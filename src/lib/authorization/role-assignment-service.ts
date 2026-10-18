import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isBusinessRole, isTechnicalPrivilege } from "./definitions";
import type { AuthorizationAssignment, AuthorizationSnapshot } from "./assignment-plans";
import {
  changeReason, expectedVersion, identifier, inputRecord, requireCondition,
  runAssignmentTransaction, type AssignmentDatabase,
} from "./assignment-transaction";

type Dependencies = {
  database: AssignmentDatabase;
  // Trusted server composition only: read the current request's existing session
  // cookie. Never implement this with an actor ID or role from mutation input.
  readSessionToken: () => Promise<string | null>;
};

const unassigned: AuthorizationAssignment = {
  businessRole: null, technicalPrivileges: [], accountStatus: "ACTIVE",
};

function isDirector(actor: AuthorizationSnapshot) { return actor.businessRole === "DIRECTOR"; }
function isTechnicalAdmin(actor: AuthorizationSnapshot) { return actor.technicalPrivileges.includes("TECHNICAL_ADMIN"); }

async function sessionActor(
  tx: Prisma.TransactionClient,
  state: readonly AuthorizationSnapshot[],
  readSessionToken: Dependencies["readSessionToken"],
) {
  const token = await readSessionToken();
  requireCondition(typeof token === "string" && token.length > 0, "UNAUTHENTICATED");
  // Fresh DB authentication, no cached legacy role. Prisma stores timestamp(3)
  // without time zone as UTC; compare explicitly in UTC on any server timezone.
  // Lock the session through commit against concurrent revocation.
  const sessions = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId" FROM "Session"
    WHERE token = ${token} AND "expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') FOR SHARE`;
  requireCondition(sessions.length === 1, "UNAUTHENTICATED");
  const actor = state.find((row) => row.userId === sessions[0].userId);
  requireCondition(actor && actor.accountStatus === "ACTIVE", "ACTOR_NOT_ACTIVE");
  return actor;
}

function targetInput(input: unknown, field: string) {
  const record = inputRecord(input, ["userId", "expectedVersion", "reason", field]);
  return {
    userId: identifier(record.userId), expectedVersion: expectedVersion(record.expectedVersion),
    reason: changeReason(record.reason), value: record[field],
  };
}

/** Inactive factory: no global client, routes, server actions or legacy-role fallback. */
export function createRoleAssignmentService({ database, readSessionToken }: Dependencies) {
  function setAssignment(
    input: ReturnType<typeof targetInput>,
    makeAssignment: (actor: AuthorizationSnapshot, before: AuthorizationAssignment) => AuthorizationAssignment,
  ) {
    const changeId = randomUUID();
    return runAssignmentTransaction(database, async (tx, state) => {
      const actor = await sessionActor(tx, state, readSessionToken);
      const before = state.find((row) => row.userId === input.userId) ?? unassigned;
      return {
        command: {
          kind: "SET_ASSIGNMENT", userId: input.userId, expectedVersion: input.expectedVersion,
          assignment: makeAssignment(actor, before),
        },
        attribution: { actorUserId: actor.userId, reason: input.reason, changeId },
      };
    });
  }

  return {
    async assignBusinessRole(raw: unknown) {
      const input = targetInput(raw, "businessRole");
      const businessRole = input.value;
      requireCondition(businessRole === null || isBusinessRole(businessRole), "INVALID_BUSINESS_ROLE");
      return setAssignment(input, (actor, before) => {
        requireCondition(isDirector(actor), "BUSINESS_AUTHORITY_REQUIRED");
        return { ...before, businessRole };
      });
    },

    async setTechnicalPrivileges(raw: unknown) {
      const input = targetInput(raw, "technicalPrivileges");
      requireCondition(Array.isArray(input.value) && Array.from(input.value).every(isTechnicalPrivilege) &&
        new Set(input.value).size === input.value.length, "INVALID_TECHNICAL_PRIVILEGES");
      // Copy before awaiting: callers cannot mutate an authorized operation in flight.
      const technicalPrivileges = [...input.value];
      return setAssignment(input, (actor, before) => {
        requireCondition(isTechnicalAdmin(actor), "TECHNICAL_AUTHORITY_REQUIRED");
        return { ...before, technicalPrivileges };
      });
    },

    async setAuthorizationStatus(raw: unknown) {
      const input = targetInput(raw, "accountStatus");
      const accountStatus = input.value;
      requireCondition(accountStatus === "ACTIVE" || accountStatus === "SUSPENDED", "INVALID_ACCOUNT_STATUS");
      return setAssignment(input, (actor, before) => {
        // One status covers BOTH domains. Require each affected authority; neither
        // domain may indirectly revoke/reactivate the other's access. Unassigned
        // accounts require the Director. The planner always protects the Director.
        if (before.businessRole !== null || before.technicalPrivileges.length === 0) {
          requireCondition(isDirector(actor), "BUSINESS_AUTHORITY_REQUIRED");
        }
        if (before.technicalPrivileges.length > 0) {
          requireCondition(isTechnicalAdmin(actor), "TECHNICAL_AUTHORITY_REQUIRED");
        }
        return { ...before, accountStatus };
      });
    },

    async transferDirector(raw: unknown) {
      const input = inputRecord(raw, ["toUserId", "fromExpectedVersion", "toExpectedVersion", "outgoingBusinessRole", "reason"]);
      const toUserId = identifier(input.toUserId);
      const fromExpectedVersion = expectedVersion(input.fromExpectedVersion);
      requireCondition(fromExpectedVersion !== null, "INVALID_VERSION");
      const toExpectedVersion = expectedVersion(input.toExpectedVersion);
      const outgoingBusinessRole = input.outgoingBusinessRole;
      requireCondition(outgoingBusinessRole === null ||
        (isBusinessRole(outgoingBusinessRole) && outgoingBusinessRole !== "DIRECTOR"), "INVALID_BUSINESS_ROLE");
      const reason = changeReason(input.reason), changeId = randomUUID();
      return runAssignmentTransaction(database, async (tx, state) => {
        const actor = await sessionActor(tx, state, readSessionToken);
        requireCondition(isDirector(actor), "BUSINESS_AUTHORITY_REQUIRED");
        return {
          command: { kind: "TRANSFER_DIRECTOR", fromUserId: actor.userId, toUserId,
            fromExpectedVersion, toExpectedVersion, outgoingBusinessRole },
          attribution: { actorUserId: actor.userId, reason, changeId },
        };
      });
    },
  };
}

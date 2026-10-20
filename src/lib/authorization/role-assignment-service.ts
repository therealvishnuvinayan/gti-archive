import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isBusinessRole, isTechnicalPrivilege } from "./definitions";
import type { AuthorizationAssignment, AuthorizationSnapshot } from "./assignment-plans";
import { isAuthorizationAssignment } from "./assignment-plans";
import { administrationLabel, type AdministrationDomain, type AdministrationDirectory, type AdministrationHistory } from "./administration-types";
import { resolveAuthenticatedSession } from "./session";
import {
  changeReason, expectedVersion, identifier, inputRecord, requireCondition,
  runAssignmentTransaction, assignmentSelect, type AssignmentDatabase,
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
  requireCondition(await resolveAuthenticatedSession(tx, token), "STALE_SESSION");
  return actor;
}

function targetInput(input: unknown, field: string) {
  const record = inputRecord(input, ["userId", "expectedVersion", "reason", field]);
  return {
    userId: identifier(record.userId), expectedVersion: expectedVersion(record.expectedVersion),
    reason: changeReason(record.reason), value: record[field],
  };
}

/** Trusted server factory. All administration uses fresh sessions and the existing assignment authority. */
export function createRoleAssignmentService({ database, readSessionToken }: Dependencies) {
  // Reads use the same actor resolver and domain authority as mutations. Hold the
  // assignment and session locks until safe projections are complete.
  function readAdministration<T>(domain: AdministrationDomain, read: (
    tx: Prisma.TransactionClient, actor: AuthorizationSnapshot, state: AuthorizationSnapshot[],
  ) => Promise<T>) {
    requireCondition(domain === "business" || domain === "technical", "INVALID_INPUT");
    return database.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`LOCK TABLE "UserAuthorization" IN SHARE MODE`;
      const state = await tx.userAuthorization.findMany({ select: assignmentSelect });
      const actor = await sessionActor(tx, state, readSessionToken);
      requireCondition(domain === "business" ? isDirector(actor) : isTechnicalAdmin(actor),
        domain === "business" ? "BUSINESS_AUTHORITY_REQUIRED" : "TECHNICAL_AUTHORITY_REQUIRED");
      return read(tx, actor, state);
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
  }

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
    getAdministrationDirectory(domain: AdministrationDomain): Promise<AdministrationDirectory> {
      return readAdministration(domain, async (tx, actor, state) => {
        const users = await tx.user.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, email: true } });
        return { actorId: actor.userId, actorVersion: actor.authorizationVersion, accounts: users.map(user => {
          const assignment = state.find(row => row.userId === user.id);
          return { ...user, version: assignment?.authorizationVersion ?? null,
            status: assignment?.accountStatus ?? "UNASSIGNED",
            value: domain === "business" ? assignment?.businessRole ?? null
              : assignment?.technicalPrivileges.includes("TECHNICAL_ADMIN") ? "TECHNICAL_ADMIN" : null,
            canChangeStatus: domain === "business" && assignment?.businessRole !== "DIRECTOR" &&
              (!assignment?.technicalPrivileges.length || isTechnicalAdmin(actor)),
          };
        }) };
      });
    },

    getAdministrationHistory(domain: AdministrationDomain, raw: unknown): Promise<AdministrationHistory> {
      const input = inputRecord(raw, ["userId", "beforeVersion"]);
      const userId = identifier(input.userId), beforeVersion = expectedVersion(input.beforeVersion);
      return readAdministration(domain, async tx => {
        requireCondition(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }), "USER_NOT_FOUND");
        const rows = await tx.userAuthorizationChange.findMany({ where: { userId,
          ...(beforeVersion === null ? {} : { authorizationVersion: { lt: beforeVersion } }) },
          orderBy: { authorizationVersion: "desc" }, take: 51,
          select: { authorizationVersion: true, changeId: true, reason: true, createdAt: true,
            before: true, after: true, actor: { select: { id: true, name: true, email: true } } },
        });
        const entries: AdministrationHistory["entries"] = [];
        for (const row of rows.slice(0, 50)) {
          requireCondition(isAuthorizationAssignment(row.after) &&
            (row.before === null || isAuthorizationAssignment(row.before)), "INVALID_STATE");
          const before = row.before, after = row.after;
          // Filter before serialization: never send the other domain's snapshots
          // or reasons for changes confined to the other domain.
          const statusChanged = before?.accountStatus !== after.accountStatus;
          const relevant = domain === "business"
            ? (before?.businessRole ?? null) !== after.businessRole || (statusChanged &&
              (before?.businessRole || after.businessRole || (!before?.technicalPrivileges.length && !after.technicalPrivileges.length)))
            : JSON.stringify(before?.technicalPrivileges ?? []) !== JSON.stringify(after.technicalPrivileges) ||
              (statusChanged && (before?.technicalPrivileges.length || after.technicalPrivileges.length));
          if (!relevant) continue;
          const describe = (assignment: AuthorizationAssignment | null) => assignment === null ? "Unassigned"
            : `${administrationLabel(domain === "business" ? assignment.businessRole : assignment.technicalPrivileges[0] ?? null)} · ${assignment.accountStatus}`;
          entries.push({ version: row.authorizationVersion, changeId: row.changeId, reason: row.reason,
            timestamp: row.createdAt.toISOString(), actor: row.actor, before: describe(before), after: describe(after) });
        }
        return { entries, nextBeforeVersion: rows.length > 50 ? rows[49].authorizationVersion : null };
      });
    },

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

    async setAuthorizationStatus(raw: unknown, domain?: "business") {
      const input = targetInput(raw, "accountStatus");
      const accountStatus = input.value;
      requireCondition(accountStatus === "ACTIVE" || accountStatus === "SUSPENDED", "INVALID_ACCOUNT_STATUS");
      return setAssignment(input, (actor, before) => {
        // The Business Users surface cannot become a technical status editor.
        if (domain === "business") requireCondition(isDirector(actor), "BUSINESS_AUTHORITY_REQUIRED");
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

import {
  isBusinessRole,
  isTechnicalPrivilege,
  type BusinessRole,
  type TechnicalPrivilege,
} from "./definitions";

export const authorizationAccountStatusValues = ["ACTIVE", "SUSPENDED"] as const;
export type AuthorizationAccountStatus = (typeof authorizationAccountStatusValues)[number];

export type AuthorizationAssignment = Readonly<{
  businessRole: BusinessRole | null;
  technicalPrivileges: readonly TechnicalPrivilege[];
  accountStatus: AuthorizationAccountStatus;
}>;

export type AuthorizationSnapshot = AuthorizationAssignment & Readonly<{
  userId: string;
  authorizationVersion: number;
}>;

export type AuthorizationChangeAttribution = Readonly<{
  actorUserId: string;
  reason: string;
  changeId: string;
}>;

export type AuthorizationChangeCommand =
  | { kind: "SET_ASSIGNMENT"; userId: string; expectedVersion: number | null; assignment: unknown }
  | { kind: "BOOTSTRAP_DIRECTOR"; userId: string; expectedVersion: number | null }
  | {
      kind: "TRANSFER_DIRECTOR";
      fromUserId: string;
      toUserId: string;
      fromExpectedVersion: number;
      toExpectedVersion: number | null;
      outgoingBusinessRole: unknown;
    };

export type AssignmentPlanRejection =
  | "INVALID_ATTRIBUTION"
  | "INVALID_STATE"
  | "INVALID_ASSIGNMENT"
  | "INVALID_TARGET"
  | "STALE_VERSION"
  | "DIRECTOR_ALREADY_EXISTS"
  | "DIRECTOR_TRANSFER_REQUIRED"
  | "USE_DIRECTOR_OPERATION"
  | "INVALID_TRANSFER"
  | "SUSPENDED_DIRECTOR_TARGET"
  | "VERSION_EXHAUSTED"
  | "UNSUPPORTED_COMMAND";

export type AssignmentChange = Readonly<{
  userId: string;
  before: AuthorizationSnapshot | null;
  after: AuthorizationSnapshot;
}>;

export type AuthorizationAssignmentPlan =
  | { decision: "REJECTED"; reason: AssignmentPlanRejection }
  | { decision: "NO_CHANGE" }
  | {
      decision: "REQUIRES_AUTHORIZED_TRANSACTION";
      attribution: AuthorizationChangeAttribution;
      changes: readonly AssignmentChange[];
    };

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAuthorizationAssignment(value: unknown): value is AuthorizationAssignment {
  if (!value || typeof value !== "object") return false;
  const assignment = value as Record<string, unknown>;
  return (assignment.businessRole === null || isBusinessRole(assignment.businessRole)) &&
    Array.isArray(assignment.technicalPrivileges) &&
    Array.from(assignment.technicalPrivileges).every(isTechnicalPrivilege) &&
    new Set(assignment.technicalPrivileges).size === assignment.technicalPrivileges.length &&
    authorizationAccountStatusValues.includes(assignment.accountStatus as AuthorizationAccountStatus);
}

// PostgreSQL Int bounds. An absent mapping has no version; persisted versions start at 1.
const maxAuthorizationVersion = 2_147_483_647;

/**
 * Inactive, pure transition planner. `state` must be a complete, authoritative V2
 * snapshot, re-read under a future authorized transaction. No actor authorization,
 * database access, legacy-role mapping or session changes occur here. A plan is
 * never permission to execute it. DB uniqueness/constraints remain authoritative.
 */
export function planAuthorizationAssignmentChange(
  state: readonly AuthorizationSnapshot[],
  command: AuthorizationChangeCommand,
  attribution: AuthorizationChangeAttribution,
): AuthorizationAssignmentPlan {
  const reject = (reason: AssignmentPlanRejection): AuthorizationAssignmentPlan => ({ decision: "REJECTED", reason });
  if (![attribution.actorUserId, attribution.reason, attribution.changeId].every(isNonBlank)) {
    return reject("INVALID_ATTRIBUTION");
  }
  if (state.some((row) => !isAuthorizationAssignment(row) || !isNonBlank(row.userId) ||
      !Number.isInteger(row.authorizationVersion) || row.authorizationVersion < 1 ||
      row.authorizationVersion > maxAuthorizationVersion ||
      (row.businessRole === "DIRECTOR" && row.accountStatus !== "ACTIVE")) ||
      new Set(state.map((row) => row.userId)).size !== state.length ||
      state.filter((row) => row.businessRole === "DIRECTOR").length > 1) {
    return reject("INVALID_STATE");
  }

  const find = (userId: string) => state.find((row) => row.userId === userId) ?? null;
  const versionMatches = (row: AuthorizationSnapshot | null, expected: number | null) =>
    (row?.authorizationVersion ?? null) === expected;
  const initialAssignment: AuthorizationAssignment = {
    businessRole: null, technicalPrivileges: [], accountStatus: "ACTIVE",
  };
  const changes: AssignmentChange[] = [];
  function addChange(userId: string, before: AuthorizationSnapshot | null, next: AuthorizationAssignment) {
    // Copy arrays and snapshots: planning must not mutate caller-owned state.
    changes.push({
      userId,
      before: before ? { ...before, technicalPrivileges: [...before.technicalPrivileges] } : null,
      after: {
        userId,
        businessRole: next.businessRole,
        technicalPrivileges: [...next.technicalPrivileges],
        accountStatus: next.accountStatus,
        authorizationVersion: (before?.authorizationVersion ?? 0) + 1,
      },
    });
  }

  switch (command.kind) {
    case "SET_ASSIGNMENT": {
      if (!isNonBlank(command.userId)) return reject("INVALID_TARGET");
      if (!isAuthorizationAssignment(command.assignment)) return reject("INVALID_ASSIGNMENT");
      const before = find(command.userId);
      const next = command.assignment;
      if (!versionMatches(before, command.expectedVersion)) return reject("STALE_VERSION");
      if (before?.businessRole === "DIRECTOR" &&
          (next.businessRole !== "DIRECTOR" || next.accountStatus !== "ACTIVE")) {
        return reject("DIRECTOR_TRANSFER_REQUIRED");
      }
      if (next.businessRole === "DIRECTOR" && before?.businessRole !== "DIRECTOR") {
        return reject("USE_DIRECTOR_OPERATION");
      }
      if (before && before.businessRole === next.businessRole && before.accountStatus === next.accountStatus &&
          before.technicalPrivileges.length === next.technicalPrivileges.length &&
          before.technicalPrivileges.every((privilege) => next.technicalPrivileges.includes(privilege))) {
        return { decision: "NO_CHANGE" };
      }
      addChange(command.userId, before, next);
      break;
    }
    case "BOOTSTRAP_DIRECTOR": {
      if (!isNonBlank(command.userId)) return reject("INVALID_TARGET");
      if (state.some((row) => row.businessRole === "DIRECTOR")) return reject("DIRECTOR_ALREADY_EXISTS");
      const before = find(command.userId);
      if (!versionMatches(before, command.expectedVersion)) return reject("STALE_VERSION");
      if (before?.accountStatus === "SUSPENDED") return reject("SUSPENDED_DIRECTOR_TARGET");
      addChange(command.userId, before, { ...(before ?? initialAssignment), businessRole: "DIRECTOR" });
      break;
    }
    case "TRANSFER_DIRECTOR": {
      if (!isNonBlank(command.fromUserId) || !isNonBlank(command.toUserId) ||
          command.fromUserId === command.toUserId || command.outgoingBusinessRole === "DIRECTOR" ||
          (command.outgoingBusinessRole !== null && !isBusinessRole(command.outgoingBusinessRole))) {
        return reject("INVALID_TRANSFER");
      }
      const from = find(command.fromUserId);
      const to = find(command.toUserId);
      if (!from || from.businessRole !== "DIRECTOR") return reject("INVALID_TRANSFER");
      if (!versionMatches(from, command.fromExpectedVersion) || !versionMatches(to, command.toExpectedVersion)) {
        return reject("STALE_VERSION");
      }
      if (to?.accountStatus === "SUSPENDED") return reject("SUSPENDED_DIRECTOR_TARGET");
      // Order is intentional: immediate DB uniqueness requires demotion first.
      // Both writes AND trigger-generated audit rows must commit or roll back together.
      addChange(from.userId, from, { ...from, businessRole: command.outgoingBusinessRole });
      addChange(command.toUserId, to, { ...(to ?? initialAssignment), businessRole: "DIRECTOR" });
      break;
    }
    default:
      return reject("UNSUPPORTED_COMMAND");
  }
  if (changes.some((change) => change.after.authorizationVersion > maxAuthorizationVersion)) {
    return reject("VERSION_EXHAUSTED");
  }
  return {
    decision: "REQUIRES_AUTHORIZED_TRANSACTION",
    attribution: {
      actorUserId: attribution.actorUserId.trim(),
      reason: attribution.reason.trim(),
      changeId: attribution.changeId.trim(),
    },
    changes,
  };
}

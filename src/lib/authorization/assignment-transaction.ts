import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  planAuthorizationAssignmentChange,
  type AuthorizationChangeAttribution,
  type AuthorizationChangeCommand,
  type AuthorizationSnapshot,
} from "./assignment-plans";

export class AuthorizationMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AuthorizationMutationError";
  }
}

export function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new AuthorizationMutationError(code);
}

export function inputRecord(input: unknown, keys: readonly string[]): Record<string, unknown> {
  requireCondition(input && typeof input === "object" && !Array.isArray(input), "INVALID_INPUT");
  const record = input as Record<string, unknown>;
  requireCondition(Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key)), "INVALID_INPUT");
  return record;
}

export function identifier(value: unknown): string {
  requireCondition(typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !value.includes("\0"), "INVALID_IDENTITY");
  return value;
}

export function expectedVersion(value: unknown): number | null {
  requireCondition(value === null || (Number.isInteger(value) &&
    (value as number) > 0 && (value as number) <= 2_147_483_647), "INVALID_VERSION");
  return value as number | null;
}

export function changeReason(value: unknown): string {
  requireCondition(typeof value === "string" && value.trim().length > 0 &&
    value.length <= 2000 && !value.includes("\0"), "INVALID_REASON");
  return value.trim();
}

export const assignmentSelect = {
  userId: true, businessRole: true, technicalPrivileges: true,
  accountStatus: true, authorizationVersion: true,
} as const;

export type AssignmentDatabase = Pick<PrismaClient, "$transaction">;
export type AssignmentMutationResult =
  | { status: "NO_CHANGE" }
  | { status: "APPLIED"; changeId: string; assignments: readonly AuthorizationSnapshot[] };

/** Internal transaction primitive; callbacks are trusted server code, never request input. */
export async function runAssignmentTransaction(
  database: AssignmentDatabase,
  authorize: (tx: Prisma.TransactionClient, state: readonly AuthorizationSnapshot[]) => Promise<{
    command: AuthorizationChangeCommand;
    attribution: AuthorizationChangeAttribution;
  }>,
): Promise<AssignmentMutationResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await database.$transaction(async (tx) => {
        // Rare administrative writes: serialize the complete snapshot, including
        // absent rows. This also blocks direct SQL writers during actor rechecks.
        // READ COMMITTED takes a fresh snapshot AFTER acquiring this table lock.
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        await tx.$executeRaw`LOCK TABLE "UserAuthorization" IN SHARE ROW EXCLUSIVE MODE`;
        const state = await tx.userAuthorization.findMany({ select: assignmentSelect });
        const { command, attribution } = await authorize(tx, state);
        const targets = command.kind === "TRANSFER_DIRECTOR"
          ? [command.fromUserId, command.toUserId] : [command.userId];
        for (const userId of new Set([attribution.actorUserId, ...targets])) {
          requireCondition(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }), "USER_NOT_FOUND");
        }
        const plan = planAuthorizationAssignmentChange(state, command, attribution);
        if (plan.decision === "REJECTED") throw new AuthorizationMutationError(plan.reason);
        if (plan.decision === "NO_CHANGE") return { status: "NO_CHANGE" };

        // Parameterized, transaction-local metadata; PostgreSQL alone writes history
        // and increments versions. Rollback removes both assignments and audit rows.
        await tx.$queryRaw`SELECT
          set_config('flux.authorization_actor_id', ${plan.attribution.actorUserId}, true),
          set_config('flux.authorization_reason', ${plan.attribution.reason}, true),
          set_config('flux.authorization_change_id', ${plan.attribution.changeId}, true)`;
        const assignments: AuthorizationSnapshot[] = [];
        for (const change of plan.changes) {
          const data = {
            businessRole: change.after.businessRole,
            technicalPrivileges: [...change.after.technicalPrivileges],
            accountStatus: change.after.accountStatus,
          };
          if (change.before) {
            const result = await tx.userAuthorization.updateMany({
              where: { userId: change.userId, authorizationVersion: change.before.authorizationVersion }, data,
            });
            requireCondition(result.count === 1, "STALE_VERSION");
          } else {
            await tx.userAuthorization.create({ data: { userId: change.userId, ...data } });
          }
          const saved = await tx.userAuthorization.findUniqueOrThrow({
            where: { userId: change.userId }, select: assignmentSelect,
          });
          requireCondition(saved.authorizationVersion === change.after.authorizationVersion, "VERSION_INTEGRITY_FAILURE");
          assignments.push(saved);
        }
        return { status: "APPLIED", changeId: plan.attribution.changeId, assignments };
      }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // P2034 guarantees transaction failure (write conflict/deadlock). Never retry
      // unknown connection/commit outcomes, stale expectations or policy denials.
      if (!error || typeof error !== "object" || !("code" in error) ||
          error.code !== "P2034" || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

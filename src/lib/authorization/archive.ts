import "server-only";
import { getCurrentUser } from "../auth";
import { runtimeAuthorization } from "./runtime";
import { projectReadActor } from "./project-read-rules";
import { archiveTransactions, activeArchiveOperation } from "./archive-transaction";
import type { ArchiveCapability } from "./archive-rules";

class RejectedArchiveOperation extends Error {
  constructor(readonly result: unknown) { super("Archive operation rejected; rolled back."); }
}
export async function runArchiveOperation<T>(expected: { id: string }, capability: ArchiveCapability,
  targetId: string, operation: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>): Promise<T> {
  const parent = activeArchiveOperation();
  const afterCommit = parent?.afterCommit ?? [];
  const execute = async (tx: Parameters<Parameters<typeof runtimeAuthorization.runAuthorized>[1]>[0], grant: { actorUserId: string }) => {
    if (grant.actorUserId !== expected.id || (parent && parent.actorId !== grant.actorUserId)) throw new Error("Archive actor/session mismatch.");
    return archiveTransactions.run({ tx, actorId: grant.actorUserId, capability, targetId, afterCommit }, async () => {
      const user = await getCurrentUser();
      if (!user || user.id !== grant.actorUserId) throw new Error("Archive authentication expired.");
      const value = await operation(user);
      const actor = projectReadActor(user);
      if (!actor || Date.parse(actor.session.expiresAt) <= Date.now()) throw new Error("Archive authentication expired.");
      if (value && typeof value === "object" && "error" in value) throw new RejectedArchiveOperation(value);
      return value;
    });
  };
  try {
    const request = { capability, targetId };
    const value = parent ? await runtimeAuthorization.runAuthorizedInTransaction(parent.tx, request, execute)
      : await runtimeAuthorization.runAuthorized(request, execute, { isolationLevel: "Serializable", timeout: 30_000 });
    if (!parent) for (const effect of afterCommit) await effect();
    return value;
  } catch (error) {
    if (error instanceof RejectedArchiveOperation && !parent) return error.result as T;
    throw error;
  }
}

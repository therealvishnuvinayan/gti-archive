import "server-only";
import { getCurrentUser } from "../auth";
import { runtimeAuthorization } from "./runtime";
import { projectReadActor } from "./project-read-rules";
import { libraryTransactions, activeLibraryOperation } from "./library-transaction";
import type { LibraryCapability } from "./library-rules";

class RejectedLibraryOperation extends Error {
  constructor(readonly result: unknown) { super("Library operation rejected; rolled back."); }
}
export async function runLibraryOperation<T>(expected: { id: string }, capability: LibraryCapability,
  targetId: string, operation: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>): Promise<T> {
  const parent = activeLibraryOperation();
  const afterCommit = parent?.afterCommit ?? [];
  const execute = async (tx: Parameters<Parameters<typeof runtimeAuthorization.runAuthorized>[1]>[0], grant: { actorUserId: string }) => {
    if (grant.actorUserId !== expected.id || (parent && parent.actorId !== grant.actorUserId)) throw new Error("Library actor/session mismatch.");
    return libraryTransactions.run({ tx, actorId: grant.actorUserId, capability, targetId, afterCommit }, async () => {
      const user = await getCurrentUser();
      if (!user || user.id !== grant.actorUserId) throw new Error("Library authentication expired.");
      const value = await operation(user);
      const actor = projectReadActor(user);
      if (!actor || Date.parse(actor.session.expiresAt) <= Date.now()) throw new Error("Library authentication expired.");
      if (value && typeof value === "object" && "error" in value) throw new RejectedLibraryOperation(value);
      if (!["library.view", "library.download", "library.accessProjectFile"].includes(capability)) {
        afterCommit.push(async () => { console.info("[library-operation]", JSON.stringify({ capability, targetId, actorUserId: grant.actorUserId })); });
      }
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
    if (error instanceof RejectedLibraryOperation && !parent) return error.result as T;
    throw error;
  }
}

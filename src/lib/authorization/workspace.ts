import "server-only";
import { getCurrentUser } from "../auth";
import { runtimeAuthorization } from "./runtime";
import { projectReadActor } from "./project-read-rules";
import { workspaceTransactions, activeWorkspaceOperation } from "./workspace-transaction";
import type { businessCapabilityCatalog } from "./definitions";
type WorkspaceCapability = (typeof businessCapabilityCatalog)["workspace"][number];

class RejectedWorkspaceOperation extends Error {
  constructor(readonly result: unknown) { super("Workspace operation rejected; rolled back."); }
}
export async function runWorkspaceOperation<T>(expected: { id: string }, capability: WorkspaceCapability,
  targetId: string, operation: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>): Promise<T> {
  const parent = activeWorkspaceOperation();
  const afterCommit = parent?.afterCommit ?? [];
  const execute = async (tx: Parameters<Parameters<typeof runtimeAuthorization.runAuthorized>[1]>[0], grant: { actorUserId: string }) => {
    if (grant.actorUserId !== expected.id || (parent && parent.actorId !== grant.actorUserId)) throw new Error("Workspace actor/session mismatch.");
    return workspaceTransactions.run({ tx, actorId: grant.actorUserId, capability, targetId, afterCommit }, async () => {
      const user = await getCurrentUser();
      if (!user || user.id !== grant.actorUserId) throw new Error("Workspace authentication expired.");
      const value = await operation(user);
      const actor = projectReadActor(user);
      if (!actor || Date.parse(actor.session.expiresAt) <= Date.now()) throw new Error("Workspace authentication expired.");
      if (value && typeof value === "object" && "error" in value) throw new RejectedWorkspaceOperation(value);
      if (!["workspace.dashboard", "workspace.businessUsers", "workspace.calendar.view"].includes(capability)) {
        afterCommit.push(async () => { console.info("[workspace-operation]", JSON.stringify({ capability, targetId, actorUserId: grant.actorUserId })); });
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
    if (error instanceof RejectedWorkspaceOperation && !parent) return error.result as T;
    throw error;
  }
}

import "server-only";
import { activeWorkspaceOperation } from "./workspace-transaction";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";
import { activeLibraryOperation } from "./library-transaction";
import { activeArchiveOperation } from "./archive-transaction";

/** Request-local transaction propagation for the existing native service graph.
 * No request can supply this context. Nested native transactions join the outer
 * authorized transaction; they never commit independently. */
export type ProjectMutationTransaction = {
  tx: Prisma.TransactionClient;
  actorId: string;
  projectId: string;
  projectKind: "structured" | "flexible";
  operation: string;
  afterCommit: Array<() => Promise<unknown>>;
};
export const projectMutationTransactions = new AsyncLocalStorage<ProjectMutationTransaction>();
export function activeProjectMutation() { return projectMutationTransactions.getStore(); }
export function inAuthorizedProjectMutation(user: { id: string }, projectId: string) {
  const context = activeProjectMutation();
  return !!context && context.actorId === user.id && context.projectId === projectId;
}

export function projectTransactionClient(rootPrisma: PrismaClient): PrismaClient { return new Proxy(rootPrisma, {
  get(target, property) {
    const context = activeProjectMutation() ?? activeArchiveOperation() ?? activeLibraryOperation() ?? activeWorkspaceOperation();
    if (context && property === "$transaction") {
      return async (operation: unknown) => {
        if (typeof operation === "function") return operation(context.tx);
        if (Array.isArray(operation)) return Promise.all(operation);
        throw new Error("Invalid nested project transaction.");
      };
    }
    const client = context?.tx ?? target;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
}

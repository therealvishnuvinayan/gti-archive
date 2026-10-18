import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
export const workspaceTransactions = new AsyncLocalStorage<{ tx: Prisma.TransactionClient; actorId: string;
  capability: string; targetId: string; afterCommit: Array<() => Promise<unknown>> }>();
export function activeWorkspaceOperation() { return workspaceTransactions.getStore(); }

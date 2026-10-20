import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import type { ArchiveCapability } from "./archive-rules";

// Transaction propagation only. All decisions come from the existing V2 engine.
export const archiveTransactions = new AsyncLocalStorage<{
  tx: Prisma.TransactionClient; actorId: string; capability: ArchiveCapability; targetId: string;
  afterCommit: Array<() => Promise<unknown>>;
}>();
export function activeArchiveOperation() { return archiveTransactions.getStore(); }

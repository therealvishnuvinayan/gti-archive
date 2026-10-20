import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import type { LibraryCapability } from "./library-rules";

// Transaction propagation only. All decisions come from the existing V2 engine.
export const libraryTransactions = new AsyncLocalStorage<{
  tx: Prisma.TransactionClient; actorId: string; capability: LibraryCapability; targetId: string;
  afterCommit: Array<() => Promise<unknown>>;
}>();
export function activeLibraryOperation() { return libraryTransactions.getStore(); }

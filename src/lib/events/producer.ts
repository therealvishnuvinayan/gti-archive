import "server-only";
import type { Prisma } from "@prisma/client";
import { activeProjectMutation } from "../authorization/project-transaction";

/** Only the native decision boundary calls this. PostgreSQL creates the event
 * and outbox when that new terminal decision is inserted; no backfill API. */
export async function prepareCompletionReviewEvent(tx: Prisma.TransactionClient, projectId: string, nativeEventId: string | null) {
  if (process.env.FLUX_SHARED_EVENTS !== "1" || !nativeEventId) return;
  const scope = activeProjectMutation();
  if (!scope || scope.tx !== tx || scope.projectKind !== "structured" || scope.projectId !== projectId || scope.operation !== "reviewCompletionDocument") {
    throw new Error("AUTHORIZED_EVENT_TRANSACTION_REQUIRED");
  }
  const [catalog] = await tx.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."BusinessEvent"') IS NOT NULL AS available`;
  if (!catalog?.available) throw new Error("SHARED_EVENT_MIGRATION_REQUIRED");
  // Transaction-local, including when existing nested native helpers join tx.
  await tx.$queryRaw`SELECT set_config('flux.shared_event_native', ${nativeEventId}, true)`;
}

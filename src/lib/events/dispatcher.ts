import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, EventOutbox } from "@prisma/client";
import { CONSUMER_KEY, MAX_ATTEMPTS, retryDelayMs, decodeBusinessEvent, type SharedBusinessEvent } from "./contracts";

type Tx = Prisma.TransactionClient;
export type EventClaim = Readonly<{ eventId: string; token: string }>;
type Consumer = (tx: Tx, event: SharedBusinessEvent) => Promise<void>;
export class PermanentEventFailure extends Error {
  constructor() { super("PERMANENT_FAILURE"); }
}
async function worker(tx: Tx) {
  await tx.$queryRaw`SELECT set_config('flux.event_worker', ${CONSUMER_KEY}, true)`;
}
async function now(tx: Tx) {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`;
  return row.now;
}
async function locked(tx: Tx, claim: EventClaim) {
  const [row] = await tx.$queryRaw<EventOutbox[]>`SELECT * FROM "EventOutbox" WHERE "eventId"=${claim.eventId} FOR UPDATE`;
  return row?.state === "PROCESSING" && row.leaseToken === claim.token ? row : null;
}

// Phase 2.3 delivery remains usable before the Tasker migration is approved.
async function loadEvent(tx: Tx, id: string) {
  const [schema] = await tx.$queryRaw<Array<{ ready: boolean }>>`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BusinessEvent' AND column_name='taskEntryId') AS ready`;
  if (schema.ready) return tx.businessEvent.findUniqueOrThrow({ where: { id } });
  const row = await tx.businessEvent.findUniqueOrThrow({ where: { id }, select: {
    id: true, type: true, schemaVersion: true, aggregateType: true, aggregateId: true, sequence: true, projectId: true,
    actorId: true, actorRole: true, actorVersion: true, operation: true, decisionId: true, nativeEventId: true,
    approvalEvidenceId: true, fileVersionId: true, correlationId: true, causationId: true, idempotencyKey: true,
    occurredAt: true, recordedAt: true, payload: true,
  } });
  return { ...row, taskId: null, taskEntryId: null, flexibleProjectId: null };
}

/** Trusted server bootstrap capability, never a user/role or route parameter.
 * No singleton, poller, endpoint or production registration is installed here.
 * The sole registered consumer is in-process; it MUST keep effects in tx and
 * must not perform external I/O. A future external dispatcher needs review.
 * Keep this closure private to bootstrap: it can read business audit records.
 */
export function createInternalDispatcher(db: PrismaClient, consume: Consumer, options: { leaseMs?: number } = {}) {
  const leaseMs = options.leaseMs ?? 30_000;
  if (!Number.isInteger(leaseMs) || leaseMs < 10 || leaseMs > 300_000) throw new Error("INVALID_EVENT_LEASE");
  async function claim(): Promise<EventClaim | null> {
    return db.$transaction(async tx => {
      await worker(tx);
      const time = await now(tx);
      // SKIP LOCKED distributes eligible messages. No cross-aggregate ordering
      // promise: retrying/dead messages do not stall unrelated business work.
      const [row] = await tx.$queryRaw<EventOutbox[]>`SELECT * FROM "EventOutbox"
        WHERE "consumerKey"=${CONSUMER_KEY} AND ((state='PENDING' AND "availableAt"<=(clock_timestamp() AT TIME ZONE 'UTC')) OR (state='PROCESSING' AND "leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC')))
        ORDER BY "availableAt", "eventId" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!row) return null;
      if (row.state === "PROCESSING") {
        await tx.eventDeliveryAttempt.create({ data: { eventId: row.eventId, attempt: row.attempts, outcome: "EXPIRED", errorCode: "LEASE_EXPIRED" } });
        if (row.attempts >= MAX_ATTEMPTS) {
          await tx.eventOutbox.update({ where: { eventId: row.eventId }, data: { state: "FAILED", leaseToken: null, leaseUntil: null, lastErrorCode: "LEASE_EXPIRED" } });
          return null;
        }
      }
      const token = randomUUID(), attempt = row.attempts + 1;
      await tx.eventOutbox.update({ where: { eventId: row.eventId }, data: { state: "PROCESSING", attempts: attempt, leaseToken: token,
        leaseUntil: new Date(time.getTime() + leaseMs) } });
      await tx.eventDeliveryAttempt.create({ data: { eventId: row.eventId, attempt, outcome: "CLAIMED" } });
      return { eventId: row.eventId, token };
    });
  }
  async function deliver(claim: EventClaim): Promise<"DELIVERED" | "RETRY" | "FAILED" | "STALE"> {
    try {
      return await db.$transaction(async tx => {
        await worker(tx);
        const row = await locked(tx, claim);
        if (!row || !row.leaseUntil || row.leaseUntil <= await now(tx)) return "STALE";
        const receipt = await tx.eventConsumerReceipt.findUnique({ where: { eventId_consumerKey: { eventId: row.eventId, consumerKey: CONSUMER_KEY } } });
        if (!receipt) {
          const event = decodeBusinessEvent(await loadEvent(tx, row.eventId));
          await consume(tx, event);
          // Prevent an overlong callback from committing effects under an expired
          // lease. An interrupted transaction rolls effects and receipt back.
          if (row.leaseUntil <= await now(tx)) throw new Error("LEASE_EXPIRED");
          await tx.eventConsumerReceipt.create({ data: { eventId: row.eventId, consumerKey: CONSUMER_KEY } });
        }
        await tx.eventDeliveryAttempt.create({ data: { eventId: row.eventId, attempt: row.attempts, outcome: "SUCCEEDED" } });
        await tx.eventOutbox.update({ where: { eventId: row.eventId }, data: { state: "DELIVERED", deliveredAt: await now(tx),
          leaseToken: null, leaseUntil: null, lastErrorCode: null } });
        return "DELIVERED";
      }, { timeout: 10_000 });
    } catch (error) {
      // Never persist arbitrary exception text, URLs, credentials or stack traces.
      const code = error instanceof PermanentEventFailure ? "PERMANENT_FAILURE" :
        error instanceof Error && error.message === "UNSUPPORTED_EVENT_CONTRACT" ? "UNSUPPORTED_EVENT" : "TEMPORARY_FAILURE";
      return db.$transaction(async tx => {
        await worker(tx);
        const row = await locked(tx, claim);
        if (!row) return "STALE";
        const failed = code !== "TEMPORARY_FAILURE" || row.attempts >= MAX_ATTEMPTS;
        await tx.eventDeliveryAttempt.create({ data: { eventId: row.eventId, attempt: row.attempts, outcome: failed ? "DEAD" : "RETRY", errorCode: code } });
        await tx.eventOutbox.update({ where: { eventId: row.eventId }, data: { state: failed ? "FAILED" : "PENDING", leaseToken: null, leaseUntil: null,
          lastErrorCode: code, availableAt: new Date((await now(tx)).getTime() + retryDelayMs(row.attempts)) } });
        return failed ? "FAILED" : "RETRY";
      });
    }
  }
  return Object.freeze({ claim, deliver });
}

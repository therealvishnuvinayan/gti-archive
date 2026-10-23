import assert from "node:assert/strict";
import type { BusinessEvent } from "@prisma/client";
import { reviewEvent, retryDelayMs, MAX_ATTEMPTS } from "../src/lib/events/contracts";
const event: BusinessEvent = { taskId: null, taskEntryId: null, flexibleProjectId: null, id: "review:decision", type: "COMPLETION_DOCUMENT_REVIEW_DECIDED", schemaVersion: 1,
  aggregateType: "COMPLETION_DOCUMENT_SUBMISSION", aggregateId: "submission", sequence: 1, projectId: "project", actorId: "actor",
  actorRole: "DIRECTOR", actorVersion: 1, operation: "reviewCompletionDocument", decisionId: "decision", nativeEventId: "native",
  approvalEvidenceId: "evidence", fileVersionId: "version", correlationId: "request", causationId: "native", idempotencyKey: "review:decision",
  occurredAt: new Date(), recordedAt: new Date(), payload: { outcome: "APPROVE", documentType: "INVOICE", requestId: "request", evidenceHash: "a".repeat(64), checksumEvidence: "UNKNOWN" } };
assert.equal(reviewEvent(event).actor.kind, "INTERNAL");
assert.equal(reviewEvent(event).context.taskId, null);
for (const data of [
  { schemaVersion: 2 }, { actorRole: "TECHNICAL_ADMINISTRATOR" }, { actorVersion: 0 }, { operation: "completeProject" }, { sequence: 0 },
  { payload: { outcome: ["APPROVE"], documentType: "INVOICE", requestId: "request", evidenceHash: "a".repeat(64), checksumEvidence: "UNKNOWN" } },
  { aggregateType: "TASK" }, { occurredAt: new Date(NaN) }, { payload: null }, { payload: [] },
  { payload: { outcome: "APPROVE", documentType: "INVOICE", requestId: "request", evidenceHash: "a".repeat(64), checksumEvidence: "UNKNOWN", token: "secret" } },
]) assert.throws(() => reviewEvent({ ...event, ...data }), /UNSUPPORTED_EVENT_CONTRACT/);
assert.deepEqual(Array.from({ length: MAX_ATTEMPTS }, (_, i) => retryDelayMs(i + 1)), [5000, 10000, 20000, 40000, 80000]);
for (const n of [0, -1, 1.5, MAX_ATTEMPTS + 1, NaN]) assert.throws(() => retryDelayMs(n));
console.log("PASS event units: typed versioned projection, unsupported contracts and sensitive payload rejection, explicit unknown checksum evidence, bounded retry policy.");

import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";
import { CONSUMER_KEY, reviewEvent } from "../src/lib/events/contracts";

type User = NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>;
type Context = {
  db: PrismaClient;
  objects: Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>;
  user: (id: string) => Promise<User>;
  fixture: (id: string) => Promise<{ kind: "ARTWORK"; projectId: string }>;
  load: (name: string) => unknown;
};
export async function verifySharedEvents({ db, objects, user, fixture, load }: Context) {
  // The parent harness creates a private unix-socket cluster and strips app env.
  const schema = process.env.FLUX_EVENT_MIGRATION_SCHEMA!, url = process.env.FLUX_AUTH_TEST_URL!;
  assert.match(url, /^postgresql:\/\/flux_v2_test@localhost:55432\//);
  assert.ok(new URL(url).searchParams.get("host")?.includes("flux-v2-auth-pg-"));
  const candidate = "20261021190000_shared_audit_events", root = dirname(schema);
  const migrate = (args: string[]) => {
    const r = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], { cwd: root,
      env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 30000 });
    assert.equal(r.status, 0, r.stderr || r.stdout); return r.stdout;
  };
  const count = async (query: string) => Number((await db.$queryRawUnsafe<Array<{ n: bigint }>>(query))[0].n);
  const history = await db.$queryRaw<Array<{ migration_name: string; checksum: string }>>`SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  assert.equal(history.length, 107);
  for (const m of history) assert.equal(m.checksum, createHash("sha256").update(readFileSync(join(root, "migrations", m.migration_name, "migration.sql"))).digest("hex"));
  assert.equal(await count("SELECT count(*) n FROM pg_tables WHERE schemaname='public'"), 108);
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", join(root, "events-baseline/schema.prisma"), "--script"]), /This is an empty migration/);
  assert.ok(await db.approvalDecision.count() > 5, "Populated real native approval decisions must precede migration");
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const snapshot = async () => Promise.all(tables.map(async ({ tablename }) => {
    assert.match(tablename, /^[A-Za-z0-9_]+$/);
    const where = tablename === "_prisma_migrations" ? ` WHERE migration_name <> '${candidate}'` : "";
    return (await db.$queryRawUnsafe<Array<{ fingerprint: string }>>(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS fingerprint FROM "${tablename}" t${where}`))[0].fingerprint;
  }));
  const before = await snapshot();
  migrate(["migrate", "deploy", "--schema", schema]);
  assert.deepEqual(await snapshot(), before, "Every old record and old ledger checksum preserved, including accepted/rejected approvals and nine accounts");
  assert.equal(await count('SELECT count(*) n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), 108);
  assert.equal(await count("SELECT count(*) n FROM pg_tables WHERE schemaname='public'"), 112);
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schema, "--script"]), /This is an empty migration/);
  for (const table of ["BusinessEvent", "EventOutbox", "EventDeliveryAttempt", "EventConsumerReceipt"]) assert.equal(await count(`SELECT count(*) n FROM "${table}"`), 0);
  console.log("PASS events migration: populated 107/108 -> 108/112 migrations/tables; all prior rows/checksums unchanged; zero drift, no backfill.");

  const docs = load("src/lib/project-completion.js") as typeof import("../src/lib/project-completion");
  const reviews = load("src/lib/completion-documents/service.js") as typeof import("../src/lib/completion-documents/service");
  const { runProjectMutation } = load("src/lib/authorization/project-write.js") as typeof import("../src/lib/authorization/project-write");
  const { prepareCompletionReviewEvent } = load("src/lib/events/producer.js") as typeof import("../src/lib/events/producer");
  const { createInternalDispatcher, PermanentEventFailure } = load("src/lib/events/dispatcher.js") as typeof import("../src/lib/events/dispatcher");
  const engine = load("src/lib/approvals/service.js") as typeof import("../src/lib/approvals/service");
  const assignments = await db.userAuthorization.findMany({ orderBy: { userId: "asc" } });
  const users = await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, role: true, passwordHash: true } });
  process.env.FLUX_SHARED_FILE_IDENTITY = "1"; process.env.FLUX_APPROVAL_ENGINE = "1"; process.env.FLUX_SHARED_EVENTS = "1";
  const expected = async (submissionId: string) => {
    const r = await db.approvalRequest.findUniqueOrThrow({ where: { completionSubmissionId: submissionId }, include: { steps: true } });
    return { requestId: r.id, stepId: r.steps.find(s => s.position === r.currentStep)!.id, revision: r.revision, evidenceHash: r.evidenceHash, commandId: randomUUID() };
  };
  async function submitted(id: string) {
    await fixture(id); const actor = await user("spm");
    await docs.configureProjectCompletionWorkflow(actor, { projectId: id, approvalRequired: false, copyrightRequired: false, invoiceRequired: true });
    await docs.requestProjectFinalInvoice(actor, { projectId: id, contactUserId: "spm" });
    const metadata = { projectId: id, documentType: "INVOICE" as const, originalFileName: "private.pdf", mimeType: "application/pdf", fileSize: 17 };
    const ticket = await docs.requestProjectCompletionDocumentUpload(actor, metadata);
    objects.set(ticket.storageKey, { ContentLength: 17, ContentType: "application/pdf", ETag: `opaque-${id}`, VersionId: `fixture-${id}` });
    await docs.finalizeProjectCompletionDocumentUpload(actor, { ...metadata, storageKey: ticket.storageKey });
    const submission = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { uploadKey: ticket.storageKey } });
    return { actor, submission, command: { projectId: id, submissionId: submission.id, decision: "ACCEPT" as const, reason: "Private native review reason", approval: await expected(submission.id) } };
  }
  const main = await submitted("events-main");
  for (const id of ["designer", "digital", "tech", "outsider", "unassigned"]) await assert.rejects(reviews.reviewCompletionDocument(await user(id), main.command));
  const spm = await user("spm");
  await assert.rejects(reviews.reviewCompletionDocument({ ...spm, id: "director" }, main.command));
  await assert.rejects(prepareCompletionReviewEvent(db, main.command.projectId, "forged"));
  await assert.rejects(runProjectMutation(spm, "reviewCompletionDocument", { kind: "structured", id: main.command.projectId }, async () => {
    await reviews.reviewCompletionDocument(spm, main.command); throw new Error("rollback after native decision/event/outbox");
  }));
  assert.equal(await db.businessEvent.count(), 0); assert.equal(await db.eventOutbox.count(), 0);
  assert.equal(await db.approvalDecision.count({ where: { requestId: main.command.approval.requestId } }), 0);
  assert.equal((await db.completionDocumentSubmission.findUniqueOrThrow({ where: { id: main.submission.id } })).status, "SUBMITTED");
  const replays = await Promise.allSettled([reviews.reviewCompletionDocument(spm, main.command), reviews.reviewCompletionDocument(spm, main.command)]);
  assert.ok(replays.some(r => r.status === "fulfilled"));
  for (const result of replays) if (result.status === "rejected") assert.match(String(result.reason), /serialize|conflict|deadlock/i);
  await reviews.reviewCompletionDocument(spm, main.command);
  assert.equal(await db.businessEvent.count(), 1); assert.equal(await db.eventOutbox.count(), 1);
  const row = await db.businessEvent.findFirstOrThrow(), wire = reviewEvent(row);
  const decision = await db.approvalDecision.findUniqueOrThrow({ where: { id: row.decisionId } });
  const evidence = await db.approvalEvidence.findUniqueOrThrow({ where: { id: row.approvalEvidenceId } });
  assert.equal(row.actorId, "spm"); assert.equal(row.nativeEventId, decision.nativeEventId); assert.equal(row.fileVersionId, evidence.fileVersionId);
  assert.equal(row.occurredAt.toISOString(), decision.decidedAt.toISOString()); assert.equal(wire.payload.checksumEvidence, "UNKNOWN");
  assert.equal(wire.correlationId, decision.requestId); assert.equal(wire.causationId, decision.nativeEventId);
  for (const secret of ["Private native review reason", "private.pdf", "storageKey", "sessionId", "password", "token", "bucket"]) assert.ok(!JSON.stringify(wire).includes(secret));
  await assert.rejects(reviews.reviewCompletionDocument(await user("tech"), main.command), "Replay must reauthorize the current actor");
  for (const action of [
    () => db.businessEvent.update({ where: { id: row.id }, data: { actorId: "director" } }),
    () => db.businessEvent.delete({ where: { id: row.id } }),
    () => db.businessEvent.create({ data: { ...row, payload: wire.payload, id: "forged", idempotencyKey: "forged" } }),
    () => db.eventOutbox.delete({ where: { eventId: row.id } }),
    () => db.eventOutbox.update({ where: { eventId: row.id }, data: { state: "FAILED" } }),
    () => db.eventConsumerReceipt.create({ data: { eventId: row.id, consumerKey: CONSUMER_KEY } }),
    ...["BusinessEvent", "EventOutbox", "EventDeliveryAttempt", "EventConsumerReceipt"].map(t => () => db.$executeRawUnsafe(`TRUNCATE "${t}" CASCADE`)),
  ]) await assert.rejects(action());
  const conflict = await submitted("events-conflict"), conflictActor = await user("spm");
  const raced = await Promise.allSettled([reviews.reviewCompletionDocument(conflictActor, conflict.command), reviews.reviewCompletionDocument(conflictActor, {
    ...conflict.command, decision: "REJECT", reason: "Reject", approval: { ...conflict.command.approval, commandId: randomUUID() } })]);
  assert.equal(raced.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await db.businessEvent.count({ where: { projectId: "events-conflict" } }), 1);
  const rejection = await submitted("events-rejection");
  await reviews.reviewCompletionDocument(await user("director"), { ...rejection.command, decision: "REJECT", reason: "New evidence needed" });
  const rejectedEvent = await db.businessEvent.findFirstOrThrow({ where: { projectId: "events-rejection" } });
  assert.equal(rejectedEvent.actorId, "director"); assert.equal(reviewEvent(rejectedEvent).payload.outcome, "REJECT");
  const reviser = await user("spm");
  await docs.requestProjectFinalInvoice(reviser, { projectId: "events-rejection", contactUserId: "spm" });
  const revisionMeta = { projectId: "events-rejection", documentType: "INVOICE" as const, originalFileName: "revised.pdf", mimeType: "application/pdf", fileSize: 17 };
  const revisionTicket = await docs.requestProjectCompletionDocumentUpload(reviser, revisionMeta);
  objects.set(revisionTicket.storageKey, { ContentLength: 17, ContentType: "application/pdf", ETag: "revised", VersionId: "revision-2" });
  await docs.finalizeProjectCompletionDocumentUpload(reviser, { ...revisionMeta, storageKey: revisionTicket.storageKey });
  const revised = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { uploadKey: revisionTicket.storageKey } });
  await reviews.reviewCompletionDocument(reviser, { projectId: "events-rejection", submissionId: revised.id, decision: "ACCEPT", reason: "New revision reviewed", approval: await expected(revised.id) });
  const revisionEvents = await db.businessEvent.findMany({ where: { projectId: "events-rejection" } });
  assert.equal(revisionEvents.length, 2); assert.notEqual(revisionEvents[0].fileVersionId, revisionEvents[1].fileVersionId);
  assert.deepEqual(await db.businessEvent.findUniqueOrThrow({ where: { id: rejectedEvent.id } }), rejectedEvent);
  // Fault injection affects only this disposable database. Failure in the outbox
  // insert must roll the native acceptance, approval decision and ledger back.
  const fault = await submitted("events-atomic-failure");
  await db.$executeRawUnsafe(`CREATE FUNCTION event_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outbox failure'; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER event_fixture_failure BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION event_fixture_failure()');
  await assert.rejects(reviews.reviewCompletionDocument(await user("spm"), fault.command), /fixture outbox failure/);
  await db.$executeRawUnsafe('DROP TRIGGER event_fixture_failure ON "EventOutbox"');
  await db.$executeRawUnsafe('DROP FUNCTION event_fixture_failure()');
  assert.equal(await db.businessEvent.count({ where: { projectId: fault.command.projectId } }), 0);
  assert.equal(await db.approvalDecision.count({ where: { requestId: fault.command.approval.requestId } }), 0);
  assert.equal(await db.projectCompletionDocument.count({ where: { submissionId: fault.submission.id } }), 0);
  assert.equal((await db.completionDocumentSubmission.findUniqueOrThrow({ where: { id: fault.submission.id } })).status, "SUBMITTED");
  const off = await submitted("events-off"); process.env.FLUX_SHARED_EVENTS = "0";
  await reviews.reviewCompletionDocument(await user("spm"), off.command);
  process.env.FLUX_SHARED_EVENTS = "1";
  await reviews.reviewCompletionDocument(await user("spm"), off.command);
  assert.equal(await db.businessEvent.count({ where: { projectId: "events-off" } }), 0, "Replaying a historical decision cannot backfill an event");
  // A staged policy emits only the terminal native decision, never intermediate approval.
  process.env.FLUX_APPROVAL_ENGINE = "0";
  await fixture("events-ordered"); const actor = await user("spm");
  await docs.configureProjectCompletionWorkflow(actor, { projectId: "events-ordered", approvalRequired: false, copyrightRequired: false, invoiceRequired: true });
  await docs.requestProjectFinalInvoice(actor, { projectId: "events-ordered", contactUserId: "spm" });
  const metadata = { projectId: "events-ordered", documentType: "INVOICE" as const, originalFileName: "ordered.pdf", mimeType: "application/pdf", fileSize: 17 };
  const ticket = await docs.requestProjectCompletionDocumentUpload(actor, metadata);
  objects.set(ticket.storageKey, { ContentLength: 17, ContentType: "application/pdf", ETag: "ordered" });
  await docs.finalizeProjectCompletionDocumentUpload(actor, { ...metadata, storageKey: ticket.storageKey });
  const native = await db.completionDocumentEvent.findFirstOrThrow({ where: { projectId: "events-ordered", action: "DOCUMENT_SUBMITTED" } });
  await db.$transaction(tx => engine.openCompletionApproval(tx, native.id, { key: "ordered.fixture.v1", steps: ["DOCUMENT_REVIEWER", "DIRECTOR"] }));
  process.env.FLUX_APPROVAL_ENGINE = "1";
  const ordered = { projectId: "events-ordered", submissionId: native.submissionId!, decision: "ACCEPT" as const, reason: "Ordered", approval: await expected(native.submissionId!) };
  await reviews.reviewCompletionDocument(await user("spm"), ordered);
  assert.equal(await db.businessEvent.count({ where: { projectId: ordered.projectId } }), 0);
  await reviews.reviewCompletionDocument(await user("director"), { ...ordered, approval: await expected(native.submissionId!) });
  assert.equal((await db.businessEvent.findFirstOrThrow({ where: { projectId: ordered.projectId } })).sequence, 2);
  console.log("PASS event producer: actual actor/time/evidence, strict payload, SQL immutability, rollback, concurrent replay/conflicts, scoped authorization, historical compatibility and terminal ordering.");

  // A disposable transactional effect table proves receipts and effects commit
  // together. It is dropped before the final full-schema diff.
  await db.$executeRawUnsafe('CREATE TABLE "EventEffectFixture" (id text PRIMARY KEY, value integer NOT NULL)');
  const consume = async (tx: Parameters<Parameters<typeof createInternalDispatcher>[1]>[0], event: Parameters<Parameters<typeof createInternalDispatcher>[1]>[1]) => {
    await tx.$executeRaw`INSERT INTO "EventEffectFixture" (id,value) VALUES (${event.id},1)`;
  };
  const dispatcher = createInternalDispatcher(db, consume);
  const pair = await Promise.all([dispatcher.claim(), dispatcher.claim()]);
  assert.ok(pair[0] && pair[1]); assert.notEqual(pair[0].eventId, pair[1].eventId);
  const delivered = await Promise.all([dispatcher.deliver(pair[0]), dispatcher.deliver(pair[0])]);
  assert.deepEqual(delivered.sort(), ["DELIVERED", "STALE"]);
  assert.equal(await dispatcher.deliver(pair[1]), "DELIVERED");
  for (;;) { const c = await dispatcher.claim(); if (!c) break; assert.equal(await dispatcher.deliver(c), "DELIVERED"); }
  async function nextEvent(id: string) { const t = await submitted(id); await reviews.reviewCompletionDocument(await user("spm"), t.command); return db.businessEvent.findFirstOrThrow({ where: { projectId: id } }); }
  const retry = await nextEvent("events-retry"); let fail = true;
  const flaky = createInternalDispatcher(db, async (tx, e) => { await consume(tx, e); if (fail) { fail = false; throw new Error("secret-token=https://credential.invalid"); } });
  const c1 = await flaky.claim(); assert.ok(c1); assert.equal(c1.eventId, retry.id); assert.equal(await flaky.deliver(c1), "RETRY");
  assert.equal(await count(`SELECT count(*) n FROM "EventEffectFixture" WHERE id='${retry.id}'`), 0);
  assert.equal(await db.eventConsumerReceipt.count({ where: { eventId: retry.id } }), 0);
  assert.equal(await flaky.claim(), null, "Backoff prevents immediate retry");
  await new Promise(resolve => setTimeout(resolve, 5100));
  const c2 = await flaky.claim(); assert.ok(c2); assert.equal(await flaky.deliver(c1), "STALE"); assert.equal(await flaky.deliver(c2), "DELIVERED");
  assert.equal(await count(`SELECT count(*) n FROM "EventEffectFixture" WHERE id='${retry.id}'`), 1);
  const dead = await nextEvent("events-permanent");
  const permanent = createInternalDispatcher(db, async () => { throw new PermanentEventFailure(); });
  const c3 = await permanent.claim(); assert.ok(c3); assert.equal(await permanent.deliver(c3), "FAILED");
  assert.equal((await db.eventOutbox.findUniqueOrThrow({ where: { eventId: dead.id } })).lastErrorCode, "PERMANENT_FAILURE");
  const crash = await nextEvent("events-crash"), crashWorker = createInternalDispatcher(db, consume, { leaseMs: 50 });
  const lost = await crashWorker.claim(); assert.ok(lost);
  await new Promise(resolve => setTimeout(resolve, 80));
  const recovered = await dispatcher.claim(); assert.ok(recovered); assert.equal(recovered.eventId, crash.id);
  assert.equal(await crashWorker.deliver(lost), "STALE"); assert.equal(await dispatcher.deliver(recovered), "DELIVERED");
  assert.equal(await db.eventDeliveryAttempt.count({ where: { eventId: crash.id, outcome: "EXPIRED" } }), 1);
  const exhausted = await nextEvent("events-exhausted");
  for (let i = 0; i < 5; i++) { const c = await crashWorker.claim(); assert.ok(c); assert.equal(c.eventId, exhausted.id); await new Promise(resolve => setTimeout(resolve, 80)); }
  assert.equal(await crashWorker.claim(), null);
  assert.equal((await db.eventOutbox.findUniqueOrThrow({ where: { eventId: exhausted.id } })).state, "FAILED");
  const slow = await nextEvent("events-expired-callback");
  const slowWorker = createInternalDispatcher(db, async (tx, e) => { await consume(tx, e); await new Promise(resolve => setTimeout(resolve, 80)); }, { leaseMs: 50 });
  const slowClaim = await slowWorker.claim(); assert.ok(slowClaim);
  assert.equal(await slowWorker.deliver(slowClaim), "RETRY");
  assert.equal(await count(`SELECT count(*) n FROM "EventEffectFixture" WHERE id='${slow.id}'`), 0);
  assert.equal(await db.eventConsumerReceipt.count({ where: { eventId: slow.id } }), 0);
  const attempts = await db.eventDeliveryAttempt.findMany();
  assert.ok(!JSON.stringify(attempts).includes("secret-token"));
  for (const action of [
    () => db.eventDeliveryAttempt.update({ where: { id: attempts[0].id }, data: { errorCode: "secret" } }),
    () => db.eventConsumerReceipt.deleteMany(),
    () => db.eventOutbox.update({ where: { eventId: row.id }, data: { state: "PENDING", deliveredAt: null } }),
  ]) await assert.rejects(action());
  assert.deepEqual(await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), assignments);
  assert.deepEqual(await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, role: true, passwordHash: true } }), users);
  await db.$executeRawUnsafe('DROP TABLE "EventEffectFixture"');
  delete process.env.FLUX_SHARED_EVENTS;
  console.log("PASS dispatcher: concurrent claims/delivery, atomic local effects/receipt, sanitized retry/backoff, permanent dead letter, lease recovery/fencing, bounded crash attempts, immutable diagnostics, no external dispatch.");
}

import nodeAssert from "node:assert/strict";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(value, target, args); } : value; } });
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { type WorkflowDefinition } from "../src/lib/stage-builder/contracts";

const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url }), authStore = new AsyncLocalStorage<string>();
let token: string | null = null;
async function as(id: string) { token = (await db.session.findFirstOrThrow({ where: { userId: id } })).token; }
async function asConcurrent<T>(id: string, fn: () => Promise<T>) { const session = await db.session.findFirstOrThrow({ where: { userId: id } }); return authStore.run(session.token, fn); }
const definition: WorkflowDefinition = {
  schemaVersion: 1, name: "Synthetic multi-stage process", description: "No project activation", intendedProjectType: "CUSTOM",
  stages: [
    { id: "brief", title: "Brief", description: "Structured input", position: 0, gates: [{ type: "REQUIRED_FIELDS", capabilityId: "info" }], capabilities: [
      { id: "info", type: "INFORMATION", title: "Brief fields", instructions: "Synthetic instructions", fields: [
        { id: "audience", type: "SHORT_TEXT", label: "Audience", help: "Who is it for?", required: true, options: [], defaultValue: "Retail", min: 1, max: 200 },
        { id: "budget", type: "NUMBER", label: "Units", help: "", required: false, options: [], defaultValue: 5, min: 1, max: 100 },
        { id: "deadline", type: "DATE", label: "Target date", help: "", required: false, options: [], defaultValue: "2026-11-20", min: null, max: null },
        { id: "region", type: "SELECT", label: "Region", help: "", required: true, options: ["A", "B"], defaultValue: "A", min: null, max: null },
        { id: "context", type: "LONG_TEXT", label: "Context", help: "", required: false, options: [], defaultValue: null, min: null, max: 2000 },
        { id: "notice", type: "READ_ONLY", label: "Notice", help: "", required: false, options: [], defaultValue: "Director final completion still applies", min: null, max: null },
      ] },
    ] },
    { id: "review", title: "Review", description: "Future exact evidence", position: 1, gates: [{ type: "PRECEDING_STAGE", stageId: "brief" }, { type: "ACCEPTED_FILES", capabilityId: "files" }, { type: "REQUIRED_CHECKLIST", capabilityId: "checks" }, { type: "APPROVAL_COMPLETE", capabilityId: "approval" }], capabilities: [
      { id: "files", type: "FILE_REQUIREMENT", title: "Output", instructions: "PDF only", acceptedTypes: [".pdf", "application/pdf"], minFiles: 1, maxFiles: 3, required: true, acceptance: "OWNER", acceptedVersionsGate: true },
      { id: "checks", type: "CHECKLIST", title: "Quality", instructions: "Verify evidence", items: [{ id: "proof", label: "Proof checked", description: "Exact version", required: true, evidence: "SHARED_FILE_VERSION" }] },
      { id: "approval", type: "APPROVAL", title: "Review plan", instructions: "Draft only", rejection: "RETURN_FOR_CHANGES", gatesProgression: true, steps: [
        { id: "owner_review", label: "Owner review", approver: "PROJECT_OWNER", evidence: "SHARED_FILE_VERSION", decision: "APPROVE_REQUIRED" },
        { id: "director_review", label: "Director review", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" },
      ] },
    ] },
  ],
};
async function main() {
  const [identity] = await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`;
  assert.deepEqual(identity, { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  let external = 0; global.fetch = async () => { external++; throw new Error("External request forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const service = requireLocal(join(compiled, "src/lib/stage-builder/service.js")) as typeof import("../src/lib/stage-builder/service");
  const publication = requireLocal(join(compiled, "src/lib/stage-builder/publication.js")) as typeof import("../src/lib/stage-builder/publication");
  const authorization = (requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime")).runtimeAuthorization;
  await as("spm");
  for (const flag of ["FLUX_STAGE_BUILDER_DRAFTS", "FLUX_TASKER_SISTERS", "FLUX_TASKER_CONCEPTS", "FLUX_TASKER_DELIVERABLES", "FLUX_UNIVERSAL_TASKER", "FLUX_SHARED_FILE_IDENTITY", "FLUX_APPROVAL_ENGINE", "FLUX_SHARED_EVENTS"]) process.env[flag] = "1";
  process.env.FLUX_STAGE_BUILDER_PUBLICATION = "0";
  await assert.rejects(publication.listWorkflowApprovals(), /PUBLICATION_DISABLED/);
  await assert.rejects(publication.submitWorkflowDraft("absent", {}), /PUBLICATION_DISABLED/);
  assert.equal(await publication.optionalDraftPublication("absent"), null);
  assert.equal((await authorization.authorize({ capability: "template.approvePublish", targetId: "workflow-approvals" })).decision, "DENY");
  const created = await service.createDraft({ commandId: randomUUID(), definition });
  assert.equal(created.validationStatus, "VALID");
  if (process.argv.includes("--baseline")) {
    assert.equal((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM "_prisma_migrations"`)[0].n, BigInt(113));
    assert.equal((await service.getDraft(created.workflowId)).configurationHash, created.configurationHash);
    console.log("PASS publication flag off: eight flags enabled on actual 113 schema, new generated client creates/reads drafts; no new-table query."); return;
  }
  process.env.FLUX_STAGE_BUILDER_PUBLICATION = "1";
  const oldTables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('WorkflowDraft','WorkflowDraftRevision','WorkflowPublicationSubmission','WorkflowPublicationAudit','PublishedWorkflow','PublishedWorkflowVersion','ApprovalRequest','ApprovalStep','ApprovalDecision','ApprovalEvent','BusinessEvent','EventOutbox','EventDeliveryAttempt','EventConsumerReceipt') ORDER BY tablename`;
  const preserved = await Promise.all(oldTables.map(({ tablename }) => db.$queryRawUnsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS data FROM "${tablename}" t`)));
  const submit = (d: typeof created, summary = "Reviewed definition changes") => publication.submitWorkflowDraft(d.workflowId, { commandId: randomUUID(), expectedRevision: d.revision, configurationHash: d.configurationHash, changeSummary: summary });
  type Review = Awaited<ReturnType<typeof publication.getWorkflowApproval>>;
  const command = (s: Review, outcome: "APPROVE" | "REJECT" = "APPROVE") => ({ expected: { ...s.expected, commandId: randomUUID() }, configurationHash: s.configurationHash, outcome, confirmed: true, reason: outcome === "APPROVE" ? "Reviewed all stages, inputs, files and gates." : "Clarify the required review evidence." });
  const incomplete = await service.createDraft({ commandId: randomUUID(), definition: { ...definition, name: "", stages: [] } });
  await assert.rejects(submit(incomplete), /WORKFLOW_NOT_VALID_FOR_PUBLICATION/);
  const unclassified = await service.createDraft({ commandId: randomUUID(), definition: { ...definition, intendedProjectType: null } });
  await assert.rejects(submit(unclassified), /WORKFLOW_NOT_VALID_FOR_PUBLICATION/);
  for (const extra of [{ actorId: "director" }, { policy: { steps: ["SENIOR_PROJECT_MANAGER"] } }, { versionNumber: 99 }]) await assert.rejects(publication.submitWorkflowDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 1, configurationHash: created.configurationHash, changeSummary: "Changes", ...extra }), /UNSUPPORTED_PROPERTY/);
  const submissionInput = { commandId: randomUUID(), expectedRevision: 1, configurationHash: created.configurationHash, changeSummary: "Initial reusable definition" };
  const s1 = await publication.submitWorkflowDraft(created.workflowId, submissionInput);
  assert.equal(s1.status, "PENDING"); assert.equal(s1.submittedBy.id, "spm"); assert.deepEqual(s1.definition, definition);
  assert.equal((await publication.submitWorkflowDraft(created.workflowId, submissionInput)).replayed, true);
  await assert.rejects(publication.submitWorkflowDraft(created.workflowId, { ...submissionInput, changeSummary: "Alter replay" }), /COMMAND_REUSED/);
  assert.equal(await db.approvalEvidence.count({ where: { requestId: s1.id } }), 0);
  assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: s1.id } })).completionSubmissionId, null);
  assert.equal(await db.publishedWorkflowVersion.count({ where: { workflowId: created.workflowId } }), 0);
  const approval = command(s1);
  for (const role of ["spm", "spm2", "jpm", "designer", "digital", "tech"]) {
    await as(role); await assert.rejects(publication.decideWorkflowPublication(s1.id, approval));
    if (role !== "spm") await assert.rejects(publication.getWorkflowApproval(s1.id));
    if (!["spm", "spm2"].includes(role)) { await assert.rejects(publication.listPublishedWorkflows()); await assert.rejects(submit(created)); }
  }
  await as("spm2"); assert.equal((await publication.listWorkflowApprovals()).pendingCount, 0); await assert.rejects(submit(created));
  await as("director"); assert.equal((await publication.getWorkflowApproval(s1.id)).canDecide, true);
  for (const change of [{ confirmed: false }, { reason: " " }, { actorId: "spm" }, { approvalPolicy: "OPEN" }, { version: 8 }]) await assert.rejects(publication.decideWorkflowPublication(s1.id, { ...approval, ...change }));
  await assert.rejects(publication.decideWorkflowPublication(s1.id, { ...approval, configurationHash: "0".repeat(64) }));
  await assert.rejects(publication.decideWorkflowPublication(s1.id, { ...approval, expected: { ...approval.expected, revision: 9 } }));
  const published = await publication.decideWorkflowPublication(s1.id, approval); assert.equal(published.publishedVersion?.number, 1);
  assert.equal((await publication.decideWorkflowPublication(s1.id, approval)).duplicate, true);
  await assert.rejects(publication.decideWorkflowPublication(s1.id, { ...approval, reason: "Changed replay" }));
  await assert.rejects(publication.decideWorkflowPublication(s1.id, command(s1)));
  const v1 = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: published.publishedVersion!.id } });
  assert.deepEqual(v1.definition, definition); assert.equal(v1.configurationHash, created.configurationHash); assert.equal(v1.approvedById, "director"); assert.equal(v1.authorId, "spm"); assert.equal(v1.submittedById, "spm");
  assert.equal(await db.businessEvent.count({ where: { aggregateId: s1.id } }), 3);
  assert.equal(await db.eventOutbox.count({ where: { event: { aggregateId: s1.id } } }), 3);
  console.log("PASS exact typed configuration subject, immutable snapshot/hash, Director-only decision, explicit confirmation/reason, role/ownership denials, no fabricated file evidence, atomic v1 and idempotent replay.");
  await as("spm");
  const r2 = await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition: { ...definition, description: "Revision two" } });
  const s2 = await submit(r2); await as("director"); await publication.decideWorkflowPublication(s2.id, command(s2, "REJECT"));
  assert.equal(await db.publishedWorkflowVersion.count({ where: { workflowId: created.workflowId } }), 1);
  await as("spm"); const feedback = await publication.getDraftPublication(created.workflowId); assert.match(feedback.submissions[0].decisions[0].reason, /Clarify/);
  const r3 = await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: { ...definition, description: "Clarified evidence" } });
  const s3 = await submit(r3);
  // Supersession is a database invariant and still works while publication is off.
  process.env.FLUX_STAGE_BUILDER_PUBLICATION = "0";
  const r4 = await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 3, definition: { ...definition, description: "Latest reviewed inputs" } });
  process.env.FLUX_STAGE_BUILDER_PUBLICATION = "1";
  assert.equal((await publication.getWorkflowApproval(s3.id)).status, "SUPERSEDED");
  await as("director"); await assert.rejects(publication.decideWorkflowPublication(s3.id, command(s3)));
  await as("spm"); const s4 = await submit(r4); assert.equal(s4.previousPublishedVersionId, v1.id);
  await as("director"); const v2 = await publication.decideWorkflowPublication(s4.id, command(s4)); assert.equal(v2.publishedVersion?.number, 2);
  assert.deepEqual(await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: v1.id } }), v1);
  await as("spm2"); const catalog = await publication.listPublishedWorkflows(); assert.equal(catalog.workflows.find(w => w.id === created.workflowId)?.number, 2);
  assert.ok(!JSON.stringify(catalog).includes("definition\":")); assert.ok(!JSON.stringify(catalog).includes("sessionId")); assert.ok(!JSON.stringify(catalog).includes("@tasker.invalid"));
  assert.equal((await publication.getPublishedWorkflow(created.workflowId, 1)).configurationHash, v1.configurationHash);
  console.log("PASS rejection feedback, revise/resubmit, pending-edit automatic supersession even with flag off, stale rejection, contiguous v2, unchanged v1, management catalog and safe metadata.");
  await as("director"); const own = await service.createDraft({ commandId: randomUUID(), definition: { ...definition, name: "Director authored" } }); const ownRequest = await submit(own);
  assert.equal(await db.publishedWorkflowVersion.count({ where: { workflowId: own.workflowId } }), 0);
  await publication.decideWorkflowPublication(ownRequest.id, command(ownRequest));
  const race = await service.createDraft({ commandId: randomUUID(), definition }); const raceRequest = await submit(race);
  const outcomes = await Promise.allSettled([asConcurrent("director", () => publication.decideWorkflowPublication(raceRequest.id, command(raceRequest))), asConcurrent("director", () => publication.decideWorkflowPublication(raceRequest.id, command(raceRequest, "REJECT")))]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1); assert.equal(await db.approvalDecision.count({ where: { requestId: raceRequest.id } }), 1);
  const replayDraft = await service.createDraft({ commandId: randomUUID(), definition }); const replayRequest = await submit(replayDraft), replayCommand = command(replayRequest);
  const replays = await Promise.all([asConcurrent("director", () => publication.decideWorkflowPublication(replayRequest.id, replayCommand)), asConcurrent("director", () => publication.decideWorkflowPublication(replayRequest.id, replayCommand))]);
  assert.equal(replays.filter(r => r.duplicate).length, 1); assert.equal(await db.publishedWorkflowVersion.count({ where: { workflowId: replayDraft.workflowId } }), 1);
  const rollbackDraft = await service.createDraft({ commandId: randomUUID(), definition });
  const beforeSubmit = await db.approvalRequest.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION publication_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'workflow-%' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER publication_fixture_fail BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION publication_fixture_fail()`);
  await assert.rejects(submit(rollbackDraft)); assert.equal(await db.approvalRequest.count(), beforeSubmit); assert.equal(await db.workflowPublicationSubmission.count({ where: { workflowId: rollbackDraft.workflowId } }), 0);
  await db.$executeRawUnsafe('DROP TRIGGER publication_fixture_fail ON "EventOutbox"');
  const rollbackRequest = await submit(rollbackDraft);
  const beforeDecision = { decisions: await db.approvalDecision.count(), events: await db.businessEvent.count(), audit: await db.workflowPublicationAudit.count(), outbox: await db.eventOutbox.count() };
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION publication_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'workflow-version:%' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER publication_fixture_fail BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION publication_fixture_fail()`);
  await assert.rejects(publication.decideWorkflowPublication(rollbackRequest.id, command(rollbackRequest)));
  assert.deepEqual({ decisions: await db.approvalDecision.count(), events: await db.businessEvent.count(), audit: await db.workflowPublicationAudit.count(), outbox: await db.eventOutbox.count() }, beforeDecision);
  assert.equal((await publication.getWorkflowApproval(rollbackRequest.id)).status, "PENDING"); assert.equal(await db.publishedWorkflow.count({ where: { id: rollbackDraft.workflowId } }), 0);
  await db.$executeRawUnsafe('DROP TRIGGER publication_fixture_fail ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION publication_fixture_fail()');
  assert.equal((await publication.decideWorkflowPublication(rollbackRequest.id, command(rollbackRequest))).publishedVersion?.number, 1);
  console.log("PASS explicit Director-authored decision, concurrent approve/reject single outcome, concurrent exact replay, submission and late-publication outbox rollback, no version gaps.");
  const invalidated = await service.createDraft({ commandId: randomUUID(), definition }); const invalidatedRequest = await submit(invalidated);
  const session = await db.session.findUniqueOrThrow({ where: { token: token! } });
  await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(publication.decideWorkflowPublication(invalidatedRequest.id, command(invalidatedRequest)));
  await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt, updatedAt: session.updatedAt } });
  token = `v2.999.${"0".repeat(64)}`; await assert.rejects(publication.decideWorkflowPublication(invalidatedRequest.id, command(invalidatedRequest))); await as("director");
  // A role/version revocation inside a rolled-back fixture transaction exercises the real current-session check without altering the nine account snapshots.
  const native = requireLocal(join(compiled, "src/lib/approvals/workflow.js")) as typeof import("../src/lib/approvals/workflow");
  let roleChanged = false;
  await assert.rejects(db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable revocation fixture',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    await tx.userAuthorization.update({ where: { userId: "director" }, data: { businessRole: "DESIGNER", authorizationVersion: { increment: 1 } } });
    await tx.userAuthorization.update({ where: { userId: "spm2" }, data: { businessRole: "DIRECTOR", authorizationVersion: { increment: 1 } } });
    roleChanged = true;
    await native.decideWorkflowApproval(tx, invalidatedRequest.id, command(invalidatedRequest));
  }));
  assert.equal(roleChanged, true);
  for (const mutation of [
    () => db.publishedWorkflowVersion.update({ where: { id: v1.id }, data: { number: 77 } }),
    () => db.publishedWorkflowVersion.update({ where: { id: v1.id }, data: { definition: {} } }),
    () => db.publishedWorkflowVersion.delete({ where: { id: v1.id } }),
    () => db.publishedWorkflow.delete({ where: { id: v1.workflowId } }),
    () => db.workflowPublicationSubmission.update({ where: { id: s1.submissionId }, data: { submittedById: "director" } }),
    () => db.approvalDecision.update({ where: { id: v1.approvalDecisionId }, data: { reason: "Rewrite" } }),
    () => db.approvalRequest.update({ where: { id: s1.id }, data: { subjectSnapshot: {} } }),
    () => db.$executeRawUnsafe('TRUNCATE "PublishedWorkflowVersion" CASCADE'),
  ]) await assert.rejects(mutation());
  const events = await db.businessEvent.findMany({ where: { operation: "workflowPublicationCommand" }, include: { delivery: true } });
  assert.ok(events.length > 10); for (const e of events) { assert.ok(e.delivery); assert.equal(e.projectId, null); assert.equal(e.decisionId, null); assert.ok(!JSON.stringify(e.payload).includes("definition\":")); assert.ok(!JSON.stringify(e.payload).includes("reason\":")); }
  assert.deepEqual(await Promise.all(oldTables.map(({ tablename }) => db.$queryRawUnsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS data FROM "${tablename}" t`))), preserved);
  const decoder = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  for (const event of events) {
    assert.equal(decoder.decodeBusinessEvent(event).type, event.type);
    assert.throws(() => decoder.decodeBusinessEvent({ ...event, payload: { ...(event.payload as object), privateDefinition: definition.name } }));
    assert.throws(() => decoder.decodeBusinessEvent({ ...event, actorVersion: 0 }));
  }
  const { createInternalDispatcher } = requireLocal(join(compiled, "src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  const consumed = new Set<string>(), dispatcher = createInternalDispatcher(db, async (_tx, event) => { assert.ok(!consumed.has(event.id)); consumed.add(event.id); });
  for (;;) { const claim = await dispatcher.claim(); if (!claim) break; assert.equal(await dispatcher.deliver(claim), "DELIVERED"); assert.equal(await dispatcher.deliver(claim), "STALE"); }
  for (const event of events) assert.ok(consumed.has(event.id));
  assert.equal(external, 0);
  console.log("PASS expired/invalidated/current-role session denials, immutable SQL mutation/deletion/truncate guards, hash-only events and outbox, all accounts/permissions/legacy projects/stages/files/Tasker histories preserved; no runtime instantiation or external requests.");
  console.log(JSON.stringify({ suite: "workflow-publication", assertions, outcome: "PASS" }));
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });

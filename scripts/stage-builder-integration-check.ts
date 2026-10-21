import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { parseDefinition, validateDefinition, duplicateStage, fieldTargets, type WorkflowDefinition, type Capability } from "../src/lib/stage-builder/contracts";

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
  const authorization = (requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime")).runtimeAuthorization;
  await as("director");
  process.env.FLUX_STAGE_BUILDER_DRAFTS = "0";
  await assert.rejects(service.listDrafts(), /DRAFTS_DISABLED/); await assert.rejects(service.createDraft({}), /DRAFTS_DISABLED/);
  assert.equal((await authorization.authorize({ capability: "template.configureCustomStages", targetId: "stage-drafts" })).decision, "DENY");
  if (process.argv.includes("--baseline")) { console.log("PASS Stage Builder flag off against 112 migrations: no draft-table queries; current-session policy denies direct access."); return; }
  process.env.FLUX_STAGE_BUILDER_DRAFTS = "1";
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('WorkflowDraft','WorkflowDraftRevision','BusinessEvent','EventOutbox','EventDeliveryAttempt','EventConsumerReceipt') ORDER BY tablename`;
  async function snapshot() { return Promise.all(tables.map(({ tablename }) => db.$queryRawUnsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS data FROM "${tablename.replaceAll('"', '""')}" t`))); }
  const preserved = await snapshot();
  const bad = (fn: (d: WorkflowDefinition) => void, pattern = /./) => { const d = structuredClone(definition); fn(d); assert.throws(() => parseDefinition(d), pattern); };
  assert.deepEqual(parseDefinition(definition), definition); assert.equal(validateDefinition(definition).length, 0); assert.equal(fieldTargets(definition).length, 5);
  for (const type of ["ARTWORK_PACKAGING", "POSM", "RETAIL_DISPLAY", "EXHIBITION_STAND", "DIGITAL", "CUSTOM"] as const) parseDefinition({ ...definition, intendedProjectType: type });
  bad(d => { d.stages[1].id = d.stages[0].id; }, /DUPLICATE_IDENTIFIER/);
  bad(d => { (d.stages[0].capabilities[0] as Extract<Capability, { type: "INFORMATION" }>).fields[0].id = "review"; }, /DUPLICATE_IDENTIFIER/);
  bad(d => { d.stages[0].id = "../column"; }, /INVALID_IDENTIFIER/);
  bad(d => { d.stages[0].position = 2; }, /INVALID_STAGE_ORDER/);
  bad(d => { d.stages[0].gates.push({ type: "PRECEDING_STAGE", stageId: "review" }); }, /INVALID_GATE_DEPENDENCY/);
  bad(d => { d.stages[0].gates.push({ type: "PRECEDING_STAGE", stageId: "brief" }); }, /INVALID_GATE_DEPENDENCY/);
  bad(d => { d.stages[1].gates.push({ type: "PRECEDING_STAGE", stageId: "absent" }); }, /INVALID_GATE_DEPENDENCY/);
  bad(d => { d.stages[1].gates.push({ type: "ACCEPTED_FILES", capabilityId: "absent" }); }, /MISSING_GATE_REFERENCE/);
  bad(d => { d.stages[0].gates.push(d.stages[0].gates[0]); }, /DUPLICATE_GATE/);
  bad(d => { d.stages[0].gates = [{ type: "APPROVAL_COMPLETE", capabilityId: "info" }]; }, /IMPOSSIBLE_GATE/);
  for (const extra of [{ actorId: "director" }, { published: true }, { expression: "return true" }, { sql: "DELETE FROM Project" }, { jsonPath: "project.ownerId" }]) assert.throws(() => parseDefinition({ ...definition, ...extra }), /UNSUPPORTED_PROPERTY/);
  assert.throws(() => parseDefinition({ ...definition, schemaVersion: 2 }), /UNSUPPORTED_SCHEMA/);
  bad(d => { Object.assign(d.stages[0].capabilities[0], { type: "JAVASCRIPT" }); }, /UNSUPPORTED_VALUE/);
  bad(d => { Object.assign(d.stages[1].capabilities[2], { permission: "ALL" }); }, /UNSUPPORTED_PROPERTY/);
  bad(d => { const b = d.stages[1].capabilities[2]; if (b.type === "APPROVAL") Object.assign(b.steps[0], { approver: "TECHNICAL_ADMIN" }); }, /UNSUPPORTED_VALUE/);
  bad(d => { const b = d.stages[1].capabilities[2]; if (b.type === "APPROVAL") Object.assign(b.steps[0], { decision: "OPTIONAL" }); }, /MANDATORY_DECISION/);
  bad(d => { const b = d.stages[1].capabilities[0]; if (b.type === "FILE_REQUIREMENT") b.maxFiles = 0; }, /INVALID_NUMBER/);
  bad(d => { const b = d.stages[1].capabilities[0]; if (b.type === "FILE_REQUIREMENT") b.acceptance = "NONE"; }, /IMPOSSIBLE_FILE_GATE/);
  for (const change of [{ defaultValue: "2026-02-30" }, { min: 1 }, { type: "UNKNOWN" }, { options: ["SQL"] }]) bad(d => { const b = d.stages[0].capabilities[0]; if (b.type === "INFORMATION") Object.assign(b.fields[2], change); });
  bad(d => { d.stages = Array.from({ length: 31 }, () => d.stages[0]); }, /CONFIGURATION_LIMIT/);
  bad(d => { d.description = "x".repeat(140000); }, /CONFIGURATION_LIMIT/);
  console.log("PASS v1 registry: all field types/defaults/bounds, exact file versions, checklist evidence, ordered mandatory approvals; malformed types, paths, expressions, duplicate IDs, cycles, missing references and impossible gates denied.");
  const command = { commandId: randomUUID(), definition };
  const created = await service.createDraft(command); assert.equal(created.revision, 1); assert.equal(created.actorId, "director");
  const replay = await service.createDraft(command); assert.equal(replay.id, created.id); assert.equal(replay.replayed, true);
  await assert.rejects(service.createDraft({ ...command, definition: { ...definition, name: "Replay changed" } }), /COMMAND_REUSED/);
  await assert.rejects(service.createDraft({ ...command, actorId: "spm" }), /UNSUPPORTED_PROPERTY/);
  const firstSnapshot = await db.workflowDraftRevision.findUniqueOrThrow({ where: { id: created.id } });
  const editable = structuredClone(definition); editable.stages[0].title = "Edited brief";
  const duplicate = duplicateStage(editable.stages[0]); duplicate.position = 2; editable.stages.push(duplicate);
  assert.notEqual(duplicate.id, definition.stages[0].id); assert.notEqual(duplicate.capabilities[0].id, definition.stages[0].capabilities[0].id);
  const r2 = await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition: editable });
  assert.equal(r2.revision, 2); assert.equal(fieldTargets(r2.definition)[0].fieldId, "audience");
  assert.deepEqual(await db.workflowDraftRevision.findUniqueOrThrow({ where: { id: created.id } }), firstSnapshot);
  await assert.rejects(service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition }), /STALE_REVISION/);
  editable.stages = [editable.stages[2], editable.stages[0], editable.stages[1]].map((s, position) => ({ ...s, position })); parseDefinition(editable);
  const r3 = await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: editable }); assert.equal(r3.revision, 3);
  editable.stages = editable.stages.filter(s => s.id !== duplicate.id).map((s, position) => ({ ...s, position }));
  await service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 3, definition: editable });
  const cloned = await service.cloneDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 4 });
  assert.notEqual(cloned.workflowId, created.workflowId); assert.equal(cloned.revision, 1); assert.ok(cloned.sourceRevisionId);
  await service.reviseDraft(cloned.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition: { ...definition, name: "Independent copy" } });
  assert.equal((await service.getDraft(created.workflowId)).definition.name, definition.name);
  assert.equal((await service.getDraft(created.workflowId, 1)).definition.stages[0].title, "Brief");
  const incomplete = await service.createDraft({ commandId: randomUUID(), definition: { ...definition, name: "", stages: [] } }); assert.equal(incomplete.validationStatus, "INCOMPLETE");
  console.log("PASS Director creates multi-stage draft; edit/duplicate/reorder/remove stages; stable fields, immutable historical reads, clone independence, incomplete saves and exact/mismatched replay handling.");
  await as("spm");
  const own = await service.createDraft({ commandId: randomUUID(), definition });
  assert.equal((await service.getDraft(own.workflowId)).createdById, "spm");
  await service.reviseDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition: { ...definition, name: "SPM revision" } });
  assert.ok((await service.listDrafts()).drafts.every(d => d.createdById === "spm"));
  await assert.rejects(service.getDraft(created.workflowId)); await assert.rejects(service.cloneDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 4 }));
  await assert.rejects(service.reviseDraft(created.workflowId, { commandId: randomUUID(), expectedRevision: 4, definition }));
  await as("spm2"); await assert.rejects(service.getDraft(own.workflowId)); await assert.rejects(service.reviseDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition }));
  for (const id of ["jpm", "designer", "digital", "tech"]) {
    await as(id); await assert.rejects(service.listDrafts()); await assert.rejects(service.getDraft(own.workflowId));
    await assert.rejects(service.createDraft({ commandId: randomUUID(), definition })); await assert.rejects(service.reviseDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition })); await assert.rejects(service.cloneDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 2 }));
  }
  token = null; await assert.rejects(service.listDrafts()); token = "v2.999." + "a".repeat(64); await assert.rejects(service.listDrafts());
  for (const id of ["spm", "director"]) { await as(id); for (const capability of ["template.approvePublish", "project.create", "project.activateCreation"]) assert.equal((await authorization.authorize({ capability, targetId: `stage-draft:${own.workflowId}` })).decision, "DENY"); }
  const writes = await Promise.allSettled([
    asConcurrent("director", () => service.reviseDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: { ...definition, name: "Concurrent Director" } })),
    asConcurrent("spm", () => service.reviseDraft(own.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: { ...definition, name: "Concurrent SPM" } })),
  ]);
  assert.equal(writes.filter(r => r.status === "fulfilled").length, 1); const loser = writes.find(r => r.status === "rejected"); assert.ok(loser?.status === "rejected" && /STALE_REVISION/.test(loser.reason.message));
  assert.equal((await service.getDraft(own.workflowId)).currentRevision, 3);
  const concurrentCommand = { commandId: randomUUID(), expectedRevision: 3, definition };
  const duplicateWrites = await Promise.all([service.reviseDraft(own.workflowId, concurrentCommand), service.reviseDraft(own.workflowId, concurrentCommand)]);
  assert.equal(duplicateWrites.filter(r => r.replayed).length, 1);
  console.log("PASS SPM owns authorized drafts; Director global editing; other SPM, JPM, Designer, Digital Lead, technical-only, unauthenticated and stale-session denials; two-user contention and duplicate command serialization.");
  for (const sql of ['UPDATE "WorkflowDraftRevision" SET "actorId"=\'spm\'', 'DELETE FROM "WorkflowDraftRevision"', 'TRUNCATE "WorkflowDraftRevision" CASCADE', 'UPDATE "WorkflowDraft" SET status=\'PUBLISHED\'', 'UPDATE "WorkflowDraft" SET "currentRevision"="currentRevision"+1']) await assert.rejects(db.$executeRawUnsafe(sql));
  const count = await db.workflowDraft.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION flux_test_reject_draft() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER flux_test_reject_draft BEFORE INSERT ON "EventOutbox" FOR EACH ROW WHEN (NEW."eventId" LIKE 'draft:%') EXECUTE FUNCTION flux_test_reject_draft()`);
  await assert.rejects(service.createDraft({ commandId: randomUUID(), definition })); assert.equal(await db.workflowDraft.count(), count);
  await db.$executeRawUnsafe('DROP TRIGGER flux_test_reject_draft ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION flux_test_reject_draft()');
  const events = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  const revisions = await db.workflowDraftRevision.findMany({ include: { event: { include: { delivery: true } } } });
  for (const revision of revisions) {
    const event = events.decodeBusinessEvent(revision.event); assert.equal(event.type, "WORKFLOW_DRAFT_REVISED"); assert.equal(event.actor.userId, revision.actorId); assert.equal(event.aggregate.sequence, revision.revision); assert.ok(revision.event.delivery);
    assert.equal(JSON.stringify(event).includes("Synthetic instructions"), false); assert.equal(JSON.stringify(event).includes("Retail"), false);
    assert.throws(() => events.decodeBusinessEvent({ ...revision.event, payload: { ...(revision.event.payload as object), secret: "sentinel" } }), /UNSUPPORTED_EVENT_CONTRACT/);
  }
  const event = revisions[0].event;
  await assert.rejects(db.businessEvent.create({ data: { id: "forged-event", type: "WORKFLOW_DRAFT_REVISED", schemaVersion: 1, aggregateType: "WORKFLOW_DRAFT", aggregateId: created.workflowId, sequence: 999, actorId: "director", actorRole: "DIRECTOR", actorVersion: 1, operation: "draftWorkflowCommand", correlationId: created.workflowId, causationId: created.id, idempotencyKey: "forged-event", occurredAt: new Date(), payload: event.payload! } }));
  const { createInternalDispatcher } = requireLocal(join(compiled, "src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  const consumed: string[] = [], worker = createInternalDispatcher(db, async (_tx, e) => { if (e.type === "WORKFLOW_DRAFT_REVISED") consumed.push(e.id); });
  for (let i = 0; i < 2000; i++) { const claim = await worker.claim(); if (!claim) break; assert.equal(await worker.deliver(claim), "DELIVERED"); }
  assert.equal(consumed.length, revisions.length); assert.equal(new Set(consumed).size, consumed.length);
  assert.deepEqual(await snapshot(), preserved); assert.equal(external, 0);
  assert.equal(await db.workflowDraft.count({ where: { status: { not: "DRAFT" } } }), 0);
  console.log("PASS immutable SQL guards, no approval/publication/activation routes, atomic rollback on outbox failure, native revision/event attribution and hash-only payload, existing fake dispatcher exactly-once receipt, all existing business rows/accounts preserved, zero external requests.");
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });

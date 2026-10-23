import nodeAssert from "node:assert/strict";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(value, target, args); } : value; } });
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";


const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url }), authStore = new AsyncLocalStorage<string>();
let token: string | null = null;
async function as(id: string) { token = (await db.session.findFirstOrThrow({ where: { userId: id } })).token; }
async function asConcurrent<T>(id: string, fn: () => Promise<T>) { const session = await db.session.findFirstOrThrow({ where: { userId: id } }); return authStore.run(session.token, fn); }

async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`)[0], { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>();
  let copies = 0, reads = 0, failCopy = false;
  let external = 0;
  global.fetch = async () => { external++; throw new Error("External requests forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name.endsWith("storage/s3")) return {
      getMaxAssetUploadBytes: () => 1e8, sanitizeFileName: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g,"_"), getS3BucketName: () => "isolated-fake-bucket", createPresignedUploadUrl: async () => "http://fixture.invalid/upload",
      getObjectMetadata: async (key: string) => { const o = objects.get(key); if (!o) throw Object.assign(new Error("Missing fake object"), { name: "NotFound" }); return { ...o }; },
      copyStoredObject: async ({ sourceKey, storageKey, sourceETag }: { sourceKey: string; storageKey: string; sourceETag: string }) => { if (failCopy) throw new Error("Fake storage unavailable"); const o = objects.get(sourceKey); assert.equal(o?.ETag, sourceETag); objects.set(storageKey, { ...o! }); copies++; },
      readPinnedStoredObject: async ({ storageKey, objectETag, objectVersionId }: { storageKey: string; objectETag: string; objectVersionId?: string }) => {
        const o = objects.get(storageKey); assert.equal(o?.ETag, objectETag); if (objectVersionId) assert.equal(o?.VersionId, objectVersionId); reads++;
        return { ...o, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(o!.ContentLength)); c.close(); } }) } };
      },
    };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const tasks = requireLocal(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  const runtime = requireLocal(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const events = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  for (const key of ["SHARED_FILE_IDENTITY","APPROVAL_ENGINE","SHARED_EVENTS","UNIVERSAL_TASKER","TASKER_DELIVERABLES","TASKER_CONCEPTS","TASKER_SISTERS","STAGE_BUILDER_DRAFTS","STAGE_BUILDER_PUBLICATION","STAGE_RUNTIME","RUNTIME_INTEGRATION"]) process.env[`FLUX_${key}`] = "1";
  const drafts = requireLocal(join(compiled, "src/lib/stage-builder/service.js")) as typeof import("../src/lib/stage-builder/service");
  const publication = requireLocal(join(compiled, "src/lib/stage-builder/publication.js")) as typeof import("../src/lib/stage-builder/publication");
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true, sessions: true } }));
  const native = JSON.stringify([await db.projectArchive.count(), await db.manualLibraryAsset.count(), await db.project.count(), await db.flexibleProject.count()]);
  const fields: import("../src/lib/stage-builder/contracts").FieldDefinition[] = [
    { id: "short", type: "SHORT_TEXT", label: "Audience", help: "", required: false, options: [], defaultValue: "Original", min: 1, max: 100 },
    { id: "long", type: "LONG_TEXT", label: "Notes", help: "", required: false, options: [], defaultValue: null, min: null, max: 500 },
    { id: "number", type: "NUMBER", label: "Budget", help: "", required: false, options: [], defaultValue: 5, min: 1, max: 100 },
    { id: "date", type: "DATE", label: "Date", help: "", required: false, options: [], defaultValue: "2026-11-20", min: null, max: null },
    { id: "select", type: "SELECT", label: "Region", help: "", required: false, options: ["A", "B"], defaultValue: "A", min: null, max: null },
    { id: "readonly", type: "READ_ONLY", label: "Read only", help: "", required: false, options: [], defaultValue: "Retained", min: null, max: null },
  ];
  const longCapabilityId = "i".repeat(80), longFieldId = "f".repeat(80);
  const definition: import("../src/lib/stage-builder/contracts").WorkflowDefinition = {
    schemaVersion: 1, name: "Runtime deliverable acceptance", description: "Isolated evidence", intendedProjectType: "CUSTOM", stages: [{
      id: "work", title: "Work", description: "Actual fields and file requirements", position: 0, gates: [], capabilities: [
        { id: "info", type: "INFORMATION", title: "Information", instructions: "Typed proposals", fields },
        { id: longCapabilityId, type: "INFORMATION", title: "Long stable IDs", instructions: "Full approved identifier range", fields: [{ ...fields[0], id: longFieldId }] },
        ...(["OWNER", "REVIEWER", "NONE"] as const).map((acceptance, n) => ({ id: `files${n}`, type: "FILE_REQUIREMENT" as const, title: `Output ${acceptance}`, instructions: "PDF only", acceptedTypes: ["application/pdf"], minFiles: 1, maxFiles: n === 0 ? 3 : 1, required: false, acceptance, acceptedVersionsGate: false })),
        { id: "review", type: "APPROVAL", title: "Evidence review", instructions: "Independent", rejection: "RETURN_FOR_CHANGES", gatesProgression: false, steps: [{ id: "director_review", label: "Director", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" }] },
      ],
    }, { id: "later", title: "Unavailable", description: "Requires first stage", position: 1, gates: [{ type: "PRECEDING_STAGE", stageId: "work" }], capabilities: [{ id: "later_info", type: "INFORMATION", title: "Later", instructions: "", fields: [{ ...fields[0], id: "later_text" }] }] }],
  };
  await as("director");
  const draft = await drafts.createDraft({ commandId: randomUUID(), definition });
  const submitted = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: "Synthetic deliverable fixture" });
  const decision = await publication.decideWorkflowPublication(submitted.id, { expected: { ...submitted.expected, commandId: randomUUID() }, configurationHash: submitted.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Reviewed fixture" });
  const pv = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: decision.publishedVersion!.id } });
  await as("spm");
  const project = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Runtime deliverables", description: "Synthetic", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] });
  const stage = await db.runtimeStage.findFirstOrThrow({ where: { projectId: project.projectId, position: 0 } });
  const later = await db.runtimeStage.findFirstOrThrow({ where: { projectId: project.projectId, position: 1 } });
  const contextTarget = `runtime:${project.projectId}`, field = (f: string) => `runtime-field:${stage.id}:info:${f}`, file = (c = "files0") => `runtime-file:${stage.id}:${c}`;
  const create = (type: "FILE_UPLOAD" | "DATA_INPUT", destination: string, extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget, type, destination, inputMode: type === "FILE_UPLOAD" ? "FILE" : "TEXT", title: "Runtime deliverable", brief: "Only this target", deadline: "2026-11-20T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: ["digital"], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Explicit reason", ...extra });
  const stageCommand = async (action: string, extra = {}) => runtime.runtimeStageCommand(project.projectId, stage.id, { commandId: randomUUID(), expectedRevision: (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).revision, action, ...extra });
  const uploads = async (taskId: string, name = "proof.pdf", mimeType = "application/pdf") => {
    const prepared = await change(taskId, "PREPARE_UPLOAD", { fileName: name, mimeType, fileSize: 8 });
    const upload = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId }, include: { version: true } });
    objects.set(upload.stagingKey, { ContentLength: 8, ContentType: mimeType, ETag: `"opaque-${upload.id}"`, VersionId: `provider-${upload.id}` });
    await change(taskId, "FINALIZE_UPLOAD", { uploadId: upload.id }); return upload;
  };
  const longTarget = `runtime-field:${stage.id}:${longCapabilityId}:${longFieldId}`;
  assert.ok(longTarget.length > 160); assert.ok(await create("DATA_INPUT", longTarget));
  assert.ok((await tasks.taskOptions(contextTarget)).targets.some(t => t.target === field("short")));
  for (const destination of [field("readonly"), field("missing"), `runtime-field:${later.id}:later_info:later_text`, `runtime-file:${stage.id}:info`, `runtime-field:${stage.id}:files0:short`]) await assert.rejects(create(destination.startsWith("runtime-file") ? "FILE_UPLOAD" : "DATA_INPUT", destination));
  for (const inputMode of ["FILE", "TEXT_FILE"]) await assert.rejects(create("DATA_INPUT", field("short"), { inputMode }));
  await assert.rejects(create("DATA_INPUT", field("short"), { contextTarget: "runtime:missing" }));
  await assert.rejects(create("FILE_UPLOAD", file(), { contextTarget: `structured:${project.projectId}` }));
  for (const who of ["designer", "digital", "spm2", "tech", "outsider"]) { await as(who); for (const [type, destination] of [["FILE_UPLOAD", file()], ["DATA_INPUT", field("short")]] as const) await assert.rejects(create(type, destination)); await assert.rejects(runtime.getRuntimeProject(project.projectId)); }
  await as("jpm"); const jpmTask = await create("DATA_INPUT", field("long"));
  await as("spm"); await assert.rejects(tasks.getTask(jpmTask.id));
  const ft = await create("FILE_UPLOAD", file());
  await as("designer"); const supporting = await uploads(ft.id, "support.pdf"); await change(ft.id, "MESSAGE", { fileIds: [supporting.id] });
  const old = await uploads(ft.id, "old.pdf"); await change(ft.id, "SUBMIT", { fileIds: [old.id] }); await change(ft.id, "REQUEST_COMPLETION");
  await as("spm"); await change(ft.id, "REJECT");
  await as("designer"); const latest = await uploads(ft.id, "accepted source.pdf"); await change(ft.id, "SUBMIT", { fileIds: [latest.id] }); await change(ft.id, "REQUEST_COMPLETION");
  assert.equal(await db.runtimeFileSubmission.count({ where: { stageId: stage.id } }), 0);
  await assert.rejects(stageCommand("FIELDS", { values: { short: "Unauthorized" } }));
  await as("digital"); const limited = await tasks.getTask(ft.id); assert.equal(limited.files.length, 0); assert.equal(limited.entries.length, 0); assert.equal(limited.deliverable?.applicationState, undefined); await assert.rejects(change(ft.id, "APPROVE")); await assert.rejects(tasks.downloadTaskFile(ft.id, latest.id, latest.versionId));
  await as("spm"); await change(ft.id, "APPROVE");
  const app = await db.universalTaskApplication.findFirstOrThrow({ where: { taskId: ft.id }, include: { publications: { include: { runtimePublication: { include: { submission: { include: { version: true } } } } } }, runtimeApplication: true } });
  assert.equal(app.state, "APPLIED"); assert.equal(app.publications.length, 1); assert.equal(app.publications[0].sourceVersionId, latest.versionId);
  const sf = app.publications[0].runtimePublication!.submission;
  assert.equal(sf.state, "SUBMITTED"); assert.equal(sf.submittedById, "designer"); assert.equal(sf.reviewedById, null); assert.equal(sf.version.uploadedById, "designer"); assert.notEqual(sf.versionId, latest.versionId); assert.equal(sf.version.originalFileName, latest.version.originalFileName); assert.equal(sf.version.objectETag, `"opaque-${latest.id}"`); assert.equal(sf.version.checksumEvidence, "UNKNOWN");
  assert.ok(app.runtimeApplication); assert.equal((await runtime.getRuntimeProject(project.projectId)).stage.gates.ready, false);
  await as("jpm"); await assert.rejects(stageCommand("FILE_DECIDED", { submissionId: sf.id, outcome: "APPROVE", reason: "Only Owner may review" }));
  await as("spm"); await stageCommand("FILE_DECIDED", { submissionId: sf.id, outcome: "APPROVE", reason: "Independent stage acceptance" });
  assert.equal((await tasks.getTask(ft.id)).deliverable?.runtimeFiles?.[0].state, "ACCEPTED");
  await as("designer"); assert.equal((await tasks.downloadTaskFile(ft.id, latest.id, latest.versionId)).size, 8); await assert.rejects(runtime.getRuntimeProject(project.projectId));
  const followup = await tasks.createTask({ commandId: randomUUID(), contextTarget: `task:${ft.id}`, type: "GENERAL", title: "Deliverable follow-up", brief: "Minimal task context only", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId: "spm" });
  assert.equal((await tasks.getTask(followup.id)).project.kind, "runtime");
  await assert.rejects(runtime.getRuntimeProject(project.projectId));
  for (const [fieldId, proposedText, expected] of [["short", "Updated audience", "Updated audience"], ["long", "Longer scoped notes", "Longer scoped notes"], ["number", "12.5", 12.5], ["date", "2026-12-01", "2026-12-01"], ["select", "B", "B"]] as const) {
    await as("spm"); const task = await create("DATA_INPUT", field(fieldId));
    const before = (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).values as Record<string, unknown>;
    await as("designer"); await change(task.id, "SUBMIT", { proposedText, fileIds: [] }); await change(task.id, "REQUEST_COMPLETION");
    await as("spm"); await change(task.id, "APPROVE");
    const after = (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).values as Record<string, { value: unknown; actorId: string }>;
    assert.equal(after[fieldId].value, expected); assert.equal(after[fieldId].actorId, "spm"); for (const key of Object.keys(before).filter(k => k !== fieldId)) assert.deepEqual(after[key], before[key]);
    assert.equal((await tasks.getTask(task.id)).status, "COMPLETED");
  }
  for (const [fieldId, proposedText] of [["number", "101"], ["number", "NaN"], ["date", "2026-02-30"], ["select", "C"], ["short", "x".repeat(101)]]) {
    await as("spm"); const task = await create("DATA_INPUT", field(fieldId)); await as("designer"); await assert.rejects(change(task.id, "SUBMIT", { proposedText }));
  }
  await as("spm"); const stale = await create("DATA_INPUT", field("short"));
  await as("designer"); await change(stale.id, "SUBMIT", { proposedText: "Stale proposal" }); await change(stale.id, "REQUEST_COMPLETION");
  await as("jpm"); await stageCommand("FIELDS", { values: { short: "New manager value" } });
  await as("spm"); await assert.rejects(change(stale.id, "APPROVE"), /FIELD_CONFLICT/); assert.equal((await tasks.getTask(stale.id)).deliverable?.conflict, true);
  await change(stale.id, "REFRESH_TARGET"); await as("designer"); await assert.rejects(change(stale.id, "REQUEST_COMPLETION")); await change(stale.id, "SUBMIT", { proposedText: "Fresh proposal" }); await change(stale.id, "REQUEST_COMPLETION");
  await as("spm"); await change(stale.id, "APPROVE");
  await stageCommand("APPROVAL_SUBMITTED", { capabilityId: "review" });
  const pending = await db.runtimeApprovalSubmission.findFirstOrThrow({ where: { stageId: stage.id }, orderBy: { requestedAt: "desc" } });
  const evidenceTask = await create("DATA_INPUT", field("number")); await as("designer"); await change(evidenceTask.id, "SUBMIT", { proposedText: "20" }); await change(evidenceTask.id, "REQUEST_COMPLETION"); await as("spm"); await change(evidenceTask.id, "APPROVE");
  assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: pending.approvalRequestId } })).state, "SUPERSEDED");
  // Durable intent survives copied-object / late database failure; explicit retry reuses it.
  const recover = await create("FILE_UPLOAD", file("files1")); await as("designer"); const recoveryFile = await uploads(recover.id); await change(recover.id, "SUBMIT", { fileIds: [recoveryFile.id] }); await change(recover.id, "REQUEST_COMPLETION"); await as("spm");
  failCopy = true; await assert.rejects(change(recover.id, "APPROVE")); failCopy = false;
  assert.equal((await tasks.getTask(recover.id)).status, "COMPLETION_REQUESTED");
  const intent = await db.universalTaskApplication.findFirstOrThrow({ where: { taskId: recover.id }, include: { publications: true } }); assert.equal(intent.state, "FAILED");
  await db.$executeRawUnsafe(`CREATE FUNCTION fixture_deliverable_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'runtime:%' THEN RAISE EXCEPTION 'forced runtime outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_deliverable_failure BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION fixture_deliverable_failure()`);
  const priorSubmissions = await db.runtimeFileSubmission.count(), priorActivities = await db.runtimeActivity.count();
  try { await assert.rejects(change(recover.id, "APPROVE")); assert.equal(await db.runtimeFileSubmission.count(), priorSubmissions); assert.equal(await db.runtimeActivity.count(), priorActivities); assert.equal((await tasks.getTask(recover.id)).status, "COMPLETION_REQUESTED"); } finally { await db.$executeRawUnsafe('DROP TRIGGER fixture_deliverable_failure ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION fixture_deliverable_failure()'); }
  assert.ok(objects.has(intent.publications[0].storageKey)); const copied = copies;
  const approve = { commandId: randomUUID(), expectedVersion: (await tasks.getTask(recover.id)).version, action: "APPROVE", text: "Explicit recovery" };
  const race = await Promise.allSettled([1, 2].map(() => asConcurrent("spm", () => tasks.mutateTask(recover.id, approve)))); assert.ok(race.some(r => r.status === "fulfilled"));
  assert.equal(copies, copied); assert.equal((await tasks.mutateTask(recover.id, approve)).replayed, true); assert.equal(await db.runtimeFileSubmission.count(), priorSubmissions + 1);
  const reviewerSubmission = await db.runtimeFileSubmission.findFirstOrThrow({ where: { stageId: stage.id, capabilityId: "files1" } }); await as("jpm"); await stageCommand("FILE_DECIDED", { submissionId: reviewerSubmission.id, outcome: "APPROVE", reason: "Configured reviewer independently accepts" });
  await as("spm"); const noReview = await create("FILE_UPLOAD", file("files2")); await as("designer"); const nf = await uploads(noReview.id); await change(noReview.id, "SUBMIT", { fileIds: [nf.id] }); await change(noReview.id, "REQUEST_COMPLETION"); await as("director"); await change(noReview.id, "APPROVE");
  const nfs = await db.runtimeFileSubmission.findFirstOrThrow({ where: { stageId: stage.id, capabilityId: "files2" } }); assert.equal(nfs.state, "SUBMITTED"); assert.equal((await runtime.getRuntimeProject(project.projectId)).stage.gates.ready, true);
  await assert.rejects(stageCommand("FILE_DECIDED", { submissionId: nfs.id, outcome: "APPROVE", reason: "NONE has no reviewer" }));
  await as("spm"); const excess = await create("FILE_UPLOAD", file("files2")); await as("designer"); const extra = await uploads(excess.id); await change(excess.id, "SUBMIT", { fileIds: [extra.id] }); await change(excess.id, "REQUEST_COMPLETION"); await as("spm"); await assert.rejects(change(excess.id, "APPROVE"), /FILE_COUNT_LIMIT/); assert.equal((await tasks.getTask(excess.id)).status, "COMPLETION_REQUESTED");
  const invalid = await create("FILE_UPLOAD", file()); await as("designer"); const bad = await uploads(invalid.id, "bad.png", "image/png"); await change(invalid.id, "SUBMIT", { fileIds: [bad.id] }); await change(invalid.id, "REQUEST_COMPLETION"); await as("spm"); await assert.rejects(change(invalid.id, "APPROVE"), /FILE_TYPE_DENIED/);
  const revoked = await create("DATA_INPUT", field("short")); await as("designer"); await change(revoked.id, "SUBMIT", { proposedText: "Must fail after revocation" }); await change(revoked.id, "REQUEST_COMPLETION");
  // Session expiry exercises current reviewer invalidation without modifying accounts.
  const session = await db.session.findFirstOrThrow({ where: { userId: "spm" } }); await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); await as("spm"); await assert.rejects(tasks.mutateTask(revoked.id, { commandId: randomUUID(), expectedVersion: 3, action: "APPROVE", text: "Expired" })); await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt, updatedAt: session.updatedAt } });
  // Different tasks captured the same field revision: only one may apply.
  await as("spm"); const competing = await Promise.all([create("DATA_INPUT", field("long")), create("DATA_INPUT", field("long"))]);
  await as("designer"); for (const task of competing) { await change(task.id, "SUBMIT", { proposedText: task.id }); await change(task.id, "REQUEST_COMPLETION"); }
  const commands = await Promise.all(competing.map(async task => ({ commandId: randomUUID(), expectedVersion: (await tasks.getTask(task.id)).version, action: "APPROVE", text: "Concurrent exact field acceptance" })));
  const competingResults = await Promise.allSettled(competing.map((task, i) => asConcurrent("spm", () => tasks.mutateTask(task.id, commands[i]))));
  assert.equal(competingResults.filter(r => r.status === "fulfilled").length, 1); assert.equal(await db.universalTask.count({ where: { id: { in: competing.map(t => t.id) }, status: "COMPLETED" } }), 1);
  await as("spm");
  await assert.rejects(db.runtimeTaskTarget.update({ where: { taskId: ft.id }, data: { capabilityId: "files2" } }));
  await assert.rejects(db.runtimeTaskTarget.delete({ where: { taskId: ft.id } }));
  await assert.rejects(db.runtimeTaskApplication.delete({ where: { applicationId: app.id } }));
  await assert.rejects(db.runtimeTaskPublication.delete({ where: { publicationId: app.publications[0].id } }));
  // A dedicated synthetic manager allows genuine revocation without changing
  // any of the nine existing fixture identities, sessions or permissions.
  const managerId = "deliverable-revoked-manager";
  await db.user.create({ data: { id: managerId, email: "revoked@fixture.invalid", name: "Revoked fixture", passwordHash: "synthetic", role: "USER" } });
  async function managerRole(businessRole: "SENIOR_PROJECT_MANAGER" | "DESIGNER") {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable revocation test',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
      await tx.userAuthorization.upsert({ where: { userId: managerId }, create: { userId: managerId, businessRole }, update: { businessRole } });
    });
  }
  await managerRole("SENIOR_PROJECT_MANAGER");
  const { createVersionedSessionToken } = requireLocal(join(compiled, "src/lib/authorization/session.js")) as typeof import("../src/lib/authorization/session");
  await db.session.create({ data: { userId: managerId, token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600000) } });
  await as(managerId); const revokedProject = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Revocation fixture", description: "Synthetic manager", ownerId: managerId, coOwnerIds: ["jpm"], executorIds: [] });
  const revokedStage = await db.runtimeStage.findFirstOrThrow({ where: { projectId: revokedProject.projectId, position: 0 } });
  await assert.rejects(create("FILE_UPLOAD", `runtime-file:${revokedStage.id}:files0`));
  const revokedTasks = [await create("FILE_UPLOAD", `runtime-file:${revokedStage.id}:files0`, { contextTarget: `runtime:${revokedProject.projectId}` }), await create("DATA_INPUT", `runtime-field:${revokedStage.id}:info:short`, { contextTarget: `runtime:${revokedProject.projectId}` })];
  await as("designer"); const revokedUpload = await uploads(revokedTasks[0].id, "actual source name.pdf");
  await change(revokedTasks[0].id, "SUBMIT", { fileIds: [revokedUpload.id] }); await change(revokedTasks[1].id, "SUBMIT", { proposedText: "Revoked owner must block this" });
  for (const task of revokedTasks) await change(task.id, "REQUEST_COMPLETION");
  await managerRole("DESIGNER"); await as("director");
  for (const task of revokedTasks) { await assert.rejects(change(task.id, "APPROVE"), /TARGET_ACCESS_REVOKED/); assert.equal((await tasks.getTask(task.id)).status, "COMPLETION_REQUESTED"); }
  await as(managerId); await assert.rejects(tasks.getTask(revokedTasks[0].id));
  assert.equal(await db.runtimeFileSubmission.count({ where: { stageId: revokedStage.id } }), 0);
  assert.deepEqual((await db.runtimeStage.findUniqueOrThrow({ where: { id: revokedStage.id } })).values, revokedStage.values);
  await as("spm");
  await stageCommand("COMPLETED", { reason: "Only explicit stage completion" });
  await assert.rejects(change(revoked.id, "APPROVE")); await assert.rejects(create("DATA_INPUT", field("short"))); await assert.rejects(create("FILE_UPLOAD", file()));
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: project.projectId } })).state, "ACTIVE");
  for (const row of await db.businessEvent.findMany({ where: { taskId: { in: (await db.runtimeTaskContext.findMany({ where: { projectId: project.projectId } })).map(c => c.taskId) } }, include: { runtimeTaskContext: true } })) { assert.ok(events.decodeBusinessEvent(row)); assert.ok(await db.eventOutbox.findUnique({ where: { eventId: row.id } })); }
  assert.equal(JSON.stringify(await db.user.findMany({ where: { id: { not: managerId } }, orderBy: { id: "asc" }, include: { authorization: true, sessions: true } })), accounts);
  assert.equal(JSON.stringify([await db.projectArchive.count(), await db.manualLibraryAsset.count(), await db.project.count(), await db.flexibleProject.count()]), native); assert.equal(external, 0); assert.ok(reads > 0);
  console.log(`PASS runtime deliverables: ${assertions} assertions; actual published targets, isolated executors, typed values, stale refresh, approval supersession, independent stage review, exact provenance, durable copy recovery, concurrency/replay, current sessions and retained native contexts.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

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
  let copies = 0, reads = 0;
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
      copyStoredObject: async ({ sourceKey, storageKey, sourceETag }: { sourceKey: string; storageKey: string; sourceETag: string }) => { const o = objects.get(sourceKey); assert.equal(o?.ETag, sourceETag); objects.set(storageKey, { ...o! }); copies++; },
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
  const project = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Runtime concepts and Sisters", description: "Synthetic", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] });
  const stage = await db.runtimeStage.findFirstOrThrow({ where: { projectId: project.projectId, position: 0 } });
  
  const contextTarget = `runtime:${project.projectId}`, field = (f: string) => `runtime-field:${stage.id}:info:${f}`, file = (c = "files0") => `runtime-file:${stage.id}:${c}`;
  const create = (type: import("../src/lib/tasker/contracts").TaskSummary["type"], extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget, type, title: "Runtime deliverable", brief: "Only this target", deadline: "2026-11-20T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: ["digital"], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Explicit reason", ...extra });
  const stageCommand = async (action: string, extra = {}) => runtime.runtimeStageCommand(project.projectId, stage.id, { commandId: randomUUID(), expectedRevision: (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).revision, action, ...extra });
  const uploads = async (taskId: string, name = "proof.pdf", mimeType = "application/pdf") => {
    const prepared = await change(taskId, "PREPARE_UPLOAD", { fileName: name, mimeType, fileSize: 8 });
    const upload = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId }, include: { version: true } });
    objects.set(upload.stagingKey, { ContentLength: 8, ContentType: mimeType, ETag: `"opaque-${upload.id}"`, VersionId: `provider-${upload.id}` });
    await change(taskId, "FINALIZE_UPLOAD", { uploadId: upload.id }); return upload;
  };
  async function finish(taskId: string, owner = "spm", executor = "designer", extra = {}) {
    await as(executor); await change(taskId, "SUBMIT", extra); await change(taskId, "REQUEST_COMPLETION"); await as(owner); await change(taskId, "APPROVE");
    assert.equal((await tasks.getTask(taskId)).status, "COMPLETED");
  }
  async function proposal(sourceId: string, mode = "KEEP", patch: Record<string, unknown> = {}, evidenceVersionIds: string[] = []) {
    const draft = await tasks.sisterDraft(sourceId);
    const next = { ...draft.values, contextTarget: ["FILE_UPLOAD", "DATA_INPUT"].includes(draft.values.type) ? draft.values.contextTarget : `task:${sourceId}`, commandId: randomUUID(), ...patch, sister: { sourceTaskId: sourceId, sourceVersion: draft.source.version, mode, evidenceVersionIds } };
    for (const key of Object.keys(next)) if ((next as Record<string, unknown>)[key] === undefined) delete (next as Record<string, unknown>)[key];
    return { ...next, sister: { ...next.sister, ...await tasks.previewSister(next), confirmed: true } };
  }
  async function snapshot(taskId: string) {
    return JSON.stringify([await db.universalTask.findUnique({ where: { id: taskId }, include: { spectators: true } }), await db.universalTaskEntry.findMany({ where: { taskId }, orderBy: { version: "asc" } }), await db.universalTaskUpload.findMany({ where: { taskId }, include: { version: true }, orderBy: { id: "asc" } }), await db.businessEvent.findMany({ where: { taskId }, orderBy: { id: "asc" } })]);
  }
  async function stageUpload(capabilityId = "files0", supersedesId: string | null = null) {
    const priorToken = token; await as("jpm");
    const prepared = await stageCommand("UPLOAD_PREPARED", { capabilityId, supersedesId, fileName: "stage.pdf", fileSize: 8, mimeType: "application/pdf" }) as { submissionId: string; versionId: string };
    const sub = await db.runtimeFileSubmission.findUniqueOrThrow({ where: { id: prepared.submissionId } });
    objects.set(sub.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: `"stage-${sub.id}"` });
    await stageCommand("FILE_SUBMITTED", { submissionId: sub.id }); token = priorToken; return prepared;
  }
  const state = () => Promise.all([db.runtimeStage.findMany({ where: { projectId: project.projectId }, orderBy: { id: "asc" } }), db.runtimeFileSubmission.findMany({ where: { stageId: stage.id }, orderBy: { id: "asc" } }), db.runtimeActivity.findMany({ where: { projectId: project.projectId }, orderBy: { sequence: "asc" } })]).then(JSON.stringify);
  const parentBefore = await state();
  for (const actor of ["designer", "digital", "spm2", "tech", "outsider"]) {
    await as(actor); for (const type of ["INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"] as const) await assert.rejects(create(type, { executorId: "designer2" }));
  }
  await as("director"); const inspect = await create("INSPECT_FILE", { title: "Director inspection" });
  await as("designer"); await assert.rejects(change(inspect.id, "SUBMIT"), /INSPECTION_SOURCE_REQUIRED/); await assert.rejects(change(inspect.id, "REQUEST_COMPLETION"));
  await as("director"); const ownerSource = await uploads(inspect.id, "owner-source.pdf");
  const pin = { commandId: randomUUID(), expectedVersion: (await tasks.getTask(inspect.id)).version, action: "SET_SOURCE", text: "Exact sealed source", sourceVersionId: ownerSource.versionId };
  const pinRace = await Promise.allSettled([1, 2].map(() => asConcurrent("director", () => tasks.mutateTask(inspect.id, pin)))); assert.ok(pinRace.some(r => r.status === "fulfilled"));
  assert.equal((await tasks.mutateTask(inspect.id, pin)).replayed, true); assert.equal(await db.universalTaskReference.count({ where: { taskId: inspect.id } }), 1);
  await assert.rejects(change(inspect.id, "SET_SOURCE", { sourceVersionId: ownerSource.versionId }));
  const inspectRef = (await tasks.getTask(inspect.id)).references![0];
  await as("designer"); assert.equal((await tasks.downloadTaskReference(inspect.id, inspectRef.id, inspectRef.versionId)).size, 8);
  await assert.rejects(runtime.getRuntimeProject(project.projectId)); await assert.rejects(tasks.downloadTaskReference(inspect.id, inspectRef.id, randomUUID()));
  await change(inspect.id, "SUBMIT"); await assert.rejects(change(inspect.id, "REQUEST_COMPLETION", { text: " " })); await change(inspect.id, "REQUEST_COMPLETION"); await assert.rejects(change(inspect.id, "APPROVE"));
  await as("director"); await change(inspect.id, "REJECT");
  await as("designer"); await assert.rejects(change(inspect.id, "REQUEST_COMPLETION")); await finish(inspect.id, "director");
  assert.equal(await state(), parentBefore);
  await as("spm");
  const unreviewed = await stageUpload(); await assert.rejects(create("INSPECT_FILE", { sourceVersionId: unreviewed.versionId }));
  await stageCommand("FILE_DECIDED", { submissionId: unreviewed.submissionId, outcome: "REJECT", reason: "Changes required" }); await assert.rejects(create("INSPECT_FILE", { sourceVersionId: unreviewed.versionId }));
  const accepted = await stageUpload("files0", unreviewed.submissionId);
  await stageCommand("FILE_DECIDED", { submissionId: accepted.submissionId, outcome: "APPROVE", reason: "Independent stage decision" });
  const stageInspect = await create("INSPECT_FILE", { sourceVersionId: accepted.versionId });
  const replacement = await stageUpload("files0", accepted.submissionId);
  await assert.rejects(create("INSPECT_FILE", { sourceVersionId: accepted.versionId }));
  const stageRef = (await tasks.getTask(stageInspect.id)).references![0]; assert.equal(stageRef.versionId, accepted.versionId); assert.equal(stageRef.runtimeSource?.submissionId, accepted.submissionId);
  await as("designer"); assert.equal((await tasks.downloadTaskReference(stageInspect.id, stageRef.id, accepted.versionId)).size, 8);
  await assert.rejects(tasks.downloadTaskReference(stageInspect.id, stageRef.id, replacement.versionId));
  await as("digital"); assert.equal((await tasks.getTask(stageInspect.id)).references, undefined); await assert.rejects(tasks.downloadTaskReference(stageInspect.id, stageRef.id, accepted.versionId)); await assert.rejects(tasks.sisterDraft(stageInspect.id));
  const stageBeforeReview = await state(); await finish(stageInspect.id); assert.equal(await state(), stageBeforeReview);
  await as("spm"); const none = await stageUpload("files2"); const noneInspect = await create("INSPECT_FILE", { sourceVersionId: none.versionId }); assert.ok(noneInspect.id);
  const otherProject = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Same version different actual project", description: "Isolation", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: [] });
  await assert.rejects(create("INSPECT_FILE", { contextTarget: `runtime:${otherProject.projectId}`, sourceVersionId: none.versionId }));
  await assert.rejects(create("INSPECT_FILE", { sourceVersionId: "old-file" }));
  assert.ok((await tasks.taskOptions(contextTarget)).conceptSources.some(c => c.versionId === none.versionId && c.kind === "INSPECTION"));
  assert.ok(!(await tasks.taskOptions(contextTarget)).conceptSources.some(c => c.versionId === accepted.versionId));

  const conceptParent = await state();
  const initial = await create("INITIAL_CONCEPT", { title: "Initial concept revisions", spectatorIds: [] });
  await as("designer"); const supporting = await uploads(initial.id, "support.pdf"); await change(initial.id, "MESSAGE", { fileIds: [supporting.id] });
  const rejected = await uploads(initial.id, "rejected.pdf"); await change(initial.id, "SUBMIT", { fileIds: [rejected.id] }); await change(initial.id, "REQUEST_COMPLETION");
  await as("spm"); await change(initial.id, "REJECT");
  await as("designer"); const superseded = await uploads(initial.id, "early.pdf"); await change(initial.id, "SUBMIT", { fileIds: [superseded.id] });
  const selected = await uploads(initial.id, "selected.pdf"), unselected = await uploads(initial.id, "unselected.pdf"); await change(initial.id, "SUBMIT", { fileIds: [selected.id, unselected.id] });
  await as("spm"); const submittedChoices = (await tasks.taskOptions(contextTarget)).conceptSources; assert.equal(submittedChoices.find(c => c.versionId === selected.versionId)?.sourceState, "SUBMITTED");
  for (const u of [supporting, rejected, superseded]) { assert.ok(!submittedChoices.some(c => c.versionId === u.versionId)); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [u.versionId] })); }
  await as("jpm"); assert.ok(!(await tasks.taskOptions(contextTarget)).conceptSources.some(c => c.versionId === selected.versionId)); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [selected.versionId] })); await assert.rejects(tasks.getTask(initial.id));
  await as("spm"); const final = await create("FINAL_CONCEPT", { title: "Independent final", executorId: "digital", spectatorIds: ["designer2"], inspirationVersionIds: [selected.versionId] });
  const finalRef = (await tasks.getTask(final.id)).references![0]; assert.equal(finalRef.uploader?.id, "designer"); assert.equal(finalRef.sourceState, "SUBMITTED");
  await as("digital"); assert.equal((await tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId)).size, 8); await assert.rejects(tasks.downloadTaskReference(final.id, finalRef.id, unselected.versionId)); await assert.rejects(tasks.getTask(initial.id)); await assert.rejects(runtime.getRuntimeProject(project.projectId));
  await as("designer2"); assert.equal((await tasks.getTask(final.id)).entries.length, 0); await assert.rejects(tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId));
  await as("designer"); const corrected = await uploads(initial.id, "corrected.pdf"); await change(initial.id, "SUBMIT", { fileIds: [corrected.id] }); await change(initial.id, "REQUEST_COMPLETION");
  await as("spm"); await change(initial.id, "APPROVE");
  const states = (await tasks.getTask(initial.id)).submissions!.map(s => s.state); assert.deepEqual(states, ["REJECTED", "SUPERSEDED", "SUPERSEDED", "APPROVED"]);
  assert.equal((await tasks.getTask(final.id)).references![0].versionId, selected.versionId); assert.equal((await tasks.getTask(final.id)).references![0].sourceState, "SUBMITTED");
  await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [selected.versionId] }));
  assert.equal((await tasks.taskOptions(contextTarget)).conceptSources.find(c => c.versionId === corrected.versionId)?.sourceState, "APPROVED");
  await assert.rejects(create("FINAL_CONCEPT", { contextTarget: `runtime:${otherProject.projectId}`, inspirationVersionIds: [corrected.versionId] }));
  const approvedFinal = await create("FINAL_CONCEPT", { inspirationVersionIds: [corrected.versionId] }); assert.equal((await tasks.getTask(approvedFinal.id)).references![0].review?.actor.id, "spm");
  assert.equal((await tasks.getTask(await create("FINAL_CONCEPT").then(t => t.id))).references?.length, 0);
  await finish(final.id, "spm", "digital"); await finish(approvedFinal.id);
  assert.equal(await state(), conceptParent);

  // All six Sister types retain original histories and require independent work.
  await as("spm"); const general = await create("GENERAL", { spectatorIds: [] }); await as("designer"); const generalEvidence = await uploads(general.id); await finish(general.id, "spm", "designer", { fileIds: [generalEvidence.id] });
  const fileTask = await create("FILE_UPLOAD", { destination: file(), inputMode: "FILE" }); await as("designer"); const fileEvidence = await uploads(fileTask.id); await finish(fileTask.id, "spm", "designer", { fileIds: [fileEvidence.id] });
  const dataTask = await create("DATA_INPUT", { destination: field("short"), inputMode: "TEXT" }); await finish(dataTask.id, "spm", "designer", { proposedText: "Original accepted proposal" });
  await stageCommand("FIELDS", { values: { short: "Latest manager baseline" } });
  const originals = [general, fileTask, dataTask, inspect, initial, approvedFinal];
  const sourceSnapshots = await Promise.all(originals.map(t => snapshot(t.id))); const beforeSisters = await state(); const freshSisters = new Map<string, string>();
  for (const source of originals) {
    await as("director"); const draft = await tasks.sisterDraft(source.id); const p = await proposal(source.id, "KEEP", {}, draft.evidence.map(e => e.versionId));
    await assert.rejects(tasks.createTask({ ...p, sister: { ...p.sister, confirmed: false } }), /SISTER_CONFIRMATION_REQUIRED/);
    await assert.rejects(tasks.createTask({ ...p, title: "Altered after confirmation" }), /SISTER_CONFIRMATION_REQUIRED/);
    const created = await tasks.createTask(p); const detail = await tasks.getTask(created.id); freshSisters.set(detail.type, created.id);
    assert.equal(detail.status, "OPEN"); assert.equal(detail.owner.id, "director"); assert.equal(detail.project.id, project.projectId); assert.equal(detail.family?.source?.id, source.id);
    assert.equal(detail.files.length, 0); assert.equal(detail.submissions!.length, 0); assert.equal(await db.universalTaskApplication.count({ where: { taskId: created.id } }), 0);
    assert.equal((await tasks.createTask(p)).id, created.id); assert.equal(await db.universalTaskFamilyLink.count({ where: { taskId: created.id } }), 1);
    if (detail.type === "DATA_INPUT") { const target = await db.universalTaskTarget.findUniqueOrThrow({ where: { taskId: created.id } }); assert.equal((target.expectedState as { value: { value: string } }).value.value, "Latest manager baseline"); assert.notEqual(target.expectedHash, (await db.universalTaskTarget.findUniqueOrThrow({ where: { taskId: source.id } })).expectedHash); }
    if (detail.inheritedEvidence?.length) { const evidence = detail.inheritedEvidence[0]; await as("designer"); assert.equal((await tasks.downloadInheritedEvidence(created.id, evidence.id, evidence.versionId)).size, 8); await assert.rejects(change(created.id, "SUBMIT", { fileIds: [draft.evidence[0].id] })); }
    await as("director"); await assert.rejects(tasks.createTask(await proposal(source.id, "MODIFY", { contextTarget: `runtime:${otherProject.projectId}` })), /CROSS_PROJECT/);
  }
  assert.equal(await state(), beforeSisters); assert.deepEqual(await Promise.all(originals.map(t => snapshot(t.id))), sourceSnapshots);
  const freshData = freshSisters.get("DATA_INPUT")!, freshFile = freshSisters.get("FILE_UPLOAD")!;
  await as("designer"); for (const id of [freshData, freshFile]) await assert.rejects(change(id, "REQUEST_COMPLETION"), /FRESH_SUBMISSION_REQUIRED/);
  await finish(freshData, "director", "designer", { proposedText: "Fresh independent Sister value" });
  assert.equal(((await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).values as { short: { value: string } }).short.value, "Fresh independent Sister value");
  await as("designer"); const freshOutput = await uploads(freshFile, "fresh-sister-output.pdf"); await finish(freshFile, "director", "designer", { fileIds: [freshOutput.id] });
  const freshPublication = await db.universalTaskPublication.findFirstOrThrow({ where: { application: { taskId: freshFile } }, include: { runtimePublication: { include: { submission: true } } } });
  assert.equal(freshPublication.sourceVersionId, freshOutput.versionId); assert.notEqual(freshPublication.sourceVersionId, fileEvidence.versionId); assert.equal(freshPublication.runtimePublication?.submission.state, "SUBMITTED");
  assert.deepEqual(await Promise.all(originals.map(t => snapshot(t.id))), sourceSnapshots);
  await as("spm"); await assert.rejects(tasks.createTask(await proposal(final.id)), /SOURCE_INELIGIBLE/);
  const cleared = await tasks.createTask(await proposal(final.id, "MODIFY", { inspirationVersionIds: [], executorId: "designer2", spectatorIds: [] })); assert.equal((await tasks.getTask(cleared.id)).references?.length, 0);
  await as("jpm"); const jpmInitial = await create("INITIAL_CONCEPT"); await finish(jpmInitial.id, "jpm"); await as("spm"); await assert.rejects(tasks.sisterDraft(jpmInitial.id));
  await as("designer");
  for (const source of [fileTask, dataTask, inspect, initial, approvedFinal]) await assert.rejects(tasks.createTask(await proposal(source.id, "MODIFY", { executorId: "spm", spectatorIds: [] })));
  const designerProposal = await proposal(general.id, "MODIFY", { title: "Designer-owned fresh General Sister", executorId: "spm", spectatorIds: [] }, [generalEvidence.versionId]);
  const race = await Promise.allSettled([1, 2].map(() => asConcurrent("designer", () => tasks.createTask(designerProposal)))); assert.ok(race.some(r => r.status === "fulfilled"), JSON.stringify(race));
  const designerSister = await tasks.createTask(designerProposal); assert.equal(designerSister.replayed, true); assert.equal((await tasks.getTask(designerSister.id)).owner.id, "designer");
  await assert.rejects(runtime.getRuntimeProject(project.projectId)); await finish(designerSister.id, "designer", "spm");
  const chain = await tasks.createTask(await proposal(designerSister.id, "MODIFY", { title: "Chained Sister", executorId: "digital" }));
  assert.equal((await db.universalTaskFamilyLink.findUniqueOrThrow({ where: { taskId: chain.id } })).rootTaskId, general.id);
  await as("spm"); const hidden = await tasks.createTask(await proposal(general.id, "MODIFY", { title: "HIDDEN_FAMILY_SENTINEL", executorId: "designer2", spectatorIds: [] }));
  await as("designer"); const visible = await tasks.listTasks({ familyId: general.id, sort: "recent" }); assert.ok(!visible.tasks.some(t => t.id === hidden.id)); assert.equal((await tasks.listTasks({ familyId: general.id, search: "HIDDEN_FAMILY_SENTINEL" })).total, 0); assert.equal((await tasks.getTask(general.id)).family?.count, visible.total);
  await as("digital"); await assert.rejects(tasks.sisterDraft(general.id)); const restricted = await tasks.getTask(chain.id); assert.equal(restricted.family?.root, null); assert.equal(restricted.family?.source, null); assert.ok(!JSON.stringify(restricted).includes("Designer-owned fresh"));
  await as("tech"); await assert.rejects(tasks.listTasks({ familyId: general.id })); await assert.rejects(tasks.getTask(chain.id)); await assert.rejects(tasks.sisterDraft(general.id));

  // Manager participation cannot delegate another Task Owner's private source.
  await as("director"); const privateInspect = await create("INSPECT_FILE", { executorId: "jpm", spectatorIds: [] });
  const privateUpload = await uploads(privateInspect.id); await change(privateInspect.id, "SET_SOURCE", { sourceVersionId: privateUpload.versionId }); await finish(privateInspect.id, "director", "jpm");
  await as("jpm"); await assert.rejects(tasks.createTask(await proposal(privateInspect.id, "MODIFY", { executorId: "designer" })), /SOURCE_DELEGATION_DENIED/);
  const freshInspect = await tasks.createTask(await proposal(privateInspect.id, "MODIFY", { sourceVersionId: undefined, executorId: "designer" })); assert.equal((await tasks.getTask(freshInspect.id)).references?.length, 0);
  await as("director"); const delegatedFinal = await create("FINAL_CONCEPT", { executorId: "jpm", spectatorIds: [], inspirationVersionIds: [corrected.versionId] }); await finish(delegatedFinal.id, "director", "jpm");
  await as("jpm"); await assert.rejects(tasks.createTask(await proposal(delegatedFinal.id, "MODIFY", { executorId: "designer" })), /SOURCE_DELEGATION_DENIED/);
  // Incomplete uploads cannot become inspection sources.
  await as("spm"); const incomplete = await stageCommand("UPLOAD_PREPARED", { capabilityId: "files0", fileName: "incomplete.pdf", mimeType: "application/pdf", fileSize: 8, supersedesId: replacement.submissionId }) as { versionId: string };
  await assert.rejects(create("INSPECT_FILE", { sourceVersionId: incomplete.versionId }));
  // Authorized direct SQL still cannot omit/forge the typed source association.
  const authorization = (requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime")).runtimeAuthorization;
  const sqlTask = await create("INSPECT_FILE");
  async function forgedStageReference(link?: { projectId: string; submissionId: string }) {
    return authorization.runAuthorized({ capability: "task.manage", targetId: sqlTask.id }, async (tx, grant) => {
      const t = await tx.universalTask.update({ where: { id: sqlTask.id }, data: { version: { increment: 1 } } });
      const actor = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: grant.actorUserId } });
      const e = await tx.universalTaskEntry.create({ data: { taskId: t.id, version: t.version, commandId: randomUUID(), commandHash: "a".repeat(64), action: "SET_SOURCE", text: "Forged binding fixture", snapshot: { referenceVersionIds: [none.versionId] }, actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion, directorOverride: false } });
      const r = await tx.universalTaskReference.create({ data: { taskId: t.id, selectedEntryId: e.id, versionId: none.versionId, kind: "INSPECTION", sourceState: "SEALED" } });
      if (link) await tx.runtimeTaskReference.create({ data: { referenceId: r.id, ...link } });
      await tx.sharedFileProvenance.create({ data: { taskEntryId: e.id, versionId: none.versionId } });
    });
  }
  const sqlBefore = await snapshot(sqlTask.id);
  await assert.rejects(forgedStageReference()); await assert.rejects(forgedStageReference({ projectId: otherProject.projectId, submissionId: none.submissionId }));
  await assert.rejects(forgedStageReference({ projectId: project.projectId, submissionId: accepted.submissionId })); assert.equal(await snapshot(sqlTask.id), sqlBefore);

  await assert.rejects(authorization.runAuthorized({ capability: "task.createFinalConcept", targetId: `runtime:${otherProject.projectId}` }, async (tx, grant) => {
    const t = await tx.universalTask.create({ data: { type: "FINAL_CONCEPT", title: "Forged cross-project inspiration", brief: "Rollback fixture", ownerId: grant.actorUserId, executorId: "designer", deadline: new Date("2026-11-20T12:00:00Z") } });
    await tx.runtimeTaskContext.create({ data: { taskId: t.id, projectId: otherProject.projectId } });
    const actor = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: grant.actorUserId } });
    const e = await tx.universalTaskEntry.create({ data: { taskId: t.id, version: 1, commandId: randomUUID(), commandHash: "b".repeat(64), action: "CREATED", text: "Forged cross-context reference", snapshot: { referenceVersionIds: [corrected.versionId] }, actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion, directorOverride: false } });
    const u = await tx.universalTaskUpload.findUniqueOrThrow({ where: { id: corrected.id } });
    const review = await tx.universalTaskEntry.findFirstOrThrow({ where: { taskId: initial.id, action: "APPROVE" } });
    await tx.universalTaskReference.create({ data: { taskId: t.id, selectedEntryId: e.id, versionId: u.versionId, sourceUploadId: u.id, sourceSubmissionId: u.submittedEntryId, sourceReviewId: review.id, sourceState: "APPROVED", kind: "INSPIRATION" } });
    await tx.sharedFileProvenance.create({ data: { taskEntryId: e.id, versionId: u.versionId } });
  }), /Same genuine runtime source required/);
  assert.equal(await db.universalTask.count({ where: { title: "Forged cross-project inspiration" } }), 0);

  // Current sessions, actual storage pins, SQL immutability and late rollback.
  await as("digital"); const session = await db.session.findFirstOrThrow({ where: { userId: "digital" } });
  await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId));
  await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt, updatedAt: session.updatedAt } });
  const sealed = await db.sharedFileVersion.findUniqueOrThrow({ where: { id: selected.versionId } }), stored = objects.get(sealed.storageKey)!;
  objects.delete(sealed.storageKey); await assert.rejects(tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId)); objects.set(sealed.storageKey, { ...stored, ETag: '"changed"' }); await assert.rejects(tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId)); objects.set(sealed.storageKey, stored);
  assert.equal((await tasks.downloadTaskReference(final.id, finalRef.id, selected.versionId)).size, 8);
  await as("director"); await assert.rejects(db.runtimeTaskReference.delete({ where: { referenceId: stageRef.id } })); await assert.rejects(db.runtimeTaskReference.update({ where: { referenceId: stageRef.id }, data: { projectId: otherProject.projectId } })); await assert.rejects(db.universalTaskReference.update({ where: { id: finalRef.id }, data: { versionId: corrected.versionId } })); await assert.rejects(db.universalTaskFamilyLink.delete({ where: { taskId: chain.id } }));
  const counts = () => Promise.all([db.universalTask.count(), db.universalTaskReference.count(), db.runtimeTaskReference.count(), db.sharedFileProvenance.count(), db.universalTaskEntry.count(), db.businessEvent.count(), db.eventOutbox.count(), db.universalTaskFamilyLink.count(), db.universalTaskInheritedEvidence.count()]);
  await db.$executeRawUnsafe(`CREATE FUNCTION fixture_d_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Forced late reference rollback'; END $$`);
  await db.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER fixture_d_failure AFTER INSERT ON "SharedFileProvenance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixture_d_failure()`);
  const beforeRollback = await counts();
  try { await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [corrected.versionId] })); assert.deepEqual(await counts(), beforeRollback); await assert.rejects(tasks.createTask(await proposal(general.id, "KEEP", {}, [generalEvidence.versionId]))); assert.deepEqual(await counts(), beforeRollback); }
  finally { await db.$executeRawUnsafe('DROP TRIGGER fixture_d_failure ON "SharedFileProvenance"'); await db.$executeRawUnsafe('DROP FUNCTION fixture_d_failure()'); }
  const staleTask = await create("INSPECT_FILE"); const staleSource = await uploads(staleTask.id); const staleVersion = (await tasks.getTask(staleTask.id)).version; await change(staleTask.id, "MESSAGE"); await assert.rejects(tasks.mutateTask(staleTask.id, { commandId: randomUUID(), expectedVersion: staleVersion, action: "SET_SOURCE", text: "Stale", sourceVersionId: staleSource.versionId }), /STALE_TASK_VERSION/);
  // A new disposable manager demonstrates revocation without editing original accounts.
  const managerId = "concept-revoked-manager";
  await db.user.create({ data: { id: managerId, email: "concept-revoked@fixture.invalid", name: "Revoked concept fixture", passwordHash: "synthetic", role: "USER" } });
  async function managerRole(businessRole: "SENIOR_PROJECT_MANAGER" | "DESIGNER") {
    await db.$transaction(async tx => { await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable source revocation test',true),set_config('flux.authorization_change_id',${randomUUID()},true)`; await tx.userAuthorization.upsert({ where: { userId: managerId }, create: { userId: managerId, businessRole }, update: { businessRole } }); });
  }
  await managerRole("SENIOR_PROJECT_MANAGER");
  const { createVersionedSessionToken } = requireLocal(join(compiled, "src/lib/authorization/session.js")) as typeof import("../src/lib/authorization/session");
  await db.session.create({ data: { userId: managerId, token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600000) } });
  await as(managerId); const rp = await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Source revocation fixture", description: "Private", ownerId: managerId, coOwnerIds: [], executorIds: [] });
  const rt = await create("INSPECT_FILE", { contextTarget: `runtime:${rp.projectId}`, spectatorIds: [] }); const ru = await uploads(rt.id); await change(rt.id, "SET_SOURCE", { sourceVersionId: ru.versionId }); const rr = (await tasks.getTask(rt.id)).references![0];
  await as("designer"); assert.equal((await tasks.downloadTaskReference(rt.id, rr.id, rr.versionId)).size, 8); await managerRole("DESIGNER"); await assert.rejects(tasks.downloadTaskReference(rt.id, rr.id, rr.versionId));
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: project.projectId } })).state, "ACTIVE");
  for (const row of await db.businessEvent.findMany({ where: { taskId: { in: (await db.runtimeTaskContext.findMany({ where: { projectId: project.projectId } })).map(c => c.taskId) } }, include: { runtimeTaskContext: true } })) { assert.ok(events.decodeBusinessEvent(row)); assert.ok(await db.eventOutbox.findUnique({ where: { eventId: row.id } })); }
  assert.equal(JSON.stringify(await db.user.findMany({ where: { id: { not: managerId } }, orderBy: { id: "asc" }, include: { authorization: true, sessions: true } })), accounts);
  assert.equal(JSON.stringify([await db.projectArchive.count(), await db.manualLibraryAsset.count(), await db.project.count(), await db.flexibleProject.count()]), native); assert.equal(external, 0); assert.ok(reads > 0); assert.ok(copies > 0);
  console.log(`PASS runtime concepts and Sisters: ${assertions} assertions; actual runtime inspection, exact selected inspiration, independent reviews, all six Sister types, fresh targets, family privacy, current source delegation, immutable references, replay/concurrency, rollback, storage pins and preserved accounts/native contexts.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

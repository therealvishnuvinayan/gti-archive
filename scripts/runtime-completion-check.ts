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
      isAllowedProjectCompletionDocument: (name: string, mime: string) => name.endsWith(".pdf") && mime === "application/pdf", createPresignedUploadTarget: async () => ({ uploadUrl: "http://fixture.invalid/upload", expectedHeaders: {} }), getMaxAssetUploadBytes: () => 1e8, sanitizeFileName: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g,"_"), getS3BucketName: () => "isolated-fake-bucket", createPresignedUploadUrl: async () => "http://fixture.invalid/upload",
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
  const completion = requireLocal(join(compiled, "src/lib/runtime-completion/service.js")) as typeof import("../src/lib/runtime-completion/service");
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true, sessions: true } }));
  const native = JSON.stringify([await db.projectArchive.count(), await db.manualLibraryAsset.count(), await db.project.count(), await db.flexibleProject.count()]);
  const definition: import("../src/lib/stage-builder/contracts").WorkflowDefinition = { schemaVersion: 1, name: "Runtime completion fixture", description: "Isolated final lifecycle", intendedProjectType: "CUSTOM", stages: [{ id: "work", title: "Work", description: "Required ordered review", position: 0, gates: [], capabilities: [
    { id: "info", type: "INFORMATION", title: "Information", instructions: "", fields: [{ id: "brief", type: "SHORT_TEXT", label: "Brief", help: "", required: true, options: [], defaultValue: null, min: 1, max: 100 }] },
    { id: "review", type: "APPROVAL", title: "Stage approval", instructions: "", rejection: "RETURN_FOR_CHANGES", gatesProgression: true, steps: [{ id: "director", label: "Director", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" }] },
  ] }] };
  await as("director");
  const draft = await drafts.createDraft({ commandId: randomUUID(), definition });
  const submitted = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: "Completion fixture" });
  const approved = await publication.decideWorkflowPublication(submitted.id, { expected: { ...submitted.expected, commandId: randomUUID() }, configurationHash: submitted.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Reviewed fixture" });
  const pv = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: approved.publishedVersion!.id } });
  const createProject = async (ownerId = "spm") => { await as("director"); return (await runtime.createRuntimeProject({ commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "Completion project", description: "Synthetic only", ownerId, coOwnerIds: ownerId === "director" ? ["spm", "jpm"] : ["jpm"], executorIds: ["designer"] })).projectId; };
  const projectId = await createProject(), other = await createProject();
  const stageCommand = async (pid: string, action: string, extra = {}) => { const s = await db.runtimeStage.findFirstOrThrow({ where: { projectId: pid } }); return runtime.runtimeStageCommand(pid, s.id, { commandId: randomUUID(), expectedRevision: s.revision, action, ...extra }); };
  const finishStages = async (pid: string) => { await as("spm"); await stageCommand(pid, "FIELDS", { values: { brief: "Real configured evidence" } }); await stageCommand(pid, "APPROVAL_SUBMITTED", { capabilityId: "review" }); const a = (await runtime.getRuntimeProject(pid)).stage.approvals[0]; await as("director"); await stageCommand(pid, "APPROVAL_DECIDED", { expected: { requestId: a.requestId, stepId: a.steps[0].id, revision: a.revision, evidenceHash: a.evidenceHash, commandId: randomUUID() }, confirmed: true, outcome: "APPROVE", reason: "Independent stage review" }); await as("jpm"); await stageCommand(pid, "COMPLETED", { reason: "Explicit stage completion" }); };
  const proposal = async (pid: string, action: string, extra = {}) => { const d = await completion.getRuntimeCompletion(pid); return { commandId: randomUUID(), expectedRevision: d.revision, expectedProjectRevision: d.projectRevision, expectedPolicyRevision: d.policyRevision, action, ...extra }; };
  const cmd = async (action: string, extra = {}, pid = projectId) => completion.runtimeCompletionCommand(pid, await proposal(pid, action, extra));
  const policy = (proof = "REQUIRED", copyright = "OPTIONAL", invoice = "NOT_APPLICABLE") => ({ AUTHORITY_APPROVAL_PROOF: proof, COPYRIGHT_TRANSFER: copyright, INVOICE: invoice });
  const configure = async (value = policy(), pid = projectId) => { await as("director"); return cmd("POLICY_APPROVED", { settings: value, reason: "Explicit approved business requirements", confirmed: true }, pid); };
  const request = async (pid = projectId) => cmd("COMPLETION_REQUESTED", { reason: "All configured evidence is ready", confirmed: true }, pid);
  const pending = async (pid = projectId) => (await completion.getRuntimeCompletion(pid)).requests.find(r => r.state === "PENDING")!;
  const decision = async (outcome = "APPROVE", pid = projectId) => { const r = await pending(pid); return cmd("COMPLETION_DECIDED", { requestId: r.id, requestHash: r.hash, reason: "Explicit separate final Director decision", confirmed: true, outcome }, pid); };
  const upload = async (category = "AUTHORITY_APPROVAL_PROOF", pid = projectId) => {
    const result = await cmd("UPLOAD_PREPARED", { category, fileName: "proof.pdf", mimeType: "application/pdf", fileSize: 8 }, pid);
    const s = await db.runtimeDocumentSubmission.findUniqueOrThrow({ where: { id: String(result.submissionId) }, include: { version: true } });
    await completion.runtimeDocumentUploadTarget(pid, s.id);
    objects.set(s.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: `"${s.id}"`, VersionId: `upload-${s.id}` });
    await cmd("DOCUMENT_SUBMITTED", { submissionId: s.id }, pid); return s;
  };
  const review = async (submissionId: string, outcome = "APPROVE", pid = projectId) => { const d = (await completion.getRuntimeCompletion(pid)).documents.find(x => x.id === submissionId)!; return cmd("DOCUMENT_REVIEWED", { submissionId, expected: { ...d.expected, commandId: randomUUID() }, outcome, reason: "Actual manager exact-version review", confirmed: true }, pid); };
  const bad = async (fn: () => Promise<unknown>) => { const before = await db.runtimeCompletionActivity.count(); await assert.rejects(fn); assert.equal(await db.runtimeCompletionActivity.count(), before); };
  await as("spm"); let view = await completion.getRuntimeCompletion(projectId);
  assert.equal(view.configured, false); assert.equal(view.settings, null); assert.equal(view.ready, false); assert.equal(view.externalLinksAvailable, false);
  await bad(() => request()); await bad(() => cmd("COMPLETION_REQUESTED", { ownerId: "director", reason: "Forged owner", confirmed: true })); await finishStages(projectId); await as("spm"); await bad(() => request());
  await bad(() => cmd("POLICY_APPROVED", { settings: policy(), reason: "Forged Director", confirmed: true }));
  await as("jpm"); await bad(() => cmd("POLICY_APPROVED", { settings: policy(), reason: "Co-owner", confirmed: true }));
  await as("director"); await bad(() => cmd("POLICY_APPROVED", { settings: { INVOICE: "REQUIRED" }, reason: "Incomplete", confirmed: true }));
  await bad(() => cmd("POLICY_APPROVED", { settings: policy(), reason: "", confirmed: true }));
  await bad(() => cmd("POLICY_APPROVED", { settings: policy(), reason: "Unconfirmed", confirmed: false }));
  await configure(); await as("spm"); await bad(() => request());
  await bad(() => cmd("ISSUE_EXTERNAL_LINK", { recipientEmail: "real@example.test" }));
  await bad(() => cmd("SUBMIT_EXTERNAL_DOCUMENT", { token: "unsupported-runtime-token", externalSubmitterEmail: "real@example.test" }));
  const nativeCompletion = requireLocal(join(compiled, "src/lib/completion-documents/service.js")) as typeof import("../src/lib/completion-documents/service");
  const externalCounts = [await db.completionDocumentAccess.count(), await db.completionDocumentSubmission.count(), await db.runtimeDocumentSubmission.count()];
  await bad(() => nativeCompletion.issueCompletionDocumentAccess({ id: "spm" }, { projectId, type: "AUTHORITY_APPROVAL_PROOF", recipientEmail: "real@example.test" }));
  for (const action of ["INFO", "PREPARE", "FINISH"] as const) await bad(() => nativeCompletion.externalCompletionSubmission("unsupported-runtime-token", action, { originalFileName: "proof.pdf", mimeType: "application/pdf", fileSize: 8, storageKey: `runtime-completion/${projectId}/forged` }));
  assert.deepEqual([await db.completionDocumentAccess.count(), await db.completionDocumentSubmission.count(), await db.runtimeDocumentSubmission.count()], externalCounts);
  await bad(() => cmd("UPLOAD_PREPARED", { category: "INVOICE", fileName: "invoice.pdf", mimeType: "application/pdf", fileSize: 8 }));
  await bad(() => cmd("UPLOAD_PREPARED", { category: "AUTHORITY_APPROVAL_PROOF", fileName: "bad.exe", mimeType: "application/octet-stream", fileSize: 8 }));
  const rejected = await upload(); await bad(() => request()); await review(rejected.id, "REJECT"); await bad(() => request());
  const accepted = await upload(); await bad(() => review(rejected.id));
  await bad(() => completion.openRuntimeDocument(other, accepted.versionId));
  const wrong = await proposal(projectId, "DOCUMENT_REVIEWED", { submissionId: accepted.id, expected: { requestId: "forged", stepId: "forged", evidenceHash: "f".repeat(64), revision: 0, commandId: randomUUID() }, outcome: "APPROVE", reason: "Wrong identity", confirmed: true });
  await bad(() => completion.runtimeCompletionCommand(projectId, wrong));
  await review(accepted.id); // Native document semantics permit this authorized uploader/manager review.
  view = await completion.getRuntimeCompletion(projectId); assert.equal(view.ready, true); assert.equal(view.documents[0].reviewer?.id, "spm"); assert.equal(view.documents[0].uploader.id, "spm");
  assert.equal((await db.runtimeDocumentSubmission.findUniqueOrThrow({ where: { id: rejected.id } })).state, "REJECTED");
  await completion.openRuntimeDocument(projectId, accepted.versionId); await completion.openRuntimeDocument(projectId, rejected.versionId);
  await bad(() => cmd("COMPLETION_REQUESTED", { reason: "", confirmed: true })); await bad(() => cmd("COMPLETION_REQUESTED", { reason: "Missing confirmation", confirmed: false }));
  await as("jpm"); await bad(() => request()); await as("director"); await bad(() => request());
  await as("spm"); const r1 = await request(); assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  await bad(() => request());
  // Optional work is not an extra gate and does not supersede the pending request.
  const optional = await upload("COPYRIGHT_TRANSFER"); await review(optional.id, "REJECT"); assert.equal((await pending()).id, r1.requestId);
  await as("spm"); await bad(() => decision()); await as("director"); await decision("REJECT"); assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  await as("spm"); await request(); const oldPending = await pending();
  await configure(policy("REQUIRED", "OPTIONAL", "REQUIRED")); assert.equal((await db.runtimeCompletionRequest.findUniqueOrThrow({ where: { id: oldPending.id } })).state, "SUPERSEDED");
  await bad(() => cmd("COMPLETION_DECIDED", { requestId: oldPending.id, requestHash: oldPending.hash, reason: "Stale", confirmed: true, outcome: "APPROVE" }));
  await as("spm"); await bad(() => request()); const invoice = await upload("INVOICE"); await as("jpm"); await review(invoice.id);
  await as("spm"); await request(); const r3 = await pending(); const replacement = await upload();
  assert.equal((await db.runtimeCompletionRequest.findUniqueOrThrow({ where: { id: r3.id } })).state, "SUPERSEDED"); await bad(() => request()); await review(replacement.id);
  // Missing or modified storage blocks request despite relational acceptance.
  const sealed = objects.get(replacement.version.storageKey)!; objects.delete(replacement.version.storageKey); await bad(() => request()); objects.set(replacement.version.storageKey, { ...sealed, ETag: '"changed"' }); await bad(() => request()); objects.set(replacement.version.storageKey, sealed);
  const stale = await proposal(projectId, "COMPLETION_REQUESTED", { reason: "Stale policy", confirmed: true });
  await configure(policy("REQUIRED", "NOT_APPLICABLE", "REQUIRED")); await as("spm"); await bad(() => completion.runtimeCompletionCommand(projectId, stale));
  assert.equal((await completion.getRuntimeCompletion(projectId)).documents.filter(d => d.category === "COPYRIGHT_TRANSFER").length, 1);
  await bad(() => upload("COPYRIGHT_TRANSFER"));
  for (const actor of ["designer", "digital", "tech", "outsider", "spm2"]) {
    await as(actor); await assert.rejects(() => completion.getRuntimeCompletion(projectId)); await assert.rejects(() => completion.openRuntimeDocument(projectId, replacement.versionId)); await assert.rejects(() => completion.runtimeDocumentUploadTarget(projectId, replacement.id)); await assert.rejects(() => completion.runtimeCompletionCommand(projectId, stale));
  }
  await as("spm"); const nativeTask = await tasks.createTask({ commandId: randomUUID(), contextTarget: `runtime:${projectId}`, type: "GENERAL", title: "Retained task", brief: "Read only after completion", deadline: "2026-12-20T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: [] });
  // Outbox failure rolls request, activity and events back together.
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_completion_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'runtime-completion:%' THEN RAISE EXCEPTION 'forced rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_completion_outbox BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION fail_completion_outbox()`);
  const beforeRequests = await db.runtimeCompletionRequest.count(); await bad(() => request()); assert.equal(await db.runtimeCompletionRequest.count(), beforeRequests);
  await db.$executeRawUnsafe(`DROP TRIGGER fail_completion_outbox ON "EventOutbox"`); await db.$executeRawUnsafe(`DROP FUNCTION fail_completion_outbox()`);
  const requestCommand = await proposal(projectId, "COMPLETION_REQUESTED", { reason: "Concurrent exact request", confirmed: true });
  const competingRequests = [requestCommand, { ...requestCommand, commandId: randomUUID() }];
  const requested = await Promise.allSettled(competingRequests.map(c => asConcurrent("spm", () => completion.runtimeCompletionCommand(projectId, c))));
  assert.equal(requested.filter(r => r.status === "fulfilled").length, 1);
  const winner = requested.findIndex(r => r.status === "fulfilled");
  const duplicateRequest = await completion.runtimeCompletionCommand(projectId, competingRequests[winner]);
  assert.deepEqual(duplicateRequest, (requested[winner] as PromiseFulfilledResult<unknown>).value);
  assert.equal(await db.runtimeCompletionRequest.count({ where: { projectId, state: "PENDING" } }), 1);
  await as("director"); const finalRequest = await pending(); const finalCommand = await proposal(projectId, "COMPLETION_DECIDED", { requestId: finalRequest.id, requestHash: finalRequest.hash, reason: "Approved exact final evidence", confirmed: true, outcome: "APPROVE" });
  await bad(() => completion.runtimeCompletionCommand(projectId, { ...finalCommand, commandId: randomUUID(), requestHash: "f".repeat(64) }));
  const finalObject = objects.get(replacement.version.storageKey)!; objects.delete(replacement.version.storageKey);
  await bad(() => completion.runtimeCompletionCommand(projectId, finalCommand)); objects.set(replacement.version.storageKey, finalObject);
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_completion_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'runtime-completion:%' THEN RAISE EXCEPTION 'forced final rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_completion_outbox BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION fail_completion_outbox()`);
  await bad(() => completion.runtimeCompletionCommand(projectId, finalCommand));
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  assert.equal(await db.runtimeCompletionDecision.count({ where: { projectId, outcome: "APPROVE" } }), 0);
  assert.equal((await pending()).id, finalRequest.id);
  await db.$executeRawUnsafe(`DROP TRIGGER fail_completion_outbox ON "EventOutbox"`); await db.$executeRawUnsafe(`DROP FUNCTION fail_completion_outbox()`);
  const expired = await db.session.create({ data: { userId: "director", token: `v2.1.${randomUUID().replaceAll("-", "").repeat(2)}`, expiresAt: new Date(Date.now() - 60_000) } });
  await assert.rejects(() => authStore.run(expired.token, () => completion.runtimeCompletionCommand(projectId, finalCommand)));
  await assert.rejects(() => authStore.run(expired.token, () => completion.openRuntimeDocument(projectId, replacement.versionId)));
  await db.session.delete({ where: { id: expired.id } });
  const results = await Promise.all([asConcurrent("director", () => completion.runtimeCompletionCommand(projectId, finalCommand)), asConcurrent("director", () => completion.runtimeCompletionCommand(projectId, finalCommand))]);
  assert.deepEqual(results[0], results[1]); await bad(() => completion.runtimeCompletionCommand(projectId, { ...finalCommand, outcome: "REJECT" })); assert.equal(await db.runtimeCompletionDecision.count({ where: { projectId, outcome: "APPROVE" } }), 1);
  view = await completion.getRuntimeCompletion(projectId); assert.equal(view.state, "COMPLETED"); assert.equal(view.canConfigure, false); assert.equal(view.canSubmit, false);
  assert.equal((await runtime.listRuntimeProjects()).projects.find(p => p.id === projectId)?.state, "COMPLETED"); await runtime.getRuntimeProject(projectId); await completion.openRuntimeDocument(projectId, accepted.versionId);
  await bad(() => cmd("POLICY_APPROVED", { settings: policy(), reason: "Reopen", confirmed: true })); await bad(() => upload()); await assert.rejects(() => stageCommand(projectId, "FIELDS", { values: { brief: "Changed" } }));
  await as("designer"); await tasks.getTask(nativeTask.id); await assert.rejects(async () => tasks.mutateTask(nativeTask.id, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(nativeTask.id)).version, action: "MESSAGE", text: "Late change" }));
  await as("spm"); await assert.rejects(() => tasks.createTask({ commandId: randomUUID(), contextTarget: `task:${nativeTask.id}`, type: "GENERAL", title: "Forbidden late task", brief: "", deadline: "2026-12-20T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: [] }));
  // Director-as-Owner remains two explicit operations under native project policy.
  const directorProject = await createProject("director"); await finishStages(directorProject); await configure(policy("NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"), directorProject);
  await as("director"); await request(directorProject); assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: directorProject } })).state, "ACTIVE"); await decision("APPROVE", directorProject);
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: directorProject } })).state, "COMPLETED");
  const raceProject = await createProject("director"); await finishStages(raceProject);
  await configure(policy("NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"), raceProject); await request(raceProject);
  const raceRequest = await pending(raceProject), raceCommand = await proposal(raceProject, "COMPLETION_DECIDED", { requestId: raceRequest.id, requestHash: raceRequest.hash, reason: "Competing explicit Director decisions", confirmed: true, outcome: "APPROVE" });
  const races = await Promise.allSettled([raceCommand, { ...raceCommand, commandId: randomUUID(), outcome: "REJECT" }].map(c => asConcurrent("director", () => completion.runtimeCompletionCommand(raceProject, c))));
  assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await db.runtimeCompletionDecision.count({ where: { requestId: raceRequest.id } }), 1);
  const committedRace = await db.runtimeCompletionDecision.findUniqueOrThrow({ where: { requestId: raceRequest.id } });
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: raceProject } })).state, committedRace.outcome === "APPROVE" ? "COMPLETED" : "ACTIVE");
  await configure(policy("NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"), other); await as("spm"); await bad(() => request(other));
  await stageCommand(other, "FIELDS", { values: { brief: "Review missing" } }); await stageCommand(other, "APPROVAL_SUBMITTED", { capabilityId: "review" }); await bad(() => request(other));
  // Direct tampering never erases history or fabricates final state.
  for (const table of ["RuntimeDocumentPolicy", "RuntimeCompletionActivity", "RuntimeDocumentSubmission", "RuntimeDocumentReference", "RuntimeDocumentProvenance", "RuntimeCompletionRequest", "RuntimeCompletionDecision"]) {
    await assert.rejects(() => db.$executeRawUnsafe(`DELETE FROM "${table}"`)); await assert.rejects(() => db.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`));
  }
  await assert.rejects(() => db.$executeRawUnsafe(`UPDATE "RuntimeProject" SET state='COMPLETED' WHERE id='${other}'`));
  await assert.rejects(() => db.sharedFileReference.create({ data: { versionId: accepted.versionId, role: "SOURCE" } }));
  await assert.rejects(() => db.sharedFileProvenance.create({ data: { versionId: accepted.versionId } }));
  const rows = await db.runtimeCompletionActivity.findMany({ include: { event: { include: { delivery: true } } } });
  for (const a of rows) { assert.equal(a.event.type, "RUNTIME_COMPLETION_ACTIVITY"); assert.equal(a.event.actorId, a.actorId); assert.equal(a.event.projectId, null); assert.equal(events.decodeBusinessEvent(a.event).native.id, a.id); assert.ok(a.event.delivery); }
  assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true, sessions: true } })), accounts);
  assert.equal(JSON.stringify([await db.projectArchive.count(), await db.manualLibraryAsset.count(), await db.project.count(), await db.flexibleProject.count()]), native);
  assert.equal(external, 0); assert.ok(copies >= 5); assert.ok(reads >= 3);
  process.env.FLUX_RUNTIME_INTEGRATION = "0"; await assert.rejects(() => completion.getRuntimeCompletion(projectId)); await assert.rejects(() => completion.openRuntimeDocument(projectId, accepted.versionId)); process.env.FLUX_RUNTIME_INTEGRATION = "1";
  console.log(`PASS Phase 4.4E runtime completion: ${assertions} assertions; explicit Director policy, exact document reviews, Owner request, separate final Director decision, concurrency, rollback, immutable completion and native preservation.`);
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });

import nodeAssert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createRequire } from "node:module";
import { realpathSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient, BusinessRole } from "@prisma/client";
import type { WorkflowDefinition } from "../src/lib/stage-builder/contracts";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const v = Reflect.get(target, property); return typeof v === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(v, target, args); } : v; } });
const root = realpathSync(process.env.FLUX_DASHBOARD_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-dashboard-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://dashboard_test@localhost:55439/dashboard_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.DATABASE_URL, url);
const req = createRequire(__filename), Client = (req("@prisma/client") as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url, log: [{ emit: "event", level: "query" }] });
const queries: { query: string; params: string }[] = [];
db.$on("query", e => { if (process.env.FLUX_NOTIFICATIONS_CAPTURE === "1" || process.env.FLUX_SEARCH_CAPTURE === "1" || process.env.FLUX_CALENDAR_CAPTURE === "1") queries.push({ query: e.query, params: e.params }); });
let token: string | null = null;
async function as(userId: string) { token = (await db.session.findFirstOrThrow({ where: { userId } })).token; }
async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ data: string; tcp: string }>>`SELECT current_setting('data_directory') AS data,current_setting('listen_addresses') AS tcp`)[0], { data: join(root, "data"), tcp: "" });
  const mod = req("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string }>();
  let storageReads = 0, external = 0;
  global.fetch = async () => { external++; throw new Error("External network forbidden"); };
  mod._load = function(name, ...args) {
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name.endsWith("storage/s3")) return { getS3BucketName: () => "fake-only", getMaxAssetUploadBytes: () => 1e8, sanitizeFileName: (s: string) => s,
      getObjectMetadata: async (key: string) => { storageReads++; const o = objects.get(key); assert.ok(o); return o; },
      copyStoredObject: async (p: { sourceKey: string; storageKey: string }) => { const o = objects.get(p.sourceKey); assert.ok(o); objects.set(p.storageKey, o!); },
      createPresignedUploadUrl: async () => "http://127.0.0.1/fake", createPresignedUploadTarget: async () => ({ uploadUrl: "http://127.0.0.1/fake" }) };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const dashboard = req(join(compiled, "src/lib/dashboard-v2/service.js")) as typeof import("../src/lib/dashboard-v2/service");
  const api = req(join(compiled, "src/app/api/dashboard/route.js")) as typeof import("../src/app/api/dashboard/route");
  const tasks = req(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  const drafts = req(join(compiled, "src/lib/stage-builder/service.js")) as typeof import("../src/lib/stage-builder/service");
  const pub = req(join(compiled, "src/lib/stage-builder/publication.js")) as typeof import("../src/lib/stage-builder/publication");
  const runtime = req(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const completion = req(join(compiled, "src/lib/runtime-completion/service.js")) as typeof import("../src/lib/runtime-completion/service");
  const creation = req(join(compiled, "src/lib/runtime-integration/creation.js")) as typeof import("../src/lib/runtime-integration/creation");
  const password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex");
  const roles: [string, BusinessRole | null][] = [["director", "DIRECTOR"], ["spm", "SENIOR_PROJECT_MANAGER"], ["spm2", "SENIOR_PROJECT_MANAGER"], ["jpm", "JUNIOR_PROJECT_MANAGER"], ["designer", "DESIGNER"], ["designer2", "DESIGNER"], ["digital", "DIGITAL_LEAD"], ["tech", null], ["empty", "DESIGNER"]];
  for (const [id] of roles) await db.user.create({ data: { id, name: `Fixture ${id}`, email: `${id}@dashboard.invalid`, role: id === "tech" ? "SUPER_ADMIN" : "USER", passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}` } });
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable dashboard acceptance',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    for (const [userId, businessRole] of roles) await tx.userAuthorization.create({ data: { userId, businessRole, technicalPrivileges: businessRole ? [] : ["TECHNICAL_ADMIN"] } });
  });
  for (const [userId] of roles) await db.session.create({ data: { userId, token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600_000) } });
  for (const id of ["director", "spm", "jpm", "designer", "digital"]) {
    await as(id); const empty = await dashboard.getRoleDashboard(); assert.equal(empty.work.total, 0); assert.equal(empty.projects.total, 0); assert.equal(empty.attention.completeCount, 0);
  }
  await as("tech"); await assert.rejects(dashboard.getRoleDashboard()); assert.equal((await api.GET(new Request("http://local/api/dashboard"))).status, 403);
  token = null; assert.equal((await api.GET(new Request("http://local/api/dashboard"))).status, 403);
  await as("director"); process.env.FLUX_DASHBOARD_V2 = "0"; assert.equal((await api.GET(new Request("http://local/api/dashboard"))).status, 404); process.env.FLUX_DASHBOARD_V2 = "1";
  for (const attack of [{ actorId: "director" }, { projectPage: -1 }, { projectPage: "1e2" }, { family: "secret" }, { work: "global" }, { projectPage: ["1", "2"] }]) await assert.rejects(dashboard.getRoleDashboard(attack));
  assert.equal((await api.GET(new Request("http://local/api/dashboard?work=action&work=owned"))).status, 400);
  const nativeStatus = await db.projectStatusOption.findUniqueOrThrow({ where: { slug: "in-progress" } });
  await db.project.create({ data: { statusId: nativeStatus.id, id: "native", name: "Native artwork project", category: "Artwork", ownerId: "spm", createdById: "spm", coOwners: { create: { userId: "jpm" } }, executors: { create: { userId: "designer" } } } });
  await db.project.create({ data: { statusId: nativeStatus.id, id: "private", name: "PRIVATE_PROJECT_SENTINEL", ownerId: "spm2", createdById: "spm2" } });
  await db.flexibleProject.create({ data: { id: "flexible", slug: "dashboard-flexible", name: "Flexible campaign", ownerId: "spm", createdById: "spm" } });
  const definition: WorkflowDefinition = { schemaVersion: 1, name: "Dashboard workflow", description: "Synthetic acceptance only", intendedProjectType: "CUSTOM", stages: [
    { id: "brief", title: "Brief", description: "Controlled evidence", position: 0, gates: [], capabilities: [
      { id: "info", type: "INFORMATION", title: "Brief", instructions: "", fields: [{ id: "note", type: "SHORT_TEXT", label: "Note", help: "", required: false, options: [], defaultValue: null, min: null, max: 200 }] },
      { id: "files", type: "FILE_REQUIREMENT", title: "Files", instructions: "", acceptedTypes: [".pdf", "application/pdf"], minFiles: 0, maxFiles: 4, required: false, acceptance: "NONE", acceptedVersionsGate: false },
      { id: "approval", type: "APPROVAL", title: "Independent decision", instructions: "", rejection: "RETURN_FOR_CHANGES", gatesProgression: false, steps: [{ id: "director", label: "Director decision", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" }] },
    ] },
  ] };
  await as("spm"); const draft = await drafts.createDraft({ commandId: randomUUID(), definition });
  const submission = await pub.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: "Dashboard fixture" });
  await as("director"); assert.equal((await dashboard.getRoleDashboard({ attention: "workflows" })).attention.items.length, 1);
  const approved = await pub.decideWorkflowPublication(submission.id, { expected: { ...submission.expected, commandId: randomUUID() }, configurationHash: submission.configurationHash, outcome: "APPROVE", reason: "Synthetic approved workflow", confirmed: true });
  assert.equal((await dashboard.getRoleDashboard({ attention: "workflows" })).attention.items.length, 0);
  const createInput = (title: string, ownerId = "spm") => ({ commandId: randomUUID(), publishedVersionId: approved.publishedVersion!.id, definitionHash: draft.configurationHash, title, description: "Synthetic only", ownerId, coOwnerIds: ownerId === "spm2" ? [] : ["jpm"], executorIds: ["designer", "digital"] });
  const projectId = (await runtime.createRuntimeProject(createInput("Runtime design project"))).projectId;
  const privateRuntime = (await runtime.createRuntimeProject(createInput("PRIVATE_RUNTIME_SENTINEL", "spm2"))).projectId;
  await as("spm"); const scope = await dashboard.getRoleDashboard(); assert.equal(scope.projects.total, 1); assert.equal(scope.projects.counts?.active, 3); assert.equal(scope.projects.counts?.completed, 0);
  assert.equal((await dashboard.getRoleDashboard({ family: "native" })).projects.items[0].id, "native");
  assert.equal((await dashboard.getRoleDashboard({ family: "flexible" })).projects.items[0].href, "/projects/flexible/dashboard-flexible");
  await as("director"); assert.equal((await dashboard.getRoleDashboard()).projects.counts?.active, 5);
  await as("jpm"); await assert.rejects(runtime.createRuntimeProject({ ...createInput("Bypass", "jpm"), coOwnerIds: ["spm"] }));
  await assert.rejects(creation.requestRuntimeCreation({ creation: { ...createInput("Missing SPM", "jpm"), coOwnerIds: [] }, reason: "Test governance" }));
  await creation.requestRuntimeCreation({ creation: { ...createInput("JPM requested project", "jpm"), coOwnerIds: ["spm"] }, reason: "Please review new project" });
  assert.equal((await dashboard.getRoleDashboard()).requests[0].state, "PENDING");
  assert.equal((await dashboard.getRoleDashboard({ attention: "creation" })).attention.items.length, 0);
  await as("director"); assert.equal((await dashboard.getRoleDashboard({ attention: "creation" })).attention.items.length, 1);
  const stage = await db.runtimeStage.findFirstOrThrow({ where: { projectId } });
  const stageCommand = async (action: string, extra = {}) => runtime.runtimeStageCommand(projectId, stage.id, { commandId: randomUUID(), expectedRevision: (await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).revision, action, ...extra });
  await as("spm"); await stageCommand("APPROVAL_SUBMITTED", { capabilityId: "approval" });
  assert.equal((await dashboard.getRoleDashboard({ attention: "stages" })).attention.items.length, 0);
  await as("director"); assert.equal((await dashboard.getRoleDashboard({ attention: "stages" })).attention.items.length, 1);
  await as("spm"); await stageCommand("FIELDS", { values: { note: "Evidence changed" } });
  await as("director"); assert.equal((await dashboard.getRoleDashboard({ attention: "stages" })).attention.items.length, 0);
  await as("spm"); await stageCommand("APPROVAL_SUBMITTED", { capabilityId: "approval" });
  const createTask = (title: string, executorId = "designer", type = "GENERAL", extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget: `runtime:${projectId}`, title, type, brief: "Synthetic brief", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId, spectatorIds: [], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Actual synthetic task lifecycle", ...extra });
  const task = await createTask("Prepare design brief");
  const digitalTask = await createTask("Digital campaign review", "digital");
  const inspection = await createTask("Inspect proof", "designer", "INSPECT_FILE");
  const dataTask = await createTask("Enter approved note", "designer", "DATA_INPUT", { destination: `runtime-field:${stage.id}:info:note`, inputMode: "TEXT" });
  const fileTask = await createTask("Upload design files", "designer", "FILE_UPLOAD", { destination: `runtime-file:${stage.id}:files`, inputMode: "FILE" });
  const initial = await createTask("Initial design concept", "designer", "INITIAL_CONCEPT");
  const upload = async (id: string) => { const p = await change(id, "PREPARE_UPLOAD", { fileName: "concept.pdf", mimeType: "application/pdf", fileSize: 8 }); const u = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: p.uploadId! } }); objects.set(u.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: '"synthetic-proof"' }); await change(id, "FINALIZE_UPLOAD", { uploadId: u.id }); return u; };
  await as("designer"); const proof = await upload(initial.id); await change(initial.id, "SUBMIT", { fileIds: [proof.id] }); await change(initial.id, "REQUEST_COMPLETION");
  await as("spm"); await change(initial.id, "APPROVE");
  const final = await createTask("Final design concept", "designer", "FINAL_CONCEPT", { inspirationVersionIds: [proof.versionId] });
  const inspectionProof = await upload(inspection.id);
  await change(inspection.id, "SET_SOURCE", { sourceVersionId: inspectionProof.versionId });
  await as("designer"); const action = await dashboard.getRoleDashboard(); assert.equal(action.work.actionable, 5); assert.equal(action.projects.counts, null); assert.equal(action.projects.items[0].status, null);
  assert.ok(action.work.items.every(t => t.executor.id === "designer")); assert.ok(!JSON.stringify(action).includes("PRIVATE_")); assert.ok(!JSON.stringify(action).includes(digitalTask.id));
  assert.ok(!action.links.some(l => /workflow|runtime/.test(l.href)));
  const completed = await dashboard.getRoleDashboard({ work: "completed" }); assert.equal(completed.work.items.find(t => t.id === initial.id)?.status, "COMPLETED");
  const proposal = { commandId: randomUUID(), contextTarget: `runtime:${projectId}`, type: "GENERAL", title: "Sister design follow-up", brief: "Independent sister", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId: "digital", spectatorIds: [], sister: { sourceTaskId: initial.id, sourceVersion: (await tasks.getTask(initial.id)).version, mode: "MODIFY", evidenceVersionIds: [], confirmed: true, confirmation: "" } };
  // Keep the original type for the family; a separate new task is not a Sister.
  proposal.type = "INITIAL_CONCEPT";
  await as("spm"); proposal.sister.confirmation = (await tasks.previewSister(proposal)).confirmation;
  const sister = await tasks.createTask(proposal);
  await as("digital"); assert.ok((await dashboard.getRoleDashboard()).work.items.some(t => t.id === sister.id && t.isSister)); assert.equal((await dashboard.getRoleDashboard()).projects.counts, null);
  await as("designer"); await change(task.id, "REQUEST_COMPLETION"); assert.ok(!(await dashboard.getRoleDashboard()).work.items.some(t => t.id === task.id));
  await as("spm"); assert.ok((await dashboard.getRoleDashboard({ attention: "tasks" })).attention.items.some(t => t.id === task.id));
  await change(task.id, "REJECT"); assert.ok(!(await dashboard.getRoleDashboard({ attention: "tasks" })).attention.items.some(t => t.id === task.id));
  await as("designer"); await change(task.id, "REQUEST_COMPLETION");
  const owned = await tasks.createTask({ commandId: randomUUID(), contextTarget: `task:${task.id}`, type: "GENERAL", title: "Designer owned follow-up", brief: "Narrow task relationship", deadline: "2026-11-22T12:00:00Z", priority: "NORMAL", executorId: "digital", spectatorIds: [] });
  await as("digital"); await change(owned.id, "REQUEST_COMPLETION");
  await as("designer"); assert.ok((await dashboard.getRoleDashboard()).attention.items.some(t => t.id === owned.id));
  await as("director"); const privateTask = await createTask("PRIVATE_TASK_SENTINEL", "designer2");
  await as("spm"); assert.ok(!JSON.stringify(await dashboard.getRoleDashboard({ work: "owned" })).includes(privateTask.id)); await assert.rejects(tasks.getTask(privateTask.id));
  for (const id of ["designer", "digital", "jpm", "spm"]) { await as(id); await assert.rejects(runtime.getRuntimeProject(privateRuntime)); }
  await as("director");
  for (let i = 0; i < 13; i++) await runtime.createRuntimeProject(createInput(`Paginated project ${String(i).padStart(2, "0")}`));
  const first = await dashboard.getRoleDashboard(), second = await dashboard.getRoleDashboard({ projectPage: 1 });
  assert.equal(first.projects.items.length, 12); assert.equal(first.projects.hasMore, true); assert.ok(second.projects.items.length > 0);
  assert.ok(!first.projects.items.some(a => second.projects.items.some(b => a.id === b.id))); assert.deepEqual(first.projects.items, (await dashboard.getRoleDashboard()).projects.items);
  assert.equal(first.attention.completeCount, null); assert.equal(first.attention.hasMore, true);
  assert.equal(first.projects.counts?.active, await db.runtimeProject.count({ where: { state: "ACTIVE" } }) + 3);
  const policyCommand = async (pid: string, action: string, extra = {}) => { const d = await completion.getRuntimeCompletion(pid); return completion.runtimeCompletionCommand(pid, { commandId: randomUUID(), expectedRevision: d.revision, expectedProjectRevision: d.projectRevision, expectedPolicyRevision: d.policyRevision, action, ...extra }); };
  const completeId = (await runtime.createRuntimeProject(createInput("Ready for final completion"))).projectId;
  const cs = await db.runtimeStage.findFirstOrThrow({ where: { projectId: completeId } });
  await as("spm"); await runtime.runtimeStageCommand(completeId, cs.id, { commandId: randomUUID(), expectedRevision: cs.revision, action: "COMPLETED", reason: "Stage evidence complete" });
  assert.equal((await dashboard.getRoleDashboard()).projects.counts?.completed, 0);
  await as("director"); await policyCommand(completeId, "POLICY_APPROVED", { settings: { AUTHORITY_APPROVAL_PROOF: "NOT_APPLICABLE", COPYRIGHT_TRANSFER: "NOT_APPLICABLE", INVOICE: "NOT_APPLICABLE" }, reason: "Synthetic no-document policy", confirmed: true });
  await as("spm"); await policyCommand(completeId, "COMPLETION_REQUESTED", { reason: "Owner final request", confirmed: true });
  await as("director"); assert.equal((await dashboard.getRoleDashboard({ attention: "completion" })).attention.items.length, 1);
  const pending = (await completion.getRuntimeCompletion(completeId)).requests[0]; await policyCommand(completeId, "COMPLETION_DECIDED", { requestId: pending.id, requestHash: pending.hash, outcome: "APPROVE", reason: "Separate Director final decision", confirmed: true });
  assert.equal((await dashboard.getRoleDashboard({ attention: "completion" })).attention.items.length, 0); assert.equal((await dashboard.getRoleDashboard()).projects.counts?.completed, 1);
  assert.equal((await dashboard.getRoleDashboard({ projectStatus: "completed" })).projects.items[0].id, completeId);
  await db.archiveCategory.create({ data: { id: "archive", name: "Restricted archive", slug: "restricted-archive" } });
  await db.manualArchiveFile.create({ data: { id: "archive-file", archiveCategoryId: "archive", fileName: "RESTRICTED_ARCHIVE_FILE.pdf", originalFileName: "RESTRICTED_ARCHIVE_FILE.pdf", mimeType: "application/pdf", fileSize: 8, bucket: "fake", storageKey: "fake", status: "READY", uploadedById: "director" } });
  await db.userArchiveAssetAccess.create({ data: { userId: "designer2", manualArchiveFileId: "archive-file", grantedById: "director" } });
  await as("designer2"); assert.ok(!JSON.stringify(await dashboard.getRoleDashboard()).includes("RESTRICTED_ARCHIVE")); assert.equal((await dashboard.getRoleDashboard()).projects.total, 0);
  // A real accepted Data Input updates its target while stage/project completion stays separate.
  await as("designer"); await change(dataTask.id, "SUBMIT", { proposedText: "Accepted dashboard deliverable" }); await change(dataTask.id, "REQUEST_COMPLETION");
  await as("spm"); await change(dataTask.id, "APPROVE");
  assert.equal((await db.universalTask.findUniqueOrThrow({ where: { id: dataTask.id } })).status, "COMPLETED");
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  assert.notEqual((await db.runtimeStage.findUniqueOrThrow({ where: { id: stage.id } })).state, "COMPLETED");
  await stageCommand("APPROVAL_SUBMITTED", { capabilityId: "approval" });
  const spmDefinition = structuredClone(definition); spmDefinition.name = "SPM independent review workflow";
  const reviewBlock = spmDefinition.stages[0].capabilities.find(c => c.type === "APPROVAL")!;
  if (reviewBlock.type === "APPROVAL") reviewBlock.steps[0].approver = "SENIOR_PROJECT_MANAGER";
  const sd = await drafts.createDraft({ commandId: randomUUID(), definition: spmDefinition });
  const ss = await pub.submitWorkflowDraft(sd.workflowId, { commandId: randomUUID(), expectedRevision: sd.revision, configurationHash: sd.configurationHash, changeSummary: "Configured SPM review" });
  await as("director"); const sv = await pub.decideWorkflowPublication(ss.id, { expected: { ...ss.expected, commandId: randomUUID() }, configurationHash: ss.configurationHash, outcome: "APPROVE", reason: "Synthetic independent SPM policy", confirmed: true });
  const spmReviewId = (await runtime.createRuntimeProject({ ...createInput("SPM stage decision"), publishedVersionId: sv.publishedVersion!.id, definitionHash: sd.configurationHash })).projectId;
  const spmStage = await db.runtimeStage.findFirstOrThrow({ where: { projectId: spmReviewId } });
  await as("jpm"); await runtime.runtimeStageCommand(spmReviewId, spmStage.id, { commandId: randomUUID(), expectedRevision: spmStage.revision, action: "APPROVAL_SUBMITTED", capabilityId: "approval" });
  await as("spm"); assert.ok((await dashboard.getRoleDashboard({ attention: "stages" })).attention.items.some(i => i.href.includes(spmReviewId)));
  await as("director"); assert.ok(!(await dashboard.getRoleDashboard({ attention: "stages" })).attention.items.some(i => i.href.includes(spmReviewId)));
  await as("spm"); const pendingDraft = await drafts.createDraft({ commandId: randomUUID(), definition: { ...definition, name: "Workflow awaiting Director review" } });
  await pub.submitWorkflowDraft(pendingDraft.workflowId, { commandId: randomUUID(), expectedRevision: pendingDraft.revision, configurationHash: pendingDraft.configurationHash, changeSummary: "Pending visible workflow" });
  // Expired, revoked and wrong-version sessions cannot read the aggregate.
  const invalid = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(2), expiresAt: new Date(Date.now() + 3600_000) } });
  token = invalid.token; await assert.rejects(dashboard.getRoleDashboard()); await db.session.delete({ where: { id: invalid.id } });
  await as("empty"); const revoked = token!; await db.session.deleteMany({ where: { token: revoked } }); await assert.rejects(dashboard.getRoleDashboard());
  const expired = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(1), expiresAt: new Date(0) } }); token = expired.token; await assert.rejects(dashboard.getRoleDashboard()); await db.session.delete({ where: { id: expired.id } });
  await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600_000) } });
  const beforeEvents = [await db.businessEvent.count(), await db.approvalDecision.count(), await db.runtimeActivity.count(), await db.universalTaskEntry.count()];
  await as("director"); const beforeUnknown = (await dashboard.getRoleDashboard()).projects.counts!.active;
  await db.project.create({ data: { id: "unclassified", name: "Native without a status", ownerId: "spm2", createdById: "spm2" } });
  assert.equal((await dashboard.getRoleDashboard()).projects.counts!.active, beforeUnknown);
  assert.equal((await dashboard.getRoleDashboard({ family: "native" })).projects.items.find(p => p.id === "unclassified")?.status, "Status not set");
  const beforeReads = storageReads;
  for (const [id, role] of roles) if (role) { await as(id); const payload = await dashboard.getRoleDashboard(); assert.ok(!JSON.stringify(payload).includes("storageKey")); assert.ok(!JSON.stringify(payload).includes("passwordHash")); assert.ok(!JSON.stringify(payload).includes("snapshotHash")); }
  assert.deepEqual([await db.businessEvent.count(), await db.approvalDecision.count(), await db.runtimeActivity.count(), await db.universalTaskEntry.count()], beforeEvents);
  assert.equal(storageReads, beforeReads); assert.equal(external, 0);
  const response = await api.GET(new Request("http://local/api/dashboard")); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  // Preserve synthetic fixtures for real password browser logins, never real accounts.
  writeFileSync(join(root, "browser-fixture.json"), JSON.stringify({ password, projectId, privateRuntime, taskId: task.id, privateTaskId: privateTask.id, digitalTaskId: digitalTask.id, ownedId: owned.id, dataTaskId: dataTask.id, fileTaskId: fileTask.id, finalId: final.id }), { mode: 0o600 });
  if (process.env.FLUX_SEARCH_TEST === "1") {
    const searchTests = req(join(compiled, "scripts/search-v2-integration-check.js")) as typeof import("./search-v2-integration-check");
    await searchTests.runSearchAcceptance({ db, as, setToken: value => { token = value; }, queries, root, storageReads: () => storageReads, external: () => external });
  }
  if (process.env.FLUX_CALENDAR_TEST === "1") {
    const calendarTests = req(join(compiled, "scripts/calendar-v2-integration-check.js")) as typeof import("./calendar-v2-integration-check");
    await calendarTests.runCalendarAcceptance({ db, as, setToken: value => { token = value; }, queries, root, storageReads: () => storageReads, external: () => external });
  }
  if (process.env.FLUX_NOTIFICATIONS_TEST === "1") {
    const notificationTests = req(join(compiled, "scripts/notifications-v2-integration-check.js")) as typeof import("./notifications-v2-integration-check");
    await notificationTests.runAttentionAcceptance({ db, as, setToken: value => { token = value; }, queries, root, storageReads: () => storageReads, external: () => external });
  }
  console.log(`PASS dashboard service: ${assertions} assertions; all five business roles, technical/anonymous denials, counts, six Tasker types, Sisters, accepted output, exact decision queues, project families, pagination and no dashboard storage/network reads.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

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
  schemaVersion: 1, name: "Runtime acceptance workflow", description: "Runtime execution acceptance", intendedProjectType: "CUSTOM",
  stages: [
    { id: "brief", title: "Brief", description: "Structured input", position: 0, gates: [{ type: "REQUIRED_FIELDS", capabilityId: "info" }], capabilities: [
      { id: "info", type: "INFORMATION", title: "Brief fields", instructions: "Synthetic instructions", fields: [
        { id: "audience", type: "SHORT_TEXT", label: "Audience", help: "Who is it for?", required: true, options: [], defaultValue: null, min: 1, max: 200 },
        { id: "budget", type: "NUMBER", label: "Units", help: "", required: false, options: [], defaultValue: 5, min: 1, max: 100 },
        { id: "deadline", type: "DATE", label: "Target date", help: "", required: false, options: [], defaultValue: "2026-11-20", min: null, max: null },
        { id: "region", type: "SELECT", label: "Region", help: "", required: true, options: ["A", "B"], defaultValue: "A", min: null, max: null },
        { id: "context", type: "LONG_TEXT", label: "Context", help: "", required: false, options: [], defaultValue: null, min: null, max: 2000 },
        { id: "notice", type: "READ_ONLY", label: "Notice", help: "", required: false, options: [], defaultValue: "Director final completion still applies", min: null, max: null },
      ] },
    ] },
    { id: "review", title: "Review", description: "Exact runtime evidence", position: 1, gates: [{ type: "PRECEDING_STAGE", stageId: "brief" }, { type: "ACCEPTED_FILES", capabilityId: "files" }, { type: "REQUIRED_CHECKLIST", capabilityId: "checks" }, { type: "APPROVAL_COMPLETE", capabilityId: "approval" }], capabilities: [
      { id: "files", type: "FILE_REQUIREMENT", title: "Output", instructions: "PDF only", acceptedTypes: [".pdf", "application/pdf"], minFiles: 1, maxFiles: 3, required: true, acceptance: "OWNER", acceptedVersionsGate: true },
      { id: "checks", type: "CHECKLIST", title: "Quality", instructions: "Verify evidence", items: [{ id: "proof", label: "Proof checked", description: "Exact version", required: true, evidence: "SHARED_FILE_VERSION" }] },
      { id: "approval", type: "APPROVAL", title: "Review plan", instructions: "Independent review", rejection: "RETURN_FOR_CHANGES", gatesProgression: true, steps: [
        { id: "owner_review", label: "Owner review", approver: "PROJECT_OWNER", evidence: "SHARED_FILE_VERSION", decision: "APPROVE_REQUIRED" },
        { id: "director_review", label: "Director review", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" },
      ] },
    ] },
  ],
};
async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`)[0], { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>(); let failCopy = false, external = 0;
  global.fetch = async () => { external++; throw new Error("External requests forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name.endsWith("storage/s3")) return { getS3BucketName: () => "fixture-only", getMaxAssetUploadBytes: () => 1e8, sanitizeFileName: (s: string) => s.replace(/[^a-zA-Z0-9.]/g, "_"),
      getObjectMetadata: async (key: string) => { const object = objects.get(key); if (!object) throw new Error("Missing fake object"); return object; },
      copyStoredObject: async (p: { sourceKey: string; storageKey: string; sourceETag: string }) => { if (failCopy) throw new Error("Copy failure"); const source = objects.get(p.sourceKey); assert.equal(source?.ETag, p.sourceETag); objects.set(p.storageKey, { ...source! }); },
      createPresignedUploadTarget: async () => ({ uploadUrl: "http://127.0.0.1/fixture-upload" }),
      readPinnedStoredObject: async (p: { storageKey: string; objectETag: string }) => { const v = objects.get(p.storageKey); if (!v || v.ETag !== p.objectETag) throw new Error("Conditional fake read failed"); return { ...v, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("%PDF-x")); c.close(); } }) } }; } };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const runtime = requireLocal(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const files = requireLocal(join(compiled, "src/lib/stage-runtime/files.js")) as typeof import("../src/lib/stage-runtime/files");
  const drafts = requireLocal(join(compiled, "src/lib/stage-builder/service.js")) as typeof import("../src/lib/stage-builder/service");
  const publication = requireLocal(join(compiled, "src/lib/stage-builder/publication.js")) as typeof import("../src/lib/stage-builder/publication");
  for (const flag of ["FLUX_STAGE_BUILDER_DRAFTS", "FLUX_STAGE_BUILDER_PUBLICATION", "FLUX_SHARED_FILE_IDENTITY", "FLUX_APPROVAL_ENGINE", "FLUX_SHARED_EVENTS", "FLUX_UNIVERSAL_TASKER", "FLUX_TASKER_DELIVERABLES", "FLUX_TASKER_CONCEPTS", "FLUX_TASKER_SISTERS"]) process.env[flag] = "1";
  process.env.FLUX_STAGE_RUNTIME = "0"; await as("director");
  await assert.rejects(runtime.listRuntimeProjects(), /RUNTIME_DISABLED/); await assert.rejects(runtime.runtimeCreationOptions(), /RUNTIME_DISABLED/); await assert.rejects(runtime.createRuntimeProject({}), /RUNTIME_DISABLED/); await assert.rejects(runtime.getRuntimeProject("missing"), /RUNTIME_DISABLED/); await assert.rejects(files.runtimeUploadTarget("missing", "missing", "missing"), /RUNTIME_DISABLED/);
  if (process.argv.includes("--baseline")) { assert.equal((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM "_prisma_migrations"`)[0].n, BigInt(114)); assert.ok((await publication.listPublishedWorkflows()).workflows.length); console.log("PASS runtime disabled on actual 114 schema: no runtime queries; draft/publication catalog remains usable."); return; }
  process.env.FLUX_STAGE_RUNTIME = "1";
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }));
  const nativeCounts = [await db.project.count(), await db.flexibleProject.count(), await db.projectWorkflowStage.count(), await db.universalTask.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()];
  // No implicit adjacency dependency: stage 3 can run before stage 1.
  const def = structuredClone(definition); def.stages.push({ id: "parallel", title: "Independent work", description: "No invented predecessor", position: 2, gates: [], capabilities: [{ id: "parallel_info", type: "INFORMATION", title: "Independent note", instructions: "Optional independent work", fields: [] }] });
  async function publish(d: WorkflowDefinition, prior?: { workflowId: string; revision: number }) {
    await as("director"); const draft = prior ? await drafts.reviseDraft(prior.workflowId, { commandId: randomUUID(), expectedRevision: prior.revision, definition: d }) : await drafts.createDraft({ commandId: randomUUID(), definition: d });
    const submitted = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: "Synthetic runtime definition" });
    const decided = await publication.decideWorkflowPublication(submitted.id, { expected: { ...submitted.expected, commandId: randomUUID() }, configurationHash: submitted.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Reviewed controlled runtime fixture." });
    return { draft, version: decided.publishedVersion! };
  }
  const { draft, version } = await publish(def), v1 = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: version.id } });
  const creation = { commandId: randomUUID(), publishedVersionId: version.id, definitionHash: v1.configurationHash, title: "Runtime fixture", description: "Persisted execution", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] };
  for (const id of ["spm", "spm2", "jpm", "designer", "digital", "tech"]) { await as(id); await assert.rejects(runtime.createRuntimeProject(creation)); await assert.rejects(runtime.runtimeCreationOptions()); }
  await as("director"); await assert.rejects(runtime.createRuntimeProject({ ...creation, definitionHash: "0".repeat(64) })); await assert.rejects(runtime.createRuntimeProject({ ...creation, ownerId: "tech" })); await assert.rejects(runtime.createRuntimeProject({ ...creation, actorId: "spm" }));
  const created = await runtime.createRuntimeProject(creation), projectId = created.projectId;
  assert.deepEqual(await runtime.createRuntimeProject(creation), created); await assert.rejects(runtime.createRuntimeProject({ ...creation, title: "Conflicting replay" }));
  let page = await runtime.getRuntimeProject(projectId); const briefId = page.stages[0].id, reviewId = page.stages[1].id, parallelId = page.stages[2].id;
  assert.equal(page.ownerId, "spm"); assert.equal(page.participants.some(p => p.id === "director"), false); assert.equal(page.workflow.versionId, v1.id); assert.equal(page.stages.length, 3);
  assert.deepEqual((await db.runtimeStage.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map(s => s.configuration), def.stages);
  await publish({ ...def, name: "Version two changed", stages: def.stages.map(s => ({ ...s, title: `${s.title} V2` })) }, draft);
  assert.equal((await runtime.getRuntimeProject(projectId)).workflow.versionId, v1.id); assert.equal((await runtime.getRuntimeProject(projectId)).stage.definition.title, "Brief");
  for (const id of ["spm2", "designer", "digital", "tech"]) { await as(id); await assert.rejects(runtime.getRuntimeProject(projectId)); if (id === "spm2") assert.equal((await runtime.listRuntimeProjects()).count, 0); else await assert.rejects(runtime.listRuntimeProjects()); await assert.rejects(runtime.runtimeStageCommand(projectId, briefId, { action: "FIELDS", commandId: randomUUID(), expectedRevision: 0, values: { audience: "Forged" } })); }
  await as("jpm");
  async function cmd(stageId: string, action: string, extra: Record<string, unknown> = {}) { const view = await runtime.getRuntimeProject(projectId, stageId); return runtime.runtimeStageCommand(projectId, stageId, { action, commandId: randomUUID(), expectedRevision: view.stage.revision, ...extra }); }
  await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Forged skip" }), /STAGE_UNAVAILABLE/);
  await cmd(parallelId, "COMPLETED", { reason: "No implicit predecessor gate" }); assert.equal((await runtime.getRuntimeProject(projectId, parallelId)).stage.state, "COMPLETED");
  await assert.rejects(cmd(briefId, "COMPLETED", { reason: "Missing fields" }), /STAGE_GATES_UNMET/);
  for (const values of [{ audience: "" }, { budget: 101 }, { budget: "5" }, { deadline: "2026-02-30" }, { region: "C" }, { notice: "Forged read-only" }, { "project.ownerId": "jpm" }, { audience: "x".repeat(201) }]) await assert.rejects(cmd(briefId, "FIELDS", { values }));
  const fields = { action: "FIELDS", commandId: randomUUID(), expectedRevision: 0, values: { audience: "Manufacturing", budget: 12, deadline: "2026-11-20", region: "B", context: "Actual scoped work" } };
  const saved = await runtime.runtimeStageCommand(projectId, briefId, fields); assert.deepEqual(await runtime.runtimeStageCommand(projectId, briefId, fields), saved);
  await assert.rejects(runtime.runtimeStageCommand(projectId, briefId, { ...fields, values: { audience: "Conflicting" } }));
  await assert.rejects(runtime.runtimeStageCommand(projectId, briefId, { ...fields, commandId: randomUUID() }), /STALE_REVISION/);
  const revision = (await runtime.getRuntimeProject(projectId, briefId)).stage.revision;
  const race = await Promise.allSettled([1, 2].map(n => asConcurrent("jpm", () => runtime.runtimeStageCommand(projectId, briefId, { action: "FIELDS", commandId: randomUUID(), expectedRevision: revision, values: { audience: `Race ${n}` } })))); assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  await cmd(briefId, "COMPLETED", { reason: "Typed inputs complete" }); await assert.rejects(cmd(briefId, "FIELDS", { values: { audience: "After completion" } }), /STAGE_UNAVAILABLE/);
  assert.equal((await runtime.getRuntimeProject(projectId, reviewId)).stage.state, "AVAILABLE");
  await assert.rejects(cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: true, text: "", versionId: null }));
  await assert.rejects(cmd(reviewId, "UPLOAD_PREPARED", { capabilityId: "files", fileName: "bad.exe", mimeType: "application/octet-stream", fileSize: 6, supersedesId: null }));
  async function upload(supersedesId: string | null = null) {
    const r = await cmd(reviewId, "UPLOAD_PREPARED", { capabilityId: "files", fileName: "proof.pdf", mimeType: "application/pdf", fileSize: 6, supersedesId }) as { submissionId: string; versionId: string };
    const f = await db.runtimeFileSubmission.findUniqueOrThrow({ where: { id: r.submissionId } }); objects.set(f.stagingKey, { ContentLength: 6, ContentType: "application/pdf", ETag: `"opaque-${r.submissionId}"` });
    assert.ok((await files.runtimeUploadTarget(projectId, reviewId, f.id)).uploadUrl);
    await cmd(reviewId, "FILE_SUBMITTED", { submissionId: f.id }); return r;
  }
  const first = await upload(); await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Upload alone is insufficient" }));
  await assert.rejects(cmd(reviewId, "FILE_DECIDED", { submissionId: first.submissionId, outcome: "APPROVE", reason: "Self acceptance" }));
  await as("spm"); await cmd(reviewId, "FILE_DECIDED", { submissionId: first.submissionId, outcome: "REJECT", reason: "Wrong artwork" });
  await as("jpm"); await assert.rejects(cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: true, text: "", versionId: first.versionId }));
  failCopy = true; const failed = await upload(first.submissionId); failCopy = false;
  assert.equal((await db.runtimeFileSubmission.findUniqueOrThrow({ where: { id: failed.submissionId } })).state, "FAILED"); await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Failed storage" }));
  const good = await upload(failed.submissionId); await as("spm"); await cmd(reviewId, "FILE_DECIDED", { submissionId: good.submissionId, outcome: "APPROVE", reason: "Exact PDF reviewed" }); await as("jpm");
  await cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: true, text: "", versionId: good.versionId });
  assert.equal((await db.sharedFileVersion.findUniqueOrThrow({ where: { id: good.versionId } })).checksumEvidence, "UNKNOWN");
  assert.equal((await files.openRuntimeFile(projectId, reviewId, first.versionId)).mimeType, "application/pdf");
  await assert.rejects(files.openRuntimeFile(projectId, briefId, good.versionId)); await as("spm2"); await assert.rejects(files.openRuntimeFile(projectId, reviewId, good.versionId)); await as("jpm");
  const submitted = await cmd(reviewId, "APPROVAL_SUBMITTED", { capabilityId: "approval" }) as { requestId: string };
  const expectation = async (requestId: string) => { const r = await db.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { steps: { orderBy: { position: "asc" } } } }); return { requestId, stepId: r.steps[r.currentStep - 1].id, revision: r.revision, evidenceHash: r.evidenceHash, commandId: randomUUID() }; };
  const decide = async (requestId: string, outcome = "APPROVE") => cmd(reviewId, "APPROVAL_DECIDED", { expected: await expectation(requestId), outcome, reason: outcome === "APPROVE" ? "Exact evidence checked" : "Correct the stage evidence", confirmed: true });
  await assert.rejects(decide(submitted.requestId)); await as("director"); await assert.rejects(decide(submitted.requestId)); await as("spm"); await decide(submitted.requestId, "REJECT");
  await as("jpm"); await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Failed approval" })); await assert.rejects(cmd(reviewId, "APPROVAL_SUBMITTED", { capabilityId: "approval" }));
  await cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: true, text: "", versionId: good.versionId });
  const pending = await cmd(reviewId, "APPROVAL_SUBMITTED", { capabilityId: "approval" }) as { requestId: string };
  await cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: false, text: "", versionId: good.versionId }); assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: pending.requestId } })).state, "SUPERSEDED");
  await as("spm"); await assert.rejects(decide(pending.requestId)); await as("jpm"); await cmd(reviewId, "CHECKLIST", { itemId: "proof", complete: true, text: "", versionId: good.versionId });
  const final = await cmd(reviewId, "APPROVAL_SUBMITTED", { capabilityId: "approval" }) as { requestId: string };
  await as("spm"); await decide(final.requestId); assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: final.requestId } })).state, "PENDING"); await assert.rejects(decide(final.requestId));
  await as("director"); const lastExpected = await expectation(final.requestId), lastPage = await runtime.getRuntimeProject(projectId, reviewId), lastCommand = { action: "APPROVAL_DECIDED", commandId: randomUUID(), expectedRevision: lastPage.stage.revision, expected: lastExpected, outcome: "APPROVE", reason: "Independent Director decision", confirmed: true };
  const finalDecision = await runtime.runtimeStageCommand(projectId, reviewId, lastCommand); assert.deepEqual(await runtime.runtimeStageCommand(projectId, reviewId, lastCommand), finalDecision);
  const v = await db.sharedFileVersion.findUniqueOrThrow({ where: { id: good.versionId } }), originalObject = objects.get(v.storageKey)!; objects.set(v.storageKey, { ...originalObject, ETag: '"tampered"' });
  await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Storage changed" })); objects.set(v.storageKey, originalObject);
  const before = await db.runtimeActivity.count(), beforeRevision = (await runtime.getRuntimeProject(projectId, reviewId)).stage.revision;
  await db.$executeRawUnsafe(`CREATE FUNCTION runtime_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'runtime:%' THEN RAISE EXCEPTION 'fixture outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER runtime_fixture_fail BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION runtime_fixture_fail()');
  await assert.rejects(cmd(reviewId, "COMPLETED", { reason: "Atomic rollback" })); assert.equal(await db.runtimeActivity.count(), before); assert.equal((await runtime.getRuntimeProject(projectId, reviewId)).stage.revision, beforeRevision);
  await db.$executeRawUnsafe('DROP TRIGGER runtime_fixture_fail ON "EventOutbox"');
  await cmd(reviewId, "COMPLETED", { reason: "All explicit gates reviewed" });
  page = await runtime.getRuntimeProject(projectId, reviewId); assert.equal(page.stage.state, "COMPLETED"); assert.equal(page.finalClosureAvailable, false); assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  for (const statement of [`UPDATE "RuntimeProject" SET "versionNumber"=2 WHERE id='${projectId}'`, `UPDATE "RuntimeStage" SET state='AVAILABLE' WHERE id='${reviewId}'`, `DELETE FROM "RuntimeActivity" WHERE "projectId"='${projectId}'`, 'TRUNCATE "RuntimeParticipant" CASCADE', `UPDATE "RuntimeFileSubmission" SET state='ACCEPTED' WHERE id='${first.submissionId}'`]) await assert.rejects(db.$executeRawUnsafe(statement));
  // Exercise the other controlled eligibility values and the full twelve-step limit.
  const policyDefinition: WorkflowDefinition = { schemaVersion: 1, name: "Eligibility matrix", description: "Independent configured reviewers", intendedProjectType: "CUSTOM", stages: [{ id: "matrix", title: "Matrix", description: "", position: 0, gates: [], capabilities: [
    { id: "matrix_info", type: "INFORMATION", title: "Inputs", instructions: "", fields: [{ id: "matrix_text", type: "SHORT_TEXT", label: "Value", help: "", required: true, options: [], defaultValue: "Initial", min: 1, max: 100 }] },
    { id: "matrix_approval", type: "APPROVAL", title: "Twelve steps", instructions: "", rejection: "RETURN_FOR_CHANGES", gatesProgression: true, steps: Array.from({ length: 12 }, (_, n) => ({ id: `matrix_step_${n}`, label: `Step ${n + 1}`, approver: n === 0 ? "SENIOR_PROJECT_MANAGER" : n === 11 ? "DIRECTOR" : "PROJECT_CO_OWNER", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" })) },
  ] }] };
  const matrixPublished = await publish(policyDefinition), matrixVersion = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: matrixPublished.version.id } });
  const matrixProject = await runtime.createRuntimeProject({ ...creation, commandId: randomUUID(), publishedVersionId: matrixVersion.id, definitionHash: matrixVersion.configurationHash, title: "Eligibility matrix project", coOwnerIds: ["jpm", "spm2"] });
  const matrixStage = (await runtime.getRuntimeProject(matrixProject.projectId)).stage.id;
  const matrixCommand = async (action: string, extra: Record<string, unknown> = {}) => { const current = await runtime.getRuntimeProject(matrixProject.projectId, matrixStage); return runtime.runtimeStageCommand(matrixProject.projectId, matrixStage, { action, commandId: randomUUID(), expectedRevision: current.stage.revision, ...extra }); };
  await as("spm"); const self = await matrixCommand("APPROVAL_SUBMITTED", { capabilityId: "matrix_approval" }) as { requestId: string };
  await assert.rejects(matrixCommand("APPROVAL_DECIDED", { expected: await expectation(self.requestId), outcome: "APPROVE", reason: "Requester cannot self-review even when eligible SPM", confirmed: true }));
  await as("jpm"); await matrixCommand("FIELDS", { values: { matrix_text: "Corrected inputs" } });
  const matrixApproval = await matrixCommand("APPROVAL_SUBMITTED", { capabilityId: "matrix_approval" }) as { requestId: string };
  for (let n = 0; n < 12; n++) { await as(n === 0 ? "spm" : n === 11 ? "director" : "spm2"); await matrixCommand("APPROVAL_DECIDED", { expected: await expectation(matrixApproval.requestId), outcome: "APPROVE", reason: `Independent configured step ${n + 1}`, confirmed: true }); }
  assert.equal(await db.approvalDecision.count({ where: { requestId: matrixApproval.requestId } }), 12);
  assert.equal((await runtime.getRuntimeProject(matrixProject.projectId)).stage.state, "READY_FOR_COMPLETION");
  await assert.rejects(runtime.runtimeStageCommand(matrixProject.projectId, matrixStage, { action: "CHECKLIST", commandId: randomUUID(), expectedRevision: 14, itemId: "proof", complete: true, text: "", versionId: good.versionId }));
  const blockedDefinition = structuredClone(policyDefinition), blockedCapability = blockedDefinition.stages[0].capabilities[1];
  if (blockedCapability.type === "APPROVAL") { blockedCapability.rejection = "BLOCK_STAGE"; blockedCapability.steps = blockedCapability.steps.slice(0, 1); }
  const blockedPublished = await publish(blockedDefinition), blockedVersion = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: blockedPublished.version.id } });
  const blockedProject = await runtime.createRuntimeProject({ ...creation, commandId: randomUUID(), publishedVersionId: blockedVersion.id, definitionHash: blockedVersion.configurationHash, title: "Blocking rejection" });
  const blockedStage = (await runtime.getRuntimeProject(blockedProject.projectId)).stage.id;
  await as("jpm"); const blockedRequest = await runtime.runtimeStageCommand(blockedProject.projectId, blockedStage, { action: "APPROVAL_SUBMITTED", commandId: randomUUID(), expectedRevision: 0, capabilityId: "matrix_approval" }) as { requestId: string };
  await as("spm"); await runtime.runtimeStageCommand(blockedProject.projectId, blockedStage, { action: "APPROVAL_DECIDED", commandId: randomUUID(), expectedRevision: 1, expected: await expectation(blockedRequest.requestId), outcome: "REJECT", reason: "Configured blocking rejection", confirmed: true });
  assert.equal((await runtime.getRuntimeProject(blockedProject.projectId)).stage.state, "BLOCKED");
  await assert.rejects(runtime.runtimeStageCommand(blockedProject.projectId, blockedStage, { action: "FIELDS", commandId: randomUUID(), expectedRevision: 2, values: { matrix_text: "Unauthorized reopen" } }), /STAGE_UNAVAILABLE/);
  await as("director"); const invalidSession = await db.session.create({ data: { userId: "director", token: `v2.0.${"a".repeat(64)}`, expiresAt: new Date(Date.now() + 60_000) } });
  await authStore.run(invalidSession.token, () => assert.rejects(runtime.getRuntimeProject(projectId))); await db.session.delete({ where: { id: invalidSession.id } });
  console.log("PASS runtime eligibility: eligible SPM self-review denied; twelve ordered SPM/Co-owner/Director steps; blocking rejection cannot reopen; stale authorization-version session denied.");
  const eventModule = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  const events = await db.businessEvent.findMany({ where: { type: "RUNTIME_ACTIVITY" } }); assert.equal(events.length, await db.runtimeActivity.count());
  for (const e of events) { assert.equal(eventModule.decodeBusinessEvent(e).type, "RUNTIME_ACTIVITY"); assert.equal(await db.eventOutbox.count({ where: { eventId: e.id } }), 1); assert.equal(/storageKey|sessionId|proof.pdf|fixture-only/.test(JSON.stringify(e.payload)), false); assert.throws(() => eventModule.decodeBusinessEvent({ ...e, payload: { ...(e.payload as object), secret: "bad" } })); }
  const { createInternalDispatcher } = requireLocal(join(compiled, "src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  const consumed = new Set<string>(), dispatcher = createInternalDispatcher(db, async (_tx, event) => { assert.ok(!consumed.has(event.id)); consumed.add(event.id); });
  for (;;) { const claim = await dispatcher.claim(); if (!claim) break; assert.equal(await dispatcher.deliver(claim), "DELIVERED"); assert.equal(await dispatcher.deliver(claim), "STALE"); }
  for (const event of events) assert.ok(consumed.has(event.id));
  const session = await db.session.findUniqueOrThrow({ where: { token: token! } }); await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(runtime.getRuntimeProject(projectId)); await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } });
  assert.deepEqual([await db.project.count(), await db.flexibleProject.count(), await db.projectWorkflowStage.count(), await db.universalTask.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()], nativeCounts);
  assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } })), accounts); assert.equal(external, 0);
  console.log(`PASS Phase 4.3 runtime: ${assertions} assertions; persisted Director creation, immutable v1/v2, fields, exact-version files, rejection/resubmission, independent ordered approval, gates, immutable completion, no final closure, role denials, replay/race, rollback and events; fake storage only.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

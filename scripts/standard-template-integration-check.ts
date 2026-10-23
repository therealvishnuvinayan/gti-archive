import nodeAssert from "node:assert/strict";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(value, target, args); } : value; } });
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { packagingBlueprint } from "../src/lib/standard-templates/packaging";
import { validateBlueprint } from "../src/lib/standard-templates/contracts";
import { configurationHash } from "../src/lib/stage-builder/hash";
import source from "../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json";
import mapping from "../docs/requirements/GTI_FLUX_Source_to_V2_Map.json";

const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url }), authStore = new AsyncLocalStorage<string>();
let token: string | null = null;
async function as(id: string) { token = (await db.session.findFirstOrThrow({ where: { userId: id } })).token; }
async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`)[0], { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>(); let external = 0;
  global.fetch = async () => { external++; throw new Error("External requests forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name.endsWith("storage/s3")) return { getS3BucketName: () => "fixture-only", getMaxAssetUploadBytes: () => 1e8, isAllowedProjectCompletionDocument: () => true, sanitizeFileName: (s: string) => s.replace(/[^a-zA-Z0-9.]/g, "_"),
      getObjectMetadata: async (key: string) => { const object = objects.get(key); if (!object) throw new Error("Missing fake object"); return object; },
      copyStoredObject: async (p: { sourceKey: string; storageKey: string; sourceETag: string }) => { const source = objects.get(p.sourceKey); assert.equal(source?.ETag, p.sourceETag); objects.set(p.storageKey, { ...source! }); },
      createPresignedUploadTarget: async () => ({ uploadUrl: "http://127.0.0.1/fixture-upload" }),
      readPinnedStoredObject: async (p: { storageKey: string; objectETag: string }) => { const v = objects.get(p.storageKey); if (!v || v.ETag !== p.objectETag) throw new Error("Conditional fake read failed"); return { ...v, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("%PDF-x")); c.close(); } }) } }; } };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const runtime = requireLocal(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const files = requireLocal(join(compiled, "src/lib/stage-runtime/files.js")) as typeof import("../src/lib/stage-runtime/files");
  const drafts = requireLocal(join(compiled, "src/lib/stage-builder/service.js")) as typeof import("../src/lib/stage-builder/service");
  const publication = requireLocal(join(compiled, "src/lib/stage-builder/publication.js")) as typeof import("../src/lib/stage-builder/publication");
  const importer = requireLocal(join(compiled, "src/lib/standard-templates/service.js")) as typeof import("../src/lib/standard-templates/service");
  const governance = requireLocal(join(compiled, "src/lib/runtime-integration/creation.js")) as typeof import("../src/lib/runtime-integration/creation");
  const completion = requireLocal(join(compiled, "src/lib/runtime-completion/service.js")) as typeof import("../src/lib/runtime-completion/service");
  for (const flag of ["STAGE_BUILDER_DRAFTS", "STAGE_BUILDER_PUBLICATION", "SHARED_FILE_IDENTITY", "APPROVAL_ENGINE", "SHARED_EVENTS", "UNIVERSAL_TASKER", "TASKER_DELIVERABLES", "TASKER_CONCEPTS", "TASKER_SISTERS", "STAGE_RUNTIME", "RUNTIME_INTEGRATION"]) process.env[`FLUX_${flag}`] = "1";
  const blueprint = packagingBlueprint();
  assert.deepEqual(validateBlueprint(blueprint), []);
  assert.ok(validateBlueprint(blueprint, "OFFICIAL_STANDARD").length >= 11);
  assert.deepEqual(packagingBlueprint(), blueprint);
  assert.equal(configurationHash(packagingBlueprint()), configurationHash(blueprint));
  assert.equal(blueprint.source.sha256, source.sha256);
  const paragraphs = new Set(source.paragraphs.map(p => Number(p.id.slice(1))));
  for (const trace of Object.values(blueprint.trace)) for (const p of trace.paragraphs) assert.ok(paragraphs.has(p));
  for (const gap of blueprint.gaps) for (const p of gap.paragraphs) assert.ok(paragraphs.has(p));
  assert.deepEqual(mapping.processes.map(p => p.processStageCount), [8, 6, 7, 8, 7]);
  for (const process of mapping.processes) for (const stage of process.stages) for (const requirement of stage.sourceRequirements) assert.equal(source.paragraphs.find(p => Number(p.id.slice(1)) === requirement.paragraph)?.text, requirement.text);
  assert.equal(blueprint.definition.stages.length, 6);
  assert.deepEqual(blueprint.tasker.map(t => t.type), ["INITIAL_CONCEPT", "FINAL_CONCEPT"]);
  const broken = packagingBlueprint(); delete broken.trace.pkg_fa_barcode;
  assert.ok(validateBlueprint(broken).some(i => i.path === "trace.pkg_fa_barcode"));
  const malformed = packagingBlueprint(); malformed.definition.stages[1].id = malformed.definition.stages[0].id;
  assert.throws(() => validateBlueprint(malformed), /DUPLICATE_IDENTIFIER/);
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }));
  const nativeCounts = [await db.project.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()];
  const input = { commandId: randomUUID(), blueprintRevision: 1, scopeAcknowledged: true };
  for (const id of ["jpm", "designer", "digital", "tech"]) { await as(id); await assert.rejects(importer.createPackagingDraft({ ...input, commandId: randomUUID() })); }
  await as("spm");
  await assert.rejects(importer.createPackagingDraft({ ...input, actorId: "director" }), /UNSUPPORTED_PROPERTY/);
  await assert.rejects(importer.createPackagingDraft({ ...input, scopeAcknowledged: false }), /ACKNOWLEDGE/);
  await assert.rejects(importer.createPackagingDraft({ ...input, blueprintRevision: 2 }), /BLUEPRINT_REVISION_CHANGED/);
  process.env.FLUX_STAGE_BUILDER_DRAFTS = "0"; await assert.rejects(importer.createPackagingDraft(input), /DRAFTS_DISABLED/); process.env.FLUX_STAGE_BUILDER_DRAFTS = "1";
  const versionsBefore = await db.publishedWorkflowVersion.count(), projectsBefore = await db.runtimeProject.count();
  const draft = await importer.createPackagingDraft(input);
  assert.equal(draft.actorId, "spm"); assert.equal(draft.validationStatus, "VALID");
  assert.equal((await importer.createPackagingDraft(input)).id, draft.id);
  assert.equal(await db.publishedWorkflowVersion.count(), versionsBefore); assert.equal(await db.runtimeProject.count(), projectsBefore);
  await as("spm2"); await assert.rejects(drafts.getDraft(draft.workflowId));
  await as("director"); const own = await importer.createPackagingDraft({ ...input, commandId: randomUUID() }); assert.equal(own.actorId, "director");
  await as("spm");
  const edited = structuredClone(draft.definition); edited.name += " · isolated acceptance";
  const revision = await drafts.reviseDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 1, definition: edited });
  assert.deepEqual(revision.definition.stages, blueprint.definition.stages);
  assert.deepEqual((await drafts.getDraft(draft.workflowId, 1)).definition, blueprint.definition);
  const submitted = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 2, configurationHash: revision.configurationHash, changeSummary: "Isolated internal evidence pilot; official rollout exclusions retained." });
  const decision = { expected: { ...submitted.expected, commandId: randomUUID() }, configurationHash: revision.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Synthetic Director reviewed exact supported internal scope and outstanding official requirements." };
  await assert.rejects(publication.decideWorkflowPublication(submitted.id, decision));
  await as("director"); const approved = await publication.decideWorkflowPublication(submitted.id, decision);
  const version = await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: approved.publishedVersion!.id } });
  assert.equal(version.configurationHash, revision.configurationHash); assert.deepEqual(version.definition, revision.definition);
  const create = { commandId: randomUUID(), publishedVersionId: version.id, definitionHash: version.configurationHash, title: "Synthetic Packaging internal evidence pilot", description: "No external services or official standard designation", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] };
  await as("spm"); const created = await runtime.createRuntimeProject(create), projectId = created.projectId;
  await as("jpm"); await assert.rejects(runtime.createRuntimeProject({ ...create, commandId: randomUUID(), ownerId: "jpm", coOwnerIds: ["spm"] }));
  const jpmCreation = { ...create, commandId: randomUUID(), ownerId: "jpm", coOwnerIds: ["spm"] };
  await assert.rejects(governance.requestRuntimeCreation({ creation: { ...jpmCreation, coOwnerIds: [] }, reason: "Missing SPM" }));
  const requested = await governance.requestRuntimeCreation({ creation: jpmCreation, reason: "Synthetic JPM request" });
  await as("director");
  const creationRequest = await db.runtimeCreationRequest.findUniqueOrThrow({ where: { id: requested.requestId } });
  await governance.decideRuntimeCreation({ commandId: randomUUID(), requestId: creationRequest.id, snapshotHash: creationRequest.snapshotHash, outcome: "APPROVE", confirmed: true, reason: "Genuine synthetic Director approval" });
  await runtime.createRuntimeProject({ ...create, commandId: randomUUID(), title: "Director Packaging fixture" });
  const initial = await runtime.getRuntimeProject(projectId);
  assert.equal(initial.workflow.versionId, version.id); assert.equal(initial.participants.some(p => p.id === "director"), false);
  assert.deepEqual((await db.runtimeStage.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map(s => s.configuration), edited.stages);
  // A later approved version cannot retarget the existing project.
  await as("spm"); const v3 = await drafts.reviseDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: { ...edited, name: "Packaging revision for future instances" } });
  const next = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 3, configurationHash: v3.configurationHash, changeSummary: "Future version only" });
  await as("director"); await publication.decideWorkflowPublication(next.id, { expected: { ...next.expected, commandId: randomUUID() }, configurationHash: next.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Synthetic future revision" });
  assert.equal((await runtime.getRuntimeProject(projectId)).workflow.versionId, version.id);
  async function cmd(stageId: string, action: string, extra = {}) { const view = await runtime.getRuntimeProject(projectId, stageId); return runtime.runtimeStageCommand(projectId, stageId, { commandId: randomUUID(), expectedRevision: view.stage.revision, action, ...extra }); }
  for (const stage of initial.stages) {
    await as("jpm");
    await assert.rejects(cmd(stage.id, "COMPLETED", { reason: "Incomplete gate attempt" }));
    const config = (await runtime.getRuntimeProject(projectId, stage.id)).stage.definition;
    for (const block of config.capabilities) {
      if (block.type === "INFORMATION") {
        const values = Object.fromEntries(block.fields.filter(f => f.type !== "READ_ONLY").map(f => [f.id, f.type === "NUMBER" ? 1 : f.type === "DATE" ? "2026-11-01" : f.type === "SELECT" ? f.options[0] : `Synthetic ${f.label}`]));
        await cmd(stage.id, "FIELDS", { values });
        for (const f of block.fields.filter(f => f.type === "READ_ONLY")) await assert.rejects(cmd(stage.id, "FIELDS", { values: { [f.id]: "Forged scope" } }), /READ_ONLY/);
      }
      if (block.type === "FILE_REQUIREMENT") {
        const upload = await cmd(stage.id, "UPLOAD_PREPARED", { capabilityId: block.id, fileName: "evidence.pdf", mimeType: "application/pdf", fileSize: 6, supersedesId: null }) as { submissionId: string; versionId: string };
        const row = await db.runtimeFileSubmission.findUniqueOrThrow({ where: { id: upload.submissionId } });
        objects.set(row.stagingKey, { ContentLength: 6, ContentType: "application/pdf", ETag: `"${row.id}"` });
        await files.runtimeUploadTarget(projectId, stage.id, row.id); await cmd(stage.id, "FILE_SUBMITTED", { submissionId: row.id });
        await assert.rejects(cmd(stage.id, "FILE_DECIDED", { submissionId: row.id, outcome: "APPROVE", reason: "Uploader cannot accept own file" }));
        await as("spm"); await cmd(stage.id, "FILE_DECIDED", { submissionId: row.id, outcome: "APPROVE", reason: "Independent exact-version review" });
        await as("jpm"); assert.equal((await files.openRuntimeFile(projectId, stage.id, upload.versionId)).mimeType, "application/pdf");
      }
      if (block.type === "CHECKLIST") for (const item of block.items) {
        await assert.rejects(cmd(stage.id, "CHECKLIST", { itemId: item.id, complete: true, text: "", versionId: null }));
        await cmd(stage.id, "CHECKLIST", { itemId: item.id, complete: true, text: "Synthetic human review; no binary or external compliance validation claimed.", versionId: null });
      }
    }
    for (const block of config.capabilities.filter(b => b.type === "APPROVAL")) {
      await as("jpm"); const review = await cmd(stage.id, "APPROVAL_SUBMITTED", { capabilityId: block.id }) as { requestId: string };
      const request = await db.approvalRequest.findUniqueOrThrow({ where: { id: review.requestId }, include: { steps: true } });
      const expectation = { requestId: request.id, stepId: request.steps[0].id, revision: request.revision, evidenceHash: request.evidenceHash, commandId: randomUUID() };
      const payload = { expected: expectation, confirmed: true, outcome: "APPROVE", reason: "Configured independent internal review" };
      await assert.rejects(cmd(stage.id, "APPROVAL_DECIDED", payload));
      await as(block.steps[0].approver === "PROJECT_OWNER" ? "spm" : "director"); await cmd(stage.id, "APPROVAL_DECIDED", payload);
    }
    await as("jpm"); await cmd(stage.id, "COMPLETED", { reason: "All supported internal gates satisfied" });
    assert.equal((await runtime.getRuntimeProject(projectId, stage.id)).stage.state, "COMPLETED");
  }
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
  const ccmd = async (action: string, extra = {}) => { const view = await completion.getRuntimeCompletion(projectId); return completion.runtimeCompletionCommand(projectId, { commandId: randomUUID(), expectedRevision: view.revision, expectedProjectRevision: view.projectRevision, expectedPolicyRevision: view.policyRevision, action, ...extra }); };
  await as("spm"); await assert.rejects(ccmd("COMPLETION_REQUESTED", { confirmed: true, reason: "Missing policy blocks closure" }));
  const settings = { AUTHORITY_APPROVAL_PROOF: "REQUIRED", COPYRIGHT_TRANSFER: "NOT_APPLICABLE", INVOICE: "OPTIONAL" };
  await assert.rejects(ccmd("POLICY_APPROVED", { settings, confirmed: true, reason: "SPM cannot approve policy" }));
  await as("director"); await ccmd("POLICY_APPROVED", { settings, confirmed: true, reason: "Explicit synthetic internal project policy" });
  await as("spm"); await assert.rejects(ccmd("COMPLETION_REQUESTED", { confirmed: true, reason: "Missing required proof" }));
  const upload = await ccmd("UPLOAD_PREPARED", { category: "AUTHORITY_APPROVAL_PROOF", fileName: "proof.pdf", mimeType: "application/pdf", fileSize: 6 });
  const doc = await db.runtimeDocumentSubmission.findUniqueOrThrow({ where: { id: String(upload.submissionId) } });
  objects.set(doc.stagingKey, { ContentLength: 6, ContentType: "application/pdf", ETag: `"${doc.id}"` });
  await ccmd("DOCUMENT_SUBMITTED", { submissionId: doc.id });
  const document = (await completion.getRuntimeCompletion(projectId)).documents.find(d => d.id === doc.id)!;
  await ccmd("DOCUMENT_REVIEWED", { submissionId: doc.id, expected: { ...document.expected, commandId: randomUUID() }, outcome: "APPROVE", confirmed: true, reason: "Native internal document review" });
  await ccmd("COMPLETION_REQUESTED", { confirmed: true, reason: "Actual Owner requests final completion" });
  const pending = (await completion.getRuntimeCompletion(projectId)).requests.find(r => r.state === "PENDING")!;
  const finish = { requestId: pending.id, requestHash: pending.hash, outcome: "APPROVE", confirmed: true, reason: "Separate final Director decision" };
  await assert.rejects(ccmd("COMPLETION_DECIDED", finish)); await as("director"); await ccmd("COMPLETION_DECIDED", finish);
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "COMPLETED");
  assert.deepEqual([await db.project.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()], nativeCounts);
  assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } })), accounts);
  assert.equal(external, 0);
  console.log(`PASS Phase 5.1 Packaging: ${assertions} assertions; source map, deterministic trace, role-safe import/edit, genuine publication, pinned version, governed creation, all six populated runtime stages, independent files/approvals and Director policy/final completion; fake storage only.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

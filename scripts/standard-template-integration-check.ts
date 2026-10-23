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
import { posmBlueprint } from "../src/lib/standard-templates/posm";
import { retailDisplayBlueprint } from "../src/lib/standard-templates/retail-display";
import { exhibitionStandBlueprint } from "../src/lib/standard-templates/exhibition-stand";
import { digitalBlueprint, digitalSecretGuidance, digitalMaintenanceGuidance } from "../src/lib/standard-templates/digital";
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
  const tasks = requireLocal(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  for (const flag of ["STAGE_BUILDER_DRAFTS", "STAGE_BUILDER_PUBLICATION", "SHARED_FILE_IDENTITY", "APPROVAL_ENGINE", "SHARED_EVENTS", "UNIVERSAL_TASKER", "TASKER_DELIVERABLES", "TASKER_CONCEPTS", "TASKER_SISTERS", "STAGE_RUNTIME", "RUNTIME_INTEGRATION"]) process.env[`FLUX_${flag}`] = "1";
  for (const { factory, material } of [{ factory: packagingBlueprint, material: null }, { factory: posmBlueprint, material: "Printed POSM" }, { factory: posmBlueprint, material: "Merchandise" }, { factory: retailDisplayBlueprint, material: null }, { factory: exhibitionStandBlueprint, material: null }, { factory: digitalBlueprint, material: null }]) {
  const startingAssertions = assertions, blueprint = factory();
  // Preserve the original Packaging entry point and also prove registry parity.
  const load = (raw: unknown) => blueprint.category === "ARTWORK_PACKAGING" ? importer.createPackagingDraft(raw) : importer.createBlueprintDraft(blueprint.id, raw);
  assert.deepEqual(validateBlueprint(blueprint), []);
  assert.equal(validateBlueprint(blueprint, "OFFICIAL_STANDARD").length, blueprint.gaps.length);
  assert.deepEqual(factory(), blueprint);
  assert.equal(configurationHash(factory()), configurationHash(blueprint));
  assert.equal(blueprint.source.sha256, source.sha256);
  const paragraphs = new Set(source.paragraphs.map(p => Number(p.id.slice(1))));
  for (const trace of Object.values(blueprint.trace)) for (const p of trace.paragraphs) assert.ok(paragraphs.has(p));
  for (const gap of blueprint.gaps) for (const p of gap.paragraphs) assert.ok(paragraphs.has(p));
  assert.deepEqual(mapping.processes.map(p => p.processStageCount), [8, 6, 7, 8, 7]);
  for (const process of mapping.processes) for (const stage of process.stages) for (const requirement of stage.sourceRequirements) assert.equal(source.paragraphs.find(p => Number(p.id.slice(1)) === requirement.paragraph)?.text, requirement.text);
  assert.equal(blueprint.definition.stages.length, blueprint.category === "EXHIBITION_STAND" ? 8 : ["RETAIL_DISPLAY", "DIGITAL"].includes(blueprint.category) ? 7 : 6);
  assert.deepEqual(blueprint.tasker.map(t => t.type), ["INITIAL_CONCEPT", "FINAL_CONCEPT"]);
  const broken = factory(); delete broken.trace.workflow;
  assert.ok(validateBlueprint(broken).some(i => i.path === "trace.workflow"));
  const malformed = factory(); malformed.definition.stages[1].id = malformed.definition.stages[0].id;
  assert.throws(() => validateBlueprint(malformed), /DUPLICATE_IDENTIFIER/);
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }));
  const nativeCounts = [await db.project.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()];
  const taskCount = await db.universalTask.count();
  const input = { commandId: randomUUID(), blueprintRevision: 1, scopeAcknowledged: true };
  token = null; await assert.rejects(load(input));
  for (const id of ["jpm", "designer", "digital", "tech"]) { await as(id); await assert.rejects(load({ ...input, commandId: randomUUID() })); }
  await as("spm");
  for (const extra of [{ actorId: "director" }, { definition: blueprint.definition }, { designation: "OFFICIAL_STANDARD" }, { blueprintId: "gti-packaging-artwork" }]) await assert.rejects(load({ ...input, ...extra }), /UNSUPPORTED_PROPERTY/);
  for (const id of ["unknown", "__proto__", "constructor", "../packaging", "gti-exhibition-stand-v2", "gti-digital-maintenance"]) await assert.rejects(importer.createBlueprintDraft(id, input), /BLUEPRINT_NOT_FOUND/);
  await assert.rejects(load({ ...input, scopeAcknowledged: false }), /ACKNOWLEDGE/);
  await assert.rejects(load({ ...input, blueprintRevision: 2 }), /BLUEPRINT_REVISION_CHANGED/);
  await assert.rejects(load({ ...input, blueprintRevision: "1" }), /BLUEPRINT_REVISION_CHANGED/);
  process.env.FLUX_STAGE_BUILDER_DRAFTS = "0"; await assert.rejects(load(input), /DRAFTS_DISABLED/); process.env.FLUX_STAGE_BUILDER_DRAFTS = "1";
  const versionsBefore = await db.publishedWorkflowVersion.count(), projectsBefore = await db.runtimeProject.count();
  const draft = await load(input);
  assert.equal(draft.actorId, "spm"); assert.equal(draft.validationStatus, "VALID");
  assert.equal((await load(input)).id, draft.id);
  assert.equal((await importer.createBlueprintDraft(blueprint.id, input)).id, draft.id);
  assert.equal(draft.configurationHash, configurationHash(blueprint.definition));
  assert.equal(await db.eventOutbox.count({ where: { eventId: `draft:${draft.id}` } }), 1);
  assert.equal(await db.workflowDraftRevision.count({ where: { workflowId: draft.workflowId } }), 1);
  const otherId = blueprint.category === "POSM" ? "gti-retail-display" : "gti-posm-promotional-materials";
  await assert.rejects(importer.createBlueprintDraft(otherId, input), /COMMAND_REUSED/);
  assert.equal(await db.publishedWorkflowVersion.count(), versionsBefore); assert.equal(await db.runtimeProject.count(), projectsBefore);
  await as("spm2"); await assert.rejects(drafts.getDraft(draft.workflowId));
  await as("director"); const own = await load({ ...input, commandId: randomUUID() }); assert.equal(own.actorId, "director");
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
  const create = { commandId: randomUUID(), publishedVersionId: version.id, definitionHash: version.configurationHash, title: `Synthetic ${blueprint.category} ${material ?? ""} internal pilot`, description: "No external services or official standard designation", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] };
  await as("spm"); const created = await runtime.createRuntimeProject(create), projectId = created.projectId;
  await as("jpm"); await assert.rejects(runtime.createRuntimeProject({ ...create, commandId: randomUUID(), ownerId: "jpm", coOwnerIds: ["spm"] }));
  const jpmCreation = { ...create, commandId: randomUUID(), ownerId: "jpm", coOwnerIds: ["spm"] };
  await assert.rejects(governance.requestRuntimeCreation({ creation: { ...jpmCreation, coOwnerIds: [] }, reason: "Missing SPM" }));
  const requested = await governance.requestRuntimeCreation({ creation: jpmCreation, reason: "Synthetic JPM request" });
  await as("director");
  const creationRequest = await db.runtimeCreationRequest.findUniqueOrThrow({ where: { id: requested.requestId } });
  await governance.decideRuntimeCreation({ commandId: randomUUID(), requestId: creationRequest.id, snapshotHash: creationRequest.snapshotHash, outcome: "APPROVE", confirmed: true, reason: "Genuine synthetic Director approval" });
  await runtime.createRuntimeProject({ ...create, commandId: randomUUID(), title: `Director ${blueprint.category} fixture` });
  const initial = await runtime.getRuntimeProject(projectId);
  assert.equal(initial.workflow.versionId, version.id); assert.equal(initial.participants.some(p => p.id === "director"), false);
  assert.deepEqual((await db.runtimeStage.findMany({ where: { projectId }, orderBy: { position: "asc" } })).map(s => s.configuration), edited.stages);
  // A later approved version cannot retarget the existing project.
  await as("spm"); const v3 = await drafts.reviseDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 2, definition: { ...edited, name: `${blueprint.category} revision for future instances` } });
  const next = await publication.submitWorkflowDraft(draft.workflowId, { commandId: randomUUID(), expectedRevision: 3, configurationHash: v3.configurationHash, changeSummary: "Future version only" });
  await as("director"); await publication.decideWorkflowPublication(next.id, { expected: { ...next.expected, commandId: randomUUID() }, configurationHash: next.configurationHash, confirmed: true, outcome: "APPROVE", reason: "Synthetic future revision" });
  assert.equal((await runtime.getRuntimeProject(projectId)).workflow.versionId, version.id);
  async function cmd(stageId: string, action: string, extra = {}) { const view = await runtime.getRuntimeProject(projectId, stageId); return runtime.runtimeStageCommand(projectId, stageId, { commandId: randomUUID(), expectedRevision: view.stage.revision, action, ...extra }); }
  for (const stage of initial.stages) {
    await as("jpm");
    await assert.rejects(cmd(stage.id, "COMPLETED", { reason: "Incomplete gate attempt" }));
    const config = (await runtime.getRuntimeProject(projectId, stage.id)).stage.definition;
    if (config.id === "digital_brief") await assert.rejects(cmd(stage.id, "FIELDS", { values: { digital_password: "non-secret rejected fixture" } }), /FIELD_NOT_FOUND/);
    for (const block of config.capabilities) {
      if (block.type === "INFORMATION") {
        const irrelevant = (id: string) => material === "Printed POSM" ? id.startsWith("posm_merch_") : material === "Merchandise" ? id.startsWith("posm_printed_") : false;
        const values = Object.fromEntries(block.fields.filter(f => f.type !== "READ_ONLY" && !irrelevant(f.id)).map(f => [f.id, f.id === "posm_material_type" ? material : f.type === "NUMBER" ? 1 : f.type === "DATE" ? "2026-11-01" : f.type === "SELECT" ? f.options[0] : `Synthetic ${f.label}`]));
        if (Object.keys(values).length) await cmd(stage.id, "FIELDS", { values });
        for (const field of block.fields.filter(f => irrelevant(f.id))) assert.equal(field.required, false);
        const numeric = block.fields.find(f => f.type === "NUMBER" && !irrelevant(f.id));
        if (numeric) await assert.rejects(cmd(stage.id, "FIELDS", { values: { [numeric.id]: "invalid numeric input" } }));
        if (["EXHIBITION_STAND", "DIGITAL"].includes(blueprint.category)) {
          const date = block.fields.find(f => f.type === "DATE");
          if (date) await assert.rejects(cmd(stage.id, "FIELDS", { values: { [date.id]: "2026-02-30" } }));
          const select = block.fields.find(f => f.type === "SELECT");
          if (select) await assert.rejects(cmd(stage.id, "FIELDS", { values: { [select.id]: "Unsupported choice" } }));
        }
        if (block.fields.some(f => f.id === "posm_material_type")) await assert.rejects(cmd(stage.id, "FIELDS", { values: { posm_material_type: "Invented third branch" } }));
        for (const f of block.fields.filter(f => f.type === "READ_ONLY")) await assert.rejects(cmd(stage.id, "FIELDS", { values: { [f.id]: "Forged scope" } }), /READ_ONLY/);
      }
      if (block.type === "FILE_REQUIREMENT") {
        if (material && !block.required) continue; // Neither branch is forced to supply irrelevant files or three quotes.
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
  assert.equal(await db.universalTask.count(), taskCount, "No automatic starter, snag or maintenance tasks");
  if (["EXHIBITION_STAND", "DIGITAL"].includes(blueprint.category)) {
    const before = JSON.stringify(await db.runtimeStage.findMany({ where: { projectId }, orderBy: { position: "asc" } }));
    await as("spm");
    const taskInput = { commandId: randomUUID(), contextTarget: `runtime:${projectId}`, type: "GENERAL", title: blueprint.category === "DIGITAL" ? "Manual post-launch change request" : "Manual stand follow-up", brief: "Synthetic non-secret task instructions", context: "No automatic stage binding", deadline: "2026-11-15T12:00:00Z", priority: "NORMAL", executorId: "designer", spectatorIds: [] };
    const task = await tasks.createTask(taskInput);
    const change = async (action: string) => tasks.mutateTask(task.id, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(task.id)).version, action, text: "Synthetic manually assigned work" });
    await as("designer"); await change("SUBMIT"); await change("REQUEST_COMPLETION");
    await as("spm"); await change("APPROVE");
    assert.equal(JSON.stringify(await db.runtimeStage.findMany({ where: { projectId }, orderBy: { position: "asc" } })), before, "Manual task does not alter or satisfy stage evidence");
    if (blueprint.category === "DIGITAL") {
      const launch = await runtime.getRuntimeProject(projectId, initial.stages.at(-1)!.id);
      assert.equal(launch.stage.definition.id, "digital_launch");
      assert.equal(launch.stages.length, 7);
      assert.ok(blueprint.definition.description.includes(digitalMaintenanceGuidance));
      for (const block of blueprint.definition.stages.flatMap(s => s.capabilities)) {
        if (block.type === "INFORMATION") for (const field of block.fields) assert.ok(field.help.includes(digitalSecretGuidance));
        if (block.type === "FILE_REQUIREMENT") assert.ok(block.instructions.includes(digitalSecretGuidance));
      }
      await assert.rejects(cmd(initial.stages.at(-1)!.id, "MAINTENANCE"), /INVALID_ACTION/);
      assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, "ACTIVE");
    }
  }
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
  if (blueprint.category === "DIGITAL") {
    await as("spm");
    await assert.rejects(tasks.createTask({ commandId: randomUUID(), contextTarget: `runtime:${projectId}`, type: "GENERAL", title: "Denied after final closure", brief: "Synthetic non-secret fixture", deadline: "2026-11-15T12:00:00Z", priority: "NORMAL", executorId: "designer" }));
    await assert.rejects(cmd(initial.stages.at(-1)!.id, "FIELDS", { values: { digital_maintenance_decision: "Cannot reopen completed evidence" } }));
  }
  assert.deepEqual([await db.project.count(), await db.projectArchive.count(), await db.projectFinalCompletionRequest.count()], nativeCounts);
  assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } })), accounts);
  assert.equal(external, 0);
  console.log(`PASS ${blueprint.id} ${material ?? ""}: ${assertions - startingAssertions} assertions; source trace, role-safe/idempotent import, immutable edits, genuine publication, pinned governed runtime, ${blueprint.definition.stages.length} populated stages, independent exact files/approvals and Director policy/final completion; fake storage only.`);
  }
  console.log(`PASS Phase 5.3 standard templates: ${assertions} assertions; all five candidates, both POSM material choices, eight Exhibition / seven Digital stages, manual ACTIVE tasks and immutable closure; zero external requests.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

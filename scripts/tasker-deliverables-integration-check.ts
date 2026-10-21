import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient, BusinessRole } from "@prisma/client";
import { createVersionedSessionToken } from "../src/lib/authorization/session";

const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url });
const roles: [string, BusinessRole | null][] = [["director", "DIRECTOR"], ["spm", "SENIOR_PROJECT_MANAGER"], ["jpm", "JUNIOR_PROJECT_MANAGER"], ["designer", "DESIGNER"], ["digital", "DIGITAL_LEAD"], ["tech", null], ["outsider", "SENIOR_PROJECT_MANAGER"], ["designer2", "DESIGNER"], ["spm2", "SENIOR_PROJECT_MANAGER"]];
let token: string | null = null;
async function as(userId: string) { token = (await db.session.findFirstOrThrow({ where: { userId } })).token; }
async function seed() {
  for (const [id] of roles) await db.user.create({ data: { id, email: `${id}@tasker.invalid`, name: id, passwordHash: "fixture", role: id === "tech" ? "SUPER_ADMIN" : "USER" } });
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Private Tasker fixture',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    for (const [userId, businessRole] of roles) await tx.userAuthorization.create({ data: { userId, businessRole, technicalPrivileges: businessRole ? [] : ["TECHNICAL_ADMIN"] } });
  });
  for (const [userId] of roles) await db.session.create({ data: { userId, token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600000) } });
  await db.project.create({ data: { id: "project", name: "Scoped project", ownerId: "spm", createdById: "spm", coOwners: { create: { userId: "jpm" } }, executors: { create: [{ userId: "designer" }, { userId: "digital" }] } } });
  await db.project.create({ data: { id: "other", name: "UNRELATED_SENTINEL", ownerId: "outsider", createdById: "outsider" } });
  await db.projectStage.create({ data: { id: "concept-stage", projectId: "project", name: "Legacy", order: 1, isTasker: true } });
  await db.projectConceptFolder.create({ data: { id: "concept", projectId: "project", name: "Preserved concept", normalizedName: "preserved", taskerStageId: "concept-stage", assignedExecutorId: "designer", assignedById: "director" } });
  await db.projectAttachment.create({ data: { id: "old-file", projectId: "project", stageId: "concept-stage", uploadedById: "designer", fileName: "old.pdf", originalFileName: "old.pdf", mimeType: "application/pdf", fileSize: 8, bucket: "fixture", storageKey: "old", assetType: "STAGE_SUBMISSION", status: "READY" } });
  await db.flexibleProject.create({ data: { id: "flex", slug: "flex", name: "Flexible context", ownerId: "spm", createdById: "spm", collaborators: { create: { userId: "jpm" } }, milestones: { create: { id: "milestone", name: "Assigned milestone", responsibleUserId: "digital", sortOrder: 1 } } } });
  console.log("PASS seeded nine synthetic V2 identities and populated legacy structured/flexible/file context before migration.");
}
async function main() {
  const [identity] = await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`;
  assert.deepEqual(identity, { dir: join(root, "data"), tcp: "" });
  if (process.argv.includes("--seed")) { await seed(); return; }
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>();
  let copies = 0, reads = 0, failCopy = false;
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (name === "@/lib/prisma" || name === "../prisma" || name === "./prisma") return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "@/lib/storage/s3") return {
      getS3BucketName: () => "isolated-fake-bucket", createPresignedUploadUrl: async () => "http://fixture.invalid/upload",
      getObjectMetadata: async (key: string) => { const o = objects.get(key); if (!o) throw Object.assign(new Error("missing"), { name: "NotFound" }); return { ...o }; },
      copyStoredObject: async ({ sourceKey, storageKey, sourceETag }: { sourceKey: string; storageKey: string; sourceETag: string }) => { if (failCopy) throw new Error("fake S3 unavailable"); const o = objects.get(sourceKey); assert.equal(o?.ETag, sourceETag); objects.set(storageKey, { ...o! }); copies++; },
      readPinnedStoredObject: async ({ storageKey, objectETag, objectVersionId }: { storageKey: string; objectETag: string; objectVersionId?: string }) => {
        const o = objects.get(storageKey); assert.equal(o?.ETag, objectETag); if (objectVersionId) assert.equal(o?.VersionId, objectVersionId); reads++;
        return { ...o, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(o!.ContentLength)); c.close(); } }) } };
      },
    };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const tasks = requireLocal(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  const authorization = (requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime")).runtimeAuthorization;
  process.env.FLUX_UNIVERSAL_TASKER = "1"; process.env.FLUX_TASKER_DELIVERABLES = "1";
  const preserved = JSON.stringify([await db.user.findMany({ orderBy: { id: "asc" } }), await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), await db.projectConceptFolder.findMany(), await db.project.findMany({ orderBy: { id: "asc" } })]);
  await db.projectWorkflowStage.createMany({ data: ["PROJECT_RESEARCH_AND_PLANNING", "FINAL_LAYOUT"].map(stageKey => ({ projectId: "project", stageKey: stageKey as "FINAL_LAYOUT", status: "AVAILABLE" })) });
  await db.projectResearchWorkspace.create({ data: { id: "research", projectId: "project", ownerUserId: "spm", folders: { create: { id: "research-folder", name: "Research destination", normalizedName: "research", createdById: "spm" } } } });
  for (const ownerUserId of ["spm", "designer", "digital"]) await db.projectPrivateFolder.create({ data: { id: `${ownerUserId}-folder`, projectId: "project", ownerUserId, name: "Private", normalizedName: "private" } });
  await db.projectStageFileHandoff.create({ data: { id: "handoff", projectId: "project", sourceAttachmentId: "old-file", sourceWorkflowStageKey: "PROJECT_DEVELOPMENT", targetWorkflowStageKey: "FINAL_LAYOUT", handedOffById: "spm" } });
  await db.projectFileChecklist.create({ data: { id: "checklist", projectId: "project", handoffId: "handoff", sourceAttachmentId: "old-file", items: { create: ["OUTPUT_NAME", "TECHNICAL_DRAWING", "TRACK_TRACE", "HEALTH_WARNING"].map(fieldKey => ({ id: fieldKey, fieldKey: fieldKey as "OUTPUT_NAME", value: { text: "original" } })) } } });
  const create = (type = "FILE_UPLOAD", destination = "research-folder:research-folder", inputMode = "FILE", extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget: "structured:project", type, destination, inputMode, title: "Deliverable fixture", brief: "Requested work", deadline: "2026-11-20T12:00:00Z", priority: "HIGH", executorId: "designer2", spectatorIds: ["digital"], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Meaningful decision reason", ...extra });
  async function upload(taskId: string, replaceFileId?: string) {
    const prepared = await change(taskId, "PREPARE_UPLOAD", { fileName: "exact.pdf", mimeType: "application/pdf", fileSize: 8, ...(replaceFileId ? { replaceFileId } : {}) });
    const u = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId }, include: { version: true } });
    objects.set(u.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: `"${u.id}"`, VersionId: u.id });
    await change(taskId, "FINALIZE_UPLOAD", { uploadId: u.id }); return u;
  }
  async function submitted(taskId: string, files: string[], proposedText?: string) { await change(taskId, "SUBMIT", { fileIds: files, ...(proposedText === undefined ? {} : { proposedText }) }); await change(taskId, "REQUEST_COMPLETION"); }
  await as("director"); const t = await create();
  await as("designer2"); await assert.rejects(authorization.runAuthorized({ capability: "project.viewContext", targetId: "structured:project" }, async () => true));
  const v1 = await upload(t.id); await submitted(t.id, [v1.id]);
  assert.equal(await db.projectResearchFolderFile.count({ where: { folderId: "research-folder" } }), 0);
  await as("digital"); assert.equal((await tasks.getTask(t.id)).entries.length, 0); assert.equal((await tasks.getTask(t.id)).files.length, 0);
  await assert.rejects(tasks.downloadTaskFile(t.id, v1.id, v1.versionId)); await assert.rejects(change(t.id, "SUBMIT"));
  await as("outsider"); await assert.rejects(tasks.getTask(t.id));
  await as("director"); await change(t.id, "REJECT");
  await as("designer2"); await assert.rejects(change(t.id, "REQUEST_COMPLETION"), /FRESH_SUBMISSION/);
  const v2 = await upload(t.id, v1.version.fileId); await submitted(t.id, [v2.id]);
  await as("director"); const approve = { commandId: randomUUID(), expectedVersion: (await tasks.getTask(t.id)).version, action: "APPROVE", text: "Approve exact file and destination" };
  await tasks.mutateTask(t.id, approve); const count = await db.projectAttachment.count(); await tasks.mutateTask(t.id, approve); assert.equal(await db.projectAttachment.count(), count);
  const published = await db.universalTaskPublication.findFirstOrThrow({ where: { application: { taskId: t.id } }, include: { attachment: true, publishedVersion: true } });
  assert.equal(published.sourceVersionId, v2.versionId); assert.equal(published.attachment?.uploadedById, "designer2"); assert.equal(published.attachment?.reviewedById, "director");
  assert.notEqual(published.storageKey, v2.version.storageKey); assert.equal(await db.sharedFileProvenance.count({ where: { taskEntryId: (await tasks.getTask(t.id)).entries.at(-1)!.id } }), 2);
  assert.equal((await tasks.downloadTaskFile(t.id, v1.id, v1.versionId)).size, 8);
  console.log("PASS file workflow: task-only executor, no premature publication, spectator/outsider denial, rejection/revision retains exact evidence, independent acceptance and replay, uploader/reviewer/version provenance.");
  for (const who of ["designer", "digital"]) {
    await as(who); await create("FILE_UPLOAD", `private-folder:${who}-folder`, "FILE", { spectatorIds: [] });
    await assert.rejects(create("FILE_UPLOAD", "private-folder:spm-folder")); await assert.rejects(create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT"));
  }
  await as("tech"); await assert.rejects(create()); await assert.rejects(tasks.getTask(t.id));
  await as("spm"); await assert.rejects(create("FILE_UPLOAD", "research-folder:research-folder", "FILE", { contextTarget: "structured:other" }));
  await assert.rejects(create("DATA_INPUT", "checklist:HEALTH_WARNING", "TEXT")); await assert.rejects(create("DATA_INPUT", "Project.ownerId:project", "TEXT"));
  await db.projectFileChecklistRequest.create({ data: { id: "old-request", clientRequestId: "old-request", projectId: "project", checklistId: "checklist", checklistItemId: "OUTPUT_NAME", fieldKey: "OUTPUT_NAME", requestedById: "spm", channel: "IN_APP", recipientUserId: "designer", reminder: { create: { projectId: "project", configuredById: "spm", intervalHours: 24, nextReminderAt: new Date() } } } });
  const data = await create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT");
  await as("designer2"); await assert.rejects(authorization.runAuthorized({ capability: "project.manageStage", targetId: "saveStageFiveChecklist/structured:project" }, async () => true));
  await submitted(data.id, [], "Proposed output");
  const otherFields = JSON.stringify(await db.projectFileChecklistItem.findMany({ where: { id: { not: "OUTPUT_NAME" } }, orderBy: { id: "asc" } }));
  await as("spm"); await change(data.id, "REJECT"); assert.deepEqual((await db.projectFileChecklistItem.findUniqueOrThrow({ where: { id: "OUTPUT_NAME" } })).value, { text: "original" });
  await as("designer2"); await submitted(data.id, [], "Approved output"); await as("spm"); await change(data.id, "APPROVE");
  assert.deepEqual((await db.projectFileChecklistItem.findUniqueOrThrow({ where: { id: "OUTPUT_NAME" } })).value, { text: "Approved output" });
  assert.equal(JSON.stringify(await db.projectFileChecklistItem.findMany({ where: { id: { not: "OUTPUT_NAME" } }, orderBy: { id: "asc" } })), otherFields);
  assert.equal((await tasks.getTask(data.id)).deliverable?.conflict, undefined, "Accepted task must not report its own field update as a stale conflict");
  assert.equal((await db.requestReminder.findUniqueOrThrow({ where: { stageFiveRequestId: "old-request" } })).enabled, false);
  assert.equal(await db.notification.count(), 0); assert.equal(await db.requestReminderDeliveryAttempt.count(), 0);
  await as("jpm"); const stale = await create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT");
  await as("designer2"); await submitted(stale.id, [], "Must not overwrite");
  await db.projectFileChecklistItem.update({ where: { id: "OUTPUT_NAME" }, data: { value: { text: "New native edit" } } });
  await as("jpm"); await assert.rejects(change(stale.id, "APPROVE"), /FIELD_CONFLICT/); assert.equal((await tasks.getTask(stale.id)).deliverable?.conflict, true);
  await change(stale.id, "REFRESH_TARGET"); await as("designer2"); await assert.rejects(change(stale.id, "REQUEST_COMPLETION"), /FRESH_SUBMISSION/);
  await submitted(stale.id, [], "Explicitly refreshed proposal"); await as("jpm"); await change(stale.id, "APPROVE");
  for (const [field, mode] of [["TECHNICAL_DRAWING", "FILE"], ["TRACK_TRACE", "TEXT_FILE"]]) {
    await as("jpm"); const input = await create("DATA_INPUT", `checklist:${field}`, mode);
    await as("designer2"); const f = await upload(input.id); await submitted(input.id, [f.id], mode === "TEXT_FILE" ? "Placement proposal" : undefined);
    await as("jpm"); await change(input.id, "APPROVE");
    assert.equal(await db.projectFileChecklistItemAttachment.count({ where: { checklistItemId: field } }), 1);
  }
  const previousDrawing = await db.projectFileChecklistItemAttachment.findFirstOrThrow({ where: { checklistItemId: "TECHNICAL_DRAWING" } });
  await as("jpm"); const revisedDrawing = await create("DATA_INPUT", "checklist:TECHNICAL_DRAWING", "FILE");
  await as("designer2"); const revisedFile = await upload(revisedDrawing.id); await submitted(revisedDrawing.id, [revisedFile.id]);
  await as("jpm"); await change(revisedDrawing.id, "APPROVE");
  assert.equal((await db.projectAttachment.findUniqueOrThrow({ where: { id: previousDrawing.attachmentId } })).status, "READY");
  assert.ok(await db.universalTaskPublication.findUnique({ where: { attachmentId: previousDrawing.attachmentId } }));
  assert.notEqual((await db.projectFileChecklistItemAttachment.findFirstOrThrow({ where: { checklistItemId: "TECHNICAL_DRAWING" } })).attachmentId, previousDrawing.attachmentId);
  console.log("PASS Data Input: SPM/JPM exact text/file/text+file fields, no executor stage rights, rejected/stale input blocked, authorized conflict details and explicit refresh/resubmit, role/field/path allowlist.");
  // Two pending tasks captured the same native field token: only one can apply.
  await as("spm"); const competing = [await create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT"), await create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT")];
  await as("designer2"); for (const [i, candidate] of competing.entries()) await submitted(candidate.id, [], `Concurrent proposal ${i}`);
  await as("spm"); const concurrentCommands = await Promise.all(competing.map(async candidate => ({ id: candidate.id, body: { commandId: randomUUID(), expectedVersion: (await tasks.getTask(candidate.id)).version, action: "APPROVE", text: "Apply only if the captured field is current" } })));
  const concurrentResults = await Promise.allSettled(concurrentCommands.map(c => tasks.mutateTask(c.id, c.body)));
  assert.equal(concurrentResults.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await db.universalTask.count({ where: { id: { in: competing.map(c => c.id) }, status: "COMPLETED" } }), 1);
  // Pin published native reads as well as original task evidence.
  process.env.FLUX_SHARED_FILE_IDENTITY = "1";
  const shared = requireLocal(join(compiled, "src/lib/files/access.js")) as typeof import("../src/lib/files/access");
  await as("director"); assert.equal((await shared.openSharedFileVersion({ kind: "project-attachment", id: published.attachmentId! }, published.publishedVersionId!)).fileSize, 8);
  await as("designer2"); await assert.rejects(shared.openSharedFileVersion({ kind: "project-attachment", id: published.attachmentId! }, published.publishedVersionId!));
  await as("director"); await assert.rejects(db.universalTaskTarget.update({ where: { taskId: t.id }, data: { nativeId: "wrong-folder" } }));
  console.log("PASS concurrent Data Input tasks serialize on the native project/field; one wins without overwriting; native publication downloads retain pins and executor isolation; direct target rewrite denied.");
  await as("director"); const lockedStage = await create("DATA_INPUT", "checklist:OUTPUT_NAME", "TEXT");
  await as("designer2"); await submitted(lockedStage.id, [], "Cannot apply after stage completion");
  await db.projectWorkflowStage.update({ where: { projectId_stageKey: { projectId: "project", stageKey: "FINAL_LAYOUT" } }, data: { status: "COMPLETED" } });
  await as("director"); await assert.rejects(change(lockedStage.id, "APPROVE"), /TARGET_UNAVAILABLE/);
  await db.projectWorkflowStage.update({ where: { projectId_stageKey: { projectId: "project", stageKey: "FINAL_LAYOUT" } }, data: { status: "AVAILABLE" } });
  // Permission revocation, deletion and ancestry movement are checked at review.
  await as("spm"); const revoked = await create(); await as("designer2"); const rfile = await upload(revoked.id); await submitted(revoked.id, [rfile.id]);
  await db.project.update({ where: { id: "project" }, data: { ownerId: "outsider" } });
  await as("spm"); await assert.rejects(change(revoked.id, "APPROVE")); await as("director"); await assert.rejects(change(revoked.id, "APPROVE"));
  await db.project.update({ where: { id: "project" }, data: { ownerId: "spm" } });
  const deleted = await create("FILE_UPLOAD", "private-folder:spm-folder"); await as("designer2"); const dfile = await upload(deleted.id); await submitted(deleted.id, [dfile.id]);
  await db.projectPrivateFolder.delete({ where: { id: "spm-folder" } }); await as("director"); await assert.rejects(change(deleted.id, "APPROVE"), /TARGET_UNAVAILABLE/);
  const moved = await create(); await as("designer2"); const mfile = await upload(moved.id); await submitted(moved.id, [mfile.id]);
  await db.projectResearchFolder.create({ data: { id: "parent", workspaceId: "research", createdById: "spm", name: "Parent", normalizedName: "parent" } });
  await db.projectResearchFolder.update({ where: { id: "research-folder" }, data: { parentFolderId: "parent" } });
  await as("director"); await assert.rejects(change(moved.id, "APPROVE"), /TARGET_MOVED/);
  await db.projectResearchFolder.update({ where: { id: "research-folder" }, data: { parentFolderId: null } });
  for (const action of ["CLOSE", "DELETE"]) { await as("director"); const closed = await create(); await as("designer2"); const f = await upload(closed.id); await submitted(closed.id, [f.id]); await as("director"); const before = await db.projectAttachment.count(); await change(closed.id, action); assert.equal(await db.projectAttachment.count(), before); }
  console.log("PASS owner authority revoked even during Director intervention; deleted/moved destinations denied; close/delete never publish.");
  await as("director"); const failure = await create(); await as("designer2"); const ff = await upload(failure.id); await submitted(failure.id, [ff.id]); await as("director");
  const beforeFailure = await db.projectAttachment.count(); failCopy = true; await assert.rejects(change(failure.id, "APPROVE")); failCopy = false;
  assert.equal(await db.projectAttachment.count(), beforeFailure); assert.equal((await tasks.getTask(failure.id)).deliverable?.applicationState, "FAILED");
  await change(failure.id, "APPROVE"); assert.equal((await tasks.getTask(failure.id)).status, "COMPLETED");
  const rollback = await create(); await as("designer2"); const rf = await upload(rollback.id); await submitted(rollback.id, [rf.id]); await as("director");
  await db.$executeRawUnsafe(`CREATE FUNCTION deliverable_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'action'='APPROVE' THEN RAISE EXCEPTION 'fixture rollback after copy'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER deliverable_fixture_fail AFTER INSERT ON "BusinessEvent" FOR EACH ROW EXECUTE FUNCTION deliverable_fixture_fail()`);
  const previousAttachments = await db.projectAttachment.count(); await assert.rejects(change(rollback.id, "APPROVE")); const afterCopy = copies;
  assert.equal(await db.projectAttachment.count(), previousAttachments); assert.equal((await tasks.getTask(rollback.id)).status, "COMPLETION_REQUESTED");
  await db.$executeRawUnsafe('DROP TRIGGER deliverable_fixture_fail ON "BusinessEvent"'); await db.$executeRawUnsafe('DROP FUNCTION deliverable_fixture_fail()');
  await change(rollback.id, "APPROVE"); assert.equal(copies, afterCopy, "Retry reuses observed orphan rather than recopying");
  const session = await db.session.findUniqueOrThrow({ where: { token: token! } }); await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(create()); await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } });
  const { decodeBusinessEvent } = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  for (const event of await db.businessEvent.findMany({ where: { operation: "deliverableTaskCommand" } })) assert.equal(decodeBusinessEvent(event).operation, "deliverableTaskCommand");
  assert.equal(await db.businessEvent.count(), await db.universalTaskEntry.count()); assert.equal(await db.eventOutbox.count(), await db.businessEvent.count());
  assert.equal(await db.approvalRequest.count(), 0); assert.equal(await db.archivedProjectFile.count(), 0); assert.equal(await db.manualLibraryAsset.count(), 0);
  const after = [await db.user.findMany({ orderBy: { id: "asc" } }), await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), await db.projectConceptFolder.findMany(), await db.project.findMany({ orderBy: { id: "asc" } })];
  const before = JSON.parse(preserved); // Fixture-only ownership edit changes updatedAt.
  for (let i = 0; i < before[3].length; i++) before[3][i].updatedAt = JSON.parse(JSON.stringify(after))[3][i].updatedAt;
  assert.equal(JSON.stringify(after), JSON.stringify(before)); assert.ok(reads > 0);
  process.env.FLUX_TASKER_DELIVERABLES = "0"; await assert.rejects(tasks.getTask(t.id)); assert.ok((await tasks.listTasks()).tasks.every(t => t.type === "GENERAL"));
  console.log("PASS fake-storage failures and DB/outbox rollback after copy, durable recovery/retry without duplicate objects, session invalidation, truthful events, accounts/concepts/parent completion unchanged, dedicated flag isolation.");
}
main().finally(() => db.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });

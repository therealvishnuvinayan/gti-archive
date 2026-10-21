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
  process.env.FLUX_UNIVERSAL_TASKER = "1"; process.env.FLUX_TASKER_DELIVERABLES = "1"; process.env.FLUX_TASKER_CONCEPTS = "1";
  const stable = async () => JSON.stringify([await db.user.findMany({ orderBy: { id: "asc" } }), await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }),
    await db.project.findMany({ orderBy: { id: "asc" } }), await db.projectConceptFolder.findMany(), await db.projectAttachment.findMany({ orderBy: { id: "asc" } }),
    await db.approvalRequest.findMany(), await db.projectWorkflowStage.findMany({ orderBy: { id: "asc" } }),
    await db.universalTask.findMany({ where: { type: { in: ["GENERAL", "FILE_UPLOAD", "DATA_INPUT"] } }, orderBy: { id: "asc" } })]);
  const preserved = await stable();
  for (const v of await db.sharedFileVersion.findMany({ where: { status: "READY" } })) objects.set(v.storageKey, { ContentLength: v.fileSize, ContentType: v.mimeType, ETag: v.objectETag!, ...(v.objectVersionId ? { VersionId: v.objectVersionId } : {}) });
  const create = (type = "INITIAL_CONCEPT", extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget: "structured:project", type,
    title: `${type} fixture`, brief: "Private concept brief", deadline: "2026-11-20T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: ["digital"], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Meaningful reason", ...extra });
  async function upload(taskId: string, replaceFileId?: string) {
    const prepared = await change(taskId, "PREPARE_UPLOAD", { fileName: "concept.pdf", mimeType: "application/pdf", fileSize: 8, ...(replaceFileId ? { replaceFileId } : {}) });
    const u = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId }, include: { version: true } });
    objects.set(u.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: `"${u.id}"`, VersionId: u.id });
    await change(taskId, "FINALIZE_UPLOAD", { uploadId: u.id }); return u;
  }
  async function referenceRead(taskId: string, versionId?: string) { const r = (await tasks.getTask(taskId)).references![0]; return tasks.downloadTaskReference(taskId, r.id, versionId ?? r.versionId); }
  const native = await db.universalTaskPublication.findFirstOrThrow({ where: { attachment: { researchFolderFile: { folderId: "research-folder" } } }, include: { publishedVersion: true } });
  for (const actor of ["designer", "digital", "tech", "outsider"]) {
    await as(actor); for (const type of ["INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"]) await assert.rejects(create(type));
    if (actor !== "tech") assert.equal((await tasks.taskOptions()).canCreateConcepts, ["outsider"].includes(actor));
  }
  await as("director"); const inspection = await create("INSPECT_FILE", { executorId: "designer2" });
  await as("designer2"); await assert.rejects(change(inspection.id, "SUBMIT"), /SOURCE_REQUIRED/); await assert.rejects(change(inspection.id, "REQUEST_COMPLETION"), /SOURCE_REQUIRED/);
  await as("director"); const source = await upload(inspection.id); const sourceSnapshot = JSON.stringify(await db.sharedFileVersion.findUnique({ where: { id: source.versionId } }));
  const setSource = { commandId: randomUUID(), expectedVersion: (await tasks.getTask(inspection.id)).version, action: "SET_SOURCE", text: "Select exact source", sourceVersionId: source.versionId };
  await tasks.mutateTask(inspection.id, setSource); await tasks.mutateTask(inspection.id, setSource);
  assert.equal(await db.universalTaskReference.count({ where: { taskId: inspection.id } }), 1);
  await assert.rejects(tasks.mutateTask(inspection.id, { ...setSource, sourceVersionId: "forged" }), /COMMAND_REUSED/);
  const replacement = await upload(inspection.id, source.version.fileId);
  await assert.rejects(change(inspection.id, "SET_SOURCE", { sourceVersionId: replacement.versionId }), /SOURCE_ALREADY_PINNED/);
  await as("designer2"); await assert.rejects(authorization.runAuthorized({ capability: "project.viewFile", targetId: `file:${native.attachmentId}` }, async () => true));
  assert.equal((await referenceRead(inspection.id)).size, 8); await assert.rejects(referenceRead(inspection.id, replacement.versionId));
  const findings = await upload(inspection.id); await change(inspection.id, "SUBMIT", { fileIds: [findings.id] }); await change(inspection.id, "REQUEST_COMPLETION");
  assert.equal((await tasks.getTask(inspection.id)).status, "COMPLETION_REQUESTED");
  await as("director"); await change(inspection.id, "REJECT"); await as("designer2"); await assert.rejects(change(inspection.id, "REQUEST_COMPLETION"), /FRESH_SUBMISSION/);
  await change(inspection.id, "SUBMIT"); await change(inspection.id, "REQUEST_COMPLETION"); await as("director"); await change(inspection.id, "APPROVE");
  assert.equal(JSON.stringify(await db.sharedFileVersion.findUnique({ where: { id: source.versionId } })), sourceSnapshot);
  await as("spm"); const projectInspection = await create("INSPECT_FILE", { sourceVersionId: native.publishedVersionId, executorId: "designer2" });
  assert.ok((await tasks.taskOptions("structured:project")).conceptSources.some(s => s.versionId === native.publishedVersionId));
  await assert.rejects(create("INSPECT_FILE", { contextTarget: "structured:other", sourceVersionId: native.publishedVersionId }));
  await assert.rejects(create("INSPECT_FILE", { sourceVersionId: "old-file" }));
  await as("jpm"); await create("INSPECT_FILE", { sourceVersionId: native.publishedVersionId, executorId: "designer2", spectatorIds: [] });
  await as("director"); await assert.rejects(create("INSPECT_FILE", { contextTarget: "structured:other", sourceVersionId: native.publishedVersionId }));
  await as("designer2"); assert.equal((await referenceRead(projectInspection.id)).size, 8);
  const pinned = (await tasks.getTask(projectInspection.id)).references![0];
  for (const actor of ["digital", "outsider", "tech"]) { await as(actor); await assert.rejects(tasks.downloadTaskReference(projectInspection.id, pinned.id, pinned.versionId)); if (actor === "digital") assert.equal((await tasks.getTask(projectInspection.id)).references, undefined); }
  console.log("PASS inspection: owner upload and SPM adopted project selection; mandatory sealed source; independent review/rejection; exact retained source after replacement; no folder grants; spectator/technical/unrelated/cross-project/forged denial.");

  await as("spm"); const initial = await create(); await as("designer");
  const draft = await upload(initial.id); await change(initial.id, "MESSAGE", { fileIds: [draft.id], text: "PRIVATE_INITIAL_CONVERSATION" });
  await as("spm"); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [draft.versionId] }));
  await as("designer"); const v1 = await upload(initial.id), unselected = await upload(initial.id); await change(initial.id, "SUBMIT", { fileIds: [v1.id, unselected.id] });
  await as("spm"); const final = await create("FINAL_CONCEPT", { inspirationVersionIds: [v1.versionId], executorId: "designer2" });
  const inspiration = (await tasks.getTask(final.id)).references![0]; assert.equal(inspiration.sourceState, "SUBMITTED"); assert.equal(inspiration.submission?.actor.id, "designer"); assert.equal(inspiration.sourceTask?.owner.id, "spm");
  await as("designer2"); assert.equal((await referenceRead(final.id)).size, 8); await assert.rejects(tasks.getTask(initial.id));
  await assert.rejects(tasks.downloadTaskFile(initial.id, unselected.id, unselected.versionId)); await assert.rejects(referenceRead(final.id, unselected.versionId));
  assert.ok(!JSON.stringify(await tasks.getTask(final.id)).includes("PRIVATE_INITIAL_CONVERSATION"));
  await as("jpm"); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [v1.versionId] }), /DELEGATION_DENIED/); await assert.rejects(change(initial.id, "APPROVE"));
  const empty = await create("FINAL_CONCEPT", { executorId: "digital", spectatorIds: [] }); assert.deepEqual((await tasks.getTask(empty.id)).references, []);
  await as("designer"); await change(initial.id, "REQUEST_COMPLETION"); await as("spm"); await change(initial.id, "REJECT");
  assert.equal((await tasks.getTask(initial.id)).submissions![0].state, "REJECTED"); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [v1.versionId] }), /INELIGIBLE/);
  await as("designer"); const v2 = await upload(initial.id, v1.version.fileId); await change(initial.id, "SUBMIT", { fileIds: [v2.id] });
  const v3 = await upload(initial.id, v1.version.fileId); await change(initial.id, "SUBMIT", { fileIds: [v3.id] });
  assert.equal((await tasks.getTask(initial.id)).submissions![1].state, "SUPERSEDED"); await change(initial.id, "REQUEST_COMPLETION");
  await as("spm"); assert.equal((await tasks.getTask(initial.id)).status, "COMPLETION_REQUESTED"); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [v2.versionId] }));
  await change(initial.id, "APPROVE"); const approved = (await tasks.getTask(initial.id)).submissions!.at(-1)!; assert.equal(approved.state, "APPROVED"); assert.equal(approved.reviewer?.id, "spm");
  const approvedFinal = await create("FINAL_CONCEPT", { inspirationVersionIds: [v3.versionId], executorId: "digital", spectatorIds: [] });
  assert.equal((await tasks.getTask(approvedFinal.id)).references![0].review?.actor.id, "spm");
  await as("director"); const directorFinal = await create("FINAL_CONCEPT", { inspirationVersionIds: [v3.versionId], executorId: "spm", spectatorIds: [] });
  await assert.rejects(create("FINAL_CONCEPT", { contextTarget: "structured:other", inspirationVersionIds: [v3.versionId] }));
  await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [native.publishedVersionId] }));
  await as("spm"); await change(initial.id, "DELETE"); await assert.rejects(create("FINAL_CONCEPT", { inspirationVersionIds: [v3.versionId] }));
  await as("designer2"); assert.equal((await tasks.getTask(final.id)).references![0].versionId, v1.versionId); assert.equal((await referenceRead(final.id)).size, 8);
  const originalObject = objects.get(v1.version.storageKey)!; objects.delete(v1.version.storageKey); await assert.rejects(referenceRead(final.id)); objects.set(v1.version.storageKey, originalObject);
  objects.set(v1.version.storageKey, { ...originalObject, ETag: '"changed"' }); await assert.rejects(referenceRead(final.id)); objects.set(v1.version.storageKey, originalObject);
  const finalFile = await upload(final.id); assert.notEqual(finalFile.version.fileId, v1.version.fileId); await change(final.id, "SUBMIT", { fileIds: [finalFile.id] }); await change(final.id, "REQUEST_COMPLETION");
  await as("spm"); await change(final.id, "APPROVE");
  await as("digital"); await change(approvedFinal.id, "SUBMIT"); await change(approvedFinal.id, "REQUEST_COMPLETION"); await as("spm"); await change(approvedFinal.id, "APPROVE");
  await change(directorFinal.id, "SUBMIT"); await change(directorFinal.id, "REQUEST_COMPLETION"); await as("director"); await change(directorFinal.id, "APPROVE");
  console.log("PASS Initial/Final: draft/submitted/rejected/superseded/approved distinctions; real submitter/reviewer; selected-only access; no inherited conversation or approval; independent final versions/review; later revisions and source soft deletion retain exact inspiration; missing/changed bytes fail closed.");

  await as("jpm"); const manager = await create("INSPECT_FILE", { executorId: "digital", spectatorIds: [] });
  const own = await upload(manager.id); const version = (await tasks.getTask(manager.id)).version;
  const concurrent = await Promise.allSettled([1, 2].map(() => tasks.mutateTask(manager.id, { commandId: randomUUID(), expectedVersion: version, action: "SET_SOURCE", sourceVersionId: own.versionId, text: "One exact pin" })));
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1); assert.equal(await db.universalTaskReference.count({ where: { taskId: manager.id } }), 1);
  await as("director"); await change(manager.id, "SUBMIT"); await change(manager.id, "REQUEST_COMPLETION"); await assert.rejects(change(manager.id, "APPROVE"), /SELF_REVIEW/);
  const intervention = (await tasks.getTask(manager.id)).entries.at(-1)!; assert.equal(intervention.actor.id, "director"); assert.equal(intervention.directorOverride, true);
  await as("jpm"); await change(manager.id, "APPROVE"); await change(manager.id, "DELETE"); assert.ok((await tasks.getTask(manager.id)).references!.length);
  const rollback = await create("INSPECT_FILE"); failCopy = true; await assert.rejects(upload(rollback.id)); failCopy = false;
  assert.equal(await db.universalTaskReference.count({ where: { taskId: rollback.id } }), 0);
  const rf = await upload(rollback.id); const beforeVersion = (await tasks.getTask(rollback.id)).version;
  await db.$executeRawUnsafe(`CREATE FUNCTION concept_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM "BusinessEvent" WHERE id=NEW."eventId" AND payload->>'action'='SET_SOURCE') THEN RAISE EXCEPTION 'fixture outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER concept_fixture_fail BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION concept_fixture_fail()`);
  await assert.rejects(change(rollback.id, "SET_SOURCE", { sourceVersionId: rf.versionId })); assert.equal((await tasks.getTask(rollback.id)).version, beforeVersion); assert.equal(await db.universalTaskReference.count({ where: { taskId: rollback.id } }), 0);
  await db.$executeRawUnsafe('DROP TRIGGER concept_fixture_fail ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION concept_fixture_fail()');
  await assert.rejects(authorization.runAuthorized({ capability: "task.manage", targetId: rollback.id }, async (tx, grant) => {
    const task = await tx.universalTask.update({ where: { id: rollback.id }, data: { version: { increment: 1 } } });
    const actor = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: grant.actorUserId } });
    const entry = await tx.universalTaskEntry.create({ data: { taskId: task.id, version: task.version, commandId: randomUUID(), commandHash: "0".repeat(64), action: "SET_SOURCE", text: "Forged native source", snapshot: { referenceVersionIds: [v3.versionId] }, actorId: grant.actorUserId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion, directorOverride: false } });
    await tx.universalTaskReference.create({ data: { taskId: task.id, kind: "INSPECTION", versionId: v3.versionId, selectedEntryId: entry.id, sourceUploadId: v3.id, sourceState: "SEALED" } });
  }));
  assert.equal((await tasks.getTask(rollback.id)).version, beforeVersion);
  await assert.rejects(db.universalTaskReference.update({ where: { id: inspiration.id }, data: { versionId: unselected.versionId } }));
  await assert.rejects(db.universalTaskReference.delete({ where: { id: inspiration.id } })); await assert.rejects(db.$executeRawUnsafe('TRUNCATE "UniversalTaskReference"'));
  const session = await db.session.findUniqueOrThrow({ where: { token: token! } }); await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(create()); await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } });
  const { decodeBusinessEvent } = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  for (const event of await db.businessEvent.findMany({ where: { operation: "conceptTaskCommand" } })) assert.equal(decodeBusinessEvent(event).operation, "conceptTaskCommand");
  assert.equal(await db.businessEvent.count(), await db.universalTaskEntry.count()); assert.equal(await db.eventOutbox.count(), await db.businessEvent.count());
  assert.equal(await stable(), preserved); assert.ok(reads > 0); assert.ok(copies > 0); assert.equal(failCopy, false);
  process.env.FLUX_TASKER_CONCEPTS = "0"; await assert.rejects(tasks.getTask(final.id)); await assert.rejects(create());
  await as("director"); assert.ok((await tasks.listTasks()).tasks.every(t => ["GENERAL", "FILE_UPLOAD", "DATA_INPUT"].includes(t.type)));
  console.log("PASS concept guards: manager-only creation, Director truthful independent intervention, concurrency/replay, atomic outbox rollback, immutable reference/provenance, session expiry, dedicated flag, all nine accounts/legacy/General/deliverables/native projects/files/approval gates preserved.");
}
main().finally(() => db.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });

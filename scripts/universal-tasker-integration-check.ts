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
  let copies = 0, reads = 0;
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
      getObjectMetadata: async (key: string) => { const o = objects.get(key); assert.ok(o, "Fixture object required"); return { ...o }; },
      copyStoredObject: async ({ sourceKey, storageKey, sourceETag }: { sourceKey: string; storageKey: string; sourceETag: string }) => { const o = objects.get(sourceKey); assert.equal(o?.ETag, sourceETag); objects.set(storageKey, { ...o! }); copies++; },
      readPinnedStoredObject: async ({ storageKey, objectETag, objectVersionId }: { storageKey: string; objectETag: string; objectVersionId?: string }) => {
        const o = objects.get(storageKey); assert.equal(o?.ETag, objectETag); if (objectVersionId) assert.equal(o?.VersionId, objectVersionId); reads++;
        return { ...o, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(o!.ContentLength)); c.close(); } }) } };
      },
    };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const tasks = requireLocal(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  const authorization = (requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime")).runtimeAuthorization;
  const allBefore = JSON.stringify(await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }));
  const projectBefore = JSON.stringify(await db.project.findMany({ orderBy: { id: "asc" } }));
  const conceptsBefore = JSON.stringify(await db.projectConceptFolder.findMany());
  const legacyFiles = JSON.stringify(await db.projectAttachment.findMany());
  await as("director"); await assert.rejects(tasks.listTasks(), /TASKER_DISABLED/);
  process.env.FLUX_UNIVERSAL_TASKER = "1";
  const create = (executorId = "designer", contextTarget = "structured:project", extra = {}) => tasks.createTask({ commandId: randomUUID(), contextTarget, type: "GENERAL", title: "General fixture", brief: "Exact authorized brief", deadline: "2026-10-20T12:00:00Z", priority: "HIGH", executorId, spectatorIds: ["digital"], ...extra });
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Meaningful reason or response", ...extra });
  const t = await create(); assert.equal((await tasks.getTask(t.id)).owner.id, "director");
  await as("designer"); const detail = await tasks.getTask(t.id); assert.equal(detail.brief, "Exact authorized brief"); assert.equal(detail.project.name, "Scoped project");
  assert.equal((await tasks.listTasks()).total, 1); assert.equal((await tasks.listTasks({ search: "UNRELATED_SENTINEL" })).total, 0);
  await assert.rejects(create("spm", "structured:other"));
  await assert.rejects(authorization.runAuthorized({ capability: "project.viewStage", targetId: "stage:concept-stage" }, async () => true));
  const prepared = await change(t.id, "PREPARE_UPLOAD", { fileName: "response.pdf", mimeType: "application/pdf", fileSize: 8 });
  assert.ok(prepared.uploadId); const upload = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId }, include: { version: true } });
  objects.set(upload.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: '"first"', VersionId: "pin-one" });
  assert.match((await tasks.uploadTicket(t.id, upload.id)).uploadUrl, /fixture.invalid/);
  const finCommand = { commandId: randomUUID(), expectedVersion: prepared.version, action: "FINALIZE_UPLOAD", uploadId: upload.id };
  const finals = await Promise.all([tasks.mutateTask(t.id, finCommand), tasks.mutateTask(t.id, finCommand)]); assert.equal(finals.filter(r => r.replayed).length, 1); assert.equal(copies, 1);
  await change(t.id, "SUBMIT", { fileIds: [upload.id], text: "First response with file" });
  await change(t.id, "REQUEST_COMPLETION", { text: "Please review exact submitted work" });
  assert.equal((await tasks.getTask(t.id)).status, "COMPLETION_REQUESTED");
  await assert.rejects(change(t.id, "SUBMIT"), /REVIEW_PENDING/); await assert.rejects(change(t.id, "REQUEST_COMPLETION", { text: " " }));
  await as("digital"); assert.equal((await tasks.getTask(t.id)).permissions.submit, false);
  for (const action of ["MESSAGE", "SUBMIT", "APPROVE", "CLOSE", "DELETE", "EDIT", "PREPARE_UPLOAD", "REQUEST_COMPLETION"]) await assert.rejects(change(t.id, action));
  const downloaded = await tasks.downloadTaskFile(t.id, upload.id, upload.versionId); assert.equal(downloaded.size, 8);
  await as("tech"); await assert.rejects(tasks.listTasks()); await assert.rejects(tasks.getTask(t.id)); await assert.rejects(create());
  await as("outsider"); assert.equal((await tasks.listTasks({ context: "structured:project" })).total, 0);
  await assert.rejects(tasks.getTask(t.id)); await assert.rejects(tasks.downloadTaskFile(t.id, upload.id, upload.versionId));
  await as("spm"); await assert.rejects(tasks.getTask(t.id), "Project owner does not own another user's task");
  await as("director"); await change(t.id, "REJECT", { text: "Please revise the artwork" });
  await as("designer"); const second = await change(t.id, "PREPARE_UPLOAD", { fileName: "response-v2.pdf", mimeType: "application/pdf", fileSize: 9, replaceFileId: upload.version.fileId });
  const secondUpload = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: second.uploadId }, include: { version: true } });
  objects.set(secondUpload.stagingKey, { ContentLength: 9, ContentType: "application/pdf", ETag: '"second"' });
  await change(t.id, "FINALIZE_UPLOAD", { uploadId: second.uploadId }); await change(t.id, "SUBMIT", { fileIds: [second.uploadId] }); await change(t.id, "REQUEST_COMPLETION");
  assert.equal(secondUpload.version.number, 2); assert.equal((await tasks.downloadTaskFile(t.id, upload.id, upload.versionId)).size, 8);
  await as("director"); const approve = { commandId: randomUUID(), expectedVersion: (await tasks.getTask(t.id)).version, action: "APPROVE", text: "Reviewed and accepted" };
  await tasks.mutateTask(t.id, approve); const eventCount = await db.businessEvent.count(); await tasks.mutateTask(t.id, approve); assert.equal(await db.businessEvent.count(), eventCount);
  assert.equal((await tasks.getTask(t.id)).status, "COMPLETED"); await assert.rejects(change(t.id, "MESSAGE"), /TASK_TERMINAL/);
  console.log("PASS Director → Designer: scoped brief, conversation/file revisions, request remains pending, rejection/revision, exact old bytes, distinct review completion, idempotent decisions.");
  await as("designer"); const owned = await create("spm", `task:${t.id}`, { spectatorIds: [] });
  await as("spm"); await change(owned.id, "SUBMIT"); await change(owned.id, "REQUEST_COMPLETION");
  await as("designer"); await change(owned.id, "APPROVE"); assert.equal((await tasks.getTask(owned.id)).owner.id, "designer");
  for (const role of ["spm", "jpm", "digital"]) {
    await as(role); const general = await create("designer", role === "digital" ? "flexible:flex" : "structured:project", { spectatorIds: [] });
    await change(general.id, "CLOSE", { text: "Closed by real Task Owner" }); assert.equal((await tasks.getTask(general.id)).status, "CLOSED");
    await assert.rejects(create("designer", "structured:other", { spectatorIds: [] }));
  }
  await as("director"); const scoped = await create("designer2", "structured:other", { spectatorIds: [] });
  await as("designer2"); assert.equal((await tasks.getTask(scoped.id)).project.name, "UNRELATED_SENTINEL");
  await assert.rejects(authorization.runAuthorized({ capability: "project.viewContext", targetId: "structured:other" }, async () => true));
  await create("spm", `task:${scoped.id}`, { spectatorIds: [] });
  await as("designer"); const intervened = await create("spm", "structured:project", { spectatorIds: [] });
  await as("director"); await change(intervened.id, "CLOSE"); const intervention = await tasks.getTask(intervened.id);
  assert.equal(intervention.owner.id, "designer"); assert.equal(intervention.entries.at(-1)?.actor.id, "director"); assert.equal(intervention.entries.at(-1)?.directorOverride, true);
  const deletion = { commandId: randomUUID(), action: "DELETE", expectedVersion: intervention.version, text: "Remove from ordinary lists" };
  await tasks.mutateTask(intervened.id, deletion); await tasks.mutateTask(intervened.id, deletion);
  assert.ok((await tasks.getTask(intervened.id)).deletedAt); assert.ok(!(await tasks.listTasks({ context: "structured:project" })).tasks.some(t => t.id === intervened.id));
  await as("spm"); await assert.rejects(tasks.getTask(intervened.id));
  console.log("PASS Designer owner → SPM executor; SPM/JPM authorized creation; Digital Lead flexible scope; task-only context; Director intervention attribution; deletion evidence retained.");
  await as("director"); const concurrent = await create();
  const commands = ["one", "two"].map(text => ({ commandId: randomUUID(), action: "MESSAGE", expectedVersion: 1, text }));
  const outcomes = await Promise.allSettled(commands.map(c => tasks.mutateTask(concurrent.id, c))); assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  assert.equal((await tasks.getTask(concurrent.id)).version, 2);
  const creation = { commandId: randomUUID(), contextTarget: "structured:project", type: "GENERAL", title: "Replay creation", brief: "Brief", deadline: "2026-11-01T12:00:00Z", priority: "NORMAL", executorId: "designer" };
  const replays = await Promise.all([tasks.createTask(creation), tasks.createTask(creation)]); assert.equal(replays[0].id, replays[1].id);
  await assert.rejects(tasks.createTask({ ...creation, title: "Different" }), /COMMAND_REUSED/);
  for (const type of ["FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"]) await assert.rejects(tasks.createTask({ ...creation, commandId: randomUUID(), type }), /TASK_TYPE_UNAVAILABLE/);
  await assert.rejects(create("tech")); await assert.rejects(create("director")); await assert.rejects(create("designer", "structured:project", { spectatorIds: ["designer"] }));
  const snapshot = async () => JSON.stringify([await db.universalTask.findMany({ orderBy: { id: "asc" } }), await db.universalTaskEntry.count(), await db.sharedFile.count(), await db.sharedFileVersion.count(), await db.sharedFileReference.count(), await db.sharedFileProvenance.count(), await db.businessEvent.count(), await db.eventOutbox.count()]);
  const rollbackUpload = await change(concurrent.id, "PREPARE_UPLOAD", { fileName: "rollback-final.pdf", mimeType: "application/pdf", fileSize: 8 });
  const rollbackSource = await db.universalTaskUpload.findUniqueOrThrow({ where: { id: rollbackUpload.uploadId }, include: { version: true } });
  objects.set(rollbackSource.stagingKey, { ContentLength: 8, ContentType: "application/pdf", ETag: '\"rollback-bytes\"' });
  const before = await snapshot();
  await db.$executeRawUnsafe(`CREATE FUNCTION tasker_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER tasker_fixture_fail BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION tasker_fixture_fail()`);
  await assert.rejects(change(concurrent.id, "PREPARE_UPLOAD", { fileName: "rollback.pdf", mimeType: "application/pdf", fileSize: 8 })); assert.equal(await snapshot(), before);
  await assert.rejects(create()); assert.equal(await snapshot(), before);
  await assert.rejects(change(concurrent.id, "FINALIZE_UPLOAD", { uploadId: rollbackSource.id }));
  assert.equal(await snapshot(), before); assert.equal((await db.sharedFileVersion.findUniqueOrThrow({ where: { id: rollbackSource.versionId } })).status, "UPLOADING");
  await db.$executeRawUnsafe('DROP TRIGGER tasker_fixture_fail ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION tasker_fixture_fail()');
  await change(concurrent.id, "FINALIZE_UPLOAD", { uploadId: rollbackSource.id });
  const edit = await tasks.getTask(concurrent.id);
  await change(concurrent.id, "EDIT", { title: edit.title, brief: "Audited revised brief", context: "Narrow context", deadline: edit.deadline, priority: "LOW", executorId: "spm", spectatorIds: ["designer"] });
  await as("designer"); assert.equal((await tasks.getTask(concurrent.id)).permissions.submit, false);
  await as("director"); await change(concurrent.id, "REQUEST_COMPLETION"); await assert.rejects(change(concurrent.id, "APPROVE"), /SELF_REVIEW_DENIED/);
  const liveSession = await db.session.findUniqueOrThrow({ where: { token: token! } });
  await db.session.update({ where: { id: liveSession.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(tasks.listTasks());
  await db.session.update({ where: { id: liveSession.id }, data: { expiresAt: liveSession.expiresAt } });
  const routes = requireLocal(join(compiled, "src/app/api/tasker/route.js")) as typeof import("../src/app/api/tasker/route");
  assert.equal((await routes.POST(new Request("http://local/api/tasker", { method: "POST", headers: { origin: "http://foreign", "content-type": "application/json" }, body: JSON.stringify(creation) }))).status, 403);
  assert.equal((await routes.POST(new Request("http://internal/api/tasker", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(creation) }))).status, 200);
  const entry = await db.universalTaskEntry.findFirstOrThrow(); await assert.rejects(db.universalTaskEntry.update({ where: { id: entry.id }, data: { text: "rewrite" } }));
  await assert.rejects(db.sharedFileVersion.update({ where: { id: upload.versionId }, data: { originalFileName: "rewrite" } }));
  await assert.rejects(db.universalTask.delete({ where: { id: concurrent.id } }));
  objects.set(upload.version.storageKey, { ContentLength: 8, ContentType: "application/pdf", ETag: '"tampered"' }); await assert.rejects(tasks.downloadTaskFile(t.id, upload.id, upload.versionId));
  const { createInternalDispatcher } = requireLocal(join(compiled, "src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  let delivered = 0; const dispatcher = createInternalDispatcher(db, async (_tx, event) => { assert.equal(event.type, "TASK_ACTIVITY"); delivered++; });
  const claim = await dispatcher.claim(); assert.ok(claim); assert.equal(await dispatcher.deliver(claim), "DELIVERED"); assert.equal(await dispatcher.deliver(claim), "STALE"); assert.equal(delivered, 1);
  assert.equal(await db.businessEvent.count(), await db.universalTaskEntry.count()); assert.equal(await db.eventOutbox.count(), await db.businessEvent.count());
  assert.equal(JSON.stringify(await db.userAuthorization.findMany({ orderBy: { userId: "asc" } })), allBefore);
  assert.equal(JSON.stringify(await db.project.findMany({ orderBy: { id: "asc" } })), projectBefore); assert.equal(JSON.stringify(await db.projectConceptFolder.findMany()), conceptsBefore); assert.equal(JSON.stringify(await db.projectAttachment.findMany()), legacyFiles);
  assert.equal(await db.archivedProjectFile.count(), 0); assert.equal(await db.manualLibraryAsset.count(), 0);
  process.env.FLUX_UNIVERSAL_TASKER = "0"; await assert.rejects(tasks.listTasks()); await assert.rejects(tasks.getTask(t.id));
  assert.ok(reads >= 2);
  console.log("PASS concurrency, command replay/conflict, future types closed, participant eligibility, transactional file/event rollback, immutable histories, fake consumer dedupe, unchanged projects/accounts/concepts/Archives/Library, feature off.");
}
main().finally(() => db.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });

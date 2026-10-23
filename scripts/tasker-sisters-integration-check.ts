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
  let copies = 0, reads = 0; const failCopy = false;
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
  if (process.argv.includes("--baseline")) {
    process.env.FLUX_TASKER_SISTERS = "0";
    await as("director");
    let inspiration: string | undefined;
    for (const type of ["GENERAL", "FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"] as const) {
      await as("spm");
      const task = await create(type, { title: `Pre-Sisters completed ${type}`, spectatorIds: [],
        ...(type === "FILE_UPLOAD" ? { destination: "research-folder:research-folder", inputMode: "FILE" } : {}),
        ...(type === "DATA_INPUT" ? { destination: "checklist:OUTPUT_NAME", inputMode: "TEXT" } : {}),
        ...(type === "FINAL_CONCEPT" ? { inspirationVersionIds: [inspiration!] } : {}) });
      if (type === "INSPECT_FILE") { const pin = await upload(task.id); await change(task.id, "SET_SOURCE", { sourceVersionId: pin.versionId }); }
      await as("designer"); const evidence = type === "DATA_INPUT" ? null : await upload(task.id);
      await change(task.id, "SUBMIT", { fileIds: evidence ? [evidence.id] : [], ...(type === "DATA_INPUT" ? { proposedText: "Before Sisters baseline" } : {}) });
      if (type === "INITIAL_CONCEPT") inspiration = evidence!.versionId;
      await change(task.id, "REQUEST_COMPLETION"); await as("spm"); await change(task.id, "APPROVE");
      await as("director");
      assert.equal((await tasks.getTask(task.id)).type, type);
      assert.ok((await tasks.listTasks({ type, scope: "accessible", sort: "recent" })).tasks.length);
    }
    const source = await db.universalTask.findFirstOrThrow({ where: { status: "COMPLETED" } });
    await assert.rejects(tasks.sisterDraft(source.id), /SISTERS_DISABLED/);
    await assert.rejects(tasks.listTasks({ familyId: source.id }), /SISTERS_DISABLED/);
    console.log("PASS all six types readable/filterable on 111 migrations with Sisters disabled; no family table access."); return;
  }
  process.env.FLUX_TASKER_SISTERS = "1";
  const accountSnapshot = JSON.stringify([await db.user.findMany({ orderBy: { id: "asc" } }), await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), await db.projectConceptFolder.findMany()]);
  async function finish(id: string, executor = "designer", owner = "spm") {
    await as(executor); await change(id, "SUBMIT", { text: "Independent work" }); await change(id, "REQUEST_COMPLETION"); await as(owner); await change(id, "APPROVE");
  }
  async function proposal(sourceId: string, mode = "KEEP", patch: Record<string, unknown> = {}, evidenceVersionIds: string[] = []) {
    const draft = await tasks.sisterDraft(sourceId);
    const next = { ...draft.values, commandId: randomUUID(), ...patch, sister: { sourceTaskId: sourceId, sourceVersion: draft.source.version, mode, evidenceVersionIds } };
    for (const key of Object.keys(next)) if ((next as Record<string, unknown>)[key] === undefined) delete (next as Record<string, unknown>)[key];
    const preview = await tasks.previewSister(next);
    return { ...next, sister: { ...next.sister, ...preview, confirmed: true } };
  }
  async function snapshot(id: string) {
    return JSON.stringify([await db.universalTask.findUnique({ where: { id }, include: { spectators: true } }), await db.universalTaskEntry.findMany({ where: { taskId: id }, orderBy: { version: "asc" } }), await db.universalTaskUpload.findMany({ where: { taskId: id }, include: { version: true }, orderBy: { id: "asc" } }), await db.businessEvent.findMany({ where: { taskId: id }, orderBy: { id: "asc" } })]);
  }
  await as("spm"); const originalTask = await create("GENERAL", { title: "Family original sentinel", spectatorIds: ["digital"] });
  await as("designer"); const rejected = await upload(originalTask.id); await change(originalTask.id, "SUBMIT", { fileIds: [rejected.id], text: "Earlier rejected response" }); await change(originalTask.id, "REQUEST_COMPLETION");
  await as("spm"); await change(originalTask.id, "REJECT");
  await as("designer"); const approved = await upload(originalTask.id, rejected.version.fileId); await change(originalTask.id, "SUBMIT", { fileIds: [approved.id], text: "Revised response" }); await change(originalTask.id, "REQUEST_COMPLETION"); await as("spm"); await change(originalTask.id, "APPROVE");
  const originalSnapshot = await snapshot(originalTask.id);
  await as("director"); const kept = await proposal(originalTask.id, "KEEP", {}, [rejected.versionId, approved.versionId]);
  await assert.rejects(tasks.createTask({ ...kept, sister: { ...kept.sister, confirmed: false } }), /CONFIRMATION/);
  const created = await tasks.createTask(kept); assert.equal((await tasks.createTask(kept)).id, created.id);
  await assert.rejects(tasks.createTask({ ...kept, title: "Forged replay" }), /COMMAND_REUSED/);
  const first = await tasks.getTask(created.id); assert.equal(first.owner.id, "director"); assert.equal(first.status, "OPEN"); assert.equal(first.version, 1); assert.equal(first.title, "Family original sentinel");
  assert.equal(first.entries.length, 1); assert.equal(first.files.length, 0); assert.equal(first.inheritedEvidence?.length, 2);
  assert.equal(first.inheritedEvidence?.find(e => e.versionId === rejected.versionId)?.sourceState, "REJECTED"); assert.equal(first.inheritedEvidence?.find(e => e.versionId === approved.versionId)?.sourceState, "APPROVED");
  assert.equal(await snapshot(originalTask.id), originalSnapshot);
  await as("designer"); const modified = await proposal(originalTask.id, "MODIFY", { title: "Designer owns new work", executorId: "spm", priority: "URGENT", spectatorIds: [] });
  const branch = await tasks.createTask(modified); const detail = await tasks.getTask(branch.id); assert.equal(detail.owner.id, "designer"); assert.equal(detail.executor.id, "spm"); assert.equal(detail.title, "Designer owns new work");
  await finish(branch.id, "spm", "designer"); const chain = await tasks.createTask(await proposal(branch.id));
  const link = await db.universalTaskFamilyLink.findUniqueOrThrow({ where: { taskId: chain.id } }); assert.equal(link.rootTaskId, originalTask.id); assert.equal(link.sourceTaskId, branch.id);
  await as("director"); const concurrent = await proposal(originalTask.id); const outcomes = await Promise.all([tasks.createTask(concurrent), tasks.createTask(concurrent)]); assert.equal(outcomes[0].id, outcomes[1].id);
  assert.equal(await db.universalTaskEntry.count({ where: { commandId: concurrent.commandId } }), 1);
  const parallel = await Promise.all([proposal(originalTask.id), proposal(originalTask.id)]); const branches = await Promise.all(parallel.map(p => tasks.createTask(p))); assert.notEqual(branches[0].id, branches[1].id);
  await assert.rejects(tasks.createTask(await proposal(originalTask.id, "MODIFY", { contextTarget: "structured:other" })), /CROSS_PROJECT_FAMILY/);
  await assert.rejects(tasks.createTask({ ...await proposal(originalTask.id), title: "Not KEEP" }), /CONFIRMATION/);
  const stale = await proposal(originalTask.id); stale.sister.sourceVersion--;
  await assert.rejects(tasks.previewSister(stale), /STALE_SISTER_SOURCE/);
  const { confirmationHash } = requireLocal(join(compiled, "src/lib/tasker/sister-contracts.js")) as typeof import("../src/lib/tasker/sister-contracts");
  stale.sister.confirmation = confirmationHash("director", stale);
  await assert.rejects(tasks.createTask(stale), /STALE_SISTER_SOURCE/);
  for (const actor of ["digital", "tech", "outsider"]) { await as(actor); await assert.rejects(tasks.sisterDraft(originalTask.id)); await assert.rejects(tasks.previewSister(kept)); await assert.rejects(tasks.createTask({ ...kept, commandId: randomUUID() })); }
  for (const actor of ["designer", "digital"]) {
    await as("spm"); const assigned = await create("GENERAL", { executorId: actor, spectatorIds: [] }); await finish(assigned.id, actor); await as(actor);
    for (const type of ["DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"]) await assert.rejects(tasks.createTask(await proposal(assigned.id, "MODIFY", { type, executorId: "spm", spectatorIds: [], ...(type === "DATA_INPUT" ? { destination: "checklist:OUTPUT_NAME", inputMode: "TEXT" } : {}) })));
    const allowed = await tasks.createTask(await proposal(assigned.id, "MODIFY", { type: "FILE_UPLOAD", executorId: "spm", spectatorIds: [], destination: `private-folder:${actor}-folder`, inputMode: "FILE" })); assert.equal((await tasks.getTask(allowed.id)).owner.id, actor);
  }
  await as("spm");
  for (const status of ["OPEN", "IN_PROGRESS", "COMPLETION_REQUESTED", "CLOSED"] as const) {
    const t = await create("GENERAL", { title: `Reject ${status}`, spectatorIds: [] });
    if (status === "IN_PROGRESS" || status === "COMPLETION_REQUESTED") { await as("designer"); await change(t.id, "SUBMIT"); if (status === "COMPLETION_REQUESTED") await change(t.id, "REQUEST_COMPLETION"); await as("spm"); }
    if (status === "CLOSED") await change(t.id, "CLOSE");
    assert.equal((await tasks.getTask(t.id)).status, status); await assert.rejects(tasks.sisterDraft(t.id));
  }
  await assert.rejects(tasks.sisterDraft("concept-stage"));
  await as("director");
  for (const type of ["FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"] as const) {
    const candidates = await db.universalTask.findMany({ where: { type, title: `Pre-Sisters completed ${type}`, status: "COMPLETED", deletedAt: null }, orderBy: { createdAt: "asc" } }); assert.ok(candidates.length, `completed ${type} fixture`);
    const source = candidates[0], before = await snapshot(source.id), publications = await db.universalTaskPublication.count(), applications = await db.universalTaskApplication.count(), beforeCopies = copies;
    const derived = await tasks.createTask(await proposal(source.id)); const result = await tasks.getTask(derived.id);
    assert.equal(result.status, "OPEN"); assert.equal(result.entries.length, 1); assert.equal(result.files.length, 0); assert.equal(await snapshot(source.id), before);
    assert.equal(await db.universalTaskPublication.count(), publications); assert.equal(await db.universalTaskApplication.count(), applications); assert.equal(copies, beforeCopies);
    if (type === "DATA_INPUT") { const old = await db.universalTaskTarget.findUniqueOrThrow({ where: { taskId: source.id } }); const fresh = await db.universalTaskTarget.findUniqueOrThrow({ where: { taskId: derived.id } }); assert.notEqual(old.expectedHash, fresh.expectedHash); await as(result.executor.id); await change(derived.id, "SUBMIT", { proposedText: "New proposal" }); await change(derived.id, "REQUEST_COMPLETION"); await db.projectFileChecklistItem.update({ where: { id: fresh.nativeId }, data: { value: { text: "Concurrent native write" } } }); await as("director"); await assert.rejects(change(derived.id, "APPROVE"), /FIELD_CONFLICT/); }
    if (type === "INSPECT_FILE") { assert.equal(result.references?.[0].versionId, (await tasks.getTask(source.id)).references?.[0].versionId); await as(result.executor.id); assert.equal((await tasks.downloadTaskReference(derived.id, result.references![0].id, result.references![0].versionId)).size, 8); await as("director"); }
  }
  console.log("PASS Sister scenarios 1–18: roles, Keep/Modify, confirmation/replay, immutable original, exact rejected/approved versions, fresh lifecycle, branches/chains, status/source/context denial, six types, no republish, fresh Data Input baseline/stale overwrite.");
  await as("designer"); const ev = first.inheritedEvidence![0]; assert.equal((await tasks.downloadInheritedEvidence(created.id, ev.id, ev.versionId)).size, 8);
  await assert.rejects(tasks.downloadInheritedEvidence(created.id, ev.id, "forged"));
  await as("digital"); assert.equal((await tasks.getTask(created.id)).inheritedEvidence, undefined); await assert.rejects(tasks.downloadInheritedEvidence(created.id, ev.id, ev.versionId));
  // An accessible sibling never grants metadata, counts, search, evidence or source access to a hidden sibling.
  await as("director"); const hidden = await tasks.createTask(await proposal(originalTask.id, "MODIFY", { title: "HIDDEN_FAMILY_SENTINEL", executorId: "jpm", spectatorIds: [] }));
  await as("designer"); const scoped = await tasks.listTasks({ familyId: created.id, scope: "accessible" }); assert.ok(!JSON.stringify(scoped).includes(hidden.id)); assert.ok(!JSON.stringify(scoped).includes("HIDDEN_FAMILY_SENTINEL"));
  assert.equal((await tasks.listTasks({ search: "HIDDEN_FAMILY_SENTINEL", scope: "accessible" })).total, 0);
  assert.equal((await tasks.getTask(created.id)).family!.count, scoped.total);
  await assert.rejects(tasks.listTasks({ familyId: hidden.id })); await assert.rejects(tasks.getTask(hidden.id));
  for (const sort of ["deadline", "priority", "created", "recent"]) assert.ok((await tasks.listTasks({ type: "GENERAL", priority: "HIGH", sort, scope: "mine" })).tasks.every(t => t.type === "GENERAL" && t.priority === "HIGH"));
  await as("director"); const beforeRollback = [await db.universalTask.count(), await db.universalTaskFamilyLink.count(), await db.universalTaskInheritedEvidence.count(), await db.businessEvent.count(), await db.eventOutbox.count()];
  await db.$executeRawUnsafe(`CREATE FUNCTION sister_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outbox rollback'; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER sister_fixture_fail AFTER INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION sister_fixture_fail()');
  await assert.rejects(tasks.createTask(await proposal(originalTask.id, "KEEP", {}, [approved.versionId])));
  await db.$executeRawUnsafe('DROP TRIGGER sister_fixture_fail ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION sister_fixture_fail()');
  assert.deepEqual([await db.universalTask.count(), await db.universalTaskFamilyLink.count(), await db.universalTaskInheritedEvidence.count(), await db.businessEvent.count(), await db.eventOutbox.count()], beforeRollback);
  await assert.rejects(db.universalTaskFamilyLink.update({ where: { taskId: created.id }, data: { sourceTaskId: created.id } }));
  await assert.rejects(db.universalTaskFamilyLink.delete({ where: { taskId: created.id } }));
  await assert.rejects(db.universalTaskInheritedEvidence.update({ where: { id: ev.id }, data: { sourceState: "APPROVED" } }));
  await assert.rejects(change(originalTask.id, "EDIT", { title: "Forbidden", brief: "Forbidden", context: "", deadline: "2026-12-01T00:00:00Z", priority: "LOW", executorId: "designer", spectatorIds: [] }));
  assert.equal(await snapshot(originalTask.id), originalSnapshot);
  await change(originalTask.id, "DELETE"); await assert.rejects(tasks.sisterDraft(originalTask.id));
  await as("designer"); const retained = await tasks.getTask(created.id); assert.equal(retained.family!.source, null); assert.equal(retained.inheritedEvidence!.length, 2); await tasks.downloadInheritedEvidence(created.id, ev.id, ev.versionId);
  assert.equal(JSON.stringify([await db.user.findMany({ orderBy: { id: "asc" } }), await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), await db.projectConceptFolder.findMany()]), accountSnapshot);
  assert.equal(await db.eventOutbox.count(), await db.businessEvent.count()); assert.equal(await db.businessEvent.count(), await db.universalTaskEntry.count());
  assert.ok(reads > 0); assert.equal(failCopy, false);
  // Existing type policy still governs delegation; owner-only inspection cannot
  // be inherited by an executor merely because they can read the source.
  await as("director"); const delegated = await create("INSPECT_FILE", { executorId: "jpm", spectatorIds: [] }); const pin = await upload(delegated.id); await change(delegated.id, "SET_SOURCE", { sourceVersionId: pin.versionId }); await finish(delegated.id, "jpm", "director");
  await as("jpm"); await assert.rejects(tasks.createTask(await proposal(delegated.id, "MODIFY", { executorId: "designer", sourceVersionId: pin.versionId })), /SOURCE_DELEGATION_DENIED/);
  await tasks.createTask(await proposal(delegated.id, "MODIFY", { executorId: "designer", sourceVersionId: undefined }));
  await as("director"); await assert.rejects(async () => tasks.createTask(await proposal(created.id)), /SISTER_SOURCE/);
  const blank = await create("GENERAL", { title: "No retroactive family", spectatorIds: [] });
  const createdEntry = await db.universalTaskEntry.findFirstOrThrow({ where: { taskId: blank.id, action: "CREATED" } });
  for (const patch of [{ sourceTaskId: blank.id }, { rootTaskId: blank.id }, { rootTaskId: "other" }, { sourceTaskId: "concept-stage" }, {}]) {
    await assert.rejects(authorization.runAuthorized({ capability: "task.createGeneral", targetId: "structured:project" }, tx => tx.universalTaskFamilyLink.create({ data: { taskId: blank.id, sourceTaskId: branch.id, rootTaskId: originalTask.id, createdEntryId: createdEntry.id, sourceVersion: (link.sourceVersion), mode: "KEEP", ...patch } })));
  }
  const initialSource = await db.universalTask.findFirstOrThrow({ where: { title: "Pre-Sisters completed INITIAL_CONCEPT" } });
  const finalSource = await db.universalTask.findFirstOrThrow({ where: { title: "Pre-Sisters completed FINAL_CONCEPT" } });
  const historicalFinal = await tasks.createTask(await proposal(finalSource.id));
  const retainedPin = (await tasks.getTask(historicalFinal.id)).references![0].versionId;
  await change(initialSource.id, "DELETE");
  await assert.rejects(async () => tasks.createTask(await proposal(finalSource.id)), /SOURCE_UNAVAILABLE/);
  assert.equal((await tasks.getTask(historicalFinal.id)).references![0].versionId, retainedPin);
  await as("spm"); const dual = await create("INSPECT_FILE", { spectatorIds: [] });
  const dualPin = await upload(dual.id); await change(dual.id, "SET_SOURCE", { sourceVersionId: dualPin.versionId });
  await change(dual.id, "MESSAGE", { fileIds: [dualPin.id], text: "Supporting source context" }); await finish(dual.id);
  const dualSister = await tasks.createTask(await proposal(dual.id, "KEEP", {}, [dualPin.versionId]));
  const dualDetail = await tasks.getTask(dualSister.id);
  assert.equal(dualDetail.references![0].versionId, dualPin.versionId); assert.equal(dualDetail.inheritedEvidence![0].sourceState, "SUPPORTING");
  assert.equal(await db.sharedFileProvenance.count({ where: { taskEntryId: dualDetail.entries[0].id, versionId: dualPin.versionId } }), 1);
  await as("director");
  for (let batch = 0; batch < 8; batch++) {
    const proposals = await Promise.all(Array.from({ length: 8 }, () => proposal(branch.id)));
    await Promise.all(proposals.map(p => tasks.createTask(p)));
  }
  const page1 = await tasks.listTasks({ familyId: branch.id, scope: "accessible", sort: "created" });
  const page2 = await tasks.listTasks({ familyId: branch.id, scope: "accessible", sort: "created", offset: 60 });
  assert.equal(page1.tasks.length, 60); assert.ok(page2.tasks.length > 0); assert.equal(page1.total, page2.total);
  assert.equal(new Set([...page1.tasks, ...page2.tasks].map(t => t.id)).size, page1.total);
  assert.ok(page1.tasks.every(t => t.family!.count === page1.total));
  console.log("PASS bounded large-family pagination: 60-row pages, stable unique membership, authorized counts and concurrent branches.");
  console.log("PASS forged/retroactive/self/root links denied; a Final Sister rechecks current inspiration eligibility while already-selected historical pins survive later source deletion.");
  console.log("PASS Sister scenarios 19–21: soft deletion retains immutable references without source visibility, current inspection delegation, unauthorized family traversal/count/search, concurrent commands, failed transaction rollback, retained provenance/outbox and accounts.");
}
main().finally(() => db.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });

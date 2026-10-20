import type { BusinessRole, PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { projectTransactionClient } from "../src/lib/authorization/project-transaction";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { allPermissionKeys } from "../src/lib/permissions/definitions";

const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-isolated-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_library_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"],["designer2","DESIGNER"]];
const tokens = new Map<string,string>();
let signed = 0;
let copied = 0;
const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string }>();
const signedKeys: string[] = [];
async function as(id:string) { token = tokens.get(id)!; }


async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_library_test"});
 assert.equal(await db.user.count(),0);
 for(const [id] of roles) await db.user.create({data:{id,email:`${id}@example.invalid`,passwordHash:"synthetic-unusable-hash",name:id,role:id==="tech"?"SUPER_ADMIN":"ADMIN"}});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated project governance fixtures',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
  for(const [userId,businessRole] of roles.filter(([id])=>id!=="unassigned")) await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:userId==="tech"?["TECHNICAL_ADMIN"]:[],accountStatus:"ACTIVE",authorizationVersion:1}});
 });
 for(const [id] of roles){const t=createVersionedSessionToken(id==="unassigned"?null:1); await db.session.create({data:{userId:id,token:t,expiresAt:new Date(Date.now()+3600000)}});tokens.set(id,t);}
}

async function main() {
 await seed();
 const moduleApi = localRequire("node:module") as { _load: (name: string, ...args: unknown[]) => unknown };
 const original = moduleApi._load, compiledRoot = dirname(dirname(__filename));
 moduleApi._load = function(name, ...args) {
  if (name === "@prisma/client") return localRequire(join(root, "client"));
  if (name === "@/lib/rich-text") return { sanitizeRichText: (value: string | null) => value ?? "", richTextToPlainText: (value: string | null) => value ?? "", isRichTextEmpty: (value: string | null) => !value };
  if (name === "@/lib/realtime/server") return new Proxy({}, { get: () => async () => false });
  if (name === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
  if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
  if (name === "next/navigation") return { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } };
  if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init), redirect: (url: string) => Response.redirect(url) }, after: () => {} };
  if (name === "react") return { cache: (fn: unknown) => fn };
  if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: projectTransactionClient(db), withPrismaRetry: (fn: () => unknown) => fn() };
  if (name === "@/lib/permissions/profiles") return { getPermissionProfileSnapshotForUser: async () => ({ effectivePermissions: new Set(allPermissionKeys), rolePermissions: new Set(allPermissionKeys), archiveAccessGranted: true, archiveAccessLevel: "FULL" }) };
  if (["@/lib/s3", "@/lib/storage/s3"].includes(name)) return {
   ...original.call(this, join(compiledRoot, "src/lib/storage/s3.js"), ...args) as typeof import("../src/lib/storage/s3"),
   getS3BucketName: () => "fixture-no-network", getS3Region: () => "fixture-region", getDefaultS3UploadEndpointMode: () => "regional",
   getMaxAssetUploadBytes: () => 1024 * 1024,
   createPresignedUploadTarget: async (input: { storageKey: string }) => { signed++; signedKeys.push(input.storageKey); return { uploadUrl: "http://fixture.invalid/upload", endpointMode: "regional", region: "fixture", uploadHost: "fixture.invalid", expiresInSeconds: 600, expectedHeaders: {} }; },
   createPresignedDownloadUrl: async (input: { storageKey: string }) => { signed++; signedKeys.push(input.storageKey); return "http://fixture.invalid/download"; },
   createPresignedPreviewUrl: async (input: { storageKey: string }) => { signed++; signedKeys.push(input.storageKey); return "http://fixture.invalid/preview"; },
   getObjectMetadata: async (key: string) => { const value = objects.get(key); if (!value) throw new Error("Missing fake object"); return value; },
   copyStoredObject: async (input: { sourceKey: string; storageKey: string; sourceETag: string }) => { const value = objects.get(input.sourceKey); assert.equal(value?.ETag, input.sourceETag); copied++; objects.set(input.storageKey, { ...value! }); },
   deleteObjectIfNeeded: async () => { throw new Error("Library must preserve stored objects/history"); },
  };
  return original.call(this, name.startsWith("@/") ? resolve(compiledRoot, "src", name.slice(2)) : name, ...args);
 };
 try {
  const auth = localRequire(join(compiledRoot, "src/lib/auth.js")) as typeof import("../src/lib/auth");
  const library = localRequire(join(compiledRoot, "src/lib/library.js")) as typeof import("../src/lib/library");
  const favorites = localRequire(join(compiledRoot, "src/lib/manual-library-asset-favorites.js")) as typeof import("../src/lib/manual-library-asset-favorites");
  const permissions = localRequire(join(compiledRoot, "src/lib/permissions/resolver.js")) as typeof import("../src/lib/permissions/resolver");
  const runtime = localRequire(join(compiledRoot, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  const policy = localRequire(join(compiledRoot, "src/lib/authorization/policy.js")) as typeof import("../src/lib/authorization/policy");
  const tags = localRequire(join(compiledRoot, "src/app/(dashboard)/settings/project-master-data/actions.js")) as typeof import("../src/app/(dashboard)/settings/project-master-data/actions");
  const uploadRoute = localRequire(join(compiledRoot, "src/app/api/library/upload-url/route.js")) as typeof import("../src/app/api/library/upload-url/route");
  const completeRoute = localRequire(join(compiledRoot, "src/app/api/library/complete/route.js")) as typeof import("../src/app/api/library/complete/route");
  const listRoute = localRequire(join(compiledRoot, "src/app/api/library/route.js")) as typeof import("../src/app/api/library/route");
  const downloadRoute = localRequire(join(compiledRoot, "src/app/api/library/manual-assets/[assetId]/download/route.js")) as typeof import("../src/app/api/library/manual-assets/[assetId]/download/route");
  const taskDownload = localRequire(join(compiledRoot, "src/app/api/library/attachments/[attachmentId]/download/route.js")) as typeof import("../src/app/api/library/attachments/[attachmentId]/download/route");
  const favoriteRoute = localRequire(join(compiledRoot, "src/app/api/library/attachments/[attachmentId]/favorite/route.js")) as typeof import("../src/app/api/library/attachments/[attachmentId]/favorite/route");
  const tagRoute = localRequire(join(compiledRoot, "src/app/api/asset-tags/route.js")) as typeof import("../src/app/api/asset-tags/route");
  const aiRoute = localRequire(join(compiledRoot, "src/app/api/flux-ai/search/route.js")) as typeof import("../src/app/api/flux-ai/search/route");
  async function user(id: string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn: () => Promise<unknown>) { await assert.rejects(fn, policy.AuthorizationDeniedError); }
  const accountSnapshot = await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } });
  const authorizationAudit = await db.userAuthorizationChange.findMany();
  await db.assetTag.create({ data: { id: "tag", name: "Visible file tag" } });
  for (const [id, ownerId] of [["project", "spm"], ["foreign", "outsider"], ["closed", "director"]]) await db.project.create({ data: { id, name: id, ownerId, createdById: ownerId, ...(id === "closed" ? { completedAt: new Date() } : {}) } });
  await db.projectCoOwner.create({ data: { projectId: "project", userId: "jpm" } });
  for (const id of ["designer", "digital", "tech"]) {
   await db.projectExecutor.create({ data: { projectId: "project", userId: id } });
   await db.projectStage.create({ data: { id: `task-${id}`, projectId: "project", order: ["designer", "digital", "tech"].indexOf(id) + 1, name: id } });
   await db.projectConceptFolder.create({ data: { id: `concept-${id}`, projectId: "project", taskerStageId: `task-${id}`, assignedExecutorId: id, name: id, normalizedName: id } });
  }
  await db.projectStage.create({ data: { id: "foreign-stage", projectId: "foreign", order: 1, name: "Foreign" } });
  for (const [id, projectId, stageId, assetType] of [
   ["general", "project", null, "GENERAL_PROJECT_ASSET"], ["task-designer", "project", "task-designer", "STAGE_SUBMISSION"],
   ["task-digital", "project", "task-digital", "STAGE_SUBMISSION"], ["task-tech", "project", "task-tech", "GENERAL_PROJECT_ASSET"],
   ["invoice", "project", "task-designer", "STAGE_INVOICE"], ["foreign-file", "foreign", null, "GENERAL_PROJECT_ASSET"],
   ["corrupt", "project", "foreign-stage", "GENERAL_PROJECT_ASSET"], ["closed-file", "closed", null, "GENERAL_PROJECT_ASSET"],
  ] as const) await db.projectAttachment.create({ data: { id, projectId, stageId, assetType, fileName: `${id}.pdf`, originalFileName: `${id}.pdf`, mimeType: "application/pdf", fileSize: 100, bucket: "fixture-no-network", storageKey: `fixture/${id}`, status: "READY", uploadedById: "director" } });
  for (const uploadedById of ["director", "spm", "jpm", "designer", "outsider"]) await db.manualLibraryAsset.create({ data: {
   id: `manual-${uploadedById}`, uploadedById, assetName: `manual-secret-${uploadedById}.pdf`, originalFileName: `${uploadedById}.pdf`, mimeType: "application/pdf", fileSize: 100,
   bucket: "fixture-no-network", storageKey: `fixture/manual-${uploadedById}`, status: "READY", assetTags: { create: { tagId: "tag" } },
  } });
  await db.archiveCategory.create({ data: { id: "archive", name: "Archive fixture", slug: "archive-fixture" } });
  await db.manualArchiveFile.create({ data: { id: "archive-file", archiveCategoryId: "archive", uploadedById: "director", fileName: "Archive.pdf", originalFileName: "Archive.pdf", mimeType: "application/pdf", fileSize: 100, bucket: "fixture-no-network", storageKey: "fixture/archive", status: "READY" } });
  await db.userArchiveAccess.create({ data: { userId: "designer", level: "FULL", grantedById: "director" } });
  await db.userArchiveAssetAccess.create({ data: { userId: "designer", manualArchiveFileId: "archive-file", grantedById: "director" } });
  const archiveSnapshot = await db.manualArchiveFile.findMany();
  const archiveGrants = await db.userArchiveAssetAccess.findMany();
  const draft = { assetName: "Upload", originalFileName: "upload.pdf", mimeType: "application/pdf", fileSize: 100, createdByName: "Original artist", description: "Metadata", assetTagIds: ["tag"] };
  for (const [id] of roles) {
   const actor = await user(id), allowed = !["tech", "unassigned"].includes(id);
   assert.equal(permissions.hasPermission(actor, "library.view"), allowed, id);
   assert.equal(permissions.hasPermission(actor, "library.uploadAsset"), id === "director", id);
   assert.equal(permissions.hasPermission(actor, "library.deleteFile"), id === "director", id);
   if (!allowed) await denied(() => library.getLibraryPageDataForUser(actor));
   else {
    const page = await library.getLibraryPageDataForUser(actor, { pageSize: 100 });
    const ids = page.items.map(item => item.id);
    assert.ok(!ids.includes("corrupt"));
    if (["designer", "digital"].includes(id)) assert.deepEqual(ids, [`task-${id}`]);
    if (id === "designer2") assert.deepEqual(ids, []);
    if (["spm", "jpm"].includes(id)) {
     assert.ok(ids.includes("general") && ids.includes(`manual-${id}`));
     assert.ok(!ids.includes("foreign-file") && !ids.includes("manual-director"));
     assert.ok(page.items.every(item => !item.canDelete && item.canDownload && item.canFavorite));
    }
    if (id === "director") {
     assert.deepEqual(new Set(ids), new Set(["general", "task-designer", "task-digital", "task-tech", "foreign-file", "closed-file", "manual-director", "manual-spm", "manual-jpm", "manual-designer", "manual-outsider"]));
     assert.equal(page.counts.quotationsAndInvoices, 1);
    }
    const search = await library.getLibraryPageDataForUser(actor, { search: "manual-secret-director" });
    assert.equal(search.total, id === "director" ? 1 : 0);
    if (["designer", "digital", "designer2"].includes(id)) assert.equal(page.counts.quotationsAndInvoices, 0);
   }
   if (id !== "director") {
    const before = signed;
    await denied(() => library.requestManualLibraryAssetUpload(actor, draft));
    await denied(() => library.deleteManualLibraryAssetForUser(actor, `manual-${id}`));
    await denied(() => library.deleteLibraryAttachmentForUser(actor, "general"));
    await denied(() => tags.saveAssetTagAction({ name: "Not allowed", isActive: true }));
    await denied(() => tags.setAssetTagStatusAction({ id: "tag", isActive: false }));
    await denied(() => tags.deleteAssetTagAction("tag"));
    assert.equal(signed, before);
   }
   assert.equal((await runtime.runtimeAuthorization.authorize({ capability: "library.share", targetId: "manual:manual-director" })).decision, "DENY");
  }
  console.log("PASS: role matrix, scoped listing/counts/search, no legacy/profile or Archive escalation, metadata/tag/delete restrictions");
  const spm = await user("spm");
  await library.getManualLibraryAssetDownloadUrlForUser(spm, "manual-spm");
  for (const target of ["manual-director", "manual-jpm", "missing"]) {
   const before = signed;
   await denied(() => library.getManualLibraryAssetDownloadUrlForUser(spm, target));
   await denied(() => library.getManualLibraryAssetPreviewUrlForUser(spm, target));
   await denied(() => favorites.addManualLibraryAssetFavorite(spm, target));
   assert.equal(signed, before);
  }
  await favorites.addManualLibraryAssetFavorite(spm, "manual-spm");
  await favorites.addManualLibraryAssetFavorite(spm, "manual-spm");
  assert.equal(await db.manualLibraryAssetFavorite.count(), 1);
  await favorites.removeManualLibraryAssetFavorite(spm, "manual-spm");
  assert.equal(await db.manualLibraryAssetFavorite.count(), 0);
  await assert.rejects(() => library.getLibraryPageDataForUser({ ...spm, id: "director" }), /mismatch/);
  const designer = await user("designer");
  await library.getLibraryAttachmentUrlForUser(designer, "task-designer");
  await library.getLibraryAttachmentUrlForUser(designer, "task-designer", true);
  for (const target of ["task-digital", "general", "invoice", "foreign-file", "corrupt", "missing"]) await denied(() => library.getLibraryAttachmentUrlForUser(designer, target));
  await library.setLibraryAttachmentFavorite(designer, "task-designer", true);
  await denied(() => library.setLibraryAttachmentFavorite(designer, "task-digital", true));
  await user("director");
  await library.setLibraryAttachmentFavorite((await auth.getCurrentUser())!, "task-designer", true);
  await user("designer");
  await library.setLibraryAttachmentFavorite((await auth.getCurrentUser())!, "task-designer", false);
  assert.deepEqual((await db.fileFavorite.findMany()).map(row => row.userId), ["director"]);
  console.log("PASS: guessed IDs, cross-user/project/task signing denied; own favorites cannot modify another user's favorites");
  let director = await user("director");
  const requested = await library.requestManualLibraryAssetUpload(director, draft);
  assert.ok(!("error" in requested));
  assert.ok(requested.assetId);
  const intent = await db.manualLibraryAsset.findUniqueOrThrow({ where: { id: requested.assetId } });
  assert.equal(intent.status, "UPLOADING"); assert.equal(intent.uploadedById, "director");
  const completion = { ...draft, storageKey: requested.storageKey };
  await assert.rejects(() => library.createCompletedManualLibraryAssetFromUpload(director, { ...completion, storageKey: "library/manual/director/forged.pdf" }), /intent/);
  await assert.rejects(() => library.createCompletedManualLibraryAssetFromUpload(director, { ...completion, assetName: "Changed metadata" }), /metadata/);
  objects.set(requested.storageKey, { ContentLength: 99, ContentType: draft.mimeType, ETag: "etag" });
  await assert.rejects(() => library.completeManualLibraryAssetUpload(director, intent.id), /does not match/);
  objects.set(requested.storageKey, { ContentLength: 100, ContentType: "image/png", ETag: "etag" });
  await assert.rejects(() => library.completeManualLibraryAssetUpload(director, intent.id), /does not match/);
  assert.equal((await db.manualLibraryAsset.findUniqueOrThrow({ where: { id: intent.id } })).status, "UPLOADING");
  const otherUploader = await user("spm"); await denied(() => library.completeManualLibraryAssetUpload(otherUploader, intent.id));
  director = await user("director");
  objects.set(requested.storageKey, { ContentLength: 100, ContentType: draft.mimeType, ETag: "etag" });
  const complete = await library.createCompletedManualLibraryAssetFromUpload(director, completion);
  assert.equal(complete.id, intent.id); assert.equal(complete.assetTags[0]?.id, "tag");
  assert.equal(copied, 1);
  objects.set(requested.storageKey, { ContentLength: 500, ContentType: "image/png", ETag: "replaced" });
  await library.completeManualLibraryAssetUpload(director, intent.id);
  await library.createCompletedManualLibraryAssetFromUpload(director, completion);
  assert.equal(copied, 1, "replay never copies mutable staging bytes again");
  await library.getManualLibraryAssetDownloadUrlForUser(director, intent.id);
  assert.equal(signedKeys.at(-1), `${requested.storageKey}.sealed`);
  assert.equal(objects.get(`${requested.storageKey}.sealed`)?.ETag, "etag");
  assert.equal((await db.manualLibraryAsset.findUniqueOrThrow({ where: { id: intent.id } })).uploadedById, "director");
  const expiring = await library.requestManualLibraryAssetUpload(director, draft); assert.ok(!("error" in expiring));
  await db.manualLibraryAsset.update({ where: { id: expiring.assetId }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
  await assert.rejects(() => library.completeManualLibraryAssetUpload(director, expiring.assetId), /expired/);
  await library.completeManualLibraryAssetUpload(director, expiring.assetId, true);
  await denied(() => library.completeManualLibraryAssetUpload(director, expiring.assetId));
  console.log("PASS: persisted upload intent, immutable metadata/tags, uploader binding, exact object validation, expiry, replay and sealed final storage");
  await tags.saveAssetTagAction({ name: "Director tag", color: "BLUE", isActive: true });
  await denied(() => library.deleteLibraryAttachmentForUser(director, "closed-file"));
  await db.projectConceptFolder.update({ where: { id: "concept-designer" }, data: { approvedAttachmentId: "task-designer", approvedById: "director", approvedAt: new Date() } });
  await denied(() => library.deleteLibraryAttachmentForUser(director, "task-designer"));
  await library.deleteLibraryAttachmentForUser(director, "general");
  assert.equal((await db.projectAttachment.findUniqueOrThrow({ where: { id: "general" } })).status, "DELETED");
  await library.deleteManualLibraryAssetForUser(director, intent.id);
  await denied(() => library.completeManualLibraryAssetUpload(director, intent.id));
  await denied(() => library.getManualLibraryAssetDownloadUrlForUser(director, intent.id));
  assert.ok(objects.has(`${requested.storageKey}.sealed`), "soft deletion preserves storage/history");
  console.log("PASS: Director tag management and deletion; referenced/history and completed-project files remain protected");
  const request = (body: unknown) => new Request("http://fixture.invalid/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await user("tech");
  assert.equal((await listRoute.GET(new Request("http://fixture.invalid/api/library"))).status, 403);
  assert.equal((await uploadRoute.POST(request(draft))).status, 403);
  assert.equal((await completeRoute.POST(request({ assetId: intent.id }))).status, 403);
  assert.equal((await downloadRoute.GET(request({}), { params: Promise.resolve({ assetId: "manual-director" }) })).status, 403);
  assert.equal((await tagRoute.GET()).status, 403);
  await user("designer");
  assert.equal((await taskDownload.GET(request({}), { params: Promise.resolve({ attachmentId: "task-designer" }) })).status, 302);
  assert.equal((await taskDownload.GET(request({}), { params: Promise.resolve({ attachmentId: "task-digital" }) })).status, 403);
  assert.equal((await favoriteRoute.POST(request({ userId: "director" }), { params: Promise.resolve({ attachmentId: "task-designer" }) })).status, 200);
  assert.equal(await db.fileFavorite.count({ where: { userId: "designer" } }), 1);
  await user("director");
  const ai = await aiRoute.POST(request({ query: "manual-secret-director", source: "library" }));
  assert.equal(ai.status, 200); assert.deepEqual((await ai.json()).results, []);
  token = null; assert.equal((await listRoute.GET(new Request("http://fixture.invalid/api/library"))).status, 401);
  const stale = await user("spm");
  await db.session.deleteMany({ where: { token: tokens.get("spm") } });
  await denied(() => library.getManualLibraryAssetDownloadUrlForUser(stale, "manual-spm"));
  assert.deepEqual(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }), accountSnapshot);
  assert.deepEqual(await db.userAuthorizationChange.findMany(), authorizationAudit);
  assert.deepEqual(await db.manualArchiveFile.findMany(), archiveSnapshot);
  assert.deepEqual(await db.userArchiveAssetAccess.findMany(), archiveGrants);
  console.log("PASS: direct routes, technical denial, AI has no Library source, revoked sessions, all nine users/roles and Archive/audit fixtures preserved");
 } finally { moduleApi._load = original; await db.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

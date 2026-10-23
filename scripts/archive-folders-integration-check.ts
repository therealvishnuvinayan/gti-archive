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
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_archives_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"],["designer2","DESIGNER"]];
const tokens = new Map<string,string>();
let signed = 0;
let deleted = 0;
let storageMode = "ok";
const runtimeObjects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId: string }>();
async function as(id:string) { token = tokens.get(id)!; }


async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_archives_test"});
 assert.equal(await db.user.count(),0);
 for(const [id] of roles) await db.user.create({data:{id,email:`${id}@example.invalid`,passwordHash:"synthetic-unusable-hash",name:id,role:id==="tech"?"SUPER_ADMIN":"ADMIN"}});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated project governance fixtures',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
  for(const [userId,businessRole] of roles.filter(([id])=>id!=="unassigned")) await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:userId==="tech"?["TECHNICAL_ADMIN"]:[],accountStatus:"ACTIVE",authorizationVersion:1}});
 });
 for(const [id] of roles){const t=createVersionedSessionToken(id==="unassigned"?null:1); await db.session.create({data:{userId:id,token:t,expiresAt:new Date(Date.now()+3600000)}});tokens.set(id,t);}
}

async function main(){
 if(process.argv.includes("--seed")) await seed();
 else for(const session of await db.session.findMany()) tokens.set(session.userId,session.token);
 const moduleApi=localRequire("node:module") as {_load:(name:string,...args:unknown[])=>unknown};
 const original=moduleApi._load, compiledRoot=dirname(dirname(__filename));
 moduleApi._load=function(name,...args){
  if(name==="@prisma/client")return localRequire(join(root,"client"));
  // This authorization suite uses plain synthetic strings; rich-text rendering
  // is not under test (the local sanitizer transitive dependency is unavailable).
  if(name==="@/lib/rich-text")return {sanitizeRichText:(value:string|null)=>value??"",richTextToPlainText:(value:string|null)=>value??"",isRichTextEmpty:(value:string|null)=>!value};
  if(name==="@/lib/realtime/server")return new Proxy({}, {get:()=>async()=>false});
  if(name==="next/headers")return{cookies:async()=>({get:()=>token?{value:token}:undefined})};
  if(name==="next/cache")return{unstable_cache:(fn:unknown)=>fn,revalidatePath:()=>{},revalidateTag:()=>{}};
  if(name==="next/navigation")return{redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}};
  if(name==="next/server")return{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init),redirect:(url:string)=>Response.redirect(url)},after:(fn:unknown)=>{void fn;}};
  if(name==="react")return{cache:(fn:unknown)=>fn};
  if(name==="@/lib/prisma"||name==="../prisma"||name==="./prisma")return{prisma:projectTransactionClient(db),withPrismaRetry:(fn:()=>unknown)=>fn()};
  if(name==="@/lib/permissions/profiles")return{getPermissionProfileSnapshotForUser:async()=>({effectivePermissions:new Set(allPermissionKeys),rolePermissions:new Set(allPermissionKeys),archiveAccessGranted:true,archiveAccessLevel:"FULL"})};
  if(name==="@/lib/s3"||name.endsWith("storage/s3"))return {
    ...original.call(this, join(compiledRoot,"src/lib/storage/s3.js"), ...args) as typeof import("../src/lib/storage/s3"),
    getS3BucketName:()=>"fixture-no-network",
    getObjectMetadata:async(key:string)=>{ const o=runtimeObjects.get(key); if(!o)throw new Error("Missing synthetic object");return {...o}; },
    copyStoredObject:async(input:{sourceKey:string;storageKey:string;sourceETag:string})=>{ const o=runtimeObjects.get(input.sourceKey);assert.equal(o?.ETag,input.sourceETag);runtimeObjects.set(input.storageKey,{...o!}); },

    observePinnedStoredObject:async(input:{objectVersionId:string|null;objectETag:string})=>{ if(storageMode === "missing")throw new Error("NoSuchKey"); return {ContentLength:100,ContentType:"application/pdf",ETag:storageMode === "changed" ? '"changed"' : input.objectETag,VersionId:input.objectVersionId??undefined}; },
    readPinnedStoredObject:async(input:{objectVersionId:string|null;objectETag:string})=>({ContentLength:100,ContentType:"application/pdf",ETag:input.objectETag,VersionId:input.objectVersionId??undefined,Body:{transformToWebStream:()=>new ReadableStream({start(controller){controller.enqueue(new Uint8Array(100));controller.close();}})}}),
    createPresignedUploadUrl:async()=>{signed++;return "http://fixture.invalid/upload";},
    createPresignedDownloadUrl:async()=>{signed++;return "http://fixture.invalid/download";},
    createPresignedPreviewUrl:async()=>{signed++;return "http://fixture.invalid/preview";},
    deleteObjectIfNeeded:async()=>{deleted++;},
  };
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try {
  const auth = localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const folders = localRequire(join(compiledRoot,"src/lib/archive-folders/service.js")) as typeof import("../src/lib/archive-folders/service");
  const archives = localRequire(join(compiledRoot,"src/lib/archives.js")) as typeof import("../src/lib/archives");
  const categories = localRequire(join(compiledRoot,"src/lib/archive-categories.js")) as typeof import("../src/lib/archive-categories");
  const library = localRequire(join(compiledRoot,"src/lib/library.js")) as typeof import("../src/lib/library");
  const runtime = localRequire(join(compiledRoot,"src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  const actions = localRequire(join(compiledRoot,"src/app/(dashboard)/settings/project-master-data/actions.js")) as typeof import("../src/app/(dashboard)/settings/project-master-data/actions");
  const route = localRequire(join(compiledRoot,"src/app/api/archives/organization/route.js")) as typeof import("../src/app/api/archives/organization/route");
  async function user(id:string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn:()=>Promise<unknown>) { await assert.rejects(fn, error => { if(error instanceof TypeError || error instanceof ReferenceError || error instanceof assert.AssertionError)throw error; return true; }); }
  if(process.argv.includes("--seed")) {
    for(const id of ["open","restricted"]) await db.archiveCategory.create({data:{id,name:id,slug:id}});
    await db.archiveCategoryAccess.create({data:{archiveCategoryId:"restricted",userId:"director"}});
    for(const [id,category] of [["manual","open"],["ungranted","open"],["restricted-file","restricted"],...Array.from({length:105},(_,i)=>[`bulk-${String(i).padStart(3,"0")}`,"open"])]) {
      await db.manualArchiveFile.create({data:{id,archiveCategoryId:category,fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`,status:"READY",uploadedById:"director"}});
    }
    for(const id of ["project","other-project"]) await db.project.create({data:{id,name:id,ownerId:"spm",createdById:"spm"}});
    for(const [id,projectId] of [["source","project"],["foreign","other-project"]]) await db.projectAttachment.create({data:{id,projectId,fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`,status:"READY",uploadedById:"designer",assetType:"GENERAL_PROJECT_ASSET"}});
    await db.projectArchive.create({data:{id:"archive",projectId:"project",projectName:"project",projectCategory:"Artwork",archiveCategoryId:"open",archivedById:"director",archivedAt:new Date(),status:"SAVED"}});
    for(const [id,sourceAttachmentId] of [["archived","source"],["corrupt","foreign"]]) await db.archivedProjectFile.create({data:{id,archiveId:"archive",projectId:"project",sourceAttachmentId,finalArchiveFileName:`${id}.pdf`,originalFileName:`${sourceAttachmentId}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${sourceAttachmentId}`,archivedById:"director",archivedAt:new Date()}});
    for(const id of ["designer","digital"]) {
      await db.userArchiveAccess.create({data:{userId:id,level:"FULL",grantedById:"director"}});
      for(const fileId of ["manual","restricted-file"]) await db.userArchiveAssetAccess.create({data:{userId:id,manualArchiveFileId:fileId,grantedById:"director"}});
      await db.userArchiveAssetAccess.create({data:{userId:id,archivedProjectFileId:"archived",grantedById:"director"}});
    }
    await db.manualLibraryAsset.create({data:{id:"library",assetName:"Private library",originalFileName:"library.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/library",status:"READY",uploadedById:"director"}});
    for(const [id,source] of [["native-version","source"],["manual-version","manual"]]) {
      const native=source==="source";
      await db.sharedFile.create({data:{id:`identity-${id}`,projectId:native?"project":null}});
      await db.sharedFileVersion.create({data:{id,fileId:`identity-${id}`,number:1,uploadedById:native?"designer":"director",originalFileName:`${source}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${source}`}});
      await db.sharedFileReference.create({data:{id:`source-${id}`,versionId:id,role:"SOURCE",...(native?{projectAttachmentId:source}:{manualArchiveFileId:source})}});
      await db.sharedFileVersion.update({where:{id},data:{status:"READY",objectETag:'"synthetic-etag"',objectVersionId:`exact-${id}`,observedAt:new Date(),finalizedAt:new Date()}});
      if(native) await db.sharedFileReference.create({data:{id:"archived-reference",versionId:id,role:"REFERENCE",archivedProjectFileId:"archived"}});
    }
    const director=await user("director"), category=await categories.getArchiveCategoryBySlug("open");assert.ok(category);
    assert.ok((await archives.listArchivedFilesByCategory(director,category)).some(file=>file.id==="manual"));
    await archives.getArchivedFileDownloadUrlForUser(director,"ungranted");
    await denied(()=>folders.readArchiveFolder(director,{categoryId:"open"}));
    await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:"Disabled",description:"",icon:"folder"}));
    const verification = localRequire(join(compiledRoot,"src/lib/archive-verification/service.js")) as typeof import("../src/lib/archive-verification/service");
    await denied(()=>verification.readArchiveVerification(director,{sourceKind:"manual",sourceId:"manual",categoryId:"open"}));
    const runtimeArchive = localRequire(join(compiledRoot,"src/lib/archive-runtime/service.js")) as typeof import("../src/lib/archive-runtime/service");
    await denied(()=>runtimeArchive.readRuntimeArchivePublication(director,"not-a-runtime-project"));
    console.log("PASS 116-migration compatibility: current client, legacy Archive reads/downloads, disabled new services; populated native and exact-version fixtures.");
    return;
  }
  process.env.FLUX_ARCHIVE_FOLDERS="1";
  const snapshot=async()=>JSON.stringify(await Promise.all([
    db.archivedProjectFile.findMany({orderBy:{id:"asc"}}),db.manualArchiveFile.findMany({orderBy:{id:"asc"}}),db.projectAttachment.findMany({orderBy:{id:"asc"}}),
    db.sharedFile.findMany({orderBy:{id:"asc"}}),db.sharedFileVersion.findMany({orderBy:{id:"asc"}}),db.sharedFileReference.findMany({orderBy:{id:"asc"}}),db.sharedFileProvenance.findMany({orderBy:{id:"asc"}}),
    db.user.findMany({orderBy:{id:"asc"}}),db.userAuthorization.findMany({orderBy:{userId:"asc"}}),db.projectArchive.findMany({orderBy:{id:"asc"}}),db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}}),
  ]));
  const preserved=await snapshot();
  const director=await user("director");
  const create=(name:string,parentId:string|null=null,categoryId="open")=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId,action:"create",parentId,name,description:`Description ${name}`,icon:"folder"});
  const first=await create("Campaigns"), second=await create("Deliverables"), nested=await create("Print",first.id), hidden=await create("Hidden");
  const rootView=await folders.readArchiveFolder(director,{categoryId:"open"});assert.equal(rootView.total,108);assert.equal(rootView.files.length,50);
  const allFiles=new Set(rootView.files.map(f=>f.key));let cursor=rootView.nextCursor;
  while(cursor){const page=await folders.readArchiveFolder(director,{categoryId:"open",cursor});for(const file of page.files){assert.ok(!allFiles.has(file.key));allFiles.add(file.key);}cursor=page.nextCursor;}
  assert.equal(allFiles.size,108);assert.ok(!allFiles.has("project:corrupt"));
  assert.equal((await folders.readArchiveFolder(director,{categoryId:"open",search:"%"})).total,0);
  assert.deepEqual((await folders.readArchiveFolder(director,{categoryId:"open",folderId:nested.id})).breadcrumbs.map(f=>f.name),["Campaigns","Print"]);
  await denied(()=>create("  campaigns  "));
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:"bad",description:"",icon:"https://evil.invalid/icon"}));
  const rename={commandId:randomUUID(),categoryId:"open",action:"rename",folderId:nested.id,expectedRevision:1,name:"Print ready",description:"Approved files",icon:"images"};
  const renamed=await folders.organizeArchive(director,rename);assert.equal(renamed.revision,2);
  assert.deepEqual(await folders.organizeArchive(director,rename),renamed);
  await denied(()=>folders.organizeArchive(director,{...rename,name:"Replay attack"}));
  await denied(()=>folders.organizeArchive(director,{...rename,commandId:randomUUID()}));
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:first.id,expectedRevision:1,parentId:nested.id}));
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:first.id,expectedRevision:1,parentId:first.id}));
  const foreign=await create("Foreign",null,"restricted");
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:first.id,expectedRevision:1,parentId:foreign.id}));
  const moved=await folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:nested.id,expectedRevision:2,parentId:second.id});assert.equal(moved.revision,3);
  assert.deepEqual((await folders.readArchiveFolder(director,{categoryId:"open",folderId:nested.id})).breadcrumbs.map(f=>f.id),[second.id,nested.id]);
  for(const [fileKind,fileId]of [["project","archived"],["manual","manual"]])await folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind,fileId,expectedRevision:0,folderId:nested.id});
  assert.equal((await folders.readArchiveFolder(director,{categoryId:"open",folderId:nested.id})).files.length,2);
  assert.equal((await folders.readArchiveFolder(director,{categoryId:"open"})).total,106);
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"project",fileId:"corrupt",expectedRevision:0,folderId:nested.id}));
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"restricted-file",expectedRevision:0,folderId:nested.id}));
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"manual",expectedRevision:1,folderId:foreign.id}));
  console.log("PASS nested navigation, rename, folder/file moves, literal filename filtering, bounded pagination, cycles, foreign folders/files and exact-source integrity.");
  for(const id of ["spm","digital","designer","designer2","jpm","tech","unassigned"]) {
    const actor=await user(id), manager=["spm","digital"].includes(id), reader=["spm","digital","designer"].includes(id);
    if(reader){const page=await folders.readArchiveFolder(actor,{categoryId:"open",folderId:nested.id});assert.equal(page.files.length,2);assert.equal(page.canManage,manager);assert.equal(page.canMoveFiles,id==="spm");assert.equal(page.canDeleteFolders,false);
      if(id==="designer"){assert.deepEqual(new Set(page.folders.map(f=>f.id)),new Set([second.id,nested.id]));await denied(()=>folders.readArchiveFolder(actor,{categoryId:"open",folderId:hidden.id}));assert.equal((await folders.readArchiveFolder(actor,{categoryId:"open",search:"ungranted"})).total,0);}
    } else await denied(()=>folders.readArchiveFolder(actor,{categoryId:"open"}));
    const command={commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:`${id} folder`,description:"",icon:"box"};
    if(manager) await folders.organizeArchive(actor,command);else await denied(()=>folders.organizeArchive(actor,command));
    await denied(()=>folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"delete-folder",folderId:hidden.id,expectedRevision:1}));
    assert.equal((await runtime.runtimeAuthorization.authorize({capability:"archive.verify",targetId:"file:manual"})).decision,"DENY");
    if(id!=="spm")await denied(()=>folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"manual",expectedRevision:1,folderId:null}));
    if(id!=="spm")await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"ungranted"));
    if(id!=="spm")await denied(()=>folders.readArchiveFolder(actor,{categoryId:"restricted"}));
    await denied(()=>library.getManualLibraryAssetDownloadUrlForUser(actor,"library"));
    if(id==="designer"||id==="digital")await denied(()=>library.getLibraryAttachmentUrlForUser(actor,"source"));
  }
  const digital=await user("digital");
  const createdCategory=await actions.saveArchiveCategoryAction({name:"Digital category",slug:"digital-category",isActive:true,iconKey:"images"});assert.ok(!("error"in createdCategory));
  const category=await db.archiveCategory.findUniqueOrThrow({where:{slug:"digital-category"}});
  await folders.organizeArchive(digital,{commandId:randomUUID(),categoryId:category.id,action:"create",parentId:null,name:"Empty managed",description:"",icon:"folder"});
  assert.equal((await folders.readArchiveFolder(digital,{categoryId:category.id})).folders.length,1);
  await denied(()=>folders.organizeArchive(digital,{commandId:randomUUID(),categoryId:"restricted",action:"create",parentId:null,name:"Denied",description:"",icon:"folder"}));
  const spm=await user("spm");await denied(()=>archives.deleteArchivedFileForUser(spm,"ungranted"));await denied(()=>folders.organizeArchive(spm,rename));
  await user("director");
  await denied(()=>folders.organizeArchive({id:"spm"},{commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:"Forged actor",description:"",icon:"folder"}));
  console.log("PASS Director/SPM/Digital Lead/Designer/JPM/technical/unassigned policies; no inherited file grants, restricted counts/search/paths, verification remains closed and Library scope stays independent.");
  // Real parallel transactions: only one opposing move can commit.
  const a=await create("Concurrent A"),b=await create("Concurrent B");
  const concurrent=await Promise.allSettled([
    folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:a.id,expectedRevision:1,parentId:b.id}),
    folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-folder",folderId:b.id,expectedRevision:1,parentId:a.id}),
  ]);assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
  const replay={commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:"Replay once",description:"",icon:"folder"};
  await Promise.allSettled([folders.organizeArchive(director,replay),folders.organizeArchive(director,replay)]);
  await folders.organizeArchive(director,replay);assert.equal(await db.archiveFolder.count({where:{name:"Replay once"}}),1);assert.equal(await db.archiveOrganizationCommand.count({where:{id:replay.commandId}}),1);
  const moves={commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"manual",expectedRevision:1,folderId:second.id};
  const competing=await Promise.allSettled([folders.organizeArchive(director,moves),folders.organizeArchive(director,{...moves,commandId:randomUUID(),folderId:first.id})]);assert.equal(competing.filter(r=>r.status==="fulfilled").length,1);
  // An insert failure at the final receipt must roll back the organization write.
  await db.$executeRawUnsafe(`CREATE FUNCTION test_archive_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = 'forced-rollback' THEN RAISE EXCEPTION 'forced rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER test_archive_rollback BEFORE INSERT ON "ArchiveOrganizationCommand" FOR EACH ROW EXECUTE FUNCTION test_archive_rollback()`);
  await denied(()=>folders.organizeArchive(director,{commandId:"forced-rollback",categoryId:"open",action:"create",parentId:null,name:"Must not exist",description:"",icon:"folder"}));
  assert.equal(await db.archiveFolder.count({where:{name:"Must not exist"}}),0);assert.equal(await db.archiveOrganizationCommand.count({where:{id:"forced-rollback"}}),0);
  const placementBeforeRollback=await db.archiveFilePlacement.findUniqueOrThrow({where:{id:"manual:manual"}});
  await denied(()=>folders.organizeArchive(director,{commandId:"forced-rollback",categoryId:"open",action:"move-file",fileKind:"manual",fileId:"manual",expectedRevision:placementBeforeRollback.revision,folderId:null}));
  assert.deepEqual(await db.archiveFilePlacement.findUniqueOrThrow({where:{id:"manual:manual"}}),placementBeforeRollback);
  await db.$executeRawUnsafe(`DROP TRIGGER test_archive_rollback ON "ArchiveOrganizationCommand"`);await db.$executeRawUnsafe(`DROP FUNCTION test_archive_rollback()`);
  await denied(()=>db.$transaction(tx=>tx.archiveFolder.update({where:{id:second.id},data:{parentId:nested.id,revision:{increment:1}}}),{isolationLevel:"Serializable"}));
  await denied(()=>db.$transaction(tx=>tx.archiveFolder.update({where:{id:hidden.id},data:{parentId:foreign.id,revision:{increment:1}}}),{isolationLevel:"Serializable"}));
  await denied(()=>db.archiveFolder.create({data:{id:"unserialized",categoryId:"open",name:"Unserialized"}}));
  await db.$transaction(async tx=>{for(let i=1;i<=64;i++)await tx.archiveFolder.create({data:{id:`depth-${i}`,categoryId:"open",parentId:i>1?`depth-${i-1}`:null,name:`Depth ${i}`}});},{isolationLevel:"Serializable"});
  await denied(()=>db.$transaction(tx=>tx.archiveFolder.create({data:{id:"depth-65",categoryId:"open",parentId:"depth-64",name:"Too deep"}}),{isolationLevel:"Serializable"}));
  await denied(()=>db.$transaction(tx=>tx.archiveFolder.update({where:{id:"depth-1"},data:{parentId:hidden.id,revision:{increment:1}}}),{isolationLevel:"Serializable"}));
  await denied(()=>db.archiveOrganizationCommand.deleteMany());
  const empty=await create("Delete empty");await folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"delete-folder",folderId:empty.id,expectedRevision:1});
  await denied(()=>folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"delete-folder",folderId:second.id,expectedRevision:1}));
  assert.equal(await snapshot(),preserved);
  const endpoint="http://localhost/api/archives/organization";
  process.env.APP_URL="http://localhost";
  assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"https://evil.invalid","content-type":"application/json"},body:JSON.stringify(replay)}))).status,403);
  assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(replay)}))).status,200);
  await user("designer");assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(replay)}))).status,403);
  token=null;assert.equal((await route.GET(new Request(endpoint+"?categoryId=open"))).status,401);
  assert.equal(deleted,0);assert.ok(signed===0,"Organization itself must never touch S3");
  console.log("PASS competing moves and replay, stale revisions, forced rollback, DB constraint attacks, HTTP origin/session checks and retained command history; every original file/version/reference/user/grant row unchanged; zero S3 organization operations.");
  if(process.argv.includes("--verification")) {
    const check = localRequire(join(compiledRoot,"scripts/archive-verification-integration-check.js")) as typeof import("./archive-verification-integration-check");
    await check.runVerificationChecks({db,user,require:localRequire,compiledRoot,setStorageMode:(value:string)=>{storageMode=value;}});
  }
  if(process.argv.includes("--sharing")) {
    const check = localRequire(join(compiledRoot,"scripts/archive-sharing-integration-check.js")) as typeof import("./archive-sharing-integration-check");
    await check.runSharingChecks({db,user,require:localRequire,compiledRoot});
  }
  if(process.argv.includes("--runtime")) {
    const check = localRequire(join(compiledRoot,"scripts/archive-runtime-integration-check.js")) as typeof import("./archive-runtime-integration-check");
    await check.runRuntimeArchiveChecks({db,user,require:localRequire,compiledRoot,seedObject:(key:string)=>runtimeObjects.set(key,{ContentLength:100,ContentType:"application/pdf",ETag:'"runtime-artwork"',VersionId:"runtime-exact-object"})});
  }
 } finally { moduleApi._load=original; }
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());

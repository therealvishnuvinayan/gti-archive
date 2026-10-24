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
async function as(id:string) { token = tokens.get(id)!; }


function metadataDraft(runId: string, titleWorkingName: string) {
  const date = "2026-08-18";

  return {
    artworkId: `ARCHIVE-EDIT-${runId}`,
    titleWorkingName,
    versionRevision: "v1",
    languageMarket: "English / UAE",
    artworkType: "Packaging",
    brandSubBrand: "Archive Edit Brand",
    productSku: "SKU-001",
    campaignProject: "Archive edit permission check",
    formatDimensions: "A4",
    colourSpace: "CMYK",
    resolution: "300 DPI",
    fileFormats: "PDF",
    printProcess: "Digital",
    specialFinishes: "None",
    creationDate: date,
    lastModifiedDate: date,
    goLiveOnShelfDate: "",
    expirySunsetDate: "",
    archiveStatus: "Archived",
    createdByName: "Archive Edit Creator",
    approvedByName: "Archive Edit Approver",
    approvedAt: date,
    clientBrandOwner: "Archive Edit Owner",
    regulatoryClearance: "Approved",
    fontsUsed: "Inter",
    imagesPhotography: "None",
    illustrationsIcons: "None",
    colourCodes: "CMYK",
    thirdPartyLogosIp: "",
    supplierPrinter: "Test Printer",
    outputFilesList: "archive-edit.pdf",
    printProofRef: "",
    packagingDielineRef: "",
    changeLog: "Archive edit permission integration check.",
    relatedArtworks: "",
    briefSpecLink: "",
    generalNotes: "",
  };
}

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
 await seed();
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
  if(name==="@/lib/s3"||name==="@/lib/storage/s3")return {
    ...original.call(this, join(compiledRoot,"src/lib/storage/s3.js"), ...args) as typeof import("../src/lib/storage/s3"),
    getS3BucketName:()=>"fixture-no-network",
    createPresignedUploadUrl:async()=>{signed++;return "http://fixture.invalid/upload";},
    createPresignedDownloadUrl:async()=>{signed++;return "http://fixture.invalid/download";},
    createPresignedPreviewUrl:async()=>{signed++;return "http://fixture.invalid/preview";},
    deleteObjectIfNeeded:async()=>{deleted++;},
  };
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try {
  const auth = localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const archives = localRequire(join(compiledRoot,"src/lib/archives.js")) as typeof import("../src/lib/archives");
  const categories = localRequire(join(compiledRoot,"src/lib/archive-categories.js")) as typeof import("../src/lib/archive-categories");
  const actions = localRequire(join(compiledRoot,"src/app/(dashboard)/settings/project-master-data/actions.js")) as typeof import("../src/app/(dashboard)/settings/project-master-data/actions");
  const access = localRequire(join(compiledRoot,"src/lib/archive-access.js")) as typeof import("../src/lib/archive-access");
  const permissions = localRequire(join(compiledRoot,"src/lib/permissions/resolver.js")) as typeof import("../src/lib/permissions/resolver");
  const eligibility = localRequire(join(compiledRoot,"src/lib/authorization/eligibility.js")) as typeof import("../src/lib/authorization/eligibility");
  const runtime = localRequire(join(compiledRoot,"src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  const download = localRequire(join(compiledRoot,"src/app/api/archives/files/[archivedFileId]/download/route.js")) as typeof import("../src/app/api/archives/files/[archivedFileId]/download/route");
  const iconUpload = localRequire(join(compiledRoot,"src/app/api/archive-category-icons/upload-url/route.js")) as typeof import("../src/app/api/archive-category-icons/upload-url/route");
  const iconPreview = localRequire(join(compiledRoot,"src/app/api/archive-category-icons/preview/route.js")) as typeof import("../src/app/api/archive-category-icons/preview/route");
  async function user(id:string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn:()=>Promise<unknown>) { await assert.rejects(fn, error => { if(error instanceof TypeError || error instanceof ReferenceError || error instanceof assert.AssertionError)throw error; return true; }); }
  const identities = await db.userAuthorization.findMany({orderBy:{userId:"asc"}});
  for(const id of ["open","restricted","empty"]) await db.archiveCategory.create({data:{id,name:id,slug:id}});
  await db.archiveCategoryAccess.create({data:{archiveCategoryId:"restricted",userId:"director",createdById:"director"}});
  for(const [id,archiveCategoryId] of [["manual","open"],["ungranted","open"],["restricted-file","restricted"],["delete-me","open"]]) await db.manualArchiveFile.create({data:{id,archiveCategoryId,fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`,status:"READY",uploadedById:"director",uploadedAt:new Date()}});
  for(const id of ["project","other-project"]) await db.project.create({data:{id,name:id,ownerId:"spm",createdById:"spm"}});
  await db.projectStage.create({data:{id:"stage-six",projectId:"project",order:6,name:"Production and Handover"}});
  await db.projectWorkflowStage.create({data:{projectId:"project",stageKey:"PRODUCTION_AND_HANDOVER",status:"COMPLETED"}});
  for(const [id,projectId] of [["source","project"],["foreign","other-project"]]) await db.projectAttachment.create({data:{id,projectId,fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`,status:"READY",uploadedById:"designer",assetType:"GENERAL_PROJECT_ASSET"}});
  await db.projectArchive.create({data:{id:"archive",projectId:"project",finalStageId:"stage-six",projectName:"project",projectCategory:"Artwork",archiveCategoryId:"open",archivedById:"director",archivedAt:new Date(),status:"SAVED"}});
  for(const [id,sourceAttachmentId] of [["archived","source"],["corrupt","foreign"]]) await db.archivedProjectFile.create({data:{id,archiveId:"archive",projectId:"project",sourceAttachmentId,finalArchiveFileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${sourceAttachmentId}`,archivedById:"director",archivedAt:new Date()}});
  for(const id of ["designer","digital"]) {
    await db.userArchiveAccess.create({data:{userId:id,level:"FULL",grantedById:"director"}});
    for(const fileId of ["manual","restricted-file"]) await db.userArchiveAssetAccess.create({data:{userId:id,manualArchiveFileId:fileId,grantedById:"director"}});
    await db.userArchiveAssetAccess.create({data:{userId:id,archivedProjectFileId:"archived",grantedById:"director"}});
  }
  for(const [id,role] of roles.filter(([id])=>id!=="designer2")) {
    const actor=await user(id), manager=["director","spm","outsider"].includes(id), reader=manager||["designer","digital"].includes(id);
    assert.equal(permissions.canUseArchives(actor),reader,id);
    assert.equal(permissions.getArchiveAccessLevel(actor),manager?"FULL":reader?"PARTIAL":"NONE",id);
    assert.equal(archives.canUploadArchiveFiles(actor),manager,id);
    assert.equal(eligibility.getBusinessRoleEligibility(role,"archive.verify").decision!=="DENY",["director","digital"].includes(id));
    assert.equal((await runtime.runtimeAuthorization.authorize({capability:"archive.verify",targetId:"file:manual"})).decision,"DENY","verification storage is not active");
    assert.equal((await runtime.runtimeAuthorization.authorize({capability:"archive.notReal",targetId:"root"})).decision,"DENY");
    if(reader) {
      await archives.getArchivedFileDownloadUrlForUser(actor,"manual");
      await archives.getArchivedFilePreviewUrlForUser(actor,"archived");
      const category=await categories.getArchiveCategoryBySlug("open");assert.ok(category);
      const files=await archives.listArchivedFilesByCategory(actor,category);
      assert.ok(files.some(file=>file.id==="archived"));
      if(!manager) { assert.ok(!files.some(file=>file.id==="ungranted")); assert.ok(files.every(file=>file.artworkMetadata===null)); }
    } else {
      await denied(()=>archives.listArchiveCategorySummaries(actor));
      await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"manual"));
    }
    if(manager) {
      await archives.getArchivedFileDownloadUrlForUser(actor,"restricted-file");
      await archives.updateArchivedFileInformation(actor,{archivedFileId:"manual",finalArchiveFileName:"manual.pdf"});
      const shared=await archives.createArchiveFileShareLink(actor,{archivedFileId:"manual",expiryDays:1});
      assert.equal((await archives.getSharedArchiveFileDownload(shared.sharePath.split("/").pop()!)).state,"active");
    } else {
      await denied(()=>archives.updateArchivedFileInformation(actor,{archivedFileId:"manual",finalArchiveFileName:"hacked.pdf"}));
      await denied(()=>archives.createArchiveFileShareLink(actor,{archivedFileId:"manual",expiryDays:1}));
      await denied(()=>access.setArchiveFileAccess(actor,"manual","designer2",true));
      await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"restricted-file"));
      await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"ungranted"));
    }
    if(id!=="director") {
      await denied(()=>archives.deleteArchivedFileForUser(actor,"delete-me"));
      await denied(()=>actions.deleteArchiveCategoryAction("empty"));
    }
    if(!["director","spm","outsider","digital"].includes(id)) await denied(()=>actions.saveArchiveCategoryAction({name:`denied-${id}`,isActive:true}));
    const api=await download.GET(new Request("http://fixture.invalid"),{params:Promise.resolve({archivedFileId:"manual"})});
    assert.equal(api.status,reader?307:404);
    const uploadIcon=await iconUpload.POST(new Request("http://fixture.invalid",{method:"POST",body:JSON.stringify({fileName:"icon.png",mimeType:"image/png",fileSize:10})}));
    assert.equal(uploadIcon.status,["director","spm","outsider","digital"].includes(id)?200:403);
    if(!manager) await denied(()=>archives.saveStageSixArchiveSnapshot(actor,{projectId:"project",archiveCategoryId:"open",files:[]}));
  }
  console.log("PASS Archives: all nine identities, global Director/SPM, grant-scoped Designer/Digital Lead, legacy FULL overrides denied; metadata/share/delete/category/API/verification contracts.");
  let actor=await user("digital");
  const dlCategory=await actions.saveArchiveCategoryAction({name:"Digital Category",isActive:true});assert.ok("success" in dlCategory);
  await actions.saveArchiveCategoryAction({id:"open",name:"Open renamed",slug:"open",isActive:true});
  await denied(()=>actions.saveArchiveCategoryAction({id:"restricted",name:"bypass",isActive:true}));
  const aclDenied=await actions.saveArchiveCategoryAction({id:"open",name:"bypass",isActive:true,allowedUserIds:["digital"]});assert.ok("error" in aclDenied);
  assert.equal((await db.archiveCategory.findUniqueOrThrow({where:{id:"open"}})).name,"Open renamed");
  const key="settings/archive-category-icons/director/private.png";
  assert.equal((await iconPreview.GET(new Request(`http://fixture.invalid?key=${encodeURIComponent(key)}`))).status,404);
  actor=await user("spm");
  await access.setArchiveFileAccess(actor,"manual","designer2",true);
  let reader=await user("designer2");await archives.getArchivedFileDownloadUrlForUser(reader,"manual");
  actor=await user("spm");await access.setArchiveFileAccess(actor,"manual","designer2",false);
  reader=await user("designer2");await denied(()=>archives.getArchivedFileDownloadUrlForUser(reader,"manual"));
  actor=await user("director");
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"corrupt"));
  await denied(()=>archives.getArchivedFileDownloadUrlForUser({...actor,id:"spm"},"manual"));
  assert.equal(permissions.canUseArchives({...actor}),false,"copied caller identity is not trusted");
  await archives.deleteArchivedFileForUser(actor,"delete-me");assert.equal(deleted,1);
  await actions.deleteArchiveCategoryAction("empty");
  const {hashSecureExternalToken,createSecureExternalToken}=localRequire(join(compiledRoot,"src/lib/secure-external-token.js")) as typeof import("../src/lib/secure-external-token");
  const rawToken=createSecureExternalToken({expiryDays:1}).token;
  await db.archiveFileShareLink.create({data:{tokenHash:hashSecureExternalToken(rawToken)!,manualArchiveFileId:"manual",createdById:"designer",expiresAt:new Date(Date.now()+100000)}});
  assert.equal((await archives.getSharedArchiveFileDownload(rawToken)).state,"unavailable","legacy unauthorized issuer cannot share");
  const link=await archives.createArchiveFileShareLink(actor,{archivedFileId:"manual",expiryDays:1});const linkToken=link.sharePath.split("/").pop()!;
  await db.archiveFileShareLink.update({where:{tokenHash:hashSecureExternalToken(linkToken)!},data:{revokedAt:new Date()}});
  assert.equal((await archives.getSharedArchiveFileDownload(linkToken)).state,"expired");
  actor=await user("spm");
  const upload=await archives.requestArchiveFileUpload(actor,{archiveCategoryId:"open",fileName:"Uploaded-proof.pdf",originalFileName:"proof.pdf",mimeType:"application/pdf",fileSize:100});
  assert.ok("archiveFileId" in upload && upload.archiveFileId, JSON.stringify(upload));
  const uploadId = upload.archiveFileId;
  const other=await user("outsider");await denied(()=>archives.completeArchiveFileUpload(other,uploadId));
  actor=await user("spm");
  await archives.completeArchiveFileUpload(actor,uploadId,{artworkMetadata:metadataDraft("upload","Visible Title")});
  assert.equal((await db.manualArchiveFile.findUniqueOrThrow({where:{id:upload.archiveFileId}})).status,"READY");
  await archives.updateArchivedFileInformation(actor,{archivedFileId:uploadId,finalArchiveFileName:"Renamed.pdf",artworkMetadata:{...metadataDraft("upload","Visible Title"),generalNotes:"SECRET_INTERNAL_NOTES"}});
  await access.setArchiveFileAccess(actor,uploadId,"designer",true);
  reader=await user("designer");
  assert.equal((await archives.searchArchivesForUser({user:reader,query:"SECRET_INTERNAL_NOTES"})).results.length,0);
  const visibleCategory=await categories.getArchiveCategoryBySlug("open");assert.ok(visibleCategory);
  assert.equal((await archives.listArchivedFilesByCategory(reader,visibleCategory)).find(file=>file.id===upload.archiveFileId)?.artworkMetadata,null);
  actor=await user("spm");
  assert.ok((await archives.searchArchivesForUser({user:actor,query:"SECRET_INTERNAL_NOTES"})).results.length>0);
  // Publication fixtures have an accepted production source and real attribution.
  await db.archivedProjectFile.delete({where:{id:"corrupt"}}); // disposable malformed fixture only
  await db.projectStageFileHandoff.create({data:{id:"handoff",projectId:"project",sourceWorkflowStageKey:"PROJECT_DEVELOPMENT",sourceAttachmentId:"source",targetWorkflowStageKey:"FINAL_LAYOUT",handedOffById:"spm"}});
  const checklist=await db.projectFileChecklist.create({data:{projectId:"project",handoffId:"handoff",sourceAttachmentId:"source"}});
  await db.projectProductionUnit.create({data:{id:"unit",projectId:"project",sourceHandoffId:"handoff",sourceChecklistId:checklist.id,sourceAttachmentId:"source",createdById:"spm",status:"HANDOVER_READY",approvedAt:new Date()}});
  await db.productionApprovalStep.create({data:{productionUnitId:"unit",sequence:1,status:"APPROVED",decidedByUserId:"director",decidedAt:new Date()}});
  const existing=await db.archivedProjectFile.findUniqueOrThrow({where:{id:"archived"}});
  const publish={projectId:"project",archiveCategoryId:"open",files:[{sourceAttachmentId:"source",finalArchiveFileName:"source.pdf",artworkMetadata:metadataDraft("publish","Publication")}]};
  await archives.getStageSixArchivePreparation(actor,{projectId:"project"});
  await archives.saveStageSixArchiveSnapshot(actor,publish);
  assert.deepEqual(await db.archivedProjectFile.findUniqueOrThrow({where:{id:"archived"}}),existing,"republish preserves publisher, timestamp, source and metadata");
  assert.equal((await db.project.findUniqueOrThrow({where:{id:"project"}})).completedAt,null,"publication cannot complete project");
  await denied(()=>archives.saveStageSixArchiveSnapshot(actor,{...publish,files:[{...publish.files[0],sourceAttachmentId:"foreign"}]}));
  await db.projectProductionUnitFile.create({data:{productionUnitId:"unit",attachmentId:"foreign",addedById:"spm"}});
  await denied(()=>archives.saveStageSixArchiveSnapshot(actor,publish));
  await db.projectProductionUnitFile.deleteMany({where:{productionUnitId:"unit"}});
  await db.projectAttachment.create({data:{id:"source-two",projectId:"project",fileName:"source-two.pdf",originalFileName:"source-two.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/source-two",status:"READY",uploadedById:"designer",assetType:"GENERAL_PROJECT_ASSET"}});
  await db.projectProductionUnitFile.create({data:{productionUnitId:"unit",attachmentId:"source-two",addedById:"spm"}});
  const secondPublication={...publish,files:[...publish.files,{sourceAttachmentId:"source-two",finalArchiveFileName:"published-two.pdf",artworkMetadata:metadataDraft("publish-two","Second publication")}]};
  await archives.saveStageSixArchiveSnapshot(actor,secondPublication);
  const published=await db.archivedProjectFile.findUniqueOrThrow({where:{archiveId_sourceAttachmentId:{archiveId:"archive",sourceAttachmentId:"source-two"}},include:{artworkMetadata:true}});
  assert.equal(published.archivedById,"spm");assert.equal(published.sourceAttachmentId,"source-two");assert.equal(published.storageKey,"fixture/source-two");assert.equal(published.artworkMetadata?.createdByUserId,"designer");
  await db.projectProductionUnitFile.deleteMany({where:{attachmentId:"source-two"}});
  await denied(()=>archives.saveStageSixArchiveSnapshot(actor,publish));
  await db.projectProductionUnitFile.create({data:{productionUnitId:"unit",attachmentId:"source-two",addedById:"spm"}});
  actor=await user("outsider");await denied(()=>archives.saveStageSixArchiveSnapshot(actor,publish));
  actor=await user("director");await archives.saveStageSixArchiveSnapshot(actor,secondPublication);
  await denied(()=>archives.completeProjectArchive(actor,{projectId:"project",stageId:"stage-six",archiveCategoryId:"open",files:publish.files}));
  console.log("PASS Archives: upload completion ownership, metadata editing, minimum metadata/search, accepted publication, cross-project rejection, immutable publisher history and final-completion separation.");
  assert.deepEqual(await db.userAuthorization.findMany({orderBy:{userId:"asc"}}),identities);
  const beforeExpirySignatures=signed;
  await db.session.updateMany({where:{userId:"director"},data:{expiresAt:new Date(0)}});
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"manual"));
  assert.equal(signed,beforeExpirySignatures);
  assert.ok(signed>0);
  console.log("PASS Archives: grant/revoke, category ACL preservation, foreign icons, corrupted sources, real-actor binding, revoked/legacy share rejection, account preservation; fake storage only.");
 } finally {moduleApi._load=original;}
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});

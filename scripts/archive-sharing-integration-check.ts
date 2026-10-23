import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AccessCommand } from "../src/lib/archive-sharing/contracts";
type User = NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>;
export async function runSharingChecks(h: { db: PrismaClient; user: (id: string) => Promise<User>; require: NodeRequire; compiledRoot: string }) {
  const { db, user } = h;
  const service = h.require(join(h.compiledRoot,"src/lib/archive-sharing/service.js")) as typeof import("../src/lib/archive-sharing/service");
  const native = h.require(join(h.compiledRoot,"src/lib/archive-access.js")) as typeof import("../src/lib/archive-access");
  const archives = h.require(join(h.compiledRoot,"src/lib/archives.js")) as typeof import("../src/lib/archives");
  const folders = h.require(join(h.compiledRoot,"src/lib/archive-folders/service.js")) as typeof import("../src/lib/archive-folders/service");
  const verification = h.require(join(h.compiledRoot,"src/lib/archive-verification/service.js")) as typeof import("../src/lib/archive-verification/service");
  const files = h.require(join(h.compiledRoot,"src/lib/files/access.js")) as typeof import("../src/lib/files/access");
  const route = h.require(join(h.compiledRoot,"src/app/api/archives/access/route.js")) as typeof import("../src/app/api/archives/access/route");
  const dispatcher = h.require(join(h.compiledRoot,"src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  let denials = 0;
  async function denied(fn: () => Promise<unknown>) { await assert.rejects(fn, e => { if (e instanceof TypeError || e instanceof ReferenceError || e instanceof assert.AssertionError) throw e; denials++; return true; }); }
  let actor = await user("director");
  await denied(() => service.readArchiveAccess(actor,"ungranted"));
  process.env.FLUX_ARCHIVE_SHARING="1";process.env.FLUX_ARCHIVE_FOLDERS="1";process.env.FLUX_ARCHIVE_VERIFICATION="1";
  for (const id of ["share-one","share-two","share-old","share-legacy","share-expiry"]) {
    await db.manualArchiveFile.create({data:{id,archiveCategoryId:"open",fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`,status:"READY",uploadedById:"director"}});
  }
  await db.sharedFile.create({data:{id:"share-family"}});
  for (const [i,id] of ["share-one","share-two","share-old"].entries()) {
    await db.sharedFileVersion.create({data:{id:`${id}-version`,fileId:"share-family",number:i+1,uploadedById:"director",originalFileName:`${id}.pdf`,mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:`fixture/${id}`}});
    await db.sharedFileReference.create({data:{id:`${id}-ref`,versionId:`${id}-version`,role:"SOURCE",manualArchiveFileId:id}});
    await db.sharedFileVersion.update({where:{id:`${id}-version`},data:{status:"READY",objectETag:'"synthetic-etag"',objectVersionId:`exact-${id}`,observedAt:new Date(),finalizedAt:new Date()}});
  }
  // A second genuine native reference to a project version (no fabricated origin).
  await db.projectAttachment.create({data:{id:"share-attachment",projectId:"project",fileName:"native.pdf",originalFileName:"native.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/share-native",status:"READY",uploadedById:"designer",assetType:"GENERAL_PROJECT_ASSET"}});
  await db.archivedProjectFile.create({data:{id:"share-native",archiveId:"archive",projectId:"project",sourceAttachmentId:"share-attachment",finalArchiveFileName:"native.pdf",originalFileName:"native.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/share-native",archivedById:"director",archivedAt:new Date()}});
  await db.sharedFile.create({data:{id:"share-project-family",projectId:"project"}});
  await db.sharedFileVersion.create({data:{id:"share-native-version",fileId:"share-project-family",number:1,uploadedById:"designer",originalFileName:"native.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/share-native"}});
  await db.sharedFileReference.create({data:{id:"share-project-source",versionId:"share-native-version",role:"SOURCE",projectAttachmentId:"share-attachment"}});
  await db.sharedFileVersion.update({where:{id:"share-native-version"},data:{status:"READY",objectETag:'"synthetic-etag"',objectVersionId:"exact-native",observedAt:new Date(),finalizedAt:new Date()}});
  await db.sharedFileReference.create({data:{id:"share-native-ref",versionId:"share-native-version",role:"REFERENCE",archivedProjectFileId:"share-native"}});
  const command = async (fileId="share-one",recipientId="designer2",action:"GRANT"|"REVOKE"="GRANT"):Promise<AccessCommand> => {
    const v=await service.readArchiveAccess(actor,fileId),r=v.grants.find(g=>g.id===recipientId)??v.users.find(u=>u.id===recipientId);
    return {commandId:randomUUID(),sourceId:v.sourceId,sourceKind:v.sourceKind,categoryId:v.categoryId,referenceId:v.referenceId,versionId:v.versionId,recipientId,action,expectedRevision:r?.revision??0,expectedDecisionId:r?.decisionId??null,expectedGrantId:v.grants.find(g=>g.id===recipientId)?.grantId??null,expiresAt:null,reason:action==="GRANT"?"Confirmed exact synthetic file":"Access no longer required",confirmed:true};
  };
  const source={sourceKind:"manual" as const,sourceId:"share-one",categoryId:"open"};
  const verify={...source,versionId:"share-one-version",expectedRevision:0,expectedDecisionId:null,commandId:randomUUID(),reason:"Director exact review",action:"VERIFY",confirmed:true};
  const review=await verification.decideArchiveVerification(actor,verify);
  const beforeReview=JSON.stringify(await db.archiveVerificationDecision.findMany({where:{sourceId:"share-one"}}));
  const grant=await command();
  for(const patch of [{categoryId:"restricted"},{sourceKind:"project"},{versionId:"share-two-version"},{referenceId:"share-two-ref"},{recipientId:"nonexistent"},{recipientId:"jpm"},{recipientId:"tech"},{confirmed:false},{expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+91*86400000).toISOString()}]) await denied(()=>service.decideArchiveAccess(actor,{...grant,...patch}));
  const saved=await service.decideArchiveAccess(actor,grant);assert.deepEqual(await service.decideArchiveAccess(actor,grant),saved);assert.deepEqual(await service.decideArchiveAccess(actor,Object.fromEntries(Object.entries(grant).reverse())),saved);
  assert.equal(await db.userArchiveAssetAccess.count({where:{userId:"designer2",manualArchiveFileId:"share-one"}}),1);
  assert.equal(await db.archiveAccessDecision.count(),1);
  const d=await db.archiveAccessDecision.findUniqueOrThrow({where:{id:saved.decisionId}});assert.equal(d.actorId,"director");assert.equal(d.referenceId,"share-one-ref");assert.equal(d.capability,"PREVIEW_DOWNLOAD");
  await denied(()=>service.decideArchiveAccess(actor,{...grant,reason:"Changed replay"}));
  // SQL guards independently reject forged actor authority and source binding.
  for (const [id,role] of [["tech","DIRECTOR"],["spm","DIRECTOR"],["designer","SENIOR_PROJECT_MANAGER"]]) {
    const session=await db.session.findFirstOrThrow({where:{userId:id}}), decisionId=randomUUID();
    await denied(()=>db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('flux.archive_access_actor',${id},true),set_config('flux.archive_access_session',${session.id},true),set_config('flux.archive_access_confirmed','true',true)`;
      await tx.archiveAccessDecision.create({data:{...d,sourceSnapshot:d.sourceSnapshot as Prisma.InputJsonValue,id:decisionId,recipientId:"designer",grantId:randomUUID(),actorId:id,actorRole:role,sessionId:session.id,eventId:`archive-access:${decisionId}`,commandId:randomUUID()}});
    },{isolationLevel:"Serializable"}));
  }
  const manageView=await service.readArchiveAccess(actor,"share-one");assert.equal(manageView.grants[0].effective,true);assert.equal(manageView.grants[0].scope,"VERSION");
  assert.ok(!JSON.stringify(manageView).includes("fixture/share-one"));
  actor=await user("designer2");
  assert.match(await archives.getArchivedFileDownloadUrlForUser(actor,"share-one"),/^\/api\/file-versions\/share-one-version/);
  assert.match(await archives.getArchivedFilePreviewUrlForUser(actor,"share-one"),/disposition=inline/);
  const opened=await files.openSharedFileVersion({kind:"manual-archive-file",id:"share-one"},"share-one-version");assert.equal(opened.fileSize,100);
  await denied(()=>files.openSharedFileVersion({kind:"manual-archive-file",id:"share-one"},"share-two-version"));
  await denied(()=>files.openSharedFileVersion({kind:"manual-archive-file",id:"share-two"},"share-two-version"));
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"ungranted"));
  assert.equal((await verification.readArchiveVerification(actor,source)).history.length,0);
  for(const id of ["designer2","designer","digital","jpm","tech","unassigned"]) {
    actor=await user(id);await denied(()=>service.readArchiveAccess(actor,"share-one"));await denied(()=>service.decideArchiveAccess(actor,grant));
  }
  // Native grant rows cannot bypass current business role or category restrictions.
  for(const id of ["jpm","tech","unassigned"]) {await db.userArchiveAssetAccess.create({data:{userId:id,manualArchiveFileId:"share-two",grantedById:"director"}});actor=await user(id);await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-two"));}
  actor=await user("spm");await service.decideArchiveAccess(actor,await command("share-native"));
  await denied(()=>verification.decideArchiveVerification(actor,verify));await denied(()=>archives.deleteArchivedFileForUser(actor,"share-one"));
  await denied(async()=>service.decideArchiveAccess(actor,await command("restricted-file")));
  actor=await user("designer2");assert.match(await archives.getArchivedFileDownloadUrlForUser(actor,"share-native"),/share-native-version/);
  await files.openSharedFileVersion({kind:"archived-project-file",id:"share-native"},"share-native-version");
  await denied(()=>files.getSharedFileIdentity({kind:"project-attachment",id:"share-attachment"}));
  actor=await user("director");await service.decideArchiveAccess(actor,await command("share-two","digital"));
  actor=await user("digital");assert.equal((await verification.readArchiveVerification(actor,{...source,sourceId:"share-two"})).canVerify,false);
  await denied(()=>verification.decideArchiveVerification(actor,{...verify,sourceId:"share-two",versionId:"share-two-version"}));
  const digitalSession=await db.session.findFirstOrThrow({where:{userId:"digital"}});
  await denied(()=>db.$transaction(async tx=>{const id=randomUUID();await tx.$queryRaw`SELECT set_config('flux.archive_review_actor','digital',true),set_config('flux.archive_review_session',${digitalSession.id},true),set_config('flux.archive_review_confirmed','true',true)`;
    await tx.archiveVerificationDecision.create({data:{id,referenceId:"share-two-ref",versionId:"share-two-version",sourceKind:"manual",sourceId:"share-two",categoryId:"open",action:"VERIFY",sequence:1,actorId:"digital",actorRole:"DIGITAL_LEAD",actorVersion:1,sessionId:digitalSession.id,reason:"Forged delegation",commandId:randomUUID(),commandHash:"a".repeat(64),eventId:`archive-review:${id}`,storageEvidence:{bucket:"fixture-no-network",storageKey:"fixture/share-two",objectVersionId:"exact-share-two",objectETag:'"synthetic-etag"',checksumSha256:null,checksumEvidence:"UNKNOWN",fileSize:100,mimeType:"application/pdf",observedAt:new Date().toISOString()}}});},{isolationLevel:"Serializable"}));
  console.log("PASS Director/SPM native grants, actual actor/reference/version, preview and conditional version GET, all denied roles and forged grant rows, source-project/version isolation, UI privacy and SQL verification nondelegation.");

  actor=await user("director");
  const folder=await folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"create",parentId:null,name:"Shared selected",description:"",icon:"folder"});
  const grantSnapshot=JSON.stringify(await db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}}));
  await folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"share-one",folderId:folder.id,expectedRevision:0});
  await folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"share-two",folderId:folder.id,expectedRevision:0});
  assert.equal(JSON.stringify(await db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}})),grantSnapshot);
  actor=await user("designer2");const browse=await folders.readArchiveFolder(actor,{categoryId:"open",folderId:folder.id});assert.equal(browse.total,1);assert.deepEqual(browse.files.map(f=>f.id),["share-one"]);
  assert.equal((await folders.readArchiveFolder(actor,{categoryId:"open",folderId:folder.id,search:"share-two"})).total,0);
  actor=await user("director");const revoke=await command("share-one","designer2","REVOKE");await denied(()=>service.decideArchiveAccess(actor,{...revoke,reason:" "}));
  const revoked=await service.decideArchiveAccess(actor,revoke);assert.deepEqual(await service.decideArchiveAccess(actor,revoke),revoked);
  assert.equal(JSON.stringify(await db.archiveVerificationDecision.findMany({where:{sourceId:"share-one"}})),beforeReview);assert.equal((await verification.readArchiveVerification(actor,source)).decisionId,review.decisionId);
  actor=await user("designer2");
  assert.ok(!JSON.stringify(await archives.searchArchivesForUser({user:actor,query:"share-one"})).includes("share-one.pdf"));
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-one"));await denied(()=>files.openSharedFileVersion({kind:"manual-archive-file",id:"share-one"},"share-one-version"));await denied(()=>folders.readArchiveFolder(actor,{categoryId:"open",folderId:folder.id}));
  actor=await user("director");const regrant=await command();const race=await Promise.allSettled([service.decideArchiveAccess(actor,regrant),service.decideArchiveAccess(actor,{...regrant,commandId:randomUUID()})]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
  const reRevoke=await command("share-one","designer2","REVOKE");const opposed=await Promise.allSettled([service.decideArchiveAccess(actor,reRevoke),service.decideArchiveAccess(actor,{...regrant,commandId:randomUUID()})]);assert.equal(opposed.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(await db.userArchiveAssetAccess.count({where:{userId:"designer2",manualArchiveFileId:"share-one"}}),0);
  await denied(()=>db.userArchiveAssetAccess.create({data:{userId:"designer2",manualArchiveFileId:"share-one",grantedById:"director"}}));
  await denied(()=>db.archiveAccessDecision.update({where:{id:d.id},data:{reason:"rewrite"}}));await denied(()=>db.archiveAccessDecision.delete({where:{id:d.id}}));await denied(()=>db.$executeRawUnsafe('TRUNCATE "ArchiveAccessDecision" CASCADE'));
  const scoped=await db.archiveGrantScope.findFirstOrThrow();await denied(()=>db.archiveGrantScope.delete({where:{grantId:scoped.grantId}}));await denied(()=>db.userArchiveAssetAccess.update({where:{id:scoped.grantId},data:{userId:"designer"}}));await denied(()=>db.userArchiveAssetAccess.delete({where:{id:scoped.grantId}}));
  for(const table of ["BusinessEvent","EventOutbox"]) {
    const counts=await Promise.all([db.archiveAccessDecision.count(),db.archiveGrantScope.count(),db.userArchiveAssetAccess.count(),db.businessEvent.count(),db.eventOutbox.count()]);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_access_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced access audit failure'; END $$`);await db.$executeRawUnsafe(`CREATE TRIGGER test_access_rollback BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_access_rollback()`);
    const c=await command();await denied(()=>service.decideArchiveAccess(actor,c));assert.deepEqual(await Promise.all([db.archiveAccessDecision.count(),db.archiveGrantScope.count(),db.userArchiveAssetAccess.count(),db.businessEvent.count(),db.eventOutbox.count()]),counts);
    await db.$executeRawUnsafe(`DROP TRIGGER test_access_rollback ON "${table}"`);await db.$executeRawUnsafe('DROP FUNCTION test_access_rollback()');
  }
  const expiry=await command("share-expiry");expiry.expiresAt=new Date(Date.now()+1500).toISOString();await service.decideArchiveAccess(actor,expiry);
  actor=await user("designer2");await archives.getArchivedFileDownloadUrlForUser(actor,"share-expiry");await new Promise(resolve=>setTimeout(resolve,1600));await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-expiry"));
  process.env.FLUX_ARCHIVE_SHARING="0";await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-expiry"));actor=await user("director");await denied(()=>native.getArchiveFileAccess(actor,"share-one"));await denied(()=>native.setArchiveFileAccess(actor,"share-one","designer2",true));process.env.FLUX_ARCHIVE_SHARING="1";
  await service.decideArchiveAccess(actor,await command("share-legacy"));assert.equal((await service.readArchiveAccess(actor,"share-legacy")).grants[0].scope,"LEGACY_NATIVE");
  actor=await user("designer2");assert.equal(await archives.getArchivedFileDownloadUrlForUser(actor,"share-legacy"),"http://fixture.invalid/download");
  // Legacy scopes freeze the native source snapshot, without inventing a version.
  await db.manualArchiveFile.update({where:{id:"share-legacy"},data:{storageKey:"fixture/replaced"}});await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-legacy"));await db.manualArchiveFile.update({where:{id:"share-legacy"},data:{storageKey:"fixture/share-legacy"}});
  actor=await user("director");await service.decideArchiveAccess(actor,await command("share-one","digital"));
  // An untouched native grant retains independent Digital Lead review eligibility.
  await db.userArchiveAssetAccess.create({data:{userId:"digital",manualArchiveFileId:"share-old",grantedById:"director"}});
  const nativeBefore=await db.userArchiveAssetAccess.findFirstOrThrow({where:{userId:"digital",manualArchiveFileId:"share-old"}});assert.equal((await service.readArchiveAccess(actor,"share-old")).grants.find(g=>g.id==="digital")!.scope,"NATIVE");
  actor=await user("digital");assert.equal((await verification.readArchiveVerification(actor,{...source,sourceId:"share-old"})).canVerify,true);
  await verification.decideArchiveVerification(actor,{...verify,sourceId:"share-old",versionId:"share-old-version",commandId:randomUUID()});
  actor=await user("director");await service.decideArchiveAccess(actor,await command("share-old","digital","REVOKE"));assert.equal(await db.userArchiveAssetAccess.count({where:{id:nativeBefore.id}}),0);
  actor=await user("digital");await denied(()=>verification.readArchiveVerification(actor,{...source,sourceId:"share-old"}));
  await denied(()=>verification.decideArchiveVerification(actor,{...verify,sourceId:"share-old",versionId:"share-old-version",commandId:randomUUID()}));
  console.log("PASS native semantics retained; explicit legacy integrity; immutable history/scopes, expiry and flag-off enforcement, revocation, concurrent CAS/replay, outbox rollback, movement and restricted folder counts/breadcrumbs; review history unchanged.");

  actor=await user("director");const endpoint="http://localhost/api/archives/access";const next=await command();
  assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"https://evil.invalid","content-type":"application/json"},body:JSON.stringify(next)}))).status,403);
  assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(next)}))).status,200);
  actor=await user("designer2");assert.equal((await route.GET(new Request(endpoint+"?fileId=share-one"))).status,403);
  const session=await db.session.findFirstOrThrow({where:{userId:"designer2"}});await db.session.update({where:{id:session.id},data:{expiresAt:new Date(Date.now()-1000)}});await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-one"));await db.session.update({where:{id:session.id},data:{expiresAt:session.expiresAt}});
  actor=await user("director");await db.archiveCategoryAccess.create({data:{archiveCategoryId:"open",userId:"director"}});assert.equal((await service.readArchiveAccess(actor,"share-one")).grants.every(g=>!g.effective),true);actor=await user("designer2");await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-one"));await db.archiveCategoryAccess.deleteMany({where:{archiveCategoryId:"open"}});
  actor=await user("director");const historyCount=await db.archiveAccessDecision.count();process.env.FLUX_ARCHIVE_SHARING="0";
  await archives.deleteArchivedFileForUser(actor,"share-one");await archives.deleteArchivedFileForUser(actor,"share-native");await archives.deleteArchivedFileForUser(actor,"share-legacy");
  assert.equal(await db.archiveAccessDecision.count(),historyCount);assert.equal(await db.archiveVerificationDecision.count({where:{sourceId:"share-one"}}),1);assert.equal(await db.archiveGrantScope.count({where:{decision:{sourceId:{in:["share-one","share-native","share-legacy"]}}}}),0);
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"share-one"));await denied(()=>files.getSharedFileIdentity({kind:"manual-archive-file",id:"share-one"}));
  await denied(()=>db.manualArchiveFile.create({data:{id:"share-legacy",archiveCategoryId:"open",fileName:"reused.pdf",originalFileName:"reused.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/reused",status:"READY",uploadedById:"director"}}));
  const worker=dispatcher.createInternalDispatcher(db,async(_tx,event)=>{assert.ok(["ARCHIVE_ACCESS_DECIDED","ARCHIVE_VERIFICATION_DECIDED"].includes(event.type));assert.ok(!JSON.stringify(event).includes("no longer required"));});let delivered=0;for(;;){const c=await worker.claim();if(!c)break;assert.equal(await worker.deliver(c),"DELIVERED");assert.equal(await worker.deliver(c),"STALE");delivered++;}
  assert.ok(delivered>=10);console.log(`PASS protected HTTP commands, current sessions/category restrictions, flag-off Director deletion retains audit and review history, ${delivered} audit deliveries with deduplication; ${denials} expected denials, no unexpected errors.`);
}

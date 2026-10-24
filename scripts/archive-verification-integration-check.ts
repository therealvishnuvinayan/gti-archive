import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { VerificationCommand } from "../src/lib/archive-verification/contracts";

type User = NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>;
export async function runVerificationChecks(h: { db: PrismaClient; user: (id: string) => Promise<User>; require: NodeRequire; compiledRoot: string; setStorageMode: (value: string) => void }) {
  const { db, user } = h;
  const service = h.require(join(h.compiledRoot, "src/lib/archive-verification/service.js")) as typeof import("../src/lib/archive-verification/service");
  const folders = h.require(join(h.compiledRoot, "src/lib/archive-folders/service.js")) as typeof import("../src/lib/archive-folders/service");
  const archives = h.require(join(h.compiledRoot, "src/lib/archives.js")) as typeof import("../src/lib/archives");
  const route = h.require(join(h.compiledRoot, "src/app/api/archives/verification/route.js")) as typeof import("../src/app/api/archives/verification/route");
  const dispatcher = h.require(join(h.compiledRoot, "src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  const source = { sourceKind: "manual" as const, sourceId: "manual", categoryId: "open" };
  const project = { sourceKind: "project" as const, sourceId: "archived", categoryId: "open" };
  let denials = 0;
  async function denied(fn: () => Promise<unknown>) {
    await assert.rejects(fn, e => { if (e instanceof TypeError || e instanceof ReferenceError || e instanceof assert.AssertionError) throw e; denials++; return true; });
  }
  let actor = await user("director");
  await denied(() => service.readArchiveVerification(actor, source));
  process.env.FLUX_ARCHIVE_VERIFICATION = "1";
  const command = async (target = source, action: "VERIFY" | "REVOKE" = "VERIFY"): Promise<VerificationCommand> => {
    const view = await service.readArchiveVerification(actor, target);
    return { ...target, action, versionId: view.versionId!, expectedRevision: view.revision, expectedDecisionId: view.decisionId, commandId: randomUUID(), confirmed: true, reason: "Reviewed the exact synthetic file." };
  };
  const bits = async () => JSON.stringify(await Promise.all([db.manualArchiveFile.findMany({orderBy:{id:"asc"}}),db.archivedProjectFile.findMany({orderBy:{id:"asc"}}),db.sharedFileVersion.findMany({orderBy:{id:"asc"}}),db.sharedFileReference.findMany({orderBy:{id:"asc"}}),db.sharedFileProvenance.findMany({orderBy:{id:"asc"}}),db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}}),db.userAuthorization.findMany({orderBy:{userId:"asc"}})]));
  const before = await bits();
  assert.equal((await service.readArchiveVerification(actor, source)).status, "NOT VERIFIED");
  assert.equal((await service.readArchiveVerification(actor, {...source,sourceId:"ungranted"})).status,"UNAVAILABLE");
  await archives.getArchivedFileDownloadUrlForUser(actor,"ungranted");
  await db.projectAttachment.update({where:{id:"source"},data:{submissionReviewStatus:"REJECTED"}});
  assert.equal((await service.readArchiveVerification(actor,project)).status,"UNAVAILABLE");
  await db.projectAttachment.update({where:{id:"source"},data:{submissionReviewStatus:null}});
  const verify = await command();
  for (const patch of [{versionId:"forged"},{sourceKind:"project"},{categoryId:"restricted"},{sourceId:"ungranted"},{confirmed:false},{reason:"  "},{expectedRevision:3}]) await denied(()=>service.decideArchiveVerification(actor,{...verify,...patch}));
  for (const mode of ["missing","changed"]) { h.setStorageMode(mode); await denied(()=>service.decideArchiveVerification(actor,verify)); assert.equal((await service.readArchiveVerification(actor,source)).status,"UNAVAILABLE"); }
  h.setStorageMode("ok");
  const saved = await service.decideArchiveVerification(actor,verify);
  assert.deepEqual(await service.decideArchiveVerification(actor,verify),saved);
  assert.equal(await db.archiveVerificationDecision.count(),1);
  let view = await service.readArchiveVerification(actor,source); assert.equal(view.status,"VERIFIED"); assert.equal(view.history[0].reviewer,"director");
  const row = await db.archiveVerificationDecision.findUniqueOrThrow({where:{id:saved.decisionId}});
  assert.equal(row.versionId,"manual-version");assert.equal(row.actorRole,"DIRECTOR");assert.equal(row.actorVersion,1);assert.equal(row.referenceId,"source-manual-version");
  assert.equal((row.storageEvidence as {checksumEvidence:string}).checksumEvidence,"UNKNOWN");
  assert.equal(await db.businessEvent.count({where:{id:row.eventId,fileVersionId:row.versionId}}),1);assert.equal(await db.eventOutbox.count({where:{eventId:row.eventId}}),1);
  await denied(()=>service.decideArchiveVerification(actor,{...verify,reason:"Changed replay"}));
  await denied(()=>service.decideArchiveVerification(actor,{...verify,commandId:randomUUID()}));
  for (const id of ["spm","designer","jpm","tech","unassigned","designer2"]) {
    actor=await user(id);
    await denied(()=>service.decideArchiveVerification(actor,verify));
    await denied(()=>service.decideArchiveVerification(actor,{...verify,action:"REVOKE",expectedRevision:saved.revision,expectedDecisionId:saved.decisionId}));
    if (["jpm","tech","unassigned","designer2"].includes(id)) await denied(()=>service.readArchiveVerification(actor,source));
    if(id==="designer") {const redacted=await service.readArchiveVerification(actor,source);assert.equal(redacted.history.length,0);assert.equal(redacted.canVerify,false);assert.equal(redacted.canRevoke,false);}
  }
  actor=await user("digital");
  for (const sourceId of ["ungranted","restricted-file"]) await denied(()=>service.decideArchiveVerification(actor,{...verify,sourceId}));
  await denied(()=>service.decideArchiveVerification(actor,{...verify,action:"REVOKE",expectedRevision:saved.revision,expectedDecisionId:saved.decisionId}));
  const nativeView=await service.readArchiveVerification(actor,project);
  const nativeCommand={...verify,...project,commandId:randomUUID(),versionId:nativeView.versionId!,expectedRevision:0,expectedDecisionId:null};
  await service.decideArchiveVerification(actor,nativeCommand);
  assert.equal((await db.archiveVerificationDecision.findFirstOrThrow({where:{sourceKind:"project"}})).actorId,"digital");
  await denied(()=>archives.deleteArchivedFileForUser(actor,"manual"));
  actor=await user("director");
  console.log("PASS exact manual/native versions, real current Director/Digital Lead, scoped grants, all denied roles, legacy download/unavailable, binding attacks and missing/changed storage.");

  const revoke=await command(source,"REVOKE");
  const revoked=await service.decideArchiveVerification(actor,revoke);
  assert.deepEqual(await service.decideArchiveVerification(actor,revoke),revoked);
  view=await service.readArchiveVerification(actor,source);assert.equal(view.status,"REVOKED");assert.equal(view.history.length,2);assert.equal(view.history[1].reason,verify.reason);
  await denied(()=>service.decideArchiveVerification(actor,{...revoke,commandId:randomUUID()}));
  assert.equal((await service.readArchiveVerification(actor,source,2)).history[0].id,saved.decisionId);
  assert.equal((await service.readArchiveVerification(actor,source,1)).history.length,0);
  await denied(()=>service.readArchiveVerification(actor,source,-1));
  const reverify=await command();
  const race=await Promise.allSettled([service.decideArchiveVerification(actor,reverify),service.decideArchiveVerification(actor,{...reverify,commandId:randomUUID()})]);
  assert.equal(race.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db.archiveVerificationDecision.count({where:{sourceId:"manual"}}),3);
  const latest=await db.archiveVerificationDecision.findFirstOrThrow({where:{sourceId:"manual"},orderBy:{sequence:"desc"}});
  assert.equal(latest.action,"VERIFY");
  // Conflicting revoke and stale verify cannot resurrect the reviewed state.
  const revokeAgain=await command(source,"REVOKE");
  const opposed=await Promise.allSettled([service.decideArchiveVerification(actor,revokeAgain),service.decideArchiveVerification(actor,{...reverify,commandId:randomUUID()})]);
  assert.equal(opposed.filter(r=>r.status==="fulfilled").length,1);assert.equal((await service.readArchiveVerification(actor,source)).status,"REVOKED");
  await denied(()=>db.archiveVerificationDecision.update({where:{id:row.id},data:{reason:"rewrite"}}));
  await denied(()=>db.archiveVerificationDecision.delete({where:{id:row.id}}));
  await denied(()=>db.$executeRawUnsafe('TRUNCATE "ArchiveVerificationDecision" CASCADE'));
  const direct={...row,storageEvidence:row.storageEvidence as Prisma.InputJsonValue,id:randomUUID(),eventId:"fake",commandId:randomUUID()};await denied(()=>db.archiveVerificationDecision.create({data:direct}));
  const next=await command();
  // Each failure must roll back decision AND event AND outbox.
  for(const table of ["BusinessEvent","EventOutbox"]) {
    const counts=await Promise.all([db.archiveVerificationDecision.count(),db.businessEvent.count(),db.eventOutbox.count()]);
    await db.$executeRawUnsafe(`CREATE FUNCTION test_review_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER test_review_rollback BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_review_rollback()`);
    await denied(()=>service.decideArchiveVerification(actor,next));
    assert.deepEqual(await Promise.all([db.archiveVerificationDecision.count(),db.businessEvent.count(),db.eventOutbox.count()]),counts);
    await db.$executeRawUnsafe(`DROP TRIGGER test_review_rollback ON "${table}"`);await db.$executeRawUnsafe('DROP FUNCTION test_review_rollback()');
  }
  await service.decideArchiveVerification(actor,next);
  const placement=await db.archiveFilePlacement.findUniqueOrThrow({where:{id:"manual:manual"}});
  await folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"manual",fileId:"manual",expectedRevision:placement.revision,folderId:null});
  const folder=await db.archiveFolder.findFirstOrThrow({where:{name:"Campaigns"}});
  await folders.organizeArchive(actor,{commandId:randomUUID(),categoryId:"open",action:"rename",folderId:folder.id,expectedRevision:folder.revision,name:"Campaigns renamed",description:folder.description,icon:folder.icon});
  assert.equal((await service.readArchiveVerification(actor,source)).status,"VERIFIED");assert.equal(await bits(),before);
  console.log("PASS immutable revoke/reverify chain, actor-scoped replay, concurrent CAS, stale/double commands, event/outbox rollback, folder movement and all original source/version/provenance/user/grant rows preserved.");

  // A genuine second upload/version gets its own pinned native reference.
  await db.manualArchiveFile.create({data:{id:"manual-v2",archiveCategoryId:"open",fileName:"manual.pdf",originalFileName:"manual.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/manual-v2",status:"READY",uploadedById:"director"}});
  await db.sharedFileVersion.create({data:{id:"manual-version-2",fileId:"identity-manual-version",number:2,uploadedById:"director",originalFileName:"manual.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"fixture/manual-v2"}});
  await db.sharedFileReference.create({data:{id:"manual-reference-2",versionId:"manual-version-2",role:"SOURCE",manualArchiveFileId:"manual-v2"}});
  await db.sharedFileVersion.update({where:{id:"manual-version-2"},data:{status:"READY",objectETag:'"v2-etag"',objectVersionId:"exact-v2",observedAt:new Date(),finalizedAt:new Date()}});
  const versionTwo = await db.sharedFileVersion.findUniqueOrThrow({where:{id:"manual-version-2"}});
  for (const [id,role] of [["spm","SENIOR_PROJECT_MANAGER"],["digital","DIGITAL_LEAD"],["designer","DESIGNER"],["tech","DIRECTOR"]]) {
    const session = await db.session.findFirstOrThrow({where:{userId:id}}), decisionId=randomUUID();
    await denied(()=>db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('flux.archive_review_actor',${id},true),set_config('flux.archive_review_session',${session.id},true),set_config('flux.archive_review_confirmed','true',true)`;
      await tx.archiveVerificationDecision.create({data:{id:decisionId,referenceId:"manual-reference-2",versionId:versionTwo.id,sourceKind:"manual",sourceId:"manual-v2",categoryId:"open",action:"VERIFY",sequence:1,actorId:id,actorRole:role,actorVersion:1,sessionId:session.id,reason:"Raw SQL boundary attack",commandId:randomUUID(),commandHash:"a".repeat(64),eventId:`archive-review:${decisionId}`,storageEvidence:{bucket:versionTwo.bucket,storageKey:versionTwo.storageKey,objectVersionId:versionTwo.objectVersionId,objectETag:versionTwo.objectETag,checksumSha256:null,checksumEvidence:"UNKNOWN",fileSize:100,mimeType:"application/pdf",observedAt:new Date().toISOString()}}});
    },{isolationLevel:"Serializable"}));
  }
  assert.equal((await service.readArchiveVerification(actor,{...source,sourceId:"manual-v2"})).status,"NOT VERIFIED");
  assert.equal((await service.readArchiveVerification(actor,source)).status,"VERIFIED");
  for(const foldersOn of [false,true]) {
    process.env.FLUX_ARCHIVE_FOLDERS=foldersOn?"1":"0";
    assert.equal((await service.readArchiveVerification(actor,source)).status,"VERIFIED");
    process.env.FLUX_ARCHIVE_VERIFICATION="0";await denied(()=>service.readArchiveVerification(actor,source));
    await archives.getArchivedFileDownloadUrlForUser(actor,"manual");
    process.env.FLUX_ARCHIVE_VERIFICATION="1";
  }
  const endpoint="http://localhost/api/archives/verification";
  const get=()=>new Request(`${endpoint}?sourceKind=manual&sourceId=manual&categoryId=open`);
  actor=await user("designer2");assert.equal((await route.GET(get())).status,403);
  actor=await user("designer");const privateView=await (await route.GET(get())).json();assert.deepEqual(privateView.history,[]);assert.ok(!JSON.stringify(privateView).includes("fixture/manual"));
  actor=await user("director");assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"https://evil.invalid","content-type":"application/json"},body:JSON.stringify(next)}))).status,403);
  assert.equal((await route.POST(new Request(endpoint,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(next)}))).status,200);
  const worker=dispatcher.createInternalDispatcher(db,async(_tx,event)=>{assert.equal(event.type,"ARCHIVE_VERIFICATION_DECIDED");assert.ok(!JSON.stringify(event).includes("Reviewed the exact"));});
  let delivered=0;for(;;){const claim=await worker.claim();if(!claim)break;assert.equal(await worker.deliver(claim),"DELIVERED");assert.equal(await worker.deliver(claim),"STALE");delivered++;}assert.ok(delivered>=6);
  const historyCount=await db.archiveVerificationDecision.count(),versionCount=await db.sharedFileVersion.count();
  // Retention is migration-based, independent of either UI flag.
  process.env.FLUX_ARCHIVE_VERIFICATION="0";process.env.FLUX_ARCHIVE_FOLDERS="0";
  await archives.deleteArchivedFileForUser(actor,"manual");await archives.deleteArchivedFileForUser(actor,"archived");
  assert.equal(await db.manualArchiveFile.count({where:{id:"manual"}}),0);assert.equal(await db.archivedProjectFile.count({where:{id:"archived"}}),0);
  assert.equal(await db.archiveVerificationDecision.count(),historyCount);assert.equal(await db.sharedFileVersion.count(),versionCount);assert.equal(await db.retainedArchiveSource.count(),2);
  assert.equal((await db.sharedFileReference.findUniqueOrThrow({where:{id:"source-manual-version"}})).manualArchiveFileId,null);
  assert.equal((await db.retainedArchiveSource.findUniqueOrThrow({where:{id:"source-manual-version"}})).manualSourceId,"manual");
  await denied(()=>db.retainedArchiveSource.deleteMany());await denied(()=>db.sharedFileReference.delete({where:{id:"source-manual-version"}}));
  await denied(()=>archives.getArchivedFileDownloadUrlForUser(actor,"manual"));
  process.env.FLUX_ARCHIVE_VERIFICATION="1";await denied(()=>service.readArchiveVerification(actor,source));
  console.log(`PASS new version noninheritance; independent feature combinations; API privacy/origin; ${delivered} audit deliveries with replay; existing Director deletion retains typed tombstones, decisions, versions and references. ${denials} expected denials; no unexpected errors.`);
}

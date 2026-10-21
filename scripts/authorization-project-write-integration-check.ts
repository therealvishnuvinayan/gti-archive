import type { BusinessRole, PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { projectTransactionClient } from "../src/lib/authorization/project-transaction";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "../src/lib/project-workflow";
import { allPermissionKeys } from "../src/lib/permissions/definitions";

const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-isolated-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_authorization_project_write_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"]];
const tokens = new Map<string,string>();
async function as(id:string) { token = tokens.get(id)!; }


async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_authorization_project_write_test"});
 assert.equal(await db.user.count(),0);
 for(const [id] of roles) await db.user.create({data:{id,email:`${id}@example.invalid`,passwordHash:"synthetic-unusable-hash",name:id,role:id==="director"?"USER":id==="tech"?"SUPER_ADMIN":"ADMIN"}});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated project read fixtures',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
  for(const [userId,businessRole] of roles.filter(([id])=>id!=="unassigned")) await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:userId==="tech"?["TECHNICAL_ADMIN"]:[],accountStatus:"ACTIVE",authorizationVersion:1}});
 });
 for(const [id] of roles){const t=createVersionedSessionToken(id==="unassigned"?null:1); await db.session.create({data:{userId:id,token:t,expiresAt:new Date(Date.now()+3600000)}});tokens.set(id,t);}
 for(const id of ["owned","executor","unrelated"]){await db.project.create({data:{id,name:id,description:`${id} brief`,budget:999999,ownerId:id==="owned"?"spm":"outsider",createdById:"outsider",endDate:new Date("2027-01-01")}});}
 await db.projectCoOwner.create({data:{projectId:"owned",userId:"jpm"}});
 await db.project.create({data:{id:"restricted-owner",name:"restricted owner",ownerId:"designer",createdById:"outsider",budget:77777}});
 await db.projectCoOwner.create({data:{projectId:"restricted-owner",userId:"digital"}});
 for(const projectId of ["owned","executor","unrelated","restricted-owner"]) await db.projectWorkflowStage.createMany({data:PROJECT_WORKFLOW_STAGE_DEFINITIONS.map(stage=>({projectId,stageKey:stage.key,status:stage.number===1?"AVAILABLE":"LOCKED"}))});
 for(const userId of ["designer","digital","spm"]) await db.projectExecutor.create({data:{projectId:"executor",userId}});
 for(const userId of ["designer","digital"]){await db.projectStage.create({data:{id:`task-${userId}`,projectId:"executor",name:`${userId} task`,description:`${userId} task brief`,isTasker:true,order:1,budget:44444}});await db.projectConceptFolder.create({data:{id:`concept-${userId}`,projectId:"executor",taskerStageId:`task-${userId}`,name:`${userId} folder`,normalizedName:userId,assignedExecutorId:userId,assignedById:"outsider"}});}
 await db.projectStage.create({data:{id:"management-stage",projectId:"owned",name:"private stage",order:2}});
 await db.projectPrivateFolder.create({data:{id:"private",projectId:"executor",ownerUserId:"digital"}});
 await db.projectResearchWorkspace.create({data:{id:"research",projectId:"executor",ownerUserId:"outsider"}});
 for(const [id,systemKey] of [["brief","BRIEF"],["confidential",null]] as const)await db.projectResearchFolder.create({data:{id,workspaceId:"research",name:id,normalizedName:id,systemKey}});
 const fileBase={projectId:"executor",uploadedById:"outsider",fileName:"file",originalFileName:"file.pdf",mimeType:"application/pdf",fileSize:1,bucket:"fixture-no-network",status:"READY" as const};
 for(const id of ["designer","digital"])await db.projectAttachment.create({data:{...fileBase,id:`file-${id}`,storageKey:`fixture/${id}`,stageId:`task-${id}`,assetType:id==="designer"?"REVISION_ORIGINAL":"STAGE_SUBMISSION"}});
 await db.projectAttachment.create({data:{...fileBase,id:"private-file",storageKey:"fixture/private",privateFolderId:"private",assetType:"PROJECT_PRIVATE_FILE"}});
 await db.projectAttachment.create({data:{...fileBase,id:"cross-project-file",projectId:"owned",stageId:"task-designer",storageKey:"fixture/cross",assetType:"STAGE_SUBMISSION"}});
 await db.projectAttachment.create({data:{...fileBase,id:"orphan-private",storageKey:"fixture/orphan",assetType:"PROJECT_PRIVATE_FILE"}});
 for(const id of ["flex-owned","flex-assigned","flex-unrelated"])await db.flexibleProject.create({data:{id,slug:id,name:id,description:`${id} brief`,ownerId:id==="flex-owned"?"spm":"outsider",createdById:"outsider"}});
 await db.flexibleProjectCollaborator.create({data:{projectId:"flex-owned",userId:"jpm"}});
 for(const responsibleUserId of ["designer","digital","spm"])await db.flexibleMilestone.create({data:{id:`milestone-${responsibleUserId}`,projectId:"flex-assigned",name:responsibleUserId,responsibleUserId,sortOrder:["designer","digital","spm"].indexOf(responsibleUserId)+1}});
 await db.flexibleProjectAttachment.create({data:{...fileBase,projectId:"flex-assigned",id:"flex-file",milestoneId:"milestone-designer",storageKey:"fixture/flexible"}});
 for(const [id,type,createdById] of [["business-calendar","PROJECTS","outsider"],["personal-calendar","EVENTS","outsider"],["own-calendar","REMINDERS","designer"]] as const) await db.calendarEvent.create({data:{id,title:id,type,createdById,startAt:new Date("2027-01-01"),endAt:new Date("2027-01-02"),tone:"GREEN"}});
 for(const userId of ["director","spm","designer","tech"])for(const projectId of ["owned","executor","unrelated"])await db.notification.create({data:{userId,projectId,type:"PROJECT_UPDATED",title:`${projectId} confidential`,message:"Budget secret"}});
}

async function main(){
 await seed();
 const moduleApi=localRequire("node:module") as {_load:(name:string,...args:unknown[])=>unknown};
 const original=moduleApi._load, compiledRoot=dirname(dirname(__filename));
 let realtimeTokenAttempts = 0;
 moduleApi._load=function(name,...args){
  if(name==="@prisma/client")return localRequire(join(root,"client"));
  // This authorization suite uses plain synthetic strings; rich-text rendering
  // is not under test (the local sanitizer transitive dependency is unavailable).
  if(name==="@/lib/rich-text")return {sanitizeRichText:(value:string|null)=>value??"",richTextToPlainText:(value:string|null)=>value??"",isRichTextEmpty:(value:string|null)=>!value};
  if(name==="@/lib/realtime/server")return new Proxy({}, {get:(_target,key)=> {
    if (key === "getRealtimeProvider") return () => "ably";
    if (key === "isStageChatRealtimeConfigured") return () => true;
    if (key === "getProjectAccessChannelName" || key === "getStageChatChannelName") return () => "fixture-channel";
    if (String(key).startsWith("create") && String(key).includes("Token")) return () => { realtimeTokenAttempts += 1; throw new Error("EXTERNAL_TOKEN_ISSUANCE_FORBIDDEN"); };
    return async () => false;
  }});
  if(name==="next/headers")return{cookies:async()=>({get:()=>token?{value:token}:undefined})};
  if(name==="next/cache")return{unstable_cache:(fn:unknown)=>fn,revalidatePath:()=>{},revalidateTag:()=>{}};
  if(name==="next/navigation")return{redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}};
  if(name==="next/server")return{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)},after:(fn:unknown)=>{void fn;}};
  if(name==="react")return{cache:(fn:unknown)=>fn};
  if(name==="@/lib/prisma"||name==="../prisma"||name==="./prisma")return{prisma:projectTransactionClient(db),withPrismaRetry:(fn:()=>unknown)=>fn()};
  if(name==="@/lib/permissions/profiles")return{getPermissionProfileSnapshotForUser:async()=>({effectivePermissions:new Set(allPermissionKeys),rolePermissions:new Set(allPermissionKeys),archiveAccessGranted:true,archiveAccessLevel:"FULL"})};
  if(name==="@/lib/s3"||name==="@/lib/storage/s3")return new Proxy({}, {get:(_t,key)=>key==="getFileExtension" ? localRequire(join(compiledRoot,"src/lib/upload-validation.js")).getFileExtension : key==="createPresignedDownloadUrl"||key==="createPresignedPreviewUrl"?async()=>{return "fixture-signed-url";}:()=>{throw new Error(`S3_OBJECT_ACCESS_FORBIDDEN:${String(key)}`);}});
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try {
  const auth = localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const creation = localRequire(join(compiledRoot,"src/lib/project-creation.js")) as typeof import("../src/lib/project-creation");
  const management = localRequire(join(compiledRoot,"src/lib/project-management.js")) as typeof import("../src/lib/project-management");
  const history = localRequire(join(compiledRoot,"src/lib/project-history.js")) as typeof import("../src/lib/project-history");
  const concepts = localRequire(join(compiledRoot,"src/lib/project-concepts.js")) as typeof import("../src/lib/project-concepts");
  const flexible = localRequire(join(compiledRoot,"src/lib/flexible-projects.js")) as typeof import("../src/lib/flexible-projects");
  const five = localRequire(join(compiledRoot,"src/lib/stage-five.js")) as typeof import("../src/lib/stage-five");
  const six = localRequire(join(compiledRoot,"src/lib/stage-six.js")) as typeof import("../src/lib/stage-six");
  const seven = localRequire(join(compiledRoot,"src/lib/stage-seven.js")) as typeof import("../src/lib/stage-seven");
  const privateFiles = localRequire(join(compiledRoot,"src/lib/project-private-folders.js")) as typeof import("../src/lib/project-private-folders");
  const reopening = localRequire(join(compiledRoot,"src/lib/project-stage-skip-revocation.js")) as typeof import("../src/lib/project-stage-skip-revocation");
  const writes = localRequire(join(compiledRoot,"src/lib/authorization/project-write.js")) as typeof import("../src/lib/authorization/project-write");
  const runtime = localRequire(join(compiledRoot,"src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  const projects = localRequire(join(compiledRoot,"src/lib/projects.js")) as typeof import("../src/lib/projects");
  const actions = localRequire(join(compiledRoot,"src/app/(dashboard)/projects/new/v2-actions.js")) as typeof import("../src/app/(dashboard)/projects/new/v2-actions");
  const uploadRoute = localRequire(join(compiledRoot,"src/app/api/project-assets/upload-url/route.js")) as typeof import("../src/app/api/project-assets/upload-url/route");
  const drafts = localRequire(join(compiledRoot,"src/lib/project-form-drafts.js")) as typeof import("../src/lib/project-form-drafts");
  async function user(id:string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn:()=>Promise<unknown>) {
   try { const result=await fn(); assert.ok(result && typeof result==="object" && "error" in result,`Expected denial, got ${JSON.stringify(result)}`); }
   catch(error){ if(error instanceof assert.AssertionError)throw error; }
  }
  const conceptAccess = localRequire(join(compiledRoot,"src/lib/project-concept-access.js")) as typeof import("../src/lib/project-concept-access");
  // Real authenticated objects carry a server-bound V2 principal. Give every
  // fixture legacy permissions (above) so these tests catch an admin bypass.
  const relationships = { ownerId: "spm", coOwners: [{ userId: "jpm" }] };
  const conceptContext = { folderId: "concept-designer", projectId: "executor", taskerStageId: "task-designer",
    workflowStageKey: "CONCEPT_CREATION" as const, ownerId: "spm", coOwnerIds: ["jpm"], assignedExecutorId: "designer" };
  for (const [id] of roles) {
    const actor = await user(id), manages = ["director", "spm", "jpm"].includes(id);
    assert.equal(five.canManageStageFive(actor, relationships as Parameters<typeof five.canManageStageFive>[1]), manages, `Stage 5 management: ${id}`);
    assert.equal(six.canManageStageSix(actor, relationships as Parameters<typeof six.canManageStageSix>[1]), manages, `Stage 6 management: ${id}`);
    assert.equal(seven.canManageStageSeven(actor, relationships as Parameters<typeof seven.canManageStageSeven>[1]), manages, `Stage 7 management: ${id}`);
    assert.equal(conceptAccess.canManageProjectConcept(actor, conceptContext), manages, `Concept management: ${id}`);
    assert.equal(conceptAccess.canCompleteProjectConceptStage(actor, conceptContext), manages, `Concept completion: ${id}`);
    assert.equal(conceptAccess.canReviewProjectConcept(actor, conceptContext), manages, `Concept review: ${id}`);
    assert.equal(conceptAccess.canWorkOnProjectConcept(actor, conceptContext), ["director", "designer"].includes(id), `Concept execution: ${id}`);
    assert.equal(conceptAccess.canViewProjectConcept(actor, conceptContext), manages || id === "designer", `Concept visibility: ${id}`);
    assert.equal(conceptAccess.canReviewProjectConcept(actor, { ...conceptContext, assignedExecutorId: id }), false, `No self-review: ${id}`);
    if (id === "tech") {
      const assigned = { ...conceptContext, ownerId: id, coOwnerIds: [id], assignedExecutorId: id };
      assert.equal(conceptAccess.canManageProjectConcept(actor, assigned), false);
      assert.equal(conceptAccess.canWorkOnProjectConcept(actor, assigned), false);
      assert.equal(conceptAccess.canViewProjectConcept(actor, assigned), false);
    }
  }
  const forged = { id: "director", role: "SUPER_ADMIN" as const };
  assert.equal(six.canManageStageSix(forged, relationships as Parameters<typeof six.canManageStageSix>[1]), false);
  assert.equal(conceptAccess.canManageProjectConcept(forged, conceptContext), false);
  console.log("PASS write: V2 native management matrix; Director global, SPM owner/JPM co-owner, unrelated/restricted/technical/forged denial, assigned execution and no self-review.");
  for (const id of ["designer", "digital", "tech", "spm"]) {
    const actor = await user(id);
    await assert.rejects(concepts.getProjectConceptFolders(actor, "executor", "CONCEPT_CREATION"), /PROJECT_READ_DENIED/);
    await assert.rejects(seven.getStageSevenWorkspaceData(actor, "executor"), /PROJECT_READ_DENIED/);
  }
  for (const id of ["director", "outsider"]) {
    const actor = await user(id);
    const listing = await concepts.getProjectConceptFolders(actor, "executor", "CONCEPT_CREATION", { executorId: "designer" });
    assert.ok(listing?.canManage);
    assert.equal(listing.folders.length, 1);
    assert.equal(listing.folders[0].id, "concept-designer");
    assert.equal(listing.selectedExecutorId, "designer");
    assert.equal((await seven.getStageSevenWorkspaceData(actor, "executor"))?.canManage, true);
  }
  console.log("PASS write: V2 concept full-list read denial for restricted/technical/non-manager executors; Director and owner filters preserve scoped results.");
  const realtimeRoute = localRequire(join(compiledRoot,"src/app/api/realtime/ably/token/route.js")) as typeof import("../src/app/api/realtime/ably/token/route");
  for (const [id] of roles) {
    await user(id);
    for (const query of ["projectId=executor&stageId=task-designer", "projectId=executor&scope=project-access"]) {
      const response = await realtimeRoute.GET(new Request(`http://localhost/api/realtime/ably/token?${query}`));
      assert.equal(response.status, 403, `Persistent project subscription: ${id}`);
      assert.deepEqual(await response.json(), { error: "Project live updates are unavailable." });
    }
  }
  token = null;
  assert.equal((await realtimeRoute.GET(new Request("http://localhost/api/realtime/ably/token?projectId=executor&stageId=task-designer"))).status, 401);
  assert.equal(realtimeTokenAttempts, 0);
  console.log("PASS write: V2 configured project realtime routes deny all roles and signed-out requests without issuing provider tokens; Stage 7 full reads require management scope.");
  const editInput={tags:["Fixture"],name:"Edited project",ownerId:"spm",coOwnerIds:["jpm"],executorIds:[],collaboratorIds:[]};
  for(const id of ["director","spm","jpm"]) {
   const actor=await user(id); const result=await creation.updateProjectV2(actor,"owned",{...editInput,name:`Edited by ${id}`}); assert.ok("projectId" in result,JSON.stringify(result));
  }
  const owned=await db.project.findUniqueOrThrow({where:{id:"owned"}});
  assert.equal(owned.ownerId,"spm"); assert.equal(owned.createdById,"outsider");
  assert.equal(await db.projectCoOwner.count({where:{projectId:"owned",userId:"director"}}),0);
  for(const id of ["designer","digital","tech","unassigned","outsider"]) {
   const actor=await user(id); await denied(()=>creation.updateProjectV2(actor,"owned",editInput));
   await denied(()=>management.toggleProjectPin(actor,"owned"));
  }
  for(const id of ["director","spm","jpm","designer","digital","tech"]) {
   const actor=await user(id); await denied(()=>creation.createProjectV2(actor,editInput));
   await denied(()=>flexible.createFlexibleProject(actor,{name:"Unapproved",ownerId:actor.id,collaboratorIds:[],priority:"MEDIUM",scope:"INTERNAL"}));
   await denied(()=>management.deleteProject(actor,"owned"));
  }
  const spm=await user("spm");
  await denied(()=>creation.updateProjectV2(spm,"unrelated",{...editInput,ownerId:"outsider"}));
  await denied(()=>creation.updateProjectV2(spm,"owned",{...editInput,ownerId:"director"}));
  await denied(()=>creation.updateProjectV2(spm,"owned",{...editInput,coOwnerIds:["tech"]}));
  await denied(()=>creation.updateProjectV2(spm,"owned",{...editInput,executorIds:["tech"]}));
  await denied(()=>creation.updateProjectV2(spm,"owned",{...editInput,collaboratorIds:["designer"]}));
  const designer=await user("designer");
  await denied(()=>creation.updateProjectV2(Object.assign({},designer,{id:"director",role:"SUPER_ADMIN"}),"owned",editInput));
  await denied(()=>creation.updateProjectV2(Object.assign({},designer,{role:"SUPER_ADMIN"}),"owned",editInput));
  assert.equal((await runtime.runtimeAuthorization.authorize({capability:"project.edit",targetId:"unknown/structured:owned"})).decision,"DENY");
  assert.equal((await runtime.runtimeAuthorization.authorize({capability:"project.edit",targetId:"updateProjectV2/structured:owned",actor:{id:"director"}})).decision,"DENY");
  await denied(()=>actions.updateProjectV2Action("owned",editInput));
  const attachmentCount=await db.projectAttachment.count();
  await denied(()=>uploadRoute.POST(new Request("http://fixture.invalid/api/project-assets/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId:"owned",stageId:"task-designer",originalFileName:"forged.pdf",mimeType:"application/pdf",fileSize:1,assetType:"STAGE_SUBMISSION"})})));
  assert.equal(await db.projectAttachment.count(),attachmentCount);
  await user("spm");
  await drafts.saveProjectFormDraft(spm,{projectId:"owned",formKey:"stage-one-project-inquiry",payload:{brief:"Authorized draft"},clientId:"fixture",clientRevision:1});
  await denied(()=>drafts.saveProjectFormDraft(spm,{projectId:"owned",formKey:"stage-seven-sample-request:unknown",payload:{brief:"Locked"},clientId:"fixture",clientRevision:1}));
  assert.equal(await db.projectFormDraft.count({where:{projectId:"owned"}}),1);
  await user("jpm"); await denied(()=>actions.createProjectV2Action(editInput));
  console.log("PASS write: Director global edit, SPM owner/JPM co-owner, relationship denial, restricted/technical denial, creation/delete/transfer blocks, forged actor and direct action denial.");

  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"executor",stageKey:"CONCEPT_CREATION"}},data:{status:"AVAILABLE"}});
  const d=await user("designer");
  const started=await history.startProjectStageWork(d,{projectId:"executor",stageId:"task-designer"}); assert.ok(started);
  assert.equal((await db.projectStage.findUniqueOrThrow({where:{id:"task-designer"}})).startedById,"designer");
  await denied(()=>history.startProjectStageWork(d,{projectId:"executor",stageId:"task-digital"}));
  await denied(()=>history.startProjectStageWork(d,{projectId:"owned",stageId:"task-designer"}));
  await denied(()=>history.completeProjectStage(d,{projectId:"executor",stageId:"task-designer"}));
  assert.equal(await projects.getProjectById("executor",d),null);
  const director=await user("director");
  const task=await concepts.createProjectConceptFolder(director,{projectId:"executor",stageKey:"CONCEPT_CREATION",name:"New native task",assignedExecutorId:"designer",deadline:"2027-01-01",brief:"Assigned brief"});
  assert.ok("folder" in task,JSON.stringify(task));
  if("folder" in task){
   const u=await user("designer");
   const createdTask=await db.projectConceptFolder.findUniqueOrThrow({where:{id:task.folder!.id}});
   await history.startProjectStageWork(u,{projectId:"executor",stageId:createdTask.taskerStageId});
   const requested=await concepts.requestProjectConceptTaskCompletion(u,{projectId:"executor",folderId:task.folder!.id,stageKey:"CONCEPT_CREATION",note:"No file required"});
   assert.ok("changed" in requested,JSON.stringify(requested));
   await denied(()=>concepts.editProjectConceptFolder(u,{projectId:"executor",folderId:task.folder!.id,stageKey:"CONCEPT_CREATION",name:"Unauthorized structural edit"}));
  }
  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"executor",stageKey:"CONCEPT_CREATION"}},data:{status:"LOCKED"}});
  await denied(()=>history.startProjectStageWork(d,{projectId:"executor",stageId:"task-designer"}));
  console.log("PASS write: assigned native execution, truthful actor attribution, unrelated task/project denial and locked-stage enforcement.");

  const flexActor=await user("designer");
  const note=await flexible.createFlexibleMilestoneNote(flexActor,"flex-assigned","milestone-designer",{content:"My task note"}); assert.ok("noteId" in note,JSON.stringify(note));
  await denied(()=>flexible.createFlexibleMilestoneNote(flexActor,"flex-assigned","milestone-digital",{content:"Unrelated note"}));
  await denied(()=>flexible.updateFlexibleProject(flexActor,"flex-assigned",{name:"No",ownerId:"outsider",collaboratorIds:[],priority:"MEDIUM",scope:"INTERNAL"}));
  const completed=await flexible.setFlexibleMilestoneCompleted(flexActor,"flex-assigned","milestone-designer",true);assert.ok("milestoneId" in completed);
  assert.equal((await db.flexibleProject.findUniqueOrThrow({where:{id:"flex-assigned"}})).completedAt,null);
  await denied(()=>flexible.createFlexibleMilestoneNote(flexActor,"flex-assigned","milestone-designer",{content:"Completed work is immutable"}));
  await db.flexibleProject.create({data:{id:"single-flex",slug:"single-flex",name:"Single task",ownerId:"spm",createdById:"spm"}});
  await db.flexibleMilestone.create({data:{id:"single-milestone",projectId:"single-flex",name:"Final task",responsibleUserId:"designer",sortOrder:1}});
  const finalTask=await flexible.setFlexibleMilestoneCompleted(flexActor,"single-flex","single-milestone",true);assert.ok("milestoneId" in finalTask);
  const stillActive=await db.flexibleProject.findUniqueOrThrow({where:{id:"single-flex"}});assert.equal(stillActive.status,"ACTIVE");assert.equal(stillActive.completedAt,null);
  const jpm=await user("jpm");
  await denied(()=>flexible.updateFlexibleProject(jpm,"flex-owned",{name:"Legacy collaborator is not co-owner",ownerId:"spm",collaboratorIds:["jpm"],priority:"MEDIUM",scope:"INTERNAL"}));
  const dir=await user("director");
  const folder=await privateFiles.createProjectPrivateSubfolder(dir,{projectId:"executor",parentFolderId:"private",name:"Director added"});assert.ok("folder" in folder,JSON.stringify(folder));
  if("folder" in folder)assert.equal((await db.projectPrivateFolder.findUniqueOrThrow({where:{id:folder.folder!.id}})).ownerUserId,"digital");
  await denied(()=>privateFiles.createProjectPrivateSubfolder(flexActor,{projectId:"executor",parentFolderId:"private",name:"Unauthorized"}));
  console.log("PASS write: flexible assigned work without project finalization, compatibility collaborator cannot manage, private ownership preserved.");

  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"owned",stageKey:"FINAL_LAYOUT"}},data:{status:"AVAILABLE"}});
  await db.projectAttachment.create({data:{id:"source-five",projectId:"owned",uploadedById:"spm",fileName:"source.pdf",originalFileName:"source.pdf",mimeType:"application/pdf",fileSize:1,bucket:"fixture-no-network",storageKey:"fixture/source-five",assetType:"GENERAL_PROJECT_ASSET",status:"READY"}});
  await db.projectStageFileHandoff.create({data:{id:"handoff-five",projectId:"owned",sourceWorkflowStageKey:"PROJECT_DEVELOPMENT",sourceAttachmentId:"source-five",targetWorkflowStageKey:"FINAL_LAYOUT",handedOffById:"spm"}});
  const manager=await user("spm");
  const checklist=await five.saveStageFiveChecklist(manager,{projectId:"owned",handoffId:"handoff-five",items:[{fieldKey:"OUTPUT_NAME",value:{text:"Approved output"},attachmentIds:[]}]});assert.ok(!("error" in checklist),JSON.stringify(checklist));
  assert.equal((await db.projectFileChecklistItem.findFirstOrThrow({where:{checklist:{projectId:"owned"},fieldKey:"OUTPUT_NAME"}})).updatedById,"spm");
  await denied(()=>five.saveStageFiveChecklist(manager,{projectId:"owned",handoffId:"missing",items:[]}));
  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"owned",stageKey:"FINAL_LAYOUT"}},data:{status:"COMPLETED"}});
  const boss=await user("director"); await denied(()=>five.saveStageFiveChecklist(boss,{projectId:"owned",handoffId:"handoff-five",items:[]}));
  await denied(()=>seven.closeStageSevenProject(manager,{projectId:"owned"}));
  await denied(()=>seven.closeStageSevenProject(boss,{projectId:"owned"}));
  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"owned",stageKey:"PRODUCTION_AND_HANDOVER"}},data:{status:"AVAILABLE"}});
  const checklistRow=await db.projectFileChecklist.findUniqueOrThrow({where:{handoffId:"handoff-five"}});
  await db.projectProductionUnit.create({data:{id:"unit",projectId:"owned",sourceHandoffId:"handoff-five",sourceChecklistId:checklistRow.id,sourceAttachmentId:"source-five",createdById:"spm",status:"APPROVAL_PENDING"}});
  const version=new Date();
  await db.productionApprovalStep.create({data:{id:"approval",productionUnitId:"unit",sequence:1,isMarketingDirectorRequired:true,recipientType:"EXISTING_COLLABORATOR",recipientUserId:"jpm",requestedById:"spm",status:"ACTIVE",dispatchStatus:"SENT",activatedAt:version}});
  await denied(()=>six.decideProductionApproval({kind:"authenticated",user:boss,stepId:"approval"},{decision:"APPROVE",confirmed:true,requestVersion:version.toISOString()}));
  const recipient=await user("jpm");
  await denied(()=>six.decideProductionApproval({kind:"authenticated",user:recipient,stepId:"approval"},{decision:"APPROVE",confirmed:true,requestVersion:"stale"}));
  const approval=await six.decideProductionApproval({kind:"authenticated",user:recipient,stepId:"approval"},{decision:"APPROVE",confirmed:true,requestVersion:version.toISOString()});assert.ok(!("error" in approval),JSON.stringify(approval));
  assert.equal((await db.productionApprovalStep.findUniqueOrThrow({where:{id:"approval"}})).decidedByUserId,"jpm");
  await denied(()=>six.decideProductionApproval({kind:"authenticated",user:recipient,stepId:"approval"},{decision:"REJECT",confirmed:true,requestVersion:version.toISOString()}));
  assert.equal((await db.project.findUniqueOrThrow({where:{id:"owned"}})).completedAt,null);
  console.log("PASS write: Stage 6 actual recipient, approval version integrity, final-decision immutability and no project finalization.");
  console.log("PASS write: Stage 5 native checklist, actual updater, completed-stage denial even Director; Stage 7 closure preserves native prerequisites and Director gate.");

  await db.project.create({data:{id:"reopen",name:"Reopening fixture",ownerId:"spm",createdById:"spm"}});
  await db.projectExecutor.create({data:{projectId:"reopen",userId:"designer"}});
  await db.projectWorkflowStage.createMany({data:PROJECT_WORKFLOW_STAGE_DEFINITIONS.map(stage=>({projectId:"reopen",stageKey:stage.key,status:stage.number<=3?"COMPLETED":stage.number===4?"AVAILABLE":"LOCKED",unlockedAt:stage.number<=4?new Date():null,completedAt:stage.number<=3?new Date():null}))});
  const owner=await user("spm");
  await denied(()=>reopening.revokeSkippedConceptStage(owner,{projectId:"reopen",stageKey:"CONCEPT_CREATION",reason:"Unauthorized override"}));
  const intervener=await user("director");
  await denied(()=>reopening.revokeSkippedConceptStage(intervener,{projectId:"reopen",stageKey:"CONCEPT_CREATION"}));
  const reopened=await reopening.revokeSkippedConceptStage(intervener,{projectId:"reopen",stageKey:"CONCEPT_CREATION",reason:"Approved correction to skipped work"});assert.ok("changed" in reopened,JSON.stringify(reopened));
  const evidence=await db.projectActivityLog.findFirstOrThrow({where:{projectId:"reopen",action:"STAGE_SKIP_REVOKED"}});assert.equal(evidence.actorId,"director");assert.equal((evidence.metadata as {reason:string}).reason,"Approved correction to skipped work");
  assert.equal((await db.project.findUniqueOrThrow({where:{id:"reopen"}})).ownerId,"spm");
  console.log("PASS write: explicit Director reopening requires a reason, preserves ownership and stores native audit evidence.");

  const u=await user("spm");
  const oldName=(await db.project.findUniqueOrThrow({where:{id:"owned"}})).name;
  const rolled=await writes.runProjectMutation(u,"updateProjectV2",{kind:"structured",id:"owned"},async()=>{
   await projectTransactionClient(db).project.update({where:{id:"owned"},data:{name:"Must roll back"}});
   return {error:"Simulated downstream rejection"};
  });assert.ok("error" in rolled);assert.equal((await db.project.findUniqueOrThrow({where:{id:"owned"}})).name,oldName);
  let release!:()=>void, entered!:()=>void;const hold=new Promise<void>(r=>release=r), startedMutation=new Promise<void>(r=>entered=r);
  const mutation=writes.runProjectMutation(u,"updateProjectV2",{kind:"structured",id:"owned"},async()=>{entered();await hold;await projectTransactionClient(db).project.update({where:{id:"owned"},data:{name:"Authorized before revocation"}});return true;});
  await startedMutation;
  let revoked=false;
  const revocation=db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Concurrent fixture revocation',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
   await tx.userAuthorization.update({where:{userId:"spm"},data:{businessRole:"DESIGNER"}});revoked=true;
  });
  await new Promise(resolve=>setTimeout(resolve,80));assert.equal(revoked,false,"Role revocation must serialize with the active authorized transaction");release();await mutation;await revocation;
  await denied(()=>creation.updateProjectV2(u,"owned",editInput));
  await user("designer");await db.session.update({where:{token:token!},data:{expiresAt:new Date(Date.now()-1)}});
  await denied(()=>flexible.createFlexibleMilestoneNote(flexActor,"flex-assigned","milestone-designer",{content:"Expired"}));
  console.log("PASS write: transaction rollback, concurrent role revocation serialization, stale and expired session denial.");
  await db.projectWorkflowStage.updateMany({where:{projectId:"owned",stageKey:{not:"IMPLEMENTATION_AND_SUPERVISION"}},data:{status:"COMPLETED",unlockedAt:new Date(),completedAt:new Date()}});
  await db.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:"owned",stageKey:"IMPLEMENTATION_AND_SUPERVISION"}},data:{status:"AVAILABLE",unlockedAt:new Date(),completedAt:null}});
  await db.projectProductionUnit.update({where:{id:"unit"},data:{status:"HANDOVER_READY"}});
  await db.projectProductionSupervision.create({data:{id:"supervision",projectId:"owned",productionUnitId:"unit",status:"SIGNED_OFF",signedOffById:"director",signedOffAt:new Date()}});
  // Final completion now checks native tasks and explicit document scope as well.
  await db.project.update({where:{id:"owned"},data:{executionType:"INTERNAL"}});
  await db.projectStage.updateMany({where:{projectId:"owned"},data:{status:"COMPLETED"}});
  const closer=await user("director");
  await seven.closeStageSevenProject(closer,{projectId:"owned"});
  assert.equal((await db.projectClosure.findUniqueOrThrow({where:{projectId:"owned"}})).closedById,"director");
  assert.equal((await db.project.findUniqueOrThrow({where:{id:"owned"}})).ownerId,"spm");
  await denied(()=>creation.updateProjectV2(closer,"owned",editInput));
  console.log("PASS write: Director closes a non-owned project only after native Stage 7 sign-off, with truthful closure attribution; closed project edits deny.");
 } finally {moduleApi._load=original;}
}
main().then(()=>console.log("PASS Phase 1.5C actual native services on disposable PostgreSQL; no application database or S3 objects used.")).finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});

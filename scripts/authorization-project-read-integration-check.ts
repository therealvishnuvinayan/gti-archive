import type { BusinessRole, PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createAuthorizationService } from "../src/lib/authorization/policy";
import { projectReadPolicies } from "../src/lib/authorization/project-read-policies";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "../src/lib/project-workflow";
import { allPermissionKeys } from "../src/lib/permissions/definitions";

const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-isolated-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_authorization_project_read_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
let signedFiles = 0;
const service = createAuthorizationService({database:db, readSessionToken:async()=>token, policies:projectReadPolicies});
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"]];
const tokens = new Map<string,string>();
async function as(id:string) { token = tokens.get(id)!; }
async function check(capability:string, targetId:string, allow:boolean) {
 const result = await service.authorize({capability,targetId});
 assert.equal(result.decision, allow ? "ALLOW" : "DENY", `${capability} ${targetId}: ${JSON.stringify(result)}`);
}
async function businessSnapshot() {
 const [rows] = await db.$queryRaw<Array<{snapshot:unknown}>>`SELECT jsonb_build_object(
 'projects',(SELECT jsonb_agg(to_jsonb(t)) FROM "Project" t),
 'flexible',(SELECT jsonb_agg(to_jsonb(t)) FROM "FlexibleProject" t),
 'executors',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectExecutor" t),
 'coowners',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectCoOwner" t),
 'stages',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectStage" t),
 'workflow',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectWorkflowStage" t),
 'checklists',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectFileChecklist" t),
 'completion',(SELECT jsonb_agg(to_jsonb(t)) FROM "ProjectCompletionWorkflow" t)
 ) AS snapshot`;
 return rows.snapshot;
}
async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_authorization_project_read_test"});
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
 const before = await businessSnapshot();
 for(const [id] of roles){
  await as(id);
  const full=id==="director"||id==="spm"||id==="jpm";
  await check("project.view","structured:owned",full);
  await check("project.view","flexible:flex-owned",full);
  await check("project.view","structured:executor",id==="director"||id==="outsider");
  await check("project.viewContext","structured:executor",["director","outsider","spm","designer","digital"].includes(id));
  await check("project.viewContext","flexible:flex-assigned",["director","outsider","spm","designer","digital"].includes(id));
  await check("project.viewStage","stage:management-stage",full);
  await check("project.viewFile","file:cross-project-file",false);
  await check("project.viewFile","file:orphan-private",false);
  await check("project.viewFile","file:file-designer",["director","outsider","designer"].includes(id));
  await check("project.viewFile","file:private-file",["director","digital"].includes(id));
  await check("project.viewFolder","private-folder:private",["director","digital"].includes(id));
  await check("project.viewFolder","research-folder:brief",["director","outsider","spm","designer","digital"].includes(id));
  await check("project.viewFolder","research-folder:confidential",["director","outsider"].includes(id));
  await check("project.viewFile","flexible-file:flex-file",["director","outsider","designer"].includes(id));
  await check("project.view","structured:restricted-owner",id==="director");
  await check("project.viewContext","structured:restricted-owner",["director","designer","digital"].includes(id));
  await check("project.view","structured:unrelated",["director","outsider"].includes(id));
 }
 await as("director");
 await check("project.edit","structured:owned",false);
 await check("project.view","unknown:owned",false);
 await check("project.viewStage","file:file-designer",false);
 assert.equal((await service.authorize({capability:"project.view",targetId:"structured:owned",actor:{userId:"director",businessRole:"DIRECTOR"}})).decision,"DENY");
 console.log("PASS project read: five roles, technical-only, unassigned, owner/co-owner/executor/nonparticipant, both project types, stage/file/folder matrix, unknown targets and no write registration.");
 await frameworkChecks();
 assert.deepEqual(await businessSnapshot(),before,"Reading must preserve projects, real ownership, membership, workflow and missing checklist/completion records");
 console.log("PASS project read: Director reads cause no project, membership or workflow mutations; no S3 objects or application database used.");
}

async function frameworkChecks(){
 const moduleApi=localRequire("node:module") as {_load:(name:string,...args:unknown[])=>unknown};
 const original=moduleApi._load, compiledRoot=dirname(dirname(__filename));
 moduleApi._load=function(name,...args){
  if(name==="@prisma/client")return localRequire(join(root,"client"));
  // This authorization suite uses plain synthetic strings; rich-text rendering
  // is not under test (the local sanitizer transitive dependency is unavailable).
  if(name==="@/lib/rich-text")return {sanitizeRichText:(value:string|null)=>value??"",richTextToPlainText:(value:string|null)=>value??"",isRichTextEmpty:(value:string|null)=>!value};
  if(name==="@/lib/realtime/server")return new Proxy({}, {get:(_t,key)=>()=>{throw new Error(`REALTIME_SIDE_EFFECT_FORBIDDEN:${String(key)}`);}});
  if(name==="next/headers")return{cookies:async()=>({get:()=>token?{value:token}:undefined})};
  if(name==="next/cache")return{unstable_cache:(fn:unknown)=>fn,revalidatePath:()=>{},revalidateTag:()=>{}};
  if(name==="next/navigation")return{redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}};
  if(name==="react")return{cache:(fn:unknown)=>fn};
  if(name==="@/lib/prisma"||name==="../prisma"||name==="./prisma")return{prisma:db,withPrismaRetry:(fn:()=>unknown)=>fn()};
  if(name==="@/lib/permissions/profiles")return{getPermissionProfileSnapshotForUser:async()=>({effectivePermissions:new Set(allPermissionKeys),rolePermissions:new Set(allPermissionKeys),archiveAccessGranted:true,archiveAccessLevel:"FULL"})};
  if(name==="@/lib/s3"||name==="@/lib/storage/s3")return new Proxy({}, {get:(_t,key)=>key==="getFileExtension" ? localRequire(join(compiledRoot,"src/lib/upload-validation.js")).getFileExtension : key==="createPresignedDownloadUrl"||key==="createPresignedPreviewUrl"?async()=>{signedFiles++;return "fixture-signed-url";}:()=>{throw new Error(`S3_OBJECT_ACCESS_FORBIDDEN:${String(key)}`);}});
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try{
  const auth=localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const context=localRequire(join(compiledRoot,"src/lib/authorization/project-context.js")) as typeof import("../src/lib/authorization/project-context");
  const projects=localRequire(join(compiledRoot,"src/lib/projects.js")) as typeof import("../src/lib/projects");
  const flexible=localRequire(join(compiledRoot,"src/lib/flexible-projects.js")) as typeof import("../src/lib/flexible-projects");
  const history=localRequire(join(compiledRoot,"src/lib/project-history.js")) as typeof import("../src/lib/project-history");
  const notifications=localRequire(join(compiledRoot,"src/lib/notification-center/service.js")) as typeof import("../src/lib/notification-center/service");
  const five=localRequire(join(compiledRoot,"src/lib/stage-five.js")) as typeof import("../src/lib/stage-five");
  const seven=localRequire(join(compiledRoot,"src/lib/stage-seven.js")) as typeof import("../src/lib/stage-seven");
  const calendar=localRequire(join(compiledRoot,"src/lib/calendar.js")) as typeof import("../src/lib/calendar");
  const dashboard=localRequire(join(compiledRoot,"src/lib/dashboard.js")) as typeof import("../src/lib/dashboard");
  const library=localRequire(join(compiledRoot,"src/lib/library.js")) as typeof import("../src/lib/library");
  const privateFolders=localRequire(join(compiledRoot,"src/lib/project-private-folders.js")) as typeof import("../src/lib/project-private-folders");
  const completion=localRequire(join(compiledRoot,"src/lib/project-completion.js")) as typeof import("../src/lib/project-completion");
  for(const [id]of roles){
   await as(id);const user=(await auth.getCurrentUser())!;assert.ok(user);
   const index=await context.getProjectContextIndex(user);
   if(id==="tech")assert.equal((await calendar.getCalendarEvents(user)).length,0);
   if(id==="designer")assert.equal((await calendar.getCalendarEvents(user)).length,1);
   if(id==="director")assert.equal((await calendar.getCalendarEvents(user)).length,1);
   const listed=await projects.getProjectsList({query:"",status:"ALL"},user);
   const counts=await projects.getDashboardProjectCounts(user);
   assert.equal(listed.total,index.artwork.length);assert.equal(counts.total,index.artwork.length);
   const limitedIndex=await context.getProjectContextIndex(user,true);
   const flexiblePage=await flexible.getFlexibleProjectsPage(user);
   assert.equal(flexiblePage.total+limitedIndex.flexible.length,index.flexible.length);
   const snapshot=await dashboard.getDashboardSnapshot(user);assert.equal(snapshot.kpis[0].value,index.total);
   if (["tech", "unassigned"].includes(id)) await assert.rejects(() => library.getLibraryPageDataForUser(user));
   else {
    const libraryPage = await library.getLibraryPageDataForUser(user);
    if (id === "designer") assert.ok(libraryPage.items.some(file => file.id === "file-designer"));
    if (id === "digital") assert.ok(!JSON.stringify(libraryPage).includes("file-designer"));
   }
   for(const row of index.artwork) assert.ok(await context.getRestrictedProjectContext(row.id,user));
   if(["tech","unassigned"].includes(id))assert.equal(index.total,0);
   if(["designer","digital"].includes(id)){
    const data=await context.getRestrictedProjectContext("executor",user);
    assert.equal(data.creator.id,"outsider");assert.equal(data.owner?.id,"outsider");
    assert.equal(data.tasks.length,1);assert.equal(data.tasks[0].id,`concept-${id}`);
    assert.deepEqual(Object.keys(data).sort(),["id","name","creator","owner","projectBrief","targetMarkets","deliverables","deadline","tasks"].sort());
    assert.ok(!JSON.stringify(data).includes("999999")&&!JSON.stringify(data).includes("44444"));
    assert.equal(await projects.getProjectById("executor",user),null);
    assert.equal(await flexible.getFlexibleProjectDetail("flex-assigned",user),null);
    const privateContext=await context.getFlexibleContextBySlug("flex-assigned",user);assert.equal(privateContext?.tasks.length,1);
    await assert.rejects(seven.getStageSevenWorkspaceData(user,"executor"),/PROJECT_READ_DENIED/);
    if(id==="designer") await assert.rejects(history.getAttachmentDownloadUrlForUser(user,"private-file"),/PROJECT_READ_DENIED/);
   }
   if(id==="director"){
    assert.ok(await projects.getProjectById("owned",user));
    const resources = await context.getDirectorProjectResources("executor",user);
    assert.ok(resources?.files.some(file=>file.id==="private-file"));
    assert.ok(resources?.folders.some(folder=>folder.id==="private"));
    const privateView=await privateFolders.getProjectPrivateFolderPageData(user,{projectId:"executor",folderId:"private"});assert.equal(privateView.canWrite,false);assert.equal(privateView.canUpload,false);
    assert.ok(await flexible.getFlexibleProjectDetail("flex-unrelated",user));
    assert.ok(await five.getStageFiveWorkspaceData(user,"owned"));
    assert.ok(await seven.getStageSevenWorkspaceData(user,"owned"));
    const unconfigured = await completion.getProjectCompletionWorkflowForUser(user,"owned");
    assert.equal(unconfigured?.workflowId,"unconfigured");
    assert.equal(unconfigured?.needsInitialConfiguration,true);
    assert.equal(await db.projectCompletionWorkflow.count(),0,"Completion read projection must not persist a workflow");
   }
  }
  await as("designer");const user=(await auth.getCurrentUser())!;
  const signatures=signedFiles;await assert.rejects(history.getAttachmentDownloadUrlForUser({...user,role:"SUPER_ADMIN"},"file-digital"),/PROJECT_READ_DENIED/);assert.equal(signedFiles,signatures);
  assert.equal(await history.getAttachmentDownloadUrlForUser(user,"file-designer"),"fixture-signed-url");
  await assert.rejects(context.getProjectContextIndex({id:"director"}),/PROJECT_READ_UNAUTHENTICATED/);
  const forged={...user,role:"SUPER_ADMIN" as const,businessRole:"DIRECTOR"};assert.equal((await projects.getProjectsList({query:"",status:"ALL"},forged)).total,2);
  for(const [id,total]of [["director",3],["spm",1],["designer",0],["tech",0]] as const){await as(id);assert.equal(await notifications.getUnreadNotificationCount(id),total);const rows=await notifications.getRecentNotificationsForUser(id);assert.equal(rows.notifications.length,total);}
  await as("designer");await db.session.update({where:{token:token!},data:{expiresAt:new Date(0)}});await assert.rejects(context.getProjectContextIndex(user),/PROJECT_READ_UNAUTHENTICATED/);
  await as("jpm");await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated version invalidation',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;await tx.userAuthorization.update({where:{userId:"jpm"},data:{businessRole:"DESIGNER",authorizationVersion:{increment:1}}});});
  await assert.rejects(context.getProjectContextIndex({id:"jpm"}),/PROJECT_READ_UNAUTHENTICATED/);
  console.log("PASS project read: actual session-bound services, dashboard/flexible list/count alignment, scoped Library, safe projection keys, direct stage/detail/file denial, list/count consistency, scoped notifications/calendar, forged user rejection, expiry and version invalidation.");
 }finally{moduleApi._load=original;}
}
main().catch((error:unknown)=>{console.error("FAIL project read:",error instanceof Error?error.name:"UnknownError");if(error instanceof assert.AssertionError)console.error(error.message);else if(error instanceof Error)console.error(error.message.replace(/postgresql:\/\/\S+/g,"[isolated database]"));process.exitCode=1;}).finally(()=>db.$disconnect());

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
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_authorization_project_governance_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
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
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_authorization_project_governance_test"});
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
  if(name==="next/server")return{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)},after:(fn:unknown)=>{void fn;}};
  if(name==="react")return{cache:(fn:unknown)=>fn};
  if(name==="@/lib/prisma"||name==="../prisma"||name==="./prisma")return{prisma:projectTransactionClient(db),withPrismaRetry:(fn:()=>unknown)=>fn()};
  if(name==="@/lib/permissions/profiles")return{getPermissionProfileSnapshotForUser:async()=>({effectivePermissions:new Set(allPermissionKeys),rolePermissions:new Set(allPermissionKeys),archiveAccessGranted:true,archiveAccessLevel:"FULL"})};
  if(name==="@/lib/s3"||name==="@/lib/storage/s3")return new Proxy({}, {get:(_t,key)=>key==="getFileExtension" ? localRequire(join(compiledRoot,"src/lib/upload-validation.js")).getFileExtension : key==="createPresignedDownloadUrl"||key==="createPresignedPreviewUrl"?async()=>{return "fixture-signed-url";}:()=>{throw new Error(`S3_OBJECT_ACCESS_FORBIDDEN:${String(key)}`);}});
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try {
  const auth = localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const service = localRequire(join(compiledRoot,"src/lib/project-governance/service.js")) as typeof import("../src/lib/project-governance/service");
  const preset = localRequire(join(compiledRoot,"src/lib/project-governance/preset.js")) as typeof import("../src/lib/project-governance/preset");
  const creation = localRequire(join(compiledRoot,"src/lib/project-creation.js")) as typeof import("../src/lib/project-creation");
  const flexible = localRequire(join(compiledRoot,"src/lib/flexible-projects.js")) as typeof import("../src/lib/flexible-projects");
  const seven = localRequire(join(compiledRoot,"src/lib/stage-seven.js")) as typeof import("../src/lib/stage-seven");
  const completion = localRequire(join(compiledRoot,"src/lib/project-completion.js")) as typeof import("../src/lib/project-completion");
  const actions = localRequire(join(compiledRoot,"src/app/(dashboard)/projects/governance-actions.js")) as typeof import("../src/app/(dashboard)/projects/governance-actions");
  const permissions = localRequire(join(compiledRoot,"src/lib/permissions/resolver.js")) as typeof import("../src/lib/permissions/resolver");
  const runtime = localRequire(join(compiledRoot,"src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  async function user(id:string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn:()=>Promise<unknown>) {
   try { const result=await fn(); assert.ok(result&&typeof result==="object"&&"error" in result,`Expected denial, got ${JSON.stringify(result)}`); }
   catch(error){
    if(error instanceof assert.AssertionError || error instanceof TypeError || error instanceof ReferenceError)throw error;
    if(error instanceof Error && (error.message.includes("S3_OBJECT_ACCESS_FORBIDDEN") || ("code" in error && !["P2002","P2034"].includes(String(error.code)))))throw error;
   }
  }
  const details = (ownerId:string): import("../src/lib/project-governance/configuration").CreationDetails => ({kind:"ARTWORK",name:`Governed ${randomUUID()}`,description:"Immutable project brief",ownerId,coOwnerIds:ownerId==="jpm"?["spm"]:[],executorIds:["designer"],tags:["Synthetic"],executionType:"INTERNAL",clientRequestId:randomUUID()});
  const creationRow=(id:string)=>db.projectCreationRequest.findUniqueOrThrow({where:{id}});
  const completionRow=(id:string)=>db.projectFinalCompletionRequest.findUniqueOrThrow({where:{id}});
  const director=await user("director");
  assert.equal(await db.legacyProjectPresetApproval.count(),0,"Migration must never auto-approve presets");
  const direct=await service.submitProjectCreation(director,{...details("spm"),coOwnerIds:["jpm"]});
  assert.ok("projectId" in direct);if(!("projectId" in direct))throw new Error("Missing project");
  const directProject=await db.project.findUniqueOrThrow({where:{id:direct.projectId},include:{coOwners:true,executors:true,workflowStages:true}});
  assert.equal(directProject.createdById,"director");assert.equal(directProject.ownerId,"spm");
  assert.deepEqual(directProject.coOwners.map(u=>u.userId),["jpm"]);assert.deepEqual(directProject.executors.map(u=>u.userId),["designer"]);assert.equal(directProject.workflowStages.length,7);
  assert.equal(await db.projectResearchWorkspace.count({where:{projectId:direct.projectId}}),1);
  assert.equal(await db.projectCollaborator.count({where:{projectId:direct.projectId}}),0);
  await denied(()=>service.submitProjectCreation(director,{...details("spm"),coOwnerIds:["director"]}));
  for(const id of ["designer","digital","tech","unassigned"]){
   const actor=await user(id);await denied(()=>service.submitProjectCreation(actor,details(id)));
   await denied(()=>service.approveLegacyArtworkPreset(actor,{definitionHash:preset.legacyArtworkPresetHash,reason:"Unauthorized"}));
   await denied(()=>service.getGovernanceWorkspace(actor));
   assert.equal(permissions.canCreateProjects(actor),false);
  }
  const spm=await user("spm");
  await denied(()=>service.submitProjectCreation(spm,details("spm")));
  await denied(()=>service.submitProjectCreation(spm,{...details("spm"),presetApprovalId:"forged"}));
  await user("director");
  await denied(()=>service.approveLegacyArtworkPreset(director,{definitionHash:"old-hash",reason:"Stale definition"}));
  const approvedPreset=await service.approveLegacyArtworkPreset(director,{definitionHash:preset.legacyArtworkPresetHash,reason:"Reviewed exact native seven-stage preset"});
  await denied(()=>service.approveLegacyArtworkPreset(director,{definitionHash:preset.legacyArtworkPresetHash,reason:"Duplicate approval"}));
  await user("spm");
  const spmDirect=await service.submitProjectCreation(spm,{...details("spm"),presetApprovalId:approvedPreset.approvalId});
  assert.equal(spmDirect.status,"ACTIVATED");
  const spmRow=await creationRow(spmDirect.requestId);assert.equal(spmRow.requesterId,"spm");assert.equal(spmRow.decidedById,null);
  await denied(()=>service.submitProjectCreation(spm,{...details("outsider"),presetApprovalId:approvedPreset.approvalId}));
  console.log("PASS governance: Director direct creation and attribution; explicit preset designation; SPM approved-only creation; restricted/technical denial; no legacy collaborator mirroring.");

  // Endorsing a template proposal must not publish it or create an approval grant.
  const proposalInput={clientRequestId:randomUUID(),title:"Reusable proof workflow",changeKind:"CREATE" as const,brief:"Propose stages and required proof for future implementation"};
  const proposal=await service.submitTemplateProposal(spm,proposalInput);
  const proposalRow=await db.projectTemplateProposal.findUniqueOrThrow({where:{id:proposal.proposalId}});
  await denied(()=>service.submitTemplateProposal(spm,proposalInput));
  await denied(()=>service.decideTemplateProposal(spm,{proposalId:proposalRow.id,proposalHash:proposalRow.proposalHash,decision:"APPROVE",reason:"Self publish"}));
  for(const id of ["jpm","designer","digital","tech"]){const actor=await user(id);await denied(()=>service.submitTemplateProposal(actor,{...proposalInput,clientRequestId:randomUUID()}));}
  await user("director");const presetCount=await db.legacyProjectPresetApproval.count();
  await service.decideTemplateProposal(director,{proposalId:proposalRow.id,proposalHash:proposalRow.proposalHash,decision:"APPROVE",reason:"Accept scope for later template design"});
  assert.equal(await db.legacyProjectPresetApproval.count(),presetCount);
  assert.equal((await runtime.runtimeAuthorization.authorize({capability:"template.approvePublish",targetId:`template-proposal:${proposalRow.id}`})).decision,"DENY");
  await denied(()=>service.decideTemplateProposal(director,{proposalId:proposalRow.id,proposalHash:proposalRow.proposalHash,decision:"REJECT",reason:"Replay"}));
  await assert.rejects(db.projectTemplateProposal.update({where:{id:proposalRow.id},data:{proposal:{rewritten:true}}}));
  console.log("PASS governance: SPM template proposal, Director endorsement, immutable decision; no publication or implicit preset grant.");

  const jpm=await user("jpm");
  for(const coOwnerIds of [[],["jpm"],["director"],["designer"],["tech"]])await denied(()=>service.submitProjectCreation(jpm,{...details("jpm"),coOwnerIds}));
  const count=await db.project.count();const jpmInput=details("jpm");
  const request=await service.submitProjectCreation(jpm,jpmInput);assert.equal(request.status,"SUBMITTED");assert.equal(await db.project.count(),count);
  await denied(()=>service.submitProjectCreation(jpm,jpmInput));
  const submitted=await creationRow(request.requestId);
  await denied(()=>service.activateApprovedProject(jpm,{requestId:submitted.id,configurationHash:submitted.configurationHash}));
  await denied(()=>service.decideProjectCreation(jpm,{requestId:submitted.id,configurationHash:submitted.configurationHash,decision:"APPROVE",reason:"Self approval"}));
  await user("director");
  await denied(()=>service.decideProjectCreation(director,{requestId:submitted.id,configurationHash:"changed",decision:"APPROVE",reason:"Changed request"}));
  const decision={requestId:submitted.id,configurationHash:submitted.configurationHash,decision:"APPROVE" as const,reason:"Reviewed JPM details and SPM co-owner"};
  const concurrent=await Promise.allSettled([service.decideProjectCreation(director,decision),service.decideProjectCreation(director,decision)]);
  assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
  await denied(()=>service.decideProjectCreation(director,decision));
  await user("outsider");await denied(()=>service.activateApprovedProject({id:"outsider"},{requestId:submitted.id,configurationHash:submitted.configurationHash}));
  await user("director");
  const activation={requestId:submitted.id,configurationHash:submitted.configurationHash};
  const activations=await Promise.allSettled([service.activateApprovedProject(director,activation),service.activateApprovedProject(director,activation)]);
  assert.equal(activations.filter(r=>r.status==="fulfilled").length,1);
  const activated=await creationRow(submitted.id);assert.ok(activated.projectId);
  const jpmProject=await db.project.findUniqueOrThrow({where:{id:activated.projectId!},include:{coOwners:true}});
  assert.equal(jpmProject.ownerId,"jpm");assert.equal(jpmProject.createdById,"jpm");assert.equal(jpmProject.coOwners[0].userId,"spm");assert.equal(jpmProject.coOwners[0].addedById,"director");
  assert.equal(await db.projectGovernanceEvent.count({where:{creationRequestId:submitted.id,action:"CREATION_APPROVED"}}),1);
  assert.equal(await db.projectGovernanceEvent.count({where:{creationRequestId:submitted.id,action:"APPROVED_PROJECT_ACTIVATED",actorId:"director"}}),1);
  assert.equal(await db.project.count(),count+1);
  const audit=await db.projectGovernanceEvent.findFirstOrThrow({where:{creationRequestId:submitted.id}});
  await assert.rejects(db.projectGovernanceEvent.update({where:{id:audit.id},data:{reason:"Rewrite"}}));
  await assert.rejects(db.projectGovernanceEvent.delete({where:{id:audit.id}}));
  await assert.rejects(db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.project_governance_actor','director',true)`;await tx.projectCreationRequest.update({where:{id:submitted.id},data:{configuration:{forged:true}}});}));
  await assert.rejects(db.$executeRawUnsafe('TRUNCATE "ProjectGovernanceEvent"'));
  console.log("PASS governance: JPM request only, mandatory eligible SPM, immutable details, actual creator/owner/activator; concurrent decision and activation each succeed once; append-only history.");

  await user("jpm");const rejected=await service.submitProjectCreation(jpm,details("jpm"));const rejection=await creationRow(rejected.requestId);
  await user("director");await service.decideProjectCreation(director,{requestId:rejection.id,configurationHash:rejection.configurationHash,decision:"REJECT",reason:"Scope needs revision"});
  assert.equal((await creationRow(rejection.id)).decisionReason,"Scope needs revision");
  await denied(()=>service.activateApprovedProject(director,{requestId:rejection.id,configurationHash:rejection.configurationHash}));
  await user("jpm");const stale=await service.submitProjectCreation(jpm,{...details("jpm"),coOwnerIds:["outsider"]});const staleRow=await creationRow(stale.requestId);
  const staleActivation=await service.submitProjectCreation(jpm,{...details("jpm"),coOwnerIds:["outsider"]});const staleActivationRow=await creationRow(staleActivation.requestId);
  const selfActivation=await service.submitProjectCreation(jpm,details("jpm"));const selfRow=await creationRow(selfActivation.requestId);
  await user("director");
  for(const row of [staleActivationRow,selfRow])await service.decideProjectCreation(director,{requestId:row.id,configurationHash:row.configurationHash,decision:"APPROVE",reason:"Reviewed before activation"});
  await user("jpm");const selfResult=await service.activateApprovedProject(jpm,{requestId:selfRow.id,configurationHash:selfRow.configurationHash});assert.equal(selfResult.status,"ACTIVATED");
  await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated participant revocation',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;await tx.userAuthorization.update({where:{userId:"outsider"},data:{businessRole:"DESIGNER"}});});
  await user("director");await denied(()=>service.activateApprovedProject(director,{requestId:staleActivationRow.id,configurationHash:staleActivationRow.configurationHash}));
  await denied(()=>service.decideProjectCreation(director,{requestId:staleRow.id,configurationHash:staleRow.configurationHash,decision:"APPROVE",reason:"Stale participant"}));
  await service.decideProjectCreation(director,{requestId:staleRow.id,configurationHash:staleRow.configurationHash,decision:"REJECT",reason:"SPM eligibility changed"});
  // Only this disposable fixture inserts an already expired immutable request.
  const expired=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.project_governance_actor','jpm',true)`;return tx.projectCreationRequest.create({data:{clientRequestId:randomUUID(),requesterId:"jpm",requesterVersion:1,kind:"ARTWORK",configuration:submitted.configuration!,configurationHash:submitted.configurationHash,submittedAt:new Date(Date.now()-8*86400000),expiresAt:new Date(Date.now()-86400000)}});});
  await denied(()=>service.decideProjectCreation(director,{requestId:expired.id,configurationHash:expired.configurationHash,decision:"APPROVE",reason:"Expired"}));
  await service.decideProjectCreation(director,{requestId:expired.id,configurationHash:expired.configurationHash,decision:"REJECT",reason:"Expired request retained"});
  await service.revokeLegacyArtworkPreset(director,{approvalId:approvedPreset.approvalId,reason:"Explicit revocation"});
  await user("spm");await denied(()=>service.submitProjectCreation(spm,{...details("spm"),presetApprovalId:approvedPreset.approvalId}));
  const ownInbox=await service.getGovernanceWorkspace(spm);assert.ok(ownInbox.creations.every(r=>r.requesterId==="spm"));
  await user("designer");await denied(()=>service.submitProjectCreation({id:"director"},details("director")));
  const forged=new FormData();for(const [k,v] of Object.entries({command:"create",kind:"ARTWORK",executionType:"INTERNAL",ownerId:"director",actorId:"director",role:"DIRECTOR",name:"Forged API",tags:"Synthetic",clientRequestId:randomUUID()}))forged.set(k,v);
  assert.ok((await actions.projectGovernanceAction({},forged)).error);
  assert.equal((await runtime.runtimeAuthorization.authorize({capability:"project.create",targetId:"governance:creation",actorId:"director"})).decision,"DENY");
  console.log("PASS governance: rejected/expired requests retained, revoked presets, changed co-owner authority, scoped inbox, forged actor/body and server-action bypass denial.");

  async function flexibleFixture(id:string,ownerId:string,ready=true){
    await db.flexibleProject.create({data:{id,slug:id,name:id,ownerId,createdById:ownerId}});
    await db.flexibleMilestone.create({data:{id:`${id}-milestone`,projectId:id,name:"Deliverable",responsibleUserId:ownerId,sortOrder:1,status:ready?"COMPLETED":"PENDING",completedAt:ready?new Date():null,completedById:ready?ownerId:null}});
    return {kind:"FLEXIBLE" as const,projectId:id};
  }
  await user("director");const flexibleDirect=await service.submitProjectCreation(director,{...details("spm"),kind:"FLEXIBLE",executorIds:[],tags:[]});assert.equal(flexibleDirect.status,"ACTIVATED");
  const flex=await flexibleFixture("flex-spm","spm");const flexJunior=await flexibleFixture("flex-jpm","jpm");const unfinished=await flexibleFixture("flex-unfinished","spm",false);
  await user("spm");await denied(()=>service.requestProjectCompletion(spm,unfinished,"Not ready"));
  await denied(()=>service.finalizeProjectAsDirector(spm,flex,"Owner bypass"));
  const requested=await service.requestProjectCompletion(spm,flex,"All deliverables verified");
  assert.equal((await db.flexibleProject.findUniqueOrThrow({where:{id:flex.projectId}})).completedAt,null);
  await denied(()=>service.requestProjectCompletion(spm,flex,"Duplicate pending request"));
  const submittedCompletion=await completionRow(requested.requestId);
  await assert.rejects(db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('flux.project_governance_actor','director',true)`;
   await tx.projectFinalCompletionRequest.update({where:{id:submittedCompletion.id},data:{snapshot:{forged:true}}});
  }));
  for(const id of ["spm","jpm","designer","digital","tech"]){const actor=await user(id);await denied(()=>service.decideProjectCompletion(actor,{requestId:submittedCompletion.id,snapshotHash:submittedCompletion.snapshotHash,decision:"APPROVE",reason:"Unauthorized completion approval"}));if(id!=="spm")await denied(()=>service.requestProjectCompletion(actor,flex,"Non-owner request"));}
  await user("director");await denied(()=>service.finalizeProjectAsDirector(director,flex,"Cannot bypass pending review"));
  const finalDecision={requestId:submittedCompletion.id,snapshotHash:submittedCompletion.snapshotHash,decision:"APPROVE" as const,reason:"Director reviewed all deliverables"};
  const decisions=await Promise.allSettled([service.decideProjectCompletion(director,finalDecision),service.decideProjectCompletion(director,finalDecision)]);assert.equal(decisions.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await db.flexibleProject.findUniqueOrThrow({where:{id:flex.projectId}})).status,"COMPLETED");
  assert.equal((await completionRow(submittedCompletion.id)).decidedById,"director");
  await denied(()=>service.finalizeProjectAsDirector(director,flex,"Repeat completion"));
  await user("jpm");const jrCompletion=await service.requestProjectCompletion(jpm,flexJunior,"JPM completion request");const jrRow=await completionRow(jrCompletion.requestId);
  await db.flexibleMilestone.update({where:{id:"flex-jpm-milestone"},data:{name:"Changed after request"}});
  await user("director");await denied(()=>service.decideProjectCompletion(director,{requestId:jrRow.id,snapshotHash:jrRow.snapshotHash,decision:"APPROVE",reason:"Stale evidence"}));
  await service.decideProjectCompletion(director,{requestId:jrRow.id,snapshotHash:jrRow.snapshotHash,decision:"REJECT",reason:"Please review changed milestone"});
  assert.equal((await completionRow(jrRow.id)).decisionReason,"Please review changed milestone");assert.equal((await db.flexibleProject.findUniqueOrThrow({where:{id:flexJunior.projectId}})).completedAt,null);
  await user("jpm");const fresh=await service.requestProjectCompletion(jpm,flexJunior,"Reviewed current evidence");const freshRow=await completionRow(fresh.requestId);
  await user("director");await service.decideProjectCompletion(director,{requestId:freshRow.id,snapshotHash:freshRow.snapshotHash,decision:"APPROVE",reason:"Current evidence approved"});
  const manual=await flexibleFixture("flex-direct","spm");await service.finalizeProjectAsDirector(director,manual,"Director intervention");
  assert.equal(await db.projectGovernanceEvent.count({where:{completionRequest:{flexibleProjectId:manual.projectId},action:"PROJECT_COMPLETED",actorId:"director"}}),1);
  console.log("PASS governance: owner SPM/JPM completion requests, no automatic flexible finalization, Director decision, concurrent approval once, stale evidence denial, retained rejection and direct Director audit.");

  async function artworkFixture(id:string,executionType:"INTERNAL"|"EXTERNAL"="INTERNAL"){
    await db.project.create({data:{id,name:id,ownerId:"spm",createdById:"spm",executionType,workflowStages:{create:PROJECT_WORKFLOW_STAGE_DEFINITIONS.map(stage=>({stageKey:stage.key,status:stage.number===7?"AVAILABLE":"COMPLETED",unlockedAt:new Date(),completedAt:stage.number===7?null:new Date()}))}}});
    await db.projectAttachment.create({data:{id:`${id}-file`,projectId:id,uploadedById:"spm",fileName:"proof.pdf",originalFileName:"proof.pdf",mimeType:"application/pdf",fileSize:1,bucket:"fixture-no-network",storageKey:`fixture/${id}`,assetType:"GENERAL_PROJECT_ASSET",status:"READY"}});
    await db.projectStageFileHandoff.create({data:{id:`${id}-handoff`,projectId:id,sourceWorkflowStageKey:"PROJECT_DEVELOPMENT",targetWorkflowStageKey:"FINAL_LAYOUT",sourceAttachmentId:`${id}-file`,handedOffById:"spm"}});
    await db.projectFileChecklist.create({data:{id:`${id}-checklist`,projectId:id,handoffId:`${id}-handoff`,sourceAttachmentId:`${id}-file`}});
    await db.projectProductionUnit.create({data:{id:`${id}-unit`,projectId:id,sourceHandoffId:`${id}-handoff`,sourceChecklistId:`${id}-checklist`,sourceAttachmentId:`${id}-file`,createdById:"spm",status:"HANDOVER_READY",supervision:{create:{projectId:id,status:"SIGNED_OFF",signedOffById:"director",signedOffAt:new Date()}}}});
    return {kind:"ARTWORK" as const,projectId:id};
  }
  const art=await artworkFixture("art-native");const external=await artworkFixture("art-external","EXTERNAL");
  await denied(()=>service.finalizeProjectAsDirector(director,external,"Missing document configuration"));
  await db.projectCompletionWorkflow.create({data:{id:"external-docs",projectId:external.projectId,approvalRequired:true,approvalStatus:"COMPLETED",copyrightRequired:false,invoiceRequired:false}});
  await denied(()=>service.finalizeProjectAsDirector(director,external,"Missing mandatory proof"));
  await db.projectCompletionDocument.create({data:{projectId:external.projectId,workflowId:"external-docs",type:"AUTHORITY_APPROVAL_PROOF",originalFileName:"approval.pdf",archiveFileName:"approval.pdf",mimeType:"application/pdf",fileSize:1,bucket:"fixture-no-network",storageKey:"fixture/document",uploadedById:"spm",uploadedAt:new Date()}});
  await service.finalizeProjectAsDirector(director,external,"Existing mandatory evidence verified");assert.equal(await db.projectCompletionDocument.count({where:{projectId:external.projectId}}),1);
  await db.projectProductionSupervision.update({where:{productionUnitId:"art-native-unit"},data:{signedOffAt:null}});
  await denied(()=>seven.closeStageSevenProject(director,{projectId:art.projectId}));
  await db.projectProductionSupervision.update({where:{productionUnitId:"art-native-unit"},data:{signedOffAt:new Date()}});
  await db.productionApprovalStep.create({data:{id:"historical-approval",productionUnitId:"art-native-unit",sequence:1,status:"ACTIVE",recipientType:"EXISTING_COLLABORATOR",recipientUserId:"director",requestedById:"spm"}});
  await denied(()=>seven.closeStageSevenProject(director,{projectId:art.projectId}));
  await db.productionApprovalStep.update({where:{id:"historical-approval"},data:{removedAt:new Date(),removedByUserId:"director",statusAtRemoval:"ACTIVE"}});
  await user("spm");await denied(()=>seven.closeStageSevenProject(spm,{projectId:art.projectId}));
  assert.equal(permissions.hasProjectPermission(spm,{ownerId:"spm"},"project.completeArchive"),false);
  const artRequest=await service.requestProjectCompletion(spm,art,"Ready Artwork");const artRow=await completionRow(artRequest.requestId);
  await user("director");await service.decideProjectCompletion(director,{requestId:artRow.id,snapshotHash:artRow.snapshotHash,decision:"APPROVE",reason:"Native workflow approved"});
  const closed=await db.project.findUniqueOrThrow({where:{id:art.projectId},include:{closure:true}});assert.ok(closed.completedAt);assert.equal(closed.archivedAt,null);assert.equal(closed.ownerId,"spm");assert.equal(closed.closure?.closedById,"director");
  assert.equal((await db.productionApprovalStep.findUniqueOrThrow({where:{id:"historical-approval"}})).statusAtRemoval,"ACTIVE");
  assert.equal((await db.projectWorkflowStage.findUniqueOrThrow({where:{projectId_stageKey:{projectId:art.projectId,stageKey:"IMPLEMENTATION_AND_SUPERVISION"}}})).status,"COMPLETED");
  const native=await artworkFixture("art-direct");await seven.closeStageSevenProject(director,{projectId:native.projectId});
  assert.equal(await db.projectFinalCompletionRequest.count({where:{projectId:native.projectId,status:"APPROVED",decidedById:"director"}}),1);
  await denied(()=>creation.createProjectV2(director,{name:"Legacy bypass",tags:["Synthetic"],ownerId:"director",coOwnerIds:[],executorIds:[],collaboratorIds:[]}));
  await denied(()=>flexible.createFlexibleProject(director,{name:"Legacy bypass",ownerId:"director",collaboratorIds:[],priority:"MEDIUM",scope:"INTERNAL"}));
  assert.equal(permissions.hasProjectPermission(director,{ownerId:"spm"},"project.completeArchive"),false);
  assert.ok(completion,"Legacy completion module remains loaded under central write protection");
  const good=await user("spm");await db.session.update({where:{token:token!},data:{expiresAt:new Date(Date.now()-1)}});
  await denied(()=>service.getGovernanceWorkspace(good));
  console.log("PASS governance: shared Stage 7 finalization; mandatory documents and sign-off preserved; archived remains distinct; legacy creation/archive bypasses closed; expired sessions deny.");
 } finally {moduleApi._load=original;}
}
main().then(()=>console.log("PASS Phase 1.5D actual services and actions on disposable PostgreSQL; no application database, accounts or S3 objects touched.")).finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});

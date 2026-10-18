import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { runtimeAuthorization } from "../authorization/runtime";
import { resolveAuthenticatedSession, type AuthenticatedPrincipal } from "../authorization/session";
import type { BusinessCapability } from "../authorization/definitions";
import { ensureCanonicalProjectResearchWorkspaceTx } from "../project-research";
import { ensureProjectPrivateFolderTx } from "../project-private-folders";
import { resolveProjectTagIdsTx } from "../project-tag-assignments";
import { getInitialProjectWorkflowStageData } from "../project-workflow";
import { legacyArtworkPreset, legacyArtworkPresetHash, governanceHash } from "./preset";
import { prepareCreation, validateStoredCreation, reasonText, validPreset, type CreationDetails } from "./configuration";
import { applyFinalCompletion, completionEvidence, completionTargetId, type CompletionTarget } from "./completion";

type Tx=Prisma.TransactionClient;
type ExpectedActor={id:string};
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const expiry=()=>new Date(Date.now()+7*24*60*60*1000);
async function run<T>(expected:ExpectedActor,capability:BusinessCapability,targetId:string,fn:(tx:Tx,actor:AuthenticatedPrincipal)=>Promise<T>,reason?:string) {
  return runtimeAuthorization.runAuthorized({capability,targetId,...(reason?{reason}:{})},async(tx,grant)=>{
    if(expected.id!==grant.actorUserId)throw new Error("The supplied actor does not match the authenticated session.");
    const token=await readCurrentSessionToken();
    const session=token?await resolveAuthenticatedSession(tx,token):null;
    if(!session||session.principal.userId!==grant.actorUserId)throw new Error("Authentication expired.");
    await tx.$queryRaw`SELECT set_config('flux.project_governance_actor', ${grant.actorUserId}, true)`;
    const result=await fn(tx,session.principal);
    if(Date.parse(session.principal.session.expiresAt)<=Date.now())throw new Error("Authentication expired during the operation.");
    return result;
  },{isolationLevel:"Serializable",timeout:30000});
}
async function event(tx:Tx,actorId:string,action:string,reason:string,reference:{creationRequestId?:string;completionRequestId?:string;presetApprovalId?:string;templateProposalId?:string},details:unknown={}) {
  await tx.projectGovernanceEvent.create({data:{actorId,action,reason,...reference,details:json(details)}});
}
export async function approveLegacyArtworkPreset(user:ExpectedActor,input:{definitionHash:string;reason:string}) {
  const reason=reasonText(input.reason);
  return run(user,"project.approveLegacyPreset",`legacy:${legacyArtworkPreset.key}`,async(tx,actor)=>{
    if(input.definitionHash!==legacyArtworkPresetHash)throw new Error("The preset definition changed. Review its current stages before approval.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(19501, 15)::text`;
    const existing=await tx.legacyProjectPresetApproval.findFirst({where:{presetKey:legacyArtworkPreset.key,definitionHash:legacyArtworkPresetHash,revokedAt:null}});
    if(existing)throw new Error("This exact legacy preset already has an active approval.");
    const row=await tx.legacyProjectPresetApproval.create({data:{presetKey:legacyArtworkPreset.key,definitionHash:legacyArtworkPresetHash,definition:json(legacyArtworkPreset),approvedById:actor.userId,reason}});
    await event(tx,actor.userId,"LEGACY_PRESET_APPROVED",reason,{presetApprovalId:row.id},{definitionHash:row.definitionHash});
    return {approvalId:row.id};
  },reason);
}
export async function revokeLegacyArtworkPreset(user:ExpectedActor,input:{approvalId:string;reason:string}) {
  const reason=reasonText(input.reason);
  return run(user,"project.approveLegacyPreset",`legacy:${legacyArtworkPreset.key}`,async(tx,actor)=>{
    const result=await tx.legacyProjectPresetApproval.updateMany({where:{id:input.approvalId,presetKey:legacyArtworkPreset.key,revokedAt:null},data:{revokedAt:new Date(),revokedById:actor.userId,revocationReason:reason}});
    if(result.count!==1)throw new Error("The preset approval is unavailable or already revoked.");
    await event(tx,actor.userId,"LEGACY_PRESET_REVOKED",reason,{presetApprovalId:input.approvalId});
    return {approvalId:input.approvalId};
  },reason);
}
async function activate(tx:Tx,requestId:string,actor:AuthenticatedPrincipal,direct:boolean) {
  return runtimeAuthorization.runAuthorizedInTransaction(tx,{capability:direct?"project.create":"project.activateCreation",targetId:`creation:${requestId}`},async()=>{
    const row=await tx.projectCreationRequest.findUniqueOrThrow({where:{id:requestId}});
    const {configuration:c}=await validateStoredCreation(tx,row);
    let projectId:string,projectUrl:string;
    if(c.kind==="ARTWORK") {
      const tagIds=await resolveProjectTagIdsTx(tx,c.tags);
      const project=await tx.project.create({data:{name:c.name,description:c.description,executionType:c.executionType,ownerId:c.ownerId,createdById:row.requesterId,
        coOwners:{create:c.coOwnerIds.map(userId=>({userId,addedById:actor.userId}))},executors:{create:c.executorIds.map(userId=>({userId,addedById:actor.userId}))},
        tags:{create:tagIds.map(tagId=>({tagId}))},workflowStages:{create:getInitialProjectWorkflowStageData()},
      }});
      projectId=project.id;projectUrl=`/projects/${projectId}`;
      await ensureCanonicalProjectResearchWorkspaceTx(tx,projectId);
      for(const id of new Set([c.ownerId,...c.coOwnerIds,...c.executorIds]))await ensureProjectPrivateFolderTx(tx,projectId,id);
    }else{
      const project=await tx.flexibleProject.create({data:{name:c.name,description:c.description,scope:c.executionType,ownerId:c.ownerId,createdById:row.requesterId,slug:`project-${randomUUID()}`}});
      projectId=project.id;projectUrl=`/projects/flexible/${project.slug}`;
    }
    const result=await tx.projectCreationRequest.updateMany({where:{id:row.id,status:direct?"DRAFT":"APPROVED",activatedAt:null},data:{status:"ACTIVATED",activatedAt:new Date(),...(c.kind==="ARTWORK"?{projectId}:{flexibleProjectId:projectId})}});
    if(result.count!==1)throw new Error("This request has already been activated or changed.");
    await event(tx,actor.userId,direct?"PROJECT_CREATED_DIRECTLY":"APPROVED_PROJECT_ACTIVATED",direct?"Authorized direct project creation":"Activation of the immutable Director-approved request",{creationRequestId:row.id},{projectId,creatorId:row.requesterId,ownerId:c.ownerId,configurationHash:row.configurationHash});
    return {requestId:row.id,projectId,projectUrl,status:"ACTIVATED" as const};
  });
}
export async function submitProjectCreation(user:ExpectedActor,input:CreationDetails) {
  return run(user,"project.requestCreation","governance:creation",async(tx,actor)=>{
    if(!/^[a-zA-Z0-9_-]{12,100}$/.test(input.clientRequestId))throw new Error("A valid single-use submission identifier is required.");
    const configuration=await prepareCreation(tx,input,actor.userId,actor.businessRole!);
    const approvalId=input.presetApprovalId||null;
    if(approvalId&&configuration.kind!=="ARTWORK")throw new Error("The legacy Artwork approval cannot be used for another project type.");
    if(approvalId&&!await validPreset(tx,approvalId))throw new Error("The selected preset has no current approval.");
    const submitted=actor.businessRole==="JUNIOR_PROJECT_MANAGER";
    if(submitted&&configuration.kind!=="ARTWORK")throw new Error("JPM creation currently supports the Artwork workflow only.");
    const row=await tx.projectCreationRequest.create({data:{clientRequestId:input.clientRequestId,requesterId:actor.userId,requesterVersion:actor.authorizationVersion!,kind:configuration.kind,configuration:json(configuration),configurationHash:governanceHash(configuration),presetApprovalId:approvalId,status:submitted?"SUBMITTED":"DRAFT",expiresAt:expiry()}});
    await event(tx,actor.userId,submitted?"CREATION_REQUESTED":"DIRECT_CREATION_PREPARED",submitted?"Submitted to the Director approval inbox":"Configuration prepared for a direct creation policy check",{creationRequestId:row.id},{configurationHash:row.configurationHash});
    if(submitted)return {requestId:row.id,status:"SUBMITTED" as const};
    return activate(tx,row.id,actor,true);
  });
}
export async function decideProjectCreation(user:ExpectedActor,input:{requestId:string;configurationHash:string;decision:"APPROVE"|"REJECT";reason:string}) {
  const reason=reasonText(input.reason);
  return run(user,"project.decideCreation",`creation:${input.requestId}`,async(tx,actor)=>{
    const row=await tx.projectCreationRequest.findUniqueOrThrow({where:{id:input.requestId}});
    if(input.configurationHash!==row.configurationHash)throw new Error("The reviewed project configuration no longer matches this request.");
    if(!["APPROVE","REJECT"].includes(input.decision))throw new Error("Invalid creation decision.");
    if(input.decision==="APPROVE"){
      await validateStoredCreation(tx,row);
      if(row.presetApprovalId&&!await validPreset(tx,row.presetApprovalId))throw new Error("The selected preset approval was revoked or changed.");
    }
    const status=input.decision==="APPROVE"?"APPROVED":"REJECTED";
    const result=await tx.projectCreationRequest.updateMany({where:{id:row.id,status:"SUBMITTED"},data:{status,decidedById:actor.userId,decidedAt:new Date(),decisionReason:reason}});
    if(result.count!==1)throw new Error("This request already has a decision.");
    await event(tx,actor.userId,`CREATION_${status}`,reason,{creationRequestId:row.id},{configurationHash:row.configurationHash});
    return {requestId:row.id,status};
  },reason);
}
export async function activateApprovedProject(user:ExpectedActor,input:{requestId:string;configurationHash:string}) {
  return run(user,"project.activateCreation",`creation:${input.requestId}`,async(tx,actor)=>{
    const row=await tx.projectCreationRequest.findUniqueOrThrow({where:{id:input.requestId}});
    if(row.configurationHash!==input.configurationHash)throw new Error("The approved configuration does not match.");
    return activate(tx,row.id,actor,false);
  });
}
async function submitCompletion(tx:Tx,actor:AuthenticatedPrincipal,target:CompletionTarget,reason:string) {
  const evidence=await completionEvidence(tx,target);
  const snapshot=json(evidence.snapshot);
  const request=await tx.projectFinalCompletionRequest.create({data:{...(target.kind==="ARTWORK"?{projectId:target.projectId}:{flexibleProjectId:target.projectId}),requesterId:actor.userId,requesterVersion:actor.authorizationVersion!,snapshot,snapshotHash:governanceHash(snapshot),reason,expiresAt:expiry()}});
  await event(tx,actor.userId,"COMPLETION_REQUESTED",reason,{completionRequestId:request.id},{snapshotHash:request.snapshotHash});
  return request;
}
export async function requestProjectCompletion(user:ExpectedActor,target:CompletionTarget,reasonValue:string) {
  const reason=reasonText(reasonValue);
  return run(user,"project.requestCompletion",completionTargetId(target),async(tx,actor)=>{
    const request=await submitCompletion(tx,actor,target,reason);
    return {requestId:request.id,status:request.status};
  },reason);
}
async function finishCompletion(tx:Tx,actor:AuthenticatedPrincipal,input:{requestId:string;snapshotHash:string;decision:"APPROVE"|"REJECT";reason:string}) {
  const row=await tx.projectFinalCompletionRequest.findUniqueOrThrow({where:{id:input.requestId}});
  if(row.status!=="SUBMITTED"||row.snapshotHash!==input.snapshotHash||!["APPROVE","REJECT"].includes(input.decision))throw new Error("This completion request changed or already has a decision.");
  const target:CompletionTarget=row.projectId?{kind:"ARTWORK",projectId:row.projectId}:{kind:"FLEXIBLE",projectId:row.flexibleProjectId!};
  let completedAt:Date|undefined;
  if(input.decision==="APPROVE"){
    const requester=await tx.userAuthorization.findUnique({where:{userId:row.requesterId}});
    const evidence=await completionEvidence(tx,target);
    if(row.expiresAt<=new Date()||requester?.accountStatus!=="ACTIVE"||requester.authorizationVersion!==row.requesterVersion||!["DIRECTOR","SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER"].includes(requester.businessRole??"")||(requester.businessRole!=="DIRECTOR"&&evidence.ownerId!==row.requesterId)||governanceHash(evidence.snapshot)!==row.snapshotHash)throw new Error("Completion evidence or requester authority changed. Reject this request and submit a fresh one.");
    completedAt=await applyFinalCompletion(tx,target,actor.userId);
  }
  const status=input.decision==="APPROVE"?"APPROVED":"REJECTED";
  await tx.projectFinalCompletionRequest.update({where:{id:row.id},data:{status,decidedById:actor.userId,decidedAt:new Date(),decisionReason:input.reason,completedAt}});
  await event(tx,actor.userId,`COMPLETION_${status}`,input.reason,{completionRequestId:row.id},{snapshotHash:row.snapshotHash});
  if(completedAt)await event(tx,actor.userId,"PROJECT_COMPLETED",input.reason,{completionRequestId:row.id},{...target,completedAt});
  return {requestId:row.id,status,closedAt:completedAt?.toISOString(),duplicate:false as const};
}
export async function decideProjectCompletion(user:ExpectedActor,input:{requestId:string;snapshotHash:string;decision:"APPROVE"|"REJECT";reason:string}) {
  const reason=reasonText(input.reason);
  return run(user,"project.approveCompletion",`completion-request:${input.requestId}`,async(tx,actor)=>finishCompletion(tx,actor,{...input,reason}),reason);
}
export async function finalizeProjectAsDirector(user:ExpectedActor,target:CompletionTarget,reasonValue:string) {
  const reason=reasonText(reasonValue);
  return run(user,"project.finalize",completionTargetId(target),async(tx,actor)=>{
    const pending=await tx.projectFinalCompletionRequest.findFirst({where:{...(target.kind==="ARTWORK"?{projectId:target.projectId}:{flexibleProjectId:target.projectId}),status:"SUBMITTED"}});
    if(pending)throw new Error("Review the existing completion request before finalizing this project.");
    const request=await submitCompletion(tx,actor,target,reason);
    return runtimeAuthorization.runAuthorizedInTransaction(tx,{capability:"project.approveCompletion",targetId:`completion-request:${request.id}`,reason},async()=>finishCompletion(tx,actor,{requestId:request.id,snapshotHash:request.snapshotHash,decision:"APPROVE",reason}));
  },reason);
}

export async function getGovernanceWorkspace(user:ExpectedActor) {
  return run(user,"project.viewGovernance","governance:creation",async(tx,actor)=>{
    const director=actor.businessRole==="DIRECTOR";
    const [users,presets,creations,completions,proposals]=await Promise.all([
      tx.user.findMany({where:{authorization:{accountStatus:"ACTIVE",businessRole:{not:null}}},select:{id:true,name:true,email:true,authorization:{select:{businessRole:true}}},orderBy:{name:"asc"}}),
      tx.legacyProjectPresetApproval.findMany({where:{presetKey:legacyArtworkPreset.key,definitionHash:legacyArtworkPresetHash,revokedAt:null},select:{id:true,approvedAt:true,approvedBy:{select:{name:true,email:true}}}}),
      tx.projectCreationRequest.findMany({where:director?{}:{requesterId:actor.userId},include:{requester:{select:{name:true,email:true}},decidedBy:{select:{name:true,email:true}},flexibleProject:{select:{slug:true}}},orderBy:[{status:"asc"},{submittedAt:"desc"}],take:100}),
      tx.projectFinalCompletionRequest.findMany({where:director?{}:{requesterId:actor.userId,OR:[{project:{ownerId:actor.userId}},{flexibleProject:{ownerId:actor.userId}}]},include:{project:{select:{name:true}},flexibleProject:{select:{name:true,slug:true}},requester:{select:{name:true,email:true}},decidedBy:{select:{name:true,email:true}}},orderBy:[{status:"asc"},{submittedAt:"desc"}],take:100}),
      tx.projectTemplateProposal.findMany({where:director?{}:{requesterId:actor.userId},include:{requester:{select:{name:true,email:true}},decidedBy:{select:{name:true,email:true}}},orderBy:[{status:"asc"},{submittedAt:"desc"}],take:100}),
    ]);
    return {actorId:actor.userId,role:actor.businessRole!,users,presets,creations,completions,proposals,preset:legacyArtworkPreset,presetHash:legacyArtworkPresetHash,director:users.find(u=>u.authorization?.businessRole==="DIRECTOR")??null};
  });
}
export async function getCompletionPanel(user:ExpectedActor,target:CompletionTarget) {
  return run(user,"project.viewGovernance","governance:creation",async(tx,actor)=>{
    const project=target.kind==="ARTWORK"?await tx.project.findUnique({where:{id:target.projectId},select:{ownerId:true,completedAt:true,archivedAt:true}}):await tx.flexibleProject.findUnique({where:{id:target.projectId},select:{ownerId:true,completedAt:true}});
    if(!project||(actor.businessRole!=="DIRECTOR"&&project.ownerId!==actor.userId))return null;
    const pending=await tx.projectFinalCompletionRequest.findFirst({where:{...(target.kind==="ARTWORK"?{projectId:target.projectId}:{flexibleProjectId:target.projectId}),status:"SUBMITTED"},select:{id:true}});
    let blocker:string|null=null;
    if(!project.completedAt)try{await completionEvidence(tx,target);}catch(error){blocker=error instanceof Error?error.message:"Completion conditions are not satisfied.";}
    return {director:actor.businessRole==="DIRECTOR",completed:!!project.completedAt,archived:"archivedAt" in project&&!!project.archivedAt,pending:pending?.id??null,blocker};
  });
}

/** This records a proposal and its endorsement, never a publishable template. */
export async function submitTemplateProposal(user:ExpectedActor,input:{clientRequestId:string;title:string;changeKind:"CREATE"|"MODIFY";brief:string;reference?:string}) {
  return run(user,"template.createProposal","governance:templates",async(tx,actor)=>{
    if(!/^[a-zA-Z0-9_-]{12,100}$/.test(input.clientRequestId)||!["CREATE","MODIFY"].includes(input.changeKind))throw new Error("Invalid template proposal.");
    const title=reasonText(input.title),brief=reasonText(input.brief),reference=input.reference?.trim()||null;
    if(title.length>200||(reference&&reference.length>500))throw new Error("Proposal title or reference is too long.");
    if(input.changeKind==="MODIFY"&&!reference)throw new Error("Identify the existing template or preset you propose to modify.");
    const proposal={title,brief,changeKind:input.changeKind,reference};
    const row=await tx.projectTemplateProposal.create({data:{clientRequestId:input.clientRequestId,requesterId:actor.userId,requesterVersion:actor.authorizationVersion!,proposal,proposalHash:governanceHash(proposal),expiresAt:expiry()}});
    await event(tx,actor.userId,"TEMPLATE_PROPOSAL_SUBMITTED",brief,{templateProposalId:row.id},{proposalHash:row.proposalHash});
    return {proposalId:row.id,status:row.status};
  });
}
export async function decideTemplateProposal(user:ExpectedActor,input:{proposalId:string;proposalHash:string;decision:"APPROVE"|"REJECT";reason:string}) {
  const reason=reasonText(input.reason);
  return run(user,"template.decideProposal",`template-proposal:${input.proposalId}`,async(tx,actor)=>{
    const row=await tx.projectTemplateProposal.findUniqueOrThrow({where:{id:input.proposalId}});
    if(input.proposalHash!==row.proposalHash||!["APPROVE","REJECT"].includes(input.decision))throw new Error("The reviewed proposal does not match.");
    if(input.decision==="APPROVE"){
      const requester=await tx.userAuthorization.findUnique({where:{userId:row.requesterId}});
      if(row.expiresAt<=new Date()||governanceHash(row.proposal)!==row.proposalHash||requester?.accountStatus!=="ACTIVE"||requester.authorizationVersion!==row.requesterVersion||!["DIRECTOR","SENIOR_PROJECT_MANAGER"].includes(requester.businessRole??""))throw new Error("Proposal or proposer authority is stale. Request a fresh proposal.");
    }
    const status=input.decision==="APPROVE"?"APPROVED":"REJECTED";
    await tx.projectTemplateProposal.update({where:{id:row.id},data:{status,decidedById:actor.userId,decidedAt:new Date(),decisionReason:reason}});
    await event(tx,actor.userId,`TEMPLATE_PROPOSAL_${status}`,reason,{templateProposalId:row.id},{proposalHash:row.proposalHash,published:false});
    return {proposalId:row.id,status};
  },reason);
}

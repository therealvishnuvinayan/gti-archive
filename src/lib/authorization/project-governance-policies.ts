import "server-only";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { validPreset, validateStoredCreation } from "../project-governance/configuration";
import { legacyArtworkPreset } from "../project-governance/preset";
import { lockCompletionProject, parseCompletionTarget } from "../project-governance/completion";

type Loader = NonNullable<ResourcePolicies["project.create"]>;
const creationPolicy:Loader = async ({tx,actor,request}) => {
  const capability=request.capability, director=actor.businessRole==="DIRECTOR";
  if(!["DIRECTOR","SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole??""))return null;
  const context:AuthorizationContext={resource:{id:request.targetId,kind:"projectCreation"},resourcePermission:true,integrity:{workflowAllowed:true,actorUserId:actor.userId,preservesOwnership:true,preservesHistory:true}};
  if(capability==="project.viewGovernance"||capability==="project.requestCreation")return request.targetId==="governance:creation"?context:null;
  if(capability==="project.approveLegacyPreset")return director&&request.targetId===`legacy:${legacyArtworkPreset.key}`?context:null;
  const match=/^creation:([^:]+)$/.exec(request.targetId);if(!match)return null;
  await tx.$queryRaw`SELECT id FROM "ProjectCreationRequest" WHERE id = ${match[1]} FOR UPDATE`;
  const row=await tx.projectCreationRequest.findUnique({where:{id:match[1]}});if(!row)return null;
  if(capability==="project.decideCreation")return director&&row.status==="SUBMITTED"?context:null;
  if(capability==="project.create") {
    if(row.status!=="DRAFT"||row.requesterId!==actor.userId||(!director&&actor.businessRole!=="SENIOR_PROJECT_MANAGER"))return null;
  } else if(capability==="project.activateCreation") {
    if(row.status!=="APPROVED"||!row.decidedById||!row.decidedAt||(!director&&row.requesterId!==actor.userId))return null;
  } else return null;
  try {
    const {configuration}=await validateStoredCreation(tx,row);
    const approvedTemplate=await validPreset(tx,row.presetApprovalId);
    if(actor.businessRole==="SENIOR_PROJECT_MANAGER"&&!approvedTemplate)return null;
    if(row.presetApprovalId&&!approvedTemplate)return null;
    return {...context,approvedTemplate,directorApprovedCreation:row.status==="APPROVED",seniorProjectManagerCoOwner:configuration.coOwnerIds.length>0};
  } catch {return null;}
};
const completionPolicy:Loader=async({tx,actor,request})=>{
  let target;
  if(request.capability==="project.approveCompletion"){
    const match=/^completion-request:([^:]+)$/.exec(request.targetId);if(!match||actor.businessRole!=="DIRECTOR")return null;
    // Project first, then request: same lock order as request submission/finalize.
    const row=await tx.projectFinalCompletionRequest.findUnique({where:{id:match[1]}});if(!row||row.status!=="SUBMITTED")return null;
    target=row.projectId?{kind:"ARTWORK" as const,projectId:row.projectId}:{kind:"FLEXIBLE" as const,projectId:row.flexibleProjectId!};
    await lockCompletionProject(tx,target);
    await tx.$queryRaw`SELECT id FROM "ProjectFinalCompletionRequest" WHERE id = ${row.id} FOR UPDATE`;
    const current=await tx.projectFinalCompletionRequest.findUnique({where:{id:row.id}});if(current?.status!=="SUBMITTED")return null;
  }else{try{target=parseCompletionTarget(request.targetId);}catch{return null;}await lockCompletionProject(tx,target);}
  const project=target.kind==="ARTWORK"?await tx.project.findUnique({where:{id:target.projectId},select:{ownerId:true}}):await tx.flexibleProject.findUnique({where:{id:target.projectId},select:{ownerId:true}});
  if(!project)return null;
  const director=actor.businessRole==="DIRECTOR";
  if(!director&&(!["SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole??"")||project.ownerId!==actor.userId||request.capability!=="project.requestCompletion"))return null;
  return {resource:{id:request.targetId,kind:"project",projectId:target.projectId},project:{id:target.projectId,participantUserIds:project.ownerId?[project.ownerId]:[]},resourcePermission:true,finalCompletionRequiresDirectorApproval:true,integrity:{workflowAllowed:true,actorUserId:actor.userId,preservesOwnership:true,preservesHistory:true}};
};

const templateProposalPolicy: Loader = async ({tx,actor,request}) => {
  const director = actor.businessRole === "DIRECTOR";
  if (!director && actor.businessRole !== "SENIOR_PROJECT_MANAGER") return null;
  const context: AuthorizationContext = {resource:{id:request.targetId,kind:"template"},resourcePermission:true,publicationRequiresDirectorApproval:true,integrity:{workflowAllowed:true,actorUserId:actor.userId,preservesOwnership:true,preservesHistory:true}};
  if (request.capability === "template.createProposal") return request.targetId === "governance:templates" ? context : null;
  const match = /^template-proposal:([^:]+)$/.exec(request.targetId);
  if (!director || request.capability !== "template.decideProposal" || !match) return null;
  await tx.$queryRaw`SELECT id FROM "ProjectTemplateProposal" WHERE id = ${match[1]} FOR UPDATE`;
  const row = await tx.projectTemplateProposal.findUnique({where:{id:match[1]}});
  return row?.status === "SUBMITTED" ? context : null;
};

export const projectGovernancePolicies:ResourcePolicies={
  "project.requestCreation":creationPolicy,"project.create":creationPolicy,"project.decideCreation":creationPolicy,
  "project.activateCreation":creationPolicy,"project.approveLegacyPreset":creationPolicy,"project.viewGovernance":creationPolicy,
  "template.createProposal":templateProposalPolicy,"template.decideProposal":templateProposalPolicy,
  "project.requestCompletion":completionPolicy,"project.approveCompletion":completionPolicy,"project.finalize":completionPolicy,
};

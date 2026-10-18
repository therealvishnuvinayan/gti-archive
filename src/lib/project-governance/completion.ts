import "server-only";
import { assertCompletionDocumentEvidence } from "../completion-documents/evidence";
import type { Prisma, GovernedProjectKind } from "@prisma/client";
import { getWorkflowStageCompletionMode } from "../project-workflow";
import { isProjectStatusCompleted } from "../project-statuses";

export type CompletionTarget = {kind:GovernedProjectKind;projectId:string};
export function completionTargetId(target:CompletionTarget) { return `${target.kind}:${target.projectId}`; }
export function parseCompletionTarget(value:string):CompletionTarget {
  const [kind,projectId,...extra]=value.split(":");
  if (!["ARTWORK","FLEXIBLE"].includes(kind)||!projectId||extra.length) throw new Error("Invalid project target.");
  return {kind:kind as GovernedProjectKind,projectId};
}
export async function lockCompletionProject(tx:Prisma.TransactionClient,target:CompletionTarget) {
  if(target.kind==="ARTWORK")await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${target.projectId} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "FlexibleProject" WHERE id = ${target.projectId} FOR UPDATE`;
}
/** A stable snapshot of the evidence the Director is being asked to approve.
 * Unrelated comments do not alter readiness; workflow/participants/files do. */
export async function completionEvidence(tx:Prisma.TransactionClient,target:CompletionTarget) {
  await lockCompletionProject(tx,target);
  if(target.kind==="FLEXIBLE") {
    const p=await tx.flexibleProject.findUniqueOrThrow({where:{id:target.projectId},include:{milestones:{orderBy:{id:"asc"}},attachments:{orderBy:{id:"asc"},select:{id:true,status:true,updatedAt:true,milestoneId:true}}}});
    if(p.completedAt||p.status==="COMPLETED")throw new Error("Project is already completed.");
    if(!p.milestones.length||p.milestones.some(m=>m.status!=="COMPLETED"||!m.completedAt||!m.completedById))throw new Error("Every milestone must be completed with its actual completer recorded.");
    if(p.attachments.some(a=>a.status==="UPLOADING"))throw new Error("Finish or cancel pending uploads before completion.");
    return {ownerId:p.ownerId,snapshot:p};
  }
  const p=await tx.project.findUniqueOrThrow({where:{id:target.projectId},include:{
    status:{include:{group:true}},closure:true,
    coOwners:{orderBy:{userId:"asc"}},executors:{orderBy:{userId:"asc"}},
    workflowStages:{orderBy:{stageKey:"asc"}},stages:{orderBy:{id:"asc"},select:{id:true,status:true,updatedAt:true}},
    productionUnits:{orderBy:{id:"asc"},include:{
      supervision:{include:{sampleRounds:{orderBy:{sequence:"asc"},include:{evaluations:{orderBy:{id:"asc"}},evidence:{orderBy:{id:"asc"}},participants:{orderBy:{userId:"asc"}}}}}},
      approvalSteps:{orderBy:{sequence:"asc"},select:{id:true,sequence:true,status:true,removedAt:true,decidedAt:true,decidedByUserId:true,isMarketingDirectorRequired:true,selectedFileIds:true,updatedAt:true}},
      files:{orderBy:{id:"asc"},include:{attachment:{select:{id:true,projectId:true,status:true,updatedAt:true}}}},
      sourceAttachment:{select:{id:true,projectId:true,status:true,updatedAt:true}},
      sourceHandoff:true,
      sourceChecklist:{include:{items:{orderBy:{id:"asc"},include:{attachments:{orderBy:{attachmentId:"asc"}}}}}},
      handover:{select:{id:true,selectedFileIds:true,deliveryStatus:true,handedOverById:true,updatedAt:true}},
    }},
    completionWorkflow:{include:{documents:{orderBy:{id:"asc"}}}},
    attachments:{orderBy:{id:"asc"},select:{id:true,status:true,updatedAt:true,stageId:true}},
  }});
  if(p.completedAt||p.archivedAt||p.closure||isProjectStatusCompleted(p.status))throw new Error("Completed or archived projects cannot be finalized again.");
  if(getWorkflowStageCompletionMode(p.workflowStages,"IMPLEMENTATION_AND_SUPERVISION")!=="TRANSITION")throw new Error("Artwork must reach the valid Stage 7 completion transition.");
  if(!p.productionUnits.length||p.productionUnits.some(unit=>!["HANDOVER_READY","HANDED_OVER"].includes(unit.status)||unit.supervision?.status!=="SIGNED_OFF"||!unit.supervision.signedOffAt||!unit.supervision.signedOffById))throw new Error("Every production unit must be ready and have its signed-off supervision evidence.");
  if(p.productionUnits.some(unit=>unit.approvalSteps.some(step=>!step.removedAt&&step.status!=="APPROVED")))throw new Error("Production approval decisions are still outstanding.");
  const invalidProductionEvidence = p.productionUnits.some(unit =>
    unit.supervision?.projectId !== p.id ||
    unit.sourceAttachment.projectId !== p.id || unit.sourceAttachment.status !== "READY" ||
    unit.sourceHandoff.projectId !== p.id || unit.sourceHandoff.sourceAttachmentId !== unit.sourceAttachmentId ||
    unit.sourceChecklist.projectId !== p.id || unit.sourceChecklist.sourceAttachmentId !== unit.sourceAttachmentId ||
    unit.sourceChecklist.handoffId !== unit.sourceHandoffId ||
    unit.files.some(file => file.attachment.projectId !== p.id || file.attachment.status !== "READY"),
  );
  if (invalidProductionEvidence) throw new Error("Production evidence is missing, unfinished or belongs to another project.");
  if(p.stages.some(stage=>stage.status!=="COMPLETED")||p.attachments.some(a=>a.status==="UPLOADING"))throw new Error("Native tasks or uploads remain unfinished.");
  const w=p.completionWorkflow;
  if(!w&&p.executionType!=="INTERNAL")throw new Error("Configure and resolve the existing completion document requirements before final completion.");
  const completionDocumentVerification = w ? await assertCompletionDocumentEvidence(tx,w) : [];
  return {ownerId:p.ownerId,snapshot:{...p,completionDocumentVerification}};
}
export async function applyFinalCompletion(tx:Prisma.TransactionClient,target:CompletionTarget,actorId:string) {
  await completionEvidence(tx,target);
  const now=new Date();
  if(target.kind==="FLEXIBLE")await tx.flexibleProject.update({where:{id:target.projectId},data:{status:"COMPLETED",completedAt:now}});
  else {
    await tx.projectClosure.create({data:{projectId:target.projectId,closedById:actorId,closedAt:now}});
    await tx.projectWorkflowStage.update({where:{projectId_stageKey:{projectId:target.projectId,stageKey:"IMPLEMENTATION_AND_SUPERVISION"}},data:{status:"COMPLETED",completedAt:now}});
    await tx.project.update({where:{id:target.projectId},data:{completedAt:now}});
    const { disableProjectRequestReminders } = await import("../request-reminders");
    await disableProjectRequestReminders(tx,{projectId:target.projectId,stage:"SEVEN",now});
  }
  return now;
}

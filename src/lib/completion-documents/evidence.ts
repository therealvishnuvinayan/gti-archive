import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, ProjectCompletionDocumentType, ProjectCompletionWorkflow } from "@prisma/client";
import { getObjectMetadata } from "@/lib/storage/s3";
import { assertCompletionApprovalAccepted } from "@/lib/approvals/service";
import { assertCompletionFileObservation } from "@/lib/files/completion-adapter";

export const completionStep = {
  AUTHORITY_APPROVAL_PROOF: "approval", COPYRIGHT_TRANSFER: "copyright", INVOICE: "invoice",
} as const;

export function stepState(workflow: ProjectCompletionWorkflow, type: ProjectCompletionDocumentType) {
  const prefix = completionStep[type];
  if (!prefix) throw new Error("Invalid completion document type.");
  return { required: workflow[`${prefix}Required`], status: workflow[`${prefix}Status`], requestedAt: workflow[`${prefix}RequestedAt`] };
}

export async function completionDocumentEvidenceHash(tx: Prisma.TransactionClient, workflow: ProjectCompletionWorkflow, type: ProjectCompletionDocumentType) {
  const state = stepState(workflow, type);
  const ids = type === "AUTHORITY_APPROVAL_PROOF" ? workflow.approvalSelectedProjectFileIds : [];
  const files = await tx.projectAttachment.findMany({ where: { id: { in: ids }, projectId: workflow.projectId, status: "READY" },
    orderBy: { id: "asc" }, select: { id: true, storageKey: true, bucket: true, mimeType: true, fileSize: true, updatedAt: true } });
  if (files.length !== ids.length || (type === "AUTHORITY_APPROVAL_PROOF" && !ids.length)) throw new Error("Authority approval requires current final files from this project.");
  const sourceEvidence = await Promise.all(files.map(async file => {
    const object = await getObjectMetadata(file.storageKey, file.bucket);
    if (object.ContentLength !== file.fileSize || object.ContentType !== file.mimeType || !object.ETag) throw new Error("Final approval source file is missing or invalid.");
    return { ...file, etag: object.ETag };
  }));
  const production = type === "AUTHORITY_APPROVAL_PROOF" ? await tx.projectProductionUnit.findMany({
    where: { projectId: workflow.projectId }, orderBy: { id: "asc" },
    select: { id: true, sourceAttachmentId: true, sourceChecklistId: true, sourceHandoffId: true, files: { orderBy: { attachmentId: "asc" }, select: { attachmentId: true } } },
  }) : [];
  return createHash("sha256").update(JSON.stringify({ type, projectId: workflow.projectId, workflowId: workflow.id, requestedAt: state.requestedAt, files: sourceEvidence, production })).digest("hex");
}

/** One readiness rule shared by document operations and final governance. Legacy
 * accepted documents are retained; new documents must have an accepted submission. */
export async function assertCompletionDocumentEvidence(tx: Prisma.TransactionClient, workflow: ProjectCompletionWorkflow) {
  const documents = await tx.projectCompletionDocument.findMany({ where: { workflowId: workflow.id }, include: { submission: true }, orderBy: { uploadedAt: "desc" } });
  const verified: Array<{ documentId: string; etag: string; fileSize: number; mimeType: string }> = [];
  for (const type of Object.keys(completionStep) as ProjectCompletionDocumentType[]) {
    const state = stepState(workflow, type);
    if (state.required === null || (state.required && state.status !== "COMPLETED") || state.status === "PENDING") throw new Error("Mandatory completion requirements or document evidence remain unresolved.");
    if (!state.required) continue;
    const document = documents.find(d => d.type === type && d.projectId === workflow.projectId && (!d.submission || d.submission.requestTime.getTime() === state.requestedAt?.getTime()));
    if (!document) throw new Error("Mandatory completion document is missing.");
    const metadata = await getObjectMetadata(document.storageKey, document.bucket);
    if (!metadata.ETag || metadata.ContentLength !== document.fileSize || metadata.ContentType !== document.mimeType) throw new Error("Accepted completion object is missing or invalid.");
    if (document.submissionId) {
      const s = document.submission;
      if (!s || s.status !== "ACCEPTED" || !s.reviewedById || !s.reviewedAt || !s.uploadedAt || !s.objectETag ||
        s.projectId !== document.projectId || s.workflowId !== document.workflowId || s.type !== type || s.storageKey !== document.storageKey ||
        s.evidenceHash !== await completionDocumentEvidenceHash(tx, workflow, type)) throw new Error("Accepted completion evidence is invalid or stale; a reviewed revision is required.");
      if (metadata.ETag !== s.objectETag || metadata.ContentLength !== s.fileSize || metadata.ContentType !== s.mimeType) throw new Error("Accepted completion object is missing or has changed.");
      await assertCompletionFileObservation(tx, s.id, metadata);
      await assertCompletionApprovalAccepted(tx, s.id);
    }
    verified.push({ documentId: document.id, etag: metadata.ETag, fileSize: document.fileSize, mimeType: document.mimeType });
  }
  return verified;
}

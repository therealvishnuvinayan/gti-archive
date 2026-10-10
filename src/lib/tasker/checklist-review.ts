import { randomUUID } from "node:crypto";
import { Prisma, type ProjectFileChecklistRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PermissionUser } from "@/lib/permissions/resolver";
import { getStageFiveFieldDefinition } from "@/lib/stage-five-fields";
import { validateStageFiveChecklistResponse, type StageFiveChecklistRequestData, type StageFiveChecklistValue } from "@/lib/stage-five";
import { copyStoredObject, getObjectMetadata } from "@/lib/storage/s3";
import { assertTaskParticipant, getTaskProjectAdapter, type ProjectTaskContext, type TaskDb } from "./adapters";
import { TaskerError, taskAssert } from "./errors";
import { lockTaskerProject } from "./field-changes";
import { fieldToken, taskTransaction } from "./service";
import { readTaskFile, taskFileReaders, type TaskFileAccessMode } from "./file-access";

export const activeChecklistStatuses = ["REQUESTED", "ACCEPTED", "IN_REVIEW", "CORRECTIONS_REQUESTED"] as const;
type ResponseFile = { id: string; sourceAttachmentId: string; name: string; mimeType: string; size: number; bucket: string; storageKey: string };
const responseFiles = (value: Prisma.JsonValue) => value as unknown as ResponseFile[];
const label = (user: { name: string | null; email: string }) => user.name || user.email;
export const checklistReviewStorage = { copy: copyStoredObject, metadata: getObjectMetadata };

export async function loadChecklistReview(db: TaskDb, user: PermissionUser, requestId: string) {
  const request = await db.projectFileChecklistRequest.findFirst({ where: { id: requestId, channel: "IN_APP", recipientUserId: { not: null } }, include: {
    requestedBy: true, recipientUser: true, checklist: { include: { sourceAttachment: true } },
    responses: { include: { submittedBy: true, reviewedBy: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  } });
  taskAssert(request?.recipientUser, "This information request is unavailable.", 404);
  const context = await getTaskProjectAdapter("STRUCTURED").load(db, request.projectId);
  // Existing internal requests may have been sent to project collaborators.
  // Keep that scoped compatibility; it does not add them to universal Tasker.
  const collaborators = await db.projectCollaborator.findMany({ where: { projectId: request.projectId }, select: { user: { select: { id: true, name: true, email: true } } } });
  for (const { user: person } of collaborators) if (!context.people.some((p) => p.id === person.id)) context.people.push({ id: person.id, label: label(person) });
  assertTaskParticipant(context, user.id);
  taskAssert([request.requestedById, request.recipientUserId, context.ownerId].includes(user.id), "This information request is unavailable.", 404);
  const target = context.fields.find((f) => f.id === `checklist:${request.checklistId}:${request.fieldKey}`);
  taskAssert(target, "The checklist field is no longer available.", 409);
  return { request, context, target };
}

export async function captureChecklistTargetToken(db: TaskDb, projectId: string, checklistId: string, fieldKey: string) {
  const context = await getTaskProjectAdapter("STRUCTURED").load(db, projectId);
  const target = context.fields.find((f) => f.id === `checklist:${checklistId}:${fieldKey}`);
  taskAssert(target, "The checklist field is no longer available.", 409);
  return fieldToken(target);
}

export async function notifyChecklistReview(db: TaskDb, request: ProjectFileChecklistRequest, context: ProjectTaskContext, actorId: string, action: string, eventId: string) {
  for (const userId of new Set([request.requestedById, request.recipientUserId])) {
    if (!userId || userId === actorId || !context.people.some((p) => p.id === userId)) continue;
    const dedupeKey = `checklist-review:${eventId}:${userId}`, subject = `Information request ${action}`;
    const message = `An information request in ${context.name} was updated. Open it to see the submission and review.`;
    await db.notification.create({ data: { userId, type: action === "completed" ? "CHECKLIST_INFORMATION_COMPLETED" : action === "declined" ? "CHECKLIST_INFORMATION_DECLINED" : "TASKER_UPDATED", title: subject, message, entityType: "CHECKLIST_REQUEST", entityId: request.id, projectId: request.projectId, url: `/requests/checklist/${request.id}`, dedupeKey } });
    await db.taskerDelivery.create({ data: { checklistRequestId: request.id, userId, dedupeKey, subject, message } });
  }
}

export async function checklistReviewData(user: PermissionUser, requestId: string): Promise<StageFiveChecklistRequestData | null> {
  try {
    return await prisma.$transaction(async (db) => {
      const { request, context, target } = await loadChecklistReview(db, user, requestId);
      const field = getStageFiveFieldDefinition(request.fieldKey)!;
      const latest = request.responses[0], canReview = request.requestedById === user.id && request.workflowStatus === "IN_REVIEW";
      const file = request.checklist.sourceAttachment;
      const toFile = (f: ResponseFile) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size });
      // Completed requests from before this migration retain their existing response.
      const legacyItem = !latest && request.workflowStatus === "COMPLETED" ? await db.projectFileChecklistItem.findUnique({ where: { id: request.checklistItemId }, include: { attachments: { include: { attachment: true } } } }) : null;
      return {
        id: request.id, project: { id: context.projectId, name: context.name }, handoffId: request.checklist.handoffId,
        file: { id: file.id, name: file.originalFileName, mimeType: file.mimeType, size: file.fileSize }, field, message: request.message, status: request.workflowStatus,
        requestedAt: request.requestedAt.toISOString(), acceptedAt: request.acceptedAt?.toISOString() ?? null, completedAt: request.completedAt?.toISOString() ?? null,
        declinedAt: request.declinedAt?.toISOString() ?? null, declineReason: request.declineReason,
        requestedBy: { id: request.requestedById, name: label(request.requestedBy) }, recipient: { id: request.recipientUser!.id, name: label(request.recipientUser!) },
        respondedBy: latest ? { id: latest.submittedById, name: label(latest.submittedBy) } : null,
        response: { value: (latest?.value ?? legacyItem?.value ?? {}) as StageFiveChecklistValue, attachments: latest ? responseFiles(latest.files).map(toFile) : legacyItem?.attachments.map(({ attachment: f }) => ({ id: f.id, name: f.originalFileName, mimeType: f.mimeType, size: f.fileSize })) ?? [] },
        canRespond: user.id === request.recipientUserId, canReview,
        canOpenStage: context.ownerId === user.id || context.coOwnerIds.includes(user.id),
        hasConflict: canReview && request.targetToken !== fieldToken(target), conflictToken: canReview ? fieldToken(target) : null,
        currentValue: canReview ? target.draftValues?.length ? { saved: target.value, unsaved: target.draftValues } : target.value : null,
        submissions: request.responses.map((s) => ({ id: s.id, value: s.value as StageFiveChecklistValue, attachments: responseFiles(s.files).map(toFile), status: s.status, submittedAt: s.createdAt.toISOString(), submittedBy: label(s.submittedBy), reviewedBy: s.reviewedBy ? label(s.reviewedBy) : null, reviewNote: s.reviewNote, reviewedAt: s.reviewedAt?.toISOString() ?? null })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  } catch (error) { if (error instanceof TaskerError && [403, 404, 409].includes(error.status)) return null; throw error; }
}

export async function submitChecklistForReview(user: PermissionUser, input: { requestId: string; value: StageFiveChecklistValue; attachmentIds: string[] }, store = checklistReviewStorage) {
  try {
    const initial = await loadChecklistReview(prisma, user, input.requestId);
    taskAssert(initial.request.recipientUserId === user.id, "Only the recipient can submit this response.", 403);
    taskAssert(["ACCEPTED", "CORRECTIONS_REQUESTED"].includes(initial.request.workflowStatus), "Accept this request before submitting a response, or wait for its review.", 409);
    taskAssert(Array.isArray(input.attachmentIds) && input.attachmentIds.length <= 20 && input.attachmentIds.every((id) => typeof id === "string"), "Select up to 20 files.");
    const ids = [...new Set(input.attachmentIds)], validated = validateStageFiveChecklistResponse(initial.request.fieldKey, input.value, ids);
    if ("error" in validated) return validated;
    const files = await prisma.projectAttachment.findMany({ where: { id: { in: ids }, projectId: initial.request.projectId, uploadedById: user.id, status: "READY", assetType: "FILE_CHECKLIST_ATTACHMENT", checklistResponseRequestId: input.requestId, fileChecklistItems: { none: {} } } });
    taskAssert(files.length === ids.length, "One or more response files are invalid or belong to another request.");
    const responseId = randomUUID(), snapshots: ResponseFile[] = [];
    for (const file of files) {
      const id = randomUUID(), storageKey = `tasker/checklist-responses/${responseId}/${id}`;
      await store.copy({ sourceBucket: file.bucket, sourceKey: file.storageKey, bucket: file.bucket, storageKey });
      const metadata = await store.metadata(storageKey, file.bucket);
      taskAssert(metadata.ContentLength === file.fileSize && metadata.ContentType === file.mimeType, "The submitted file failed verification.");
      snapshots.push({ id, sourceAttachmentId: file.id, name: file.originalFileName, mimeType: file.mimeType, size: file.fileSize, bucket: file.bucket, storageKey });
    }
    return await taskTransaction(async (db) => {
      await lockTaskerProject(db, initial.request.projectId);
      const { request, context } = await loadChecklistReview(db, user, input.requestId);
      taskAssert(request.recipientUserId === user.id && ["ACCEPTED", "CORRECTIONS_REQUESTED"].includes(request.workflowStatus) && request.updatedAt.getTime() === initial.request.updatedAt.getTime(), "This information request changed before the response was submitted.", 409);
      const unchanged = await db.projectAttachment.count({ where: { id: { in: ids }, status: "READY", uploadedById: user.id, checklistResponseRequestId: request.id, fileChecklistItems: { none: {} } } });
      taskAssert(unchanged === ids.length, "An attachment changed during submission.", 409);
      await db.projectFileChecklistResponse.create({ data: { id: responseId, requestId: request.id, submittedById: user.id, value: validated.value, files: snapshots as unknown as Prisma.InputJsonValue } });
      await db.projectFileChecklistRequest.update({ where: { id: request.id }, data: { workflowStatus: "IN_REVIEW", respondedByUserId: user.id, responseSource: "AUTHENTICATED_USER" } });
      // Awaiting-review responses do not need recipient reminders.
      await db.requestReminder.updateMany({ where: { stageFiveRequestId: request.id }, data: { nextReminderAt: null, processingToken: null, processingStartedAt: null } });
      await notifyChecklistReview(db, request, context, user.id, "awaiting review", responseId);
      return { status: "IN_REVIEW" as const, projectId: request.projectId, handoffId: request.checklist.handoffId };
    });
  } catch (error) { if (error instanceof TaskerError) return { error: error.message }; throw error; }
}

export type ChecklistReviewInput = { requestId: string; submissionId: string; action: "ACCEPT" | "CORRECTIONS" | "REJECT"; note?: string; conflictToken?: string };
export async function reviewChecklistResponse(user: PermissionUser, input: ChecklistReviewInput, store = checklistReviewStorage) {
  try {
    taskAssert(["ACCEPT", "CORRECTIONS", "REJECT"].includes(input.action), "Choose a review action.");
    taskAssert(typeof (input.note ?? "") === "string" && (input.note?.length ?? 0) <= 20000, "Enter a review note up to 20000 characters.");
    taskAssert(input.action === "ACCEPT" || input.note?.trim(), "Explain the rejection or requested corrections.");
    const published = new Map<string, string>();
    if (input.action === "ACCEPT") {
      const { request, target } = await loadChecklistReview(prisma, user, input.requestId);
      const submission = request.responses[0];
      taskAssert(request.requestedById === user.id, "Only the task owner can review this response.", 403);
      taskAssert(request.workflowStatus === "IN_REVIEW" && submission?.id === input.submissionId, "The submission changed. Refresh before reviewing it.", 409);
      taskAssert(request.targetToken === fieldToken(target) || input.conflictToken === fieldToken(target), "The field changed. Review the current value and explicitly confirm replacement.", 409);
      for (const file of responseFiles(submission.files)) {
        const key = `tasker/checklist-published/${randomUUID()}`;
        await store.copy({ sourceBucket: file.bucket, sourceKey: file.storageKey, bucket: file.bucket, storageKey: key });
        const metadata = await store.metadata(key, file.bucket);
        taskAssert(metadata.ContentLength === file.size && metadata.ContentType === file.mimeType, "The published file failed verification.", 409);
        published.set(file.id, key);
      }
    }
    return await taskTransaction(async (db) => {
      const initial = await db.projectFileChecklistRequest.findUnique({ where: { id: input.requestId }, select: { projectId: true } });
      taskAssert(initial, "Request not found.", 404);
      await lockTaskerProject(db, initial.projectId);
      const { request, context, target } = await loadChecklistReview(db, user, input.requestId);
      taskAssert(request.requestedById === user.id, "Only the task owner can review this response.", 403);
      const submission = request.responses[0];
      taskAssert(request.workflowStatus === "IN_REVIEW" && submission?.id === input.submissionId && submission.status === "IN_REVIEW", "The submission changed. Refresh before reviewing it.", 409);
      if (input.action === "ACCEPT") {
        taskAssert(request.targetToken === fieldToken(target) || input.conflictToken === fieldToken(target), "The field changed. Review the current value and explicitly confirm replacement.", 409);
        const files = responseFiles(submission.files), validated = validateStageFiveChecklistResponse(request.fieldKey, submission.value as StageFiveChecklistValue, files.map((f) => f.id));
        if ("error" in validated) return validated;
        for (const file of files) {
          taskAssert(published.has(file.id), "The prepared response changed. Refresh before reviewing it.", 409);
          await db.projectAttachment.create({ data: { id: file.id, projectId: request.projectId, uploadedById: submission.submittedById, fileName: file.name, originalFileName: file.name, mimeType: file.mimeType, fileSize: file.size, bucket: file.bucket, storageKey: published.get(file.id)!, status: "READY", assetType: "FILE_CHECKLIST_ATTACHMENT" } });
        }
        await getTaskProjectAdapter("STRUCTURED").apply(db, context, target, validated.value, files, user.id, `checklist:${request.id}:${submission.id}`);
      }
      const status = input.action === "ACCEPT" ? "COMPLETED" : input.action === "CORRECTIONS" ? "CORRECTIONS_REQUESTED" : "REJECTED";
      const now = new Date();
      await db.projectFileChecklistResponse.update({ where: { id: submission.id }, data: { status, reviewedById: user.id, reviewedAt: now, reviewNote: input.note?.trim() ?? "" } });
      await db.projectFileChecklistRequest.update({ where: { id: request.id }, data: { workflowStatus: status, ...(status === "COMPLETED" ? { completedAt: now } : {}) } });
      if (status === "REJECTED") await db.projectFileChecklistItem.updateMany({ where: { id: request.checklistItemId, status: "REQUESTED" }, data: { status: "PENDING" } });
      if (status !== "CORRECTIONS_REQUESTED") await db.requestReminder.updateMany({ where: { stageFiveRequestId: request.id }, data: { enabled: false, nextReminderAt: null, stoppedAt: now, processingToken: null, processingStartedAt: null } });
      else {
        const reminder = await db.requestReminder.findUnique({ where: { stageFiveRequestId: request.id } });
        if (reminder?.enabled) await db.requestReminder.update({ where: { id: reminder.id }, data: { nextReminderAt: new Date(now.getTime() + reminder.intervalHours * 3600000) } });
      }
      await notifyChecklistReview(db, request, context, user.id, status.toLowerCase().replaceAll("_", " "), `${submission.id}:${status}`);
      return { status, projectId: request.projectId, handoffId: request.checklist.handoffId };
    });
  } catch (error) { if (error instanceof TaskerError) return { error: error.message }; throw error; }
}

export async function checklistResponseFileAccess(user: PermissionUser, requestId: string, responseId: string, fileId: string, mode: TaskFileAccessMode, readers = taskFileReaders) {
  const { request } = await loadChecklistReview(prisma, user, requestId);
  const response = request.responses.find((s) => s.id === responseId);
  const file = response && responseFiles(response.files).find((f) => f.id === fileId);
  taskAssert(file, "File not found.", 404);
  return readTaskFile({ ...file, originalFileName: file.name, fileSize: file.size }, mode, readers);
}

export async function respondToChecklistAssignment(user: PermissionUser, requestId: string, action: "ACCEPT" | "DECLINE", reason = "") {
  try {
    return await taskTransaction(async (db) => {
      const initial = await db.projectFileChecklistRequest.findUnique({ where: { id: requestId }, select: { projectId: true } });
      taskAssert(initial, "This information request is unavailable.", 404);
      await lockTaskerProject(db, initial.projectId);
      const { request, context } = await loadChecklistReview(db, user, requestId);
      taskAssert(request.recipientUserId === user.id, "Only the recipient can respond to this request.", 403);
      if (action === "ACCEPT" && request.workflowStatus === "ACCEPTED") return { status: request.workflowStatus, projectId: request.projectId, handoffId: request.checklist.handoffId };
      taskAssert(action === "ACCEPT" ? request.workflowStatus === "REQUESTED" : ["REQUESTED", "ACCEPTED", "CORRECTIONS_REQUESTED"].includes(request.workflowStatus), "This request can no longer be accepted or declined.", 409);
      taskAssert(action === "ACCEPT" || reason.trim(), "Explain why this request is declined.");
      const status = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
      await db.projectFileChecklistRequest.update({ where: { id: requestId }, data: { workflowStatus: status, ...(action === "ACCEPT" ? { acceptedAt: new Date() } : { declinedAt: new Date(), declineReason: reason }) } });
      if (action === "DECLINE") {
        await db.requestReminder.updateMany({ where: { stageFiveRequestId: requestId }, data: { enabled: false, nextReminderAt: null, stoppedAt: new Date(), processingToken: null, processingStartedAt: null } });
        await db.projectFileChecklistItem.updateMany({ where: { id: request.checklistItemId, status: "REQUESTED" }, data: { status: "PENDING" } });
      }
      await notifyChecklistReview(db, request, context, user.id, status.toLowerCase(), `${request.id}:${status}`);
      return { status, projectId: request.projectId, handoffId: request.checklist.handoffId };
    });
  } catch (error) { if (error instanceof TaskerError) return { error: error.message }; throw error; }
}

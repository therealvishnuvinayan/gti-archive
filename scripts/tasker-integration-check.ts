import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createTask, getTaskCreateOptions, getTaskDetail, listTasks, mutateTask } from "@/lib/tasker/service";
import { getTaskProjectAdapter, validateTaskFieldValue } from "@/lib/tasker/adapters";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
import { taskFileDownload, requestTaskUpload, finalizeTaskUpload, prepareAcceptedTaskFiles, type TaskerStorage } from "@/lib/tasker/files";
import { getProjectFormDraft, saveProjectFormDraft } from "@/lib/project-form-drafts";
import { applyFieldPatches, checkTaskerFormRevision } from "@/lib/tasker/field-changes";
import { updateFlexibleMilestone } from "@/lib/flexible-projects";
import { getProjectResearchFolderPageData } from "@/lib/project-research";
import type { TaskCreateInput, TaskMutation, TaskProjectRef } from "@/lib/tasker/types";
import type { PermissionUser } from "@/lib/permissions/resolver";

async function main() {
  const [owner, coOwner, executor, executor2, outsider, admin] = await Promise.all(["owner", "co-owner", "executor", "executor-2", "outsider", "global-admin"].map((name) => prisma.user.create({ data: { name, email: `${name}@tasker.example.test`, passwordHash: "test-only", role: name === "global-admin" || name === "owner" ? "ADMIN" : "USER" } })));
  const project = await prisma.project.create({ data: { name: "Tasker structured", ownerId: owner.id, createdById: owner.id, coOwners: { create: { userId: coOwner.id } }, executors: { create: [{ userId: executor.id }, { userId: executor2.id }] }, inquiry: { create: { legalNotes: "Original", deadline: new Date("2026-11-01") } }, workflowStages: { create: [{ stageKey: "PROJECT_INQUIRY", status: "COMPLETED", completedAt: new Date() }, { stageKey: "CONCEPT_CREATION", status: "LOCKED" }] } } });
  const ref: TaskProjectRef = { projectId: project.id, projectType: "STRUCTURED" };
  const options = await getTaskCreateOptions(owner, ref);
  const legalField = options.fields.find((f) => f.id.endsWith(":legalNotes"))!;
  assert(legalField);
  assert(!options.fields.some((f) => /approvedAt|status|ownerId|decided/i.test(f.id)), "Approval and permission fields must not be delegated");
  assert.equal((await getTaskCreateOptions(executor, ref)).stages.length, 0);
  await assert.rejects(getTaskCreateOptions(outsider, ref), /not available/);
  await assert.rejects(getTaskCreateOptions(admin, ref), /not available/);

  const base: TaskCreateInput = { ...ref, kind: "FIELD_INPUT", title: "Provide legal notes", brief: "Provide the current text", assigneeId: executor.id, targetId: legalField.id };
  const raced = await Promise.allSettled([createTask(owner, base), createTask(owner, base)]);
  assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1, `Concurrent requests must reserve one active target: ${raced.map((r) => r.status === "rejected" ? String(r.reason) : "created").join("; ")}`);
  const taskId = (raced.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
  async function act(actor: PermissionUser, id: string, action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) {
    const task = await getTaskDetail(actor, id);
    return mutateTask(actor, id, { action, version: task.version, ...extra });
  }
  assert.equal((await listTasks(owner)).length, 1);
  assert.equal((await listTasks(coOwner)).length, 0, "Project co-owner does not automatically see other tasks");
  await assert.rejects(getTaskDetail(coOwner, taskId), /not found/);
  await assert.rejects(getTaskDetail(admin, taskId), /not found/);
  await assert.rejects(taskFileDownload(outsider, taskId, "invented"), /not found/);
  await assert.rejects(requestTaskUpload(outsider, taskId, { name: "a.pdf", mimeType: "application/pdf", size: 3 }), /not found/);
  const received = await getTaskDetail(executor, taskId);
  assert.equal(received.stageLabel, undefined);
  assert.equal(received.field?.stageRef, "");
  assert.deepEqual(received.people, []);
  assert.equal(received.currentValue, null);
  assert.equal(received.canReview, false);
  await assert.rejects(act(executor, taskId, "ACCEPT"), /owner or task co-owner/);

  await saveProjectFormDraft(owner, { projectId: project.id, formKey: "stage-one-project-inquiry", payload: { legalNotes: "Old unsaved notes", initialBrief: "Keep unrelated draft" }, clientId: "test", clientRevision: 1 });
  await act(executor, taskId, "START");
  await act(executor, taskId, "SUBMIT", { value: "<p>Accepted legal notes</p>", note: "Please review" });
  assert.equal((await prisma.projectInquiry.findUniqueOrThrow({ where: { projectId: project.id } })).legalNotes, "Original", "Submission alone cannot fill the field");
  await prisma.projectInquiry.update({ where: { projectId: project.id }, data: { legalNotes: "Edited while pending" } });
  await assert.rejects(act(owner, taskId, "ACCEPT"), /field changed/);
  const conflicting = await getTaskDetail(owner, taskId);
  assert(conflicting.hasConflict);
  await prisma.projectInquiry.update({ where: { projectId: project.id }, data: { legalNotes: "Edited again" } });
  await assert.rejects(act(owner, taskId, "ACCEPT", { conflictToken: conflicting.conflictToken! }), /field changed/);
  const latest = await getTaskDetail(owner, taskId);
  const acceptRace = await Promise.allSettled([mutateTask(owner, taskId, { action: "ACCEPT", version: latest.version, conflictToken: latest.conflictToken! }), mutateTask(owner, taskId, { action: "ACCEPT", version: latest.version, conflictToken: latest.conflictToken! })]);
  assert.equal(acceptRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await prisma.projectInquiry.findUniqueOrThrow({ where: { projectId: project.id } })).legalNotes, "<p>Accepted legal notes</p>");
  assert.equal((await prisma.projectWorkflowStage.findUniqueOrThrow({ where: { projectId_stageKey: { projectId: project.id, stageKey: "CONCEPT_CREATION" } } })).status, "LOCKED");
  const draft = await getProjectFormDraft(owner, project.id, "stage-one-project-inquiry");
  assert.equal(draft?.payload.legalNotes, "<p>Accepted legal notes</p>");
  assert.equal(draft?.payload.initialBrief, "Keep unrelated draft");
  await assert.rejects(saveProjectFormDraft(owner, { projectId: project.id, formKey: "stage-one-project-inquiry", payload: { legalNotes: "STALE" }, clientId: "test", clientRevision: 2 }), /Tasker updated/);
  assert.equal(await prisma.$transaction((tx) => checkTaskerFormRevision(tx, project.id, "stage-one-project-inquiry", 0)), false);
  await saveProjectFormDraft(owner, { projectId: project.id, formKey: "stage-one-project-inquiry", payload: { legalNotes: "Reviewed edit" }, clientId: "test", clientRevision: 3, taskerRevision: draft!.taskerRevision });
  await assert.rejects(getProjectFormDraft(executor, project.id, "stage-one-project-inquiry"), /do not have access/, "A scoped recipient must not read shared stage forms");
  const repeated = await createTask(owner, base);
  await act(owner, repeated, "CANCEL", { note: "No longer needed" });

  // Creator ownership is independent of the recipient's project authority.
  const reverse = await createTask(executor, { ...ref, kind: "GENERAL", title: "Owner supplies input", brief: "Please provide it", assigneeId: owner.id, coOwnerId: coOwner.id });
  await act(owner, reverse, "SUBMIT", { note: "Owner response" });
  assert.equal((await getTaskDetail(owner, reverse)).canReview, false);
  await assert.rejects(act(owner, reverse, "ACCEPT"), /task owner/);
  await act(coOwner, reverse, "CORRECTIONS", { note: "Please add the missing detail" });
  await act(owner, reverse, "SUBMIT", { note: "Corrected response" });
  await act(executor, reverse, "ACCEPT");
  assert.equal((await getTaskDetail(owner, reverse)).submissions.length, 2, "Corrections preserve previous submissions");

  const general = await createTask(executor, { ...ref, kind: "GENERAL", title: "A general task", brief: "Independent work", assigneeId: coOwner.id, participantIds: [executor2.id] });
  await act(executor, general, "MANAGE", { coOwnerId: executor2.id });
  assert.equal((await getTaskDetail(executor2, general)).canManage, true);
  await act(executor, general, "MANAGE", { coOwnerId: null });
  const removal = await prisma.taskerEvent.findFirstOrThrow({ where: { taskId: general, action: "MANAGE" }, orderBy: { createdAt: "desc" } });
  assert.equal((removal.detail as { coOwnerId: string | null }).coOwnerId, null, "History must record the removed co-owner accurately");
  assert.equal((await getTaskDetail(executor2, general)).canSubmit, false);
  await assert.rejects(act(executor2, general, "MANAGE"), /Only the task owner/);
  await act(executor, general, "REASSIGN", { assigneeId: executor2.id });
  await assert.rejects(act(coOwner, general, "SUBMIT", { note: "Old assignee" }), /current recipient/);
  await act(executor2, general, "DECLINE", { note: "Cannot complete" });
  const beforeDelete = await prisma.taskerEvent.count({ where: { taskId: general } });
  await act(owner, general, "DELETE");
  await assert.rejects(getTaskDetail(executor, general), /not found/);
  assert.equal(await prisma.taskerEvent.count({ where: { taskId: general } }), beforeDelete + 1, "Deletion preserves history");

  // File requests use canonical Brief/Tech subfolders; no private or Finance destination.
  const workspace = await prisma.projectResearchWorkspace.create({ data: { projectId: project.id, ownerUserId: owner.id } });
  const root = await prisma.projectResearchFolder.create({ data: { workspaceId: workspace.id, name: "Brief", normalizedName: "brief", systemKey: "BRIEF", isSystem: true } });
  const subfolder = await prisma.projectResearchFolder.create({ data: { workspaceId: workspace.id, parentFolderId: root.id, name: "References", normalizedName: "references" } });
  const finance = await prisma.projectResearchFolder.create({ data: { workspaceId: workspace.id, name: "Finance", normalizedName: "finance", systemKey: "FINANCE" } });
  const fileOptions = await getTaskCreateOptions(executor, ref);
  const ownerSharedFolder = await getProjectResearchFolderPageData(owner, { projectId: project.id, folderId: subfolder.id });
  assert(ownerSharedFolder, "Owner can read a shared Brief folder before Stage 2 opens");
  assert.equal(ownerSharedFolder.canUpload, false, "Tasker does not unlock normal stage uploads");
  assert(fileOptions.destinations.some((f) => f.id === subfolder.id));
  assert(!fileOptions.destinations.some((f) => f.id === finance.id));
  await assert.rejects(createTask(owner, { ...ref, kind: "FILE_REQUEST", title: "Invalid destination", brief: "Files", assigneeId: executor.id, destinationId: finance.id }), /destination/);
  const fileTask = await createTask(owner, { ...ref, kind: "FILE_REQUEST", title: "Old artwork", brief: "Upload original", assigneeId: executor.id, destinationId: subfolder.id });
  const objects = new Map<string, { size: number; type: string }>();
  const storage: TaskerStorage = {
    bucket: () => "test",
    upload: async ({ storageKey, mimeType }) => ({ uploadUrl: `https://storage.example.test/${storageKey}`, uploadHost: "storage.example.test", endpointMode: "regional", region: "test", expiresInSeconds: 300, expectedHeaders: { "Content-Type": mimeType } }),
    metadata: async (key) => { const object = objects.get(key); assert(object); return { ContentLength: object.size, ContentType: object.type, $metadata: {} }; },
    copy: async ({ sourceKey, storageKey }) => { const object = objects.get(sourceKey); assert(object); objects.set(storageKey, { ...object }); },
    download: async ({ storageKey }) => `https://storage.example.test/${storageKey}`,
  };
  const upload = await requestTaskUpload(executor, fileTask, { name: "artwork.pdf", mimeType: "application/pdf", size: 10 }, storage);
  const pendingFile = await prisma.taskerFile.findUniqueOrThrow({ where: { id: upload.fileId } });
  objects.set(pendingFile.uploadKey, { size: 11, type: "application/pdf" });
  await assert.rejects(finalizeTaskUpload(executor, fileTask, pendingFile.id, storage), /does not match/);
  objects.set(pendingFile.uploadKey, { size: 10, type: "application/pdf" });
  await finalizeTaskUpload(executor, fileTask, pendingFile.id, storage);
  const file = await prisma.taskerFile.findUniqueOrThrow({ where: { id: pendingFile.id } });
  assert.notEqual(file.storageKey, file.uploadKey);
  objects.set(file.uploadKey, { size: 999, type: "application/pdf" });
  await finalizeTaskUpload(executor, fileTask, file.id, storage);
  assert.equal(objects.get(file.storageKey)?.size, 10, "A reused upload URL cannot replace a finalized submission object");
  await assert.rejects(taskFileDownload(owner, fileTask, file.id, storage), /not found/, "Reviewers cannot read unsubmitted files");
  await act(executor, fileTask, "SUBMIT", { fileIds: [file.id] });
  assert.equal(await prisma.projectResearchFolderFile.count({ where: { folderId: subfolder.id } }), 0);
  const fileDetail = await getTaskDetail(owner, fileTask);
  const copies = await prepareAcceptedTaskFiles(owner, fileTask, fileDetail.version, storage);
  await mutateTask(owner, fileTask, { action: "ACCEPT", version: fileDetail.version }, copies);
  const native = await prisma.projectAttachment.findUniqueOrThrow({ where: { id: `${file.id}-published` } });
  assert.notEqual(native.storageKey, file.storageKey, "Published files and immutable submission files use different storage objects");
  assert.equal(await prisma.projectResearchFolderFile.count({ where: { folderId: subfolder.id } }), 1);

  // Late checklist and request-form input must preserve issued approvals/handover snapshots.
  const handoff = await prisma.projectStageFileHandoff.create({ data: { projectId: project.id, sourceWorkflowStageKey: "PROJECT_DEVELOPMENT", sourceAttachmentId: native.id, targetWorkflowStageKey: "FINAL_LAYOUT", handedOffById: owner.id } });
  const checklist = await prisma.projectFileChecklist.create({ data: { projectId: project.id, handoffId: handoff.id, sourceAttachmentId: native.id } });
  const unit = await prisma.projectProductionUnit.create({ data: { projectId: project.id, sourceHandoffId: handoff.id, sourceChecklistId: checklist.id, sourceAttachmentId: native.id, createdById: owner.id, status: "HANDED_OVER", handedOverAt: new Date() } });
  const approval = await prisma.productionApprovalStep.create({ data: { productionUnitId: unit.id, sequence: 1, status: "APPROVED", sharedSnapshot: { legal: "Issued approval" } } });
  const handover = await prisma.projectProductionHandover.create({ data: { clientRequestId: "tasker-snapshot-test", productionUnitId: unit.id, route: "DIRECT_VENDOR", recipientType: "EXTERNAL_EMAIL", recipientName: "Printer", recipientEmail: "printer@example.test", contentSnapshot: { legal: "Issued handover" }, requestedById: owner.id } });
  const output = await createTask(owner, { ...base, title: "Output name", targetId: `checklist:${checklist.id}:OUTPUT_NAME` });
  await act(executor, output, "SUBMIT", { value: { text: "Current artwork name" } });
  await act(owner, output, "ACCEPT");
  assert.deepEqual((await prisma.projectFileChecklistItem.findUniqueOrThrow({ where: { checklistId_fieldKey: { checklistId: checklist.id, fieldKey: "OUTPUT_NAME" } } })).value, { text: "Current artwork name" });
  for (const [stage, key, response, formKey] of [
    ["6", "company", "New vendor company", `stage-six-handover:${unit.id}`],
    ["7", "name", "Revised sample", `stage-seven-sample-request:${unit.id}`],
  ]) {
    const id = await createTask(owner, { ...base, targetId: `draft:${stage}:${unit.id}:${key}`, title: `Collect ${key}` });
    await act(executor, id, "SUBMIT", { value: response });
    await act(owner, id, "ACCEPT");
    assert.equal((await getProjectFormDraft(owner, project.id, formKey))?.payload[key], response);
  }
  assert.deepEqual((await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: approval.id } })).sharedSnapshot, { legal: "Issued approval" });
  assert.deepEqual((await prisma.projectProductionHandover.findUniqueOrThrow({ where: { id: handover.id } })).contentSnapshot, { legal: "Issued handover" });
  assert.equal((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: unit.id } })).status, "HANDED_OVER");
  assert.equal(await prisma.productionSampleRound.count({ where: { projectId: project.id } }), 0, "Collecting sample input must not send a sample request");

  // A completed project's current data can change; completion and issued records remain.
  await prisma.project.update({ where: { id: project.id }, data: { completedAt: new Date() } });
  const deadlineField = options.fields.find((f) => f.id.endsWith(":deadline"))!;
  const late = await createTask(owner, { ...base, targetId: deadlineField.id, title: "Late deadline" });
  await act(executor, late, "SUBMIT", { value: "2027-01-20" });
  await act(owner, late, "ACCEPT");
  assert((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).completedAt);
  assert.equal((await prisma.projectInquiry.findUniqueOrThrow({ where: { projectId: project.id } })).deadline?.toISOString().slice(0, 10), "2027-01-20");

  const flexible = await prisma.flexibleProject.create({ data: { slug: "tasker-flex", name: "Flexible", ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: new Date(), collaborators: { create: { userId: executor.id } }, milestones: { create: { name: "Launch", sortOrder: 0, status: "COMPLETED", completedAt: new Date() } } }, include: { milestones: true } });
  const flexRef = { projectId: flexible.id, projectType: "FLEXIBLE" as const };
  const flexOptions = await getTaskCreateOptions(owner, flexRef);
  const flexField = flexOptions.fields.find((f) => f.id.startsWith("milestone:") && f.id.endsWith(":name"))!;
  const flexTask = await createTask(executor, { ...flexRef, kind: "FIELD_INPUT", title: "Update milestone name", brief: "New name", assigneeId: owner.id, targetId: flexField.id });
  await act(owner, flexTask, "SUBMIT", { value: "Launch V2" });
  await act(executor, flexTask, "ACCEPT");
  assert.equal((await prisma.flexibleMilestone.findUniqueOrThrow({ where: { id: flexible.milestones[0].id } })).name, "Launch V2");
  assert.equal((await prisma.flexibleProject.findUniqueOrThrow({ where: { id: flexible.id } })).status, "COMPLETED");
  const stale = await updateFlexibleMilestone(owner, flexible.id, flexible.milestones[0].id, { name: "STALE", expectedUpdatedAt: flexible.milestones[0].updatedAt.toISOString() });
  assert("error" in stale);
  assert((await listTasks(owner)).some((t) => t.project.projectType === "FLEXIBLE"));

  const context = await getTaskProjectAdapter("STRUCTURED").load(prisma, project.id);
  const dateField = context.fields.find((f) => f.id === deadlineField.id)!;
  assert.throws(() => validateTaskFieldValue(dateField, "2026-02-31", []), /valid date/);
  assert.deepEqual(applyFieldPatches({ unrelated: "keep", nested: { a: "keep" } }, [{ id: 1, path: ["nested", "b"], value: "new" }]), { unrelated: "keep", nested: { a: "keep", b: "new" } });

  assert(await prisma.notification.count({ where: { type: "TASKER_UPDATED" } }) > 0);
  const emailTask = await createTask(owner, { ...ref, kind: "GENERAL", title: "Outbox", brief: "Delivery retry", assigneeId: executor.id });
  const failed = await deliverTaskerEmails({ taskId: emailTask, send: async () => ({ ok: false, error: "Temporary outage" }) });
  assert.equal(failed.failed, 1);
  assert.equal((await prisma.taskerTask.findUniqueOrThrow({ where: { id: emailTask } })).status, "ASSIGNED");
  await prisma.taskerDelivery.updateMany({ where: { taskId: emailTask }, data: { availableAt: new Date(0) } });
  let sent = 0;
  await Promise.all([deliverTaskerEmails({ taskId: emailTask, send: async (input) => { assert(input.idempotencyKey); sent++; return { ok: true }; } }), deliverTaskerEmails({ taskId: emailTask, send: async () => { sent++; return { ok: true }; } })]);
  assert.equal(sent, 1, "Only one worker may claim an email delivery");
  await deliverTaskerEmails({ taskId: emailTask, send: async () => { sent++; return { ok: true }; } });
  assert.equal(sent, 1, "Sent deliveries must not be resent");
  await prisma.projectExecutor.delete({ where: { projectId_userId: { projectId: project.id, userId: executor.id } } });
  await assert.rejects(getTaskDetail(executor, emailTask), /not found/);
  console.log("Passed: active-target and review races; owner/co-owner/assignee/observer access; role-independent review; field conflicts; draft protection; retained history; Brief/Tech file publication; late acceptance; flexible projects; validation; notifications and outbox retries.");
}
main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });

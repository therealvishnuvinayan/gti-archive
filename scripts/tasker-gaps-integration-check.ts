import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getInitialProjectWorkflowStageData } from "@/lib/project-workflow";
import { createTask, getTaskDetail, listTasks, mutateTask } from "@/lib/tasker/service";
import { getTaskFamily, mutateTaskFamily, taskFamilyFileAccess } from "@/lib/tasker/families";
import { taskFileAccess } from "@/lib/tasker/files";
import { acceptStageFiveChecklistRequest, getStageFiveChecklistRequestData, getStageFiveWorkspaceData, requestStageFiveChecklistInformation, submitStageFiveChecklistResponse, completeStageFive, getStageFiveChecklistRequestUploadContext } from "@/lib/stage-five";
import { checklistResponseFileAccess, reviewChecklistResponse } from "@/lib/tasker/checklist-review";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
import { getProjectFormDraft, saveProjectFormDraft } from "@/lib/project-form-drafts";
import type { PermissionUser } from "@/lib/permissions/resolver";
import type { TaskMutation, TaskProjectRef, TaskSource } from "@/lib/tasker/types";

async function main() {
  const [owner, coOwner, executor, other, outsider] = await Promise.all(["owner", "co-owner", "executor", "other", "outsider"].map((name) => prisma.user.create({ data: { name, email: `${name}@gaps.example.test`, role: name === "owner" ? "ADMIN" : "USER", passwordHash: "test-only" } })));
  const project = await prisma.project.create({ data: { name: "Tasker completion", ownerId: owner.id, createdById: owner.id, coOwners: { create: { userId: coOwner.id } }, executors: { create: [{ userId: executor.id }, { userId: other.id }] }, workflowStages: { create: getInitialProjectWorkflowStageData().map((s, i) => ({ ...s, status: i < 4 ? "COMPLETED" : i === 4 ? "AVAILABLE" : "LOCKED", unlockedAt: i <= 4 ? new Date() : null, completedAt: i < 4 ? new Date() : null })) } } });
  const ref: TaskProjectRef = { projectType: "STRUCTURED", projectId: project.id };
  const workspace = await prisma.projectResearchWorkspace.create({ data: { projectId: project.id, ownerUserId: owner.id } });
  const folder = await prisma.projectResearchFolder.create({ data: { workspaceId: workspace.id, name: "Brief", normalizedName: "brief", systemKey: "BRIEF", isSystem: true } });
  const finance = await prisma.projectResearchFolder.create({ data: { workspaceId: workspace.id, name: "Finance", normalizedName: "finance", systemKey: "FINANCE", isSystem: true } });
  const objects = new Map<string, { size: number; type: string }>();
  const store = {
    copy: async ({ sourceKey, storageKey }: { sourceKey: string; storageKey: string }) => { assert(objects.has(sourceKey)); objects.set(storageKey, { ...objects.get(sourceKey)! }); },
    metadata: async (key: string) => ({ ContentLength: objects.get(key)?.size, ContentType: objects.get(key)?.type, $metadata: {} }),
  };
  const readers = { download: async ({ storageKey }: { storageKey: string }) => storageKey, preview: async ({ storageKey }: { storageKey: string }) => storageKey, text: async () => "Escaped <script>example</script>" };
  async function act(user: PermissionUser, id: string, action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) {
    return mutateTask(user, id, { action, version: (await getTaskDetail(user, id)).version, ...extra });
  }
  async function upload(taskId: string, userId: string, name = "artwork.png", mimeType = "image/png") {
    const key = `gap-tests/${randomUUID()}`; objects.set(key, { size: 10, type: mimeType });
    return prisma.taskerFile.create({ data: { taskId, uploadedById: userId, originalFileName: name, mimeType, fileSize: 10, bucket: "test", storageKey: key, uploadKey: `${key}/upload`, status: "READY" } });
  }
  const parent = await createTask(owner, { ...ref, kind: "GENERAL", title: "Artwork", brief: "Design", assigneeId: executor.id });
  const source: TaskSource = { type: "TASK", id: parent }, file = await upload(parent, executor.id), text = await upload(parent, executor.id, "notes.txt", "text/plain");
  await assert.rejects(taskFileAccess(owner, parent, file.id, "preview", readers), /not found/, "Unsubmitted uploads are private to uploader");
  await act(executor, parent, "SUBMIT", { fileIds: [file.id, text.id] });
  assert.equal((await taskFileAccess(owner, parent, file.id, "preview", readers)).url, file.storageKey);
  assert.equal((await taskFileAccess(owner, parent, text.id, "text", readers)).content, "Escaped <script>example</script>");
  await assert.rejects(taskFileAccess(outsider, parent, file.id, "preview", readers), /not found/);
  await assert.rejects(taskFileAccess(owner, parent, text.id, "preview", readers), /Preview is not available/);
  await act(owner, parent, "ACCEPT");
  const before = await prisma.taskerTask.findUniqueOrThrow({ where: { id: parent } });
  await mutateTaskFamily(owner, source, { action: "SELECT_FINAL", fileKey: `TASK:${file.id}`, version: 0 });
  const family = await getTaskFamily(owner, source);
  assert(family.importDestinations.some((d) => d.id === "stage:5"));
  await assert.rejects(mutateTaskFamily(executor, source, { action: "IMPORT_FINAL", version: family.version, fileKey: file.id, destinationId: "stage:5" }, store), /project owner/);
  await assert.rejects(mutateTaskFamily(owner, source, { action: "IMPORT_FINAL", version: family.version, fileKey: `TASK:${file.id}`, destinationId: `folder:${finance.id}` }, store), /destination/);
  const imported = await Promise.allSettled([0, 1].map(() => mutateTaskFamily(owner, source, { action: "IMPORT_FINAL", version: family.version, fileKey: `TASK:${file.id}`, destinationId: "stage:5" }, store)));
  assert.equal(imported.filter((r) => r.status === "fulfilled").length, 1, "Concurrent duplicate imports commit only once");
  const importRecord = await prisma.taskerFileImport.findFirstOrThrow({ where: { sourceId: parent } });
  assert.equal(importRecord.fileKey, `TASK:${file.id}`);
  const copied = await prisma.projectAttachment.findUniqueOrThrow({ where: { id: importRecord.destinationAttachmentId } });
  assert.notEqual(copied.storageKey, file.storageKey);
  const handoff = await prisma.projectStageFileHandoff.findFirstOrThrow({ where: { sourceAttachmentId: copied.id }, include: { checklist: true } });
  assert.equal((await getStageFiveWorkspaceData(owner, project.id))?.files[0].sourceOrigin, "TASKER");
  assert.deepEqual(await prisma.taskerTask.findUniqueOrThrow({ where: { id: parent } }), before);
  assert.equal((await getTaskFamily(owner, source)).imports[0].destinationLabel, "Stage 5 · New final-layout file and checklist");
  // Revisions retain independent file access, including the comparison/preview paths.
  const child = await createTask(owner, { ...ref, kind: "GENERAL", title: "Revision", brief: "Adjust", assigneeId: other.id, sisterOf: source });
  const childFile = await upload(child, other.id);
  await act(other, child, "SUBMIT", { fileIds: [childFile.id] }); await act(owner, child, "ACCEPT");
  await assert.rejects(taskFamilyFileAccess(executor, source, `TASK:${childFile.id}`, "preview", readers), /not found/);
  const view = await getTaskFamily(owner, source);
  await mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: view.version, fileKey: `TASK:${childFile.id}` });
  const view2 = await getTaskFamily(owner, source);
  await mutateTaskFamily(owner, source, { action: "IMPORT_FINAL", version: view2.version, fileKey: `TASK:${childFile.id}`, destinationId: `folder:${folder.id}` }, store);
  const folderFile = await prisma.projectResearchFolderFile.findFirstOrThrow({ where: { folderId: folder.id }, include: { attachment: true } });
  assert.equal(folderFile.attachment.assetType, "PROJECT_RESEARCH_FILE");
  assert.equal((await getTaskFamily(executor, source)).imports.length, 1, "A hidden sister's import history is not exposed");

  // Internal Stage 5: request, receive, correct, conflict-review, accept exactly once.
  const created = await requestStageFiveChecklistInformation(owner, { clientRequestId: randomUUID(), projectId: project.id, handoffId: handoff.id, fieldKey: "TAR", channel: "IN_APP", recipientUserId: executor.id });
  assert(!("error" in created), JSON.stringify(created));
  const requestId = created.request.id;
  assert.equal((await getStageFiveChecklistRequestData(executor, requestId))?.canOpenStage, false);
  assert.equal(await getStageFiveChecklistRequestData(other, requestId), null);
  assert(!("error" in await acceptStageFiveChecklistRequest(executor, requestId)));
  assert(!("error" in await submitStageFiveChecklistResponse(executor, { requestId, value: { text: "5 mg" }, attachmentIds: [] })));
  const pending = (await getStageFiveChecklistRequestData(owner, requestId))!;
  assert.equal(pending.status, "IN_REVIEW"); assert.equal(pending.hasConflict, false);
  const targetWhere = { checklistId_fieldKey: { checklistId: handoff.checklist!.id, fieldKey: "TAR" as const } };
  assert.equal((await prisma.projectFileChecklistItem.findUniqueOrThrow({ where: targetWhere })).value, null);
  assert("error" in await reviewChecklistResponse(executor, { requestId, submissionId: pending.submissions[0].id, action: "ACCEPT" }));
  const duplicate = await requestStageFiveChecklistInformation(owner, { clientRequestId: randomUUID(), projectId: project.id, handoffId: handoff.id, fieldKey: "TAR", channel: "IN_APP", recipientUserId: other.id });
  assert("error" in duplicate, "Only one active field request, even across recipients");
  await assert.rejects(createTask(owner, { ...ref, title: "Duplicate", brief: "Duplicate", kind: "FIELD_INPUT", targetId: `checklist:${handoff.checklist!.id}:TAR`, assigneeId: other.id }), /pending checklist/);
  assert(!("error" in await reviewChecklistResponse(owner, { requestId, submissionId: pending.submissions[0].id, action: "CORRECTIONS", note: "Use the new value" })));
  assert(await getStageFiveChecklistRequestUploadContext(executor, requestId));
  assert(!("error" in await submitStageFiveChecklistResponse(executor, { requestId, value: { text: "6 mg" }, attachmentIds: [] })));
  await prisma.projectFileChecklistItem.update({ where: targetWhere, data: { value: { text: "Owner edit" } } });
  const conflict = (await getStageFiveChecklistRequestData(owner, requestId))!;
  assert(conflict.hasConflict);
  assert("error" in await reviewChecklistResponse(owner, { requestId, submissionId: conflict.submissions[0].id, action: "ACCEPT" }));
  await prisma.projectFileChecklistItem.update({ where: targetWhere, data: { value: { text: "New owner edit" } } });
  assert("error" in await reviewChecklistResponse(owner, { requestId, submissionId: conflict.submissions[0].id, action: "ACCEPT", conflictToken: conflict.conflictToken! }));
  await saveProjectFormDraft(owner, { projectId: project.id, formKey: `stage-five-checklist:${handoff.id}`, clientId: "gap-test", clientRevision: 1, payload: { draft: { textValues: { TAR: "Stale draft", NICOTINE: "Preserve" } } } });
  const completion = await completeStageFive(owner, { projectId: project.id });
  assert(!("error" in completion), `Awaiting review does not block stage completion: ${JSON.stringify(completion)}`);
  const unit = await prisma.projectProductionUnit.findFirstOrThrow({ where: { sourceHandoffId: handoff.id } });
  const approval = await prisma.productionApprovalStep.update({ where: { productionUnitId_sequence: { productionUnitId: unit.id, sequence: 1 } }, data: { status: "APPROVED", sharedSnapshot: { text: "Issued" } } });
  const current = (await getStageFiveChecklistRequestData(owner, requestId))!;
  const races = await Promise.all([0, 1].map(() => reviewChecklistResponse(owner, { requestId, submissionId: current.submissions[0].id, action: "ACCEPT", conflictToken: current.conflictToken! })));
  assert.equal(races.filter((r) => !("error" in r)).length, 1);
  assert.deepEqual((await prisma.projectFileChecklistItem.findUniqueOrThrow({ where: targetWhere })).value, { text: "6 mg" });
  assert.equal((await getStageFiveChecklistRequestData(owner, requestId))?.submissions.length, 2);
  assert.deepEqual((await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: approval.id } })).sharedSnapshot, { text: "Issued" });
  const draft = await getProjectFormDraft(owner, project.id, `stage-five-checklist:${handoff.id}`);
  assert.equal((draft?.payload.draft as { textValues: { NICOTINE: string } }).textValues.NICOTINE, "Preserve");
  await assert.rejects(saveProjectFormDraft(owner, { projectId: project.id, formKey: `stage-five-checklist:${handoff.id}`, clientId: "gap-test", clientRevision: 2, payload: {} }), /Tasker updated/);
  assert(!(await getTaskFamily(owner, source)).importDestinations.some((d) => d.id === "stage:5"), "Completed stages are not silently reopened for imports");

  // Pending native attachment responses preserve immutable originals and corrections.
  await prisma.projectWorkflowStage.update({ where: { projectId_stageKey: { projectId: project.id, stageKey: "FINAL_LAYOUT" } }, data: { status: "AVAILABLE" } });
  const graphics = await requestStageFiveChecklistInformation(owner, { clientRequestId: randomUUID(), projectId: project.id, handoffId: handoff.id, fieldKey: "RELATED_GRAPHICS", channel: "IN_APP", recipientUserId: executor.id });
  assert(!("error" in graphics));
  const graphicsId = graphics.request.id;
  await acceptStageFiveChecklistRequest(executor, graphicsId);
  const originalKey = `native/${randomUUID()}`; objects.set(originalKey, { size: 10, type: "image/png" });
  const attachment = await prisma.projectAttachment.create({ data: { projectId: project.id, uploadedById: executor.id, fileName: "work.png", originalFileName: "work.png", mimeType: "image/png", fileSize: 10, bucket: "test", storageKey: originalKey, status: "READY", assetType: "FILE_CHECKLIST_ATTACHMENT", checklistResponseRequestId: graphicsId } });
  assert(!("error" in await submitStageFiveChecklistResponse(executor, { requestId: graphicsId, value: {}, attachmentIds: [attachment.id] }, store)));
  const graphicsView = (await getStageFiveChecklistRequestData(owner, graphicsId))!;
  const sub = graphicsView.submissions[0], f = sub.attachments[0];
  const preview = await checklistResponseFileAccess(owner, graphicsId, sub.id, f.id, "preview", readers);
  assert.notEqual(preview.url, originalKey);
  await assert.rejects(checklistResponseFileAccess(other, graphicsId, sub.id, f.id, "preview", readers), /unavailable/);
  assert(!("error" in await reviewChecklistResponse(owner, { requestId: graphicsId, submissionId: sub.id, action: "ACCEPT", conflictToken: graphicsView.conflictToken! }, store)));
  const published = await prisma.projectAttachment.findUniqueOrThrow({ where: { id: f.id } });
  assert.notEqual(published.storageKey, preview.url, "Deleting a published checklist copy cannot destroy the submission snapshot");
  objects.delete(published.storageKey); await prisma.projectAttachment.update({ where: { id: f.id }, data: { status: "DELETED" } });
  assert(objects.has((await checklistResponseFileAccess(executor, graphicsId, sub.id, f.id, "preview", readers)).url!));

  // Abandoned-task recovery is explicit, owner-only, versioned, and preserves history.
  const abandoned = await createTask(executor, { ...ref, title: "Abandoned task", brief: "Work", kind: "GENERAL", assigneeId: other.id, coOwnerId: coOwner.id });
  await act(other, abandoned, "SUBMIT", { note: "Retain this submission" });
  await prisma.projectExecutor.deleteMany({ where: { projectId: project.id, userId: { in: [executor.id, other.id] } } });
  await assert.rejects(taskFileAccess(executor, parent, file.id, "preview", readers), /not found/);
  assert.equal(await getStageFiveChecklistRequestData(executor, graphicsId), null);
  assert((await listTasks(owner)).find((t) => t.id === abandoned)?.unavailableParticipants?.includes("Recipient"));
  const abandonedView = await getTaskDetail(owner, abandoned);
  assert(abandonedView.canRecover);
  await assert.rejects(act(coOwner, abandoned, "RECOVER", { ownerId: coOwner.id, assigneeId: owner.id, note: "Take over" }), /project owner/);
  await act(owner, abandoned, "RECOVER", { ownerId: coOwner.id, assigneeId: owner.id, note: "Both participants left" });
  const recovered = await getTaskDetail(coOwner, abandoned);
  assert.equal(recovered.status, "IN_REVIEW"); assert.equal(recovered.submissions.length, 1); assert(recovered.history.some((h) => h.action === "RECOVER"));
  assert.deepEqual(recovered.unavailableParticipants, []);
  await assert.rejects(act(owner, abandoned, "RECOVER", { ownerId: owner.id, assigneeId: owner.id, note: "Unnecessary transfer" }), /unavailable participants/);
  const emails: string[] = [];
  await deliverTaskerEmails({ limit: 100, send: async (input) => { emails.push(input.to); return { ok: true }; } });
  assert(!emails.includes(executor.email), "Removed recipients do not receive queued task or checklist emails");

  const flexible = await prisma.flexibleProject.create({ data: { slug: "gaps-flex", name: "Completed flexible", ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: new Date(), collaborators: { create: { userId: executor.id } }, milestones: { create: { name: "Launch", sortOrder: 1, status: "COMPLETED", completedAt: new Date() } } }, include: { milestones: true } });
  const flexTask = await createTask(owner, { projectType: "FLEXIBLE", projectId: flexible.id, kind: "GENERAL", title: "Late revision", brief: "Revision", assigneeId: executor.id });
  const flexFile = await upload(flexTask, executor.id); await act(executor, flexTask, "SUBMIT", { fileIds: [flexFile.id] }); await act(owner, flexTask, "ACCEPT");
  const flexSource: TaskSource = { type: "TASK", id: flexTask };
  await mutateTaskFamily(owner, flexSource, { action: "SELECT_FINAL", version: 0, fileKey: `TASK:${flexFile.id}` });
  await mutateTaskFamily(owner, flexSource, { action: "IMPORT_FINAL", version: 1, fileKey: `TASK:${flexFile.id}`, destinationId: `folder:${flexible.milestones[0].id}` }, store);
  assert.equal(await prisma.flexibleProjectAttachment.count({ where: { milestoneId: flexible.milestones[0].id, taskerImportId: { not: null } } }), 1);
  assert.equal((await prisma.flexibleMilestone.findUniqueOrThrow({ where: { id: flexible.milestones[0].id } })).status, "COMPLETED");
  console.log("Tasker gaps: scoped previews, imports/provenance, recovery, internal checklist review/conflicts, snapshots, races and flexible completion passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

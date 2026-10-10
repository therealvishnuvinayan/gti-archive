import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createTask, getTaskDetail, listTasks, mutateTask } from "@/lib/tasker/service";
import { getTaskFamily, mutateTaskFamily, taskFamilyFileDownload } from "@/lib/tasker/families";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
import type { PermissionUser } from "@/lib/permissions/resolver";
import type { TaskCreateInput, TaskMutation, TaskSource } from "@/lib/tasker/types";

async function main() {
  const [owner, coOwner, executor, other, outsider] = await Promise.all(["owner", "co-owner", "executor", "other", "outsider"].map((name) => prisma.user.create({ data: { name, email: `${name}@sisters.example.test`, passwordHash: "test-only", role: name === "owner" ? "ADMIN" : "USER" } })));
  const project = await prisma.project.create({ data: { name: "Completed Sister Task project", ownerId: owner.id, createdById: owner.id, completedAt: new Date(), coOwners: { create: { userId: coOwner.id } }, executors: { create: [{ userId: executor.id }, { userId: other.id }] }, workflowStages: { create: [{ stageKey: "PROJECT_INQUIRY", status: "COMPLETED", completedAt: new Date() }, { stageKey: "PRODUCTION_AND_HANDOVER", status: "COMPLETED", completedAt: new Date() }] } } });
  const ref = { projectType: "STRUCTURED" as const, projectId: project.id };
  const base: TaskCreateInput = { ...ref, kind: "GENERAL", title: "Original artwork", brief: "Artwork required", assigneeId: owner.id, participantIds: [coOwner.id] };
  const parentId = await createTask(executor, base), source: TaskSource = { type: "TASK", id: parentId };
  async function act(user: PermissionUser, id: string, action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) {
    return mutateTask(user, id, { action, version: (await getTaskDetail(user, id)).version, ...extra });
  }
  async function upload(user: PermissionUser, taskId: string, name: string) {
    const id = randomUUID();
    return prisma.taskerFile.create({ data: { id, taskId, uploadedById: user.id, originalFileName: name, mimeType: "application/pdf", fileSize: 10, bucket: "test", uploadKey: `uploads/${id}`, storageKey: `immutable/${id}`, status: "READY" } });
  }
  const originalFile = await upload(owner, parentId, "original.pdf");
  await assert.rejects(mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: 0, fileKey: `TASK:${originalFile.id}` }), /submitted file/, "Pending uploads cannot become the final file");
  await act(owner, parentId, "SUBMIT", { fileIds: [originalFile.id] });
  await act(executor, parentId, "ACCEPT");
  const parentBefore = await prisma.taskerTask.findUniqueOrThrow({ where: { id: parentId } });
  const originalSubmission = await prisma.taskerSubmission.findFirstOrThrow({ where: { taskId: parentId } });

  await assert.rejects(createTask(outsider, { ...base, sisterOf: source }), /not available/);
  await assert.rejects(createTask(other, { ...base, sisterOf: source }), /not found/);
  const childId = await createTask(owner, { ...base, title: "First revision", assigneeId: other.id, participantIds: [], sisterOf: source });
  const childSource: TaskSource = { type: "TASK", id: childId };
  const child = await prisma.taskerTask.findUniqueOrThrow({ where: { id: childId } });
  assert.equal(child.sisterNumber, 1);
  assert.deepEqual(await prisma.taskerTask.findUniqueOrThrow({ where: { id: parentId } }), parentBefore, "Creating a child does not mutate the original status, version, dates or brief");
  assert.deepEqual(await prisma.taskerSubmission.findUniqueOrThrow({ where: { id: originalSubmission.id } }), originalSubmission);
  assert((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).completedAt);
  assert.equal((await getTaskFamily(other, childSource)).original, null, "Child recipients do not inherit parent access");
  assert.equal((await getTaskFamily(coOwner, source)).children.length, 0, "A project co-owner cannot discover unassigned siblings");
  await assert.rejects(getTaskFamily(executor, childSource), /not found/);
  const revised = await upload(other, childId, "revised.pdf");
  await act(other, childId, "SUBMIT", { fileIds: [revised.id] });
  assert.equal((await getTaskFamily(other, childSource)).files.length, 1);
  await assert.rejects(taskFamilyFileDownload(other, childSource, `TASK:${originalFile.id}`), /not found/);
  await assert.rejects(mutateTaskFamily(executor, source, { action: "SELECT_FINAL", version: 1, fileKey: `TASK:${originalFile.id}` }), /project owner or project co-owner/, "Being task owner is not final-file authority");
  await assert.rejects(mutateTaskFamily(coOwner, source, { action: "SELECT_FINAL", version: 1, fileKey: `TASK:${revised.id}` }), /submitted file/);
  await mutateTaskFamily(coOwner, source, { action: "SELECT_FINAL", version: 1, fileKey: `TASK:${originalFile.id}`, note: "Use the original" });
  const selectionVersion = (await getTaskFamily(owner, source)).version;
  await assert.rejects(mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: selectionVersion, fileKey: `TASK:${revised.id}` }), /accepted or approved/, "Final selection cannot bypass task review");
  assert.equal((await getTaskDetail(other, childId)).status, "IN_REVIEW");
  await act(owner, childId, "ACCEPT");
  await mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: selectionVersion, fileKey: `TASK:${revised.id}` });
  assert.equal((await getTaskFamily(coOwner, source)).finalFile, null, "Final selection must not leak a hidden child's file");

  const secondId = await createTask(other, { ...base, title: "Revision of revision", participantIds: [], sisterOf: childSource });
  const second = await prisma.taskerTask.findUniqueOrThrow({ where: { id: secondId } });
  assert.equal(second.parentFamilyId, child.parentFamilyId, "Revisions stay under the first parent");
  assert.equal(second.sisterNumber, 2);
  const raced = await Promise.all([createTask(owner, { ...base, title: "Parallel A", sisterOf: source }), createTask(owner, { ...base, title: "Parallel B", sisterOf: source })]);
  assert.deepEqual((await prisma.taskerTask.findMany({ where: { id: { in: raced } }, orderBy: { sisterNumber: "asc" } })).map((t) => t.sisterNumber), [3, 4]);
  const rootView = await getTaskFamily(owner, source);
  const selectRace = await Promise.allSettled([
    mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: rootView.version, fileKey: `TASK:${originalFile.id}` }),
    mutateTaskFamily(coOwner, source, { action: "SELECT_FINAL", version: rootView.version, fileKey: `TASK:${originalFile.id}` }),
  ]);
  assert.equal(selectRace.filter((r) => r.status === "fulfilled").length, 1, "Conflicting final-file choices must require a refresh");
  assert.equal((await getTaskFamily(owner, source)).finalFile?.key, `TASK:${originalFile.id}`, "Earlier versions remain selectable");
  assert((await getTaskFamily(owner, source)).history.filter((e) => e.action === "FINAL_FILE_SELECTED").length >= 3);
  assert.equal(await taskFamilyFileDownload(owner, source, `TASK:${revised.id}`, async ({ storageKey }) => storageKey), revised.storageKey);

  const otherProject = await prisma.project.create({ data: { name: "Other project", ownerId: owner.id, createdById: owner.id } });
  await assert.rejects(createTask(owner, { ...base, projectId: otherProject.id, participantIds: [], sisterOf: source }), /original project/);
  const freshParent = await createTask(owner, { ...base, title: "Concurrent first revisions" });
  const firstChildren = await Promise.all([
    createTask(owner, { ...base, title: "First child A", sisterOf: { type: "TASK", id: freshParent } }),
    createTask(owner, { ...base, title: "First child B", sisterOf: { type: "TASK", id: freshParent } }),
  ]);
  assert.deepEqual((await prisma.taskerTask.findMany({ where: { id: { in: firstChildren } }, orderBy: { sisterNumber: "asc" } })).map((t) => t.sisterNumber), [1, 2], "Concurrent first revisions must share one new family without losing either task");

  // Native concept originals remain in their own workflow and retain every formal version.
  const stage = await prisma.projectStage.create({ data: { projectId: project.id, name: "Stage 4 original", order: 40001, isTasker: true, status: "COMPLETED", completedAt: new Date() } });
  const concept = await prisma.projectConceptFolder.create({ data: { projectId: project.id, taskerStageId: stage.id, workflowStageKey: "PROJECT_DEVELOPMENT", name: "Native artwork", normalizedName: "native artwork", assignedExecutorId: executor.id, assignedById: owner.id } });
  const revision = await prisma.projectRevision.create({ data: { projectId: project.id, stageId: stage.id, title: "Native original", revisionNumber: 1, createdById: executor.id, status: "APPROVED" } });
  const nativeFile = await prisma.projectAttachment.create({ data: { projectId: project.id, stageId: stage.id, revisionId: revision.id, uploadedById: executor.id, fileName: "native.pdf", originalFileName: "native.pdf", mimeType: "application/pdf", fileSize: 10, bucket: "test", storageKey: `native/${randomUUID()}`, status: "READY", assetType: "STAGE_SUBMISSION" } });
  await prisma.projectConceptFolder.update({ where: { id: concept.id }, data: { approvedAttachmentId: nativeFile.id, approvedById: owner.id, approvedAt: new Date() } });
  const conceptBefore = await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: concept.id } });
  const conceptSource: TaskSource = { type: "CONCEPT", id: concept.id };
  const conceptChild = await createTask(owner, { ...base, title: "Minor concept change", assigneeId: other.id, participantIds: [], sisterOf: conceptSource });
  assert.deepEqual(await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: concept.id } }), conceptBefore);
  assert.deepEqual(await prisma.projectStage.findUniqueOrThrow({ where: { id: stage.id } }), stage);
  assert.equal((await getTaskFamily(executor, conceptSource)).files[0]?.key, `CONCEPT:${nativeFile.id}`);
  assert.equal((await getTaskFamily(other, { type: "TASK", id: conceptChild })).files.length, 0);
  await mutateTaskFamily(owner, conceptSource, { action: "SELECT_FINAL", version: 1, fileKey: `CONCEPT:${nativeFile.id}` });
  assert.equal(await taskFamilyFileDownload(owner, conceptSource, `CONCEPT:${nativeFile.id}`, async ({ storageKey }) => storageKey), nativeFile.storageKey);
  assert((await listTasks(owner)).find((t) => t.id === concept.id)?.family);
  assert((await listTasks(owner)).find((t) => t.id === conceptChild)?.family);

  // A late revision records the owner's cycle decision without changing issued snapshots.
  const handoff = await prisma.projectStageFileHandoff.create({ data: { projectId: project.id, sourceWorkflowStageKey: "PROJECT_DEVELOPMENT", sourceAttachmentId: nativeFile.id, targetWorkflowStageKey: "FINAL_LAYOUT", handedOffById: owner.id } });
  const checklist = await prisma.projectFileChecklist.create({ data: { projectId: project.id, handoffId: handoff.id, sourceAttachmentId: nativeFile.id } });
  const unit = await prisma.projectProductionUnit.create({ data: { projectId: project.id, sourceHandoffId: handoff.id, sourceChecklistId: checklist.id, sourceAttachmentId: nativeFile.id, createdById: owner.id, status: "HANDED_OVER", handedOverAt: new Date() } });
  const approval = await prisma.productionApprovalStep.create({ data: { productionUnitId: unit.id, sequence: 1, status: "APPROVED", sharedSnapshot: { issued: "unchanged" } } });
  await createTask(owner, { ...base, title: "After handover", sisterOf: source });
  const late = await getTaskFamily(owner, source);
  assert.equal(late.cycleDecision, "PENDING");
  await assert.rejects(mutateTaskFamily(coOwner, source, { action: "DECIDE_CYCLE", version: late.version, decision: "NOT_REQUIRED", note: "Minor" }), /Only the project owner/);
  await mutateTaskFamily(owner, source, { action: "DECIDE_CYCLE", version: late.version, decision: "NOT_REQUIRED", note: "Minor correction; issued artwork remains valid" });
  assert.equal((await getTaskFamily(owner, source)).cycleDecision, "NOT_REQUIRED");
  await mutateTaskFamily(owner, source, { action: "SELECT_FINAL", version: (await getTaskFamily(owner, source)).version, fileKey: `TASK:${revised.id}` });
  assert.equal((await getTaskFamily(owner, source)).cycleDecision, "PENDING", "A new final choice needs a fresh owner decision");
  await mutateTaskFamily(owner, source, { action: "DECIDE_CYCLE", version: (await getTaskFamily(owner, source)).version, decision: "REQUIRED", note: "Issue through the existing production workflow" });
  assert.deepEqual(await prisma.productionApprovalStep.findUniqueOrThrow({ where: { id: approval.id } }), approval);
  assert.deepEqual(await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: unit.id } }), unit);

  // Flexible projects share the same tree, completion behaviour and final-file authority.
  const flexible = await prisma.flexibleProject.create({ data: { name: "Completed flexible", slug: "completed-flexible-sisters", ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: new Date(), collaborators: { create: { userId: executor.id } } } });
  const flexInput: TaskCreateInput = { projectType: "FLEXIBLE", projectId: flexible.id, kind: "GENERAL", title: "Flexible original", brief: "Work", assigneeId: executor.id };
  const flexParent = await createTask(owner, flexInput);
  const flexSource: TaskSource = { type: "TASK", id: flexParent };
  const flexChild = await createTask(executor, { ...flexInput, assigneeId: owner.id, title: "Flexible revision", sisterOf: flexSource });
  assert.equal((await getTaskFamily(executor, flexSource)).children[0].id, flexChild);
  assert.equal((await getTaskFamily(executor, flexSource)).canSelectFinal, false);
  assert.equal((await prisma.flexibleProject.findUniqueOrThrow({ where: { id: flexible.id } })).status, "COMPLETED");
  await prisma.flexibleProject.delete({ where: { id: flexible.id } });
  assert.equal(await prisma.taskerFamily.count({ where: { flexibleProjectId: flexible.id } }), 0, "Existing project deletion must clean up task families");

  // Email outbox handles native-original recipients and rechecks revoked access.
  const conceptDelivery = await prisma.taskerDelivery.findFirstOrThrow({ where: { conceptId: concept.id, userId: executor.id } });
  await prisma.taskerDelivery.updateMany({ where: { id: { not: conceptDelivery.id } }, data: { sentAt: new Date() } });
  let email = "";
  assert.equal((await deliverTaskerEmails({ send: async (input) => { email = input.text!; return { ok: true }; } })).sent, 1);
  assert(email.includes(`/tasks/concepts/${concept.id}/revisions`));
  await prisma.taskerDelivery.update({ where: { id: conceptDelivery.id }, data: { sentAt: null, availableAt: new Date(0) } });
  await prisma.projectConceptFolder.update({ where: { id: concept.id }, data: { assignedExecutorId: other.id } });
  assert.equal((await deliverTaskerEmails({ send: async () => { throw new Error("Should not send after access removal"); } })).sent, 0);
  await prisma.projectConceptFolder.delete({ where: { id: concept.id } });
  assert.equal((await getTaskFamily(owner, { type: "TASK", id: conceptChild })).original, null, "Explicit native task deletion must preserve its children");

  await act(owner, parentId, "DELETE");
  const orphan = await getTaskFamily(other, childSource);
  assert.equal(orphan.original, null);
  assert(orphan.children.some((t) => t.id === childId), "Deleting a parent does not silently delete children");
  await assert.rejects(getTaskFamily(owner, source), /not found/);
  console.log("Sister Tasks integration passed: hierarchy, scoped access, immutable originals, final-file races/history, concept and flexible projects, late workflow decisions and notification access.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

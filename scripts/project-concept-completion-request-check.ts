import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";
import {
  completeStageThreeTaskWithoutFile, completeStageThreeConcepts, createProjectConceptFolder,
  getProjectConceptFolders, getProjectConceptChatContext, requestStageThreeTaskCompletion,
  markProjectConceptApprovedAttachment,
} from "../src/lib/project-concepts";
import { createStageRevision, startProjectStageWork } from "../src/lib/project-history";
import { getUserProjectWorkspace } from "../src/lib/user-project-workspace";
import { getUserTasksPageData } from "../src/lib/user-tasks";
import { getUserProjectsList } from "../src/lib/user-projects";
import { notifyConceptTaskCompletion } from "../src/lib/notification-center/triggers";

const prefix = `completion-request-${randomUUID()}`;
const user = (name: string, role: UserRole = UserRole.USER) => ({ id: `${prefix}-${name}`, email: `${prefix}-${name}@example.test`, name, role });
const owner = user("Project Owner"), executor = user("Task Executor"), coOwner = user("Co Owner"), otherExecutor = user("Other Executor"), outsider = user("Outsider"), admin = user("Administrator", UserRole.ADMIN);
const users = [owner, executor, coOwner, otherExecutor, outsider, admin];
const projectId = `${prefix}-project`, stageKey = "CONCEPT_CREATION" as const;

async function task(name: string) {
  const result = await createProjectConceptFolder(owner, {
    projectId, stageKey, name, assignedExecutorId: executor.id,
    deadline: new Date(Date.now() + 86_400_000).toISOString(), brief: "<p>Research and save the materials in Tech.</p>",
  });
  assert.ok("folder" in result && result.folder, JSON.stringify(result));
  return result.folder;
}

async function main() {
  await prisma.user.createMany({ data: users.map((record) => ({ ...record, passwordHash: "test" })) });
  await prisma.project.create({ data: {
    id: projectId, name: "Research requests", ownerId: owner.id, createdById: owner.id,
    executors: { create: [executor, otherExecutor].map((record) => ({ userId: record.id })) },
    coOwners: { create: { userId: coOwner.id } },
    workflowStages: { createMany: { data: getInitialProjectWorkflowStageData(new Date()).map((stage, index) => ({
      ...stage, status: index < 2 ? "COMPLETED" as const : index === 2 ? "AVAILABLE" as const : "LOCKED" as const,
      unlockedAt: index <= 2 ? new Date() : null, completedAt: index < 2 ? new Date() : null,
    })) } },
  } });
  const research = await task("Conduct research"), input = { projectId, folderId: research.id };
  assert.equal((await getProjectConceptChatContext(executor, { ...input, stageKey }))?.chatMode.canRequestCompletion, false);
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, input), "Accepting the brief is still required");
  await startProjectStageWork(executor, { projectId, stageId: research.taskerStageId });
  assert.equal((await getProjectConceptChatContext(executor, { ...input, stageKey }))?.chatMode.canRequestCompletion, true);
  for (const actor of [owner, coOwner, otherExecutor, outsider, admin]) {
    assert.ok("error" in await requestStageThreeTaskCompletion(actor, input), "Only the assigned executor can request completion");
    assert.notEqual((await getProjectConceptChatContext(actor, { ...input, stageKey }))?.chatMode.canRequestCompletion, true);
  }
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, { ...input, projectId: "wrong-project" }));
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, { ...input, note: "x".repeat(2001) }));
  for (const field of ["completedAt", "archivedAt"] as const) {
    await prisma.project.update({ where: { id: projectId }, data: { [field]: new Date() } });
    assert.ok("error" in await requestStageThreeTaskCompletion(executor, input));
    await prisma.project.update({ where: { id: projectId }, data: { [field]: null } });
  }
  for (const status of ["LOCKED", "COMPLETED"] as const) {
    await prisma.projectWorkflowStage.updateMany({ where: { projectId, stageKey }, data: { status } });
    assert.ok("error" in await requestStageThreeTaskCompletion(executor, input));
  }
  await prisma.projectWorkflowStage.updateMany({ where: { projectId, stageKey }, data: { status: "AVAILABLE" } });

  const note = "Research is complete. Materials are in Tech → Research.\nCompare A < B & C.";
  const results = await Promise.all([requestStageThreeTaskCompletion(executor, { ...input, note }), requestStageThreeTaskCompletion(executor, { ...input, note })]);
  assert.ok(results.every((result) => !("error" in result)), JSON.stringify(results));
  assert.equal(results.filter((result) => "changed" in result && result.changed).length, 1);
  const pending = await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: research.id }, include: { taskerStage: true } });
  assert.ok(pending.completionRequestedAt);
  assert.equal(pending.completionRequestNote, note);
  assert.equal(pending.taskerStage.status, "ONGOING");
  assert.equal(pending.taskerStage.completedAt, null);
  assert.equal(await prisma.projectAttachment.count({ where: { stageId: research.taskerStageId } }), 0);
  assert.equal(await prisma.projectRevision.count({ where: { stageId: research.taskerStageId } }), 0);
  assert.equal(await prisma.projectComment.count({ where: { stageId: research.taskerStageId, body: { contains: "Task completion requested" } } }), 1);
  const requestComment = await prisma.projectComment.findFirstOrThrow({ where: { stageId: research.taskerStageId, body: { contains: "Task completion requested" } } });
  assert.ok(requestComment.body.includes("A &lt; B &amp; C."));
  const ownerView = await getProjectConceptChatContext(owner, { ...input, stageKey });
  assert.equal(ownerView?.chatMode.completionRequest?.note, note);
  assert.equal(ownerView?.chatMode.canCompleteWithoutFile, true);
  assert.equal((await getProjectConceptChatContext(executor, { ...input, stageKey }))?.chatMode.canRequestCompletion, false);
  assert.equal((await getProjectConceptFolders(owner, projectId, stageKey))?.folders[0].completionRequest?.note, note);
  assert.equal((await getUserProjectWorkspace(projectId, executor))?.assignedConcepts[0].display.status, "WAITING_FOR_REVIEW");
  assert.equal((await getUserTasksPageData(executor)).projects.find((project) => project.id === projectId)?.tasks[0].display.status, "WAITING_FOR_REVIEW");
  assert.equal((await getUserProjectsList({ filter: "ALL", query: "", sort: "updated", page: 1 }, executor)).projects.find((project) => project.id === projectId)?.tasks[0].display.status, "WAITING_FOR_REVIEW");
  assert.ok("error" in await completeStageThreeConcepts(owner, { projectId }), "A request alone must not allow Stage 3 completion");
  await notifyConceptTaskCompletion({ ...input, actorId: executor.id, event: "requested" });
  const notification = await prisma.notification.findFirstOrThrow({ where: { projectId, title: "Task completion requested" } });
  assert.equal(notification.userId, owner.id);
  assert.ok(notification.message.includes(executor.name));
  assert.equal(notification.url, `/projects/${projectId}/stages/3/concepts/${research.id}`);
  assert.equal(await prisma.notification.count({ where: { projectId, userId: coOwner.id } }), 0);
  assert.ok("error" in await completeStageThreeTaskWithoutFile(executor, input));
  assert.ok("error" in await completeStageThreeTaskWithoutFile(coOwner, input));
  assert.ok(!("error" in await completeStageThreeTaskWithoutFile(owner, input)));
  const completed = await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: research.id }, include: { taskerStage: true } });
  assert.equal(completed.completionRequestedAt, null);
  assert.equal(completed.completionRequestNote, null);
  assert.equal(completed.taskerStage.status, "COMPLETED");
  assert.ok(completed.completedWithoutFileAt);
  assert.equal((await getUserProjectWorkspace(projectId, executor))?.assignedConcepts[0].display.status, "COMPLETED");
  assert.equal((await getProjectConceptChatContext(owner, { ...input, stageKey }))?.chatMode.completionRequest, null);
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, input));
  await notifyConceptTaskCompletion({ ...input, actorId: owner.id, event: "completed" });
  assert.equal((await prisma.notification.findFirstOrThrow({ where: { projectId, title: "Task completed" } })).userId, executor.id);

  // A later file submission replaces the earlier request to complete without a file.
  const drawing = await task("Supplemental drawing"), drawingInput = { projectId, folderId: drawing.id };
  await startProjectStageWork(executor, { projectId, stageId: drawing.taskerStageId });
  assert.ok(!("error" in await requestStageThreeTaskCompletion(executor, drawingInput)), "The note is optional");
  const attachment = await prisma.projectAttachment.create({ data: {
    projectId, stageId: drawing.taskerStageId, uploadedById: executor.id,
    fileName: "drawing.pdf", originalFileName: "drawing.pdf", mimeType: "application/pdf", fileSize: 128,
    bucket: "test", storageKey: `${prefix}/drawing.pdf`, assetType: "REVISION_ORIGINAL", status: "UPLOADING",
  } });
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, drawingInput));
  assert.ok("error" in await completeStageThreeTaskWithoutFile(owner, drawingInput));
  await prisma.projectAttachment.update({ where: { id: attachment.id }, data: { status: "READY" } });
  await createStageRevision(executor, { projectId, stageId: drawing.taskerStageId, attachmentIds: [attachment.id] });
  assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: drawing.id } })).completionRequestedAt, null);
  assert.equal((await getProjectConceptChatContext(owner, { ...drawingInput, stageKey }))?.chatMode.completionRequest, null);
  assert.ok(!("error" in await markProjectConceptApprovedAttachment(owner, { ...drawingInput, attachmentId: attachment.id })));
  assert.equal((await prisma.projectConceptFolder.findUniqueOrThrow({ where: { id: drawing.id } })).completionRequestedAt, null);
  assert.ok(!("error" in await completeStageThreeConcepts(owner, { projectId })));
  const stageFour = await createProjectConceptFolder(owner, { projectId, stageKey: "PROJECT_DEVELOPMENT", name: "Stage 4", assignedExecutorId: executor.id, deadline: new Date(Date.now() + 86_400_000).toISOString(), brief: "<p>Final design</p>" });
  assert.ok("folder" in stageFour && stageFour.folder);
  assert.ok("error" in await requestStageThreeTaskCompletion(executor, { projectId, folderId: stageFour.folder.id }));
  console.log("Stage 3 completion requests passed: assignment, acceptance, locks, concurrency, notes, review states, owner notifications and approval with or without files.");
}

main().finally(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((record) => record.id) } } });
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });

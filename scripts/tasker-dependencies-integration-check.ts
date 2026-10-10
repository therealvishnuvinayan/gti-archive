import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createTask, getTaskDetail, mutateTask, listTasks } from "@/lib/tasker/service";
import { getTaskDependencies, mutateTaskDependency } from "@/lib/tasker/dependencies";
import { dependencyState } from "@/lib/tasker/dependency-runtime";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
import { taskFileAccess } from "@/lib/tasker/files";
import { createProjectConceptFolder, completeProjectConceptTaskWithoutFile, requestProjectConceptTaskCompletion, completeStageThreeConcepts, markProjectConceptApprovedAttachment, markStageFourFinalApprovedAttachment, deleteProjectConceptFolder, getProjectConceptChatContext, getProjectConceptFolders } from "@/lib/project-concepts";
import { createStageRevision, createStageTextCommentFast, startProjectStageWork } from "@/lib/project-history";
import { getInitialProjectWorkflowStageData } from "@/lib/project-workflow";
import type { PermissionUser } from "@/lib/permissions/resolver";
import type { TaskMutation, TaskSource, TaskCreateInput, TaskProjectRef } from "@/lib/tasker/types";

async function main() {
  const [owner, coOwner, executor, other, observer, outsider] = await Promise.all(["owner", "co-owner", "executor", "other", "observer", "outsider"].map((name) => prisma.user.create({ data: { name, email: `${name}@dependencies.example.test`, passwordHash: "test-only", role: name === "outsider" ? "SUPER_ADMIN" : "USER" } })));
  const project = await prisma.project.create({ data: { name: "Dependencies", ownerId: owner.id, createdById: owner.id, coOwners: { create: { userId: coOwner.id } }, executors: { create: [executor, other, observer].map((u) => ({ userId: u.id })) }, workflowStages: { create: getInitialProjectWorkflowStageData().map((s, i) => ({ ...s, status: i < 2 ? "COMPLETED" : i === 2 ? "AVAILABLE" : "LOCKED", unlockedAt: i <= 2 ? new Date() : null, completedAt: i < 2 ? new Date() : null })) } } });
  const ref: TaskProjectRef = { projectType: "STRUCTURED", projectId: project.id };
  const source = (id: string): TaskSource => ({ type: "TASK", id });
  const base: TaskCreateInput = { ...ref, kind: "GENERAL", title: "Artwork", brief: "Create artwork", assigneeId: executor.id, coOwnerId: coOwner.id, participantIds: [observer.id] };
  const create = (extra: Partial<TaskCreateInput> = {}, actor: PermissionUser = owner) => createTask(actor, { ...base, ...extra });
  async function act(user: PermissionUser, id: string, action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) { return mutateTask(user, id, { action, version: (await getTaskDetail(user, id)).version, ...extra }); }
  async function link(main: TaskSource, required: TaskSource, requestPause = true, actor: PermissionUser = owner) { return (await mutateTaskDependency(actor, main, { action: "LINK", required, requestPause, reason: "Need the layout before submitting artwork" })).id; }
  async function decide(main: TaskSource, id: string, action: "APPROVE_PAUSE" | "REJECT_PAUSE" | "REQUEST_PAUSE", actor: PermissionUser = owner) {
    const edge = (await getTaskDependencies(actor, main)).links.find((l) => l.id === id)!;
    return mutateTaskDependency(actor, main, { action, dependencyId: id, version: edge.version, note: "Reviewed dependency" });
  }
  const task = await create(), mainSource = source(task);
  await act(executor, task, "START");
  const request = await create({ title: "Layout", assigneeId: coOwner.id, participantIds: [], coOwnerId: null, dependencyOf: { source: mainSource, requestPause: true, reason: "Need layout" } }, executor);
  const edge = (await getTaskDependencies(owner, mainSource)).links[0];
  assert.equal(edge.pauseStatus, "REQUESTED");
  assert.equal((await getTaskDetail(executor, task)).canSubmit, true, "Requested pauses do not stop work");
  assert.equal((await getTaskDependencies(coOwner, source(request))).links[0].relatedTask?.title, "Artwork");
  await assert.rejects(decide(mainSource, edge.id, "APPROVE_PAUSE", coOwner), /Only the project owner/);
  await assert.rejects(decide(mainSource, edge.id, "APPROVE_PAUSE", executor), /Only the project owner/);
  await assert.rejects(getTaskDependencies(outsider, mainSource), /not found/);
  await assert.rejects(link(mainSource, source(request), false, observer), /Only the task owner/);
  const decisionRace = await Promise.allSettled([decide(mainSource, edge.id, "APPROVE_PAUSE"), decide(mainSource, edge.id, "REJECT_PAUSE")]);
  assert.equal(decisionRace.filter((r) => r.status === "fulfilled").length, 1, "Concurrent decisions have one winner");
  if (!(await dependencyState(prisma, mainSource)).paused) { await decide(mainSource, edge.id, "REQUEST_PAUSE", executor); await decide(mainSource, edge.id, "APPROVE_PAUSE"); }
  assert.equal((await getTaskDetail(executor, task)).status, "IN_PROGRESS", "Hold is an overlay, not a replacement status");
  assert.equal((await getTaskDetail(executor, task)).canSubmit, false);
  await assert.rejects(act(executor, task, "SUBMIT", { note: "Cannot submit while paused" }), /paused/);
  await act(executor, task, "COMMENT", { note: "Discussion remains open" });
  assert((await listTasks(owner, ref)).find((t) => t.id === task)?.dependencyState?.paused);
  const second = await create({ title: "Second dependency" }), secondEdge = await link(mainSource, source(second));
  await decide(mainSource, secondEdge, "APPROVE_PAUSE");
  await act(coOwner, request, "SUBMIT", { note: "Layout supplied" });
  assert((await dependencyState(prisma, mainSource)).paused, "Submission is not completion");
  await act(executor, request, "CORRECTIONS", { note: "Please add dimensions" });
  assert((await dependencyState(prisma, mainSource)).paused, "Corrections keep a dependency unresolved");
  await act(coOwner, request, "SUBMIT", { note: "Layout corrected" });
  await act(executor, request, "ACCEPT");
  assert((await dependencyState(prisma, mainSource)).paused, "Every approved blocking dependency must resolve");
  await act(owner, second, "CANCEL", { note: "No longer needed" });
  const resumed = await getTaskDetail(executor, task);
  assert.equal(resumed.dependencyState?.paused, false); assert.equal(resumed.status, "IN_PROGRESS"); assert(resumed.canSubmit);
  assert(resumed.history.some((e) => e.action === "TASK_RESUMED"));
  assert((await getTaskDependencies(owner, mainSource)).links.some((l) => l.outcome === "CANCELLED"));

  // Review already underway remains intact through a pause and resumption.
  await act(executor, task, "SUBMIT", { note: "Artwork ready" });
  const third = await create({ title: "Legal verification" }), thirdEdge = await link(mainSource, source(third));
  await decide(mainSource, thirdEdge, "APPROVE_PAUSE");
  await assert.rejects(act(owner, task, "ACCEPT"), /paused/);
  await act(executor, third, "DECLINE", { note: "Cannot supply legal verification" });
  assert.equal((await getTaskDetail(owner, task)).status, "IN_REVIEW");
  await act(owner, task, "ACCEPT");

  // Nonblocking links, rejected pauses, and dependency deletion never strand work.
  const independent = await create(), needed = await create({ title: "Nonblocking", coOwnerId: null, participantIds: [] });
  const nonblocking = await link(source(independent), source(needed), false);
  assert(!(await dependencyState(prisma, source(independent))).paused);
  await decide(source(independent), nonblocking, "REQUEST_PAUSE"); await decide(source(independent), nonblocking, "REJECT_PAUSE");
  assert(!(await dependencyState(prisma, source(independent))).paused);
  await decide(source(independent), nonblocking, "REQUEST_PAUSE"); await decide(source(independent), nonblocking, "APPROVE_PAUSE");
  const privateLink = (await getTaskDependencies(observer, source(independent))).links[0];
  assert.equal(privateLink.relatedTask, null, "Dependencies do not grant related-task access");
  await act(owner, needed, "DELETE");
  assert.equal((await getTaskDependencies(owner, source(independent))).links[0].outcome, "DELETED");
  assert(!(await dependencyState(prisma, source(independent))).paused);
  const expires = await create(), expiresEdge = await link(source(independent), source(expires));
  await act(owner, expires, "CANCEL", { note: "Resolved before owner decision" });
  await assert.rejects(decide(source(independent), expiresEdge, "APPROVE_PAUSE"), /changed or resolved/);

  const [a, b, c] = await Promise.all([create({ title: "Graph A" }), create({ title: "Graph B" }), create({ title: "Graph C" })]);
  await link(source(a), source(b), false); await link(source(b), source(c), false);
  await assert.rejects(link(source(c), source(a)), /cycle/);
  await assert.rejects(link(source(a), source(a)), /itself/);
  await assert.rejects(link(source(a), source(b)), /already/);
  const [r1, r2] = await Promise.all([create(), create()]);
  const graphRace = await Promise.allSettled([link(source(r1), source(r2)), link(source(r2), source(r1))]);
  assert.equal(graphRace.filter((r) => r.status === "fulfilled").length, 1, "Reciprocal links cannot race past cycle prevention");
  const another = await prisma.project.create({ data: { name: "Other project", ownerId: owner.id, createdById: owner.id } });
  const foreign = await create({ projectId: another.id, assigneeId: owner.id, coOwnerId: null, participantIds: [] });
  await assert.rejects(link(source(a), source(foreign)), /same project/);
  const count = await prisma.taskerTask.count();
  await assert.rejects(create({ dependencyOf: { source: source(foreign), requestPause: true, reason: "Invalid cross-project request" } }), /same project/);
  assert.equal(await prisma.taskerTask.count(), count, "Failed dependency creation rolls back task, events and notifications");

  const [nestedA, nestedB, nestedC] = await Promise.all([create(), create(), create()]);
  const ab = await link(source(nestedA), source(nestedB)), bc = await link(source(nestedB), source(nestedC));
  await decide(source(nestedA), ab, "APPROVE_PAUSE"); await decide(source(nestedB), bc, "APPROVE_PAUSE");
  await act(executor, nestedC, "SUBMIT", { note: "C ready" }); await act(owner, nestedC, "ACCEPT");
  assert(!(await dependencyState(prisma, source(nestedB))).paused);
  assert((await dependencyState(prisma, source(nestedA))).paused, "Resuming a prerequisite does not complete it");
  await act(executor, nestedB, "SUBMIT", { note: "B ready" }); await act(owner, nestedB, "ACCEPT");
  assert(!(await dependencyState(prisma, source(nestedA))).paused);

  const raceMain = await create(), raceRequired = await create();
  await act(executor, raceMain, "SUBMIT", { note: "Already in review" });
  const raceEdge = await link(source(raceMain), source(raceRequired));
  const raceVersion = (await getTaskDetail(owner, raceMain)).version;
  const completionRace = await Promise.allSettled([decide(source(raceMain), raceEdge, "APPROVE_PAUSE"), mutateTask(owner, raceMain, { action: "ACCEPT", version: raceVersion })]);
  assert.equal(completionRace.filter((r) => r.status === "fulfilled").length, 1, "Pause approval and main-task completion cannot both win");
  const afterRace = await getTaskDetail(owner, raceMain);
  assert(afterRace.status === "COMPLETED" ? !afterRace.dependencyState?.paused : afterRace.dependencyState?.paused);

  const hiddenMain = await create({ coOwnerId: null, participantIds: [] }), visibleRequest = await create({ assigneeId: other.id, coOwnerId: null, participantIds: [] });
  await link(source(hiddenMain), source(visibleRequest), false);
  const incoming = (await getTaskDependencies(other, source(visibleRequest))).links[0];
  assert.equal(incoming.relatedTask, null); assert.equal(incoming.reason, ""); assert.deepEqual(incoming.history, [], "Incoming links do not reveal a restricted main task's notes");

  // Removing an assignment revokes dependency access; an owner can still cancel
  // an orphan request to release its approved hold.
  const orphan = await create({ assigneeId: other.id, coOwnerId: null, participantIds: [] });
  const orphanEdge = await link(source(a), source(orphan)); await decide(source(a), orphanEdge, "APPROVE_PAUSE");
  await prisma.projectExecutor.delete({ where: { projectId_userId: { projectId: project.id, userId: other.id } } });
  await assert.rejects(getTaskDependencies(other, source(orphan)), /not found/);
  await act(owner, orphan, "CANCEL", { note: "Recipient left the project" });
  assert(!(await dependencyState(prisma, source(a))).paused);

  // Paused task reference previews keep their existing scope.
  const reference = await prisma.taskerFile.create({ data: { taskId: independent, uploadedById: executor.id, originalFileName: "reference.png", mimeType: "image/png", fileSize: 10, bucket: "test", storageKey: `ref/${randomUUID()}`, uploadKey: `ref-upload/${randomUUID()}`, status: "READY" } });
  assert.equal((await taskFileAccess(executor, independent, reference.id, "preview", { preview: async () => "preview", download: async () => "download", text: async () => "text" })).url, "preview");

  // Native Stage 3/4 concepts work in either direction without replacing approval.
  for (const stageKey of ["CONCEPT_CREATION", "PROJECT_DEVELOPMENT"] as const) {
    if (stageKey === "PROJECT_DEVELOPMENT") await prisma.projectWorkflowStage.update({ where: { projectId_stageKey: { projectId: project.id, stageKey } }, data: { status: "AVAILABLE" } });
    const made = await createProjectConceptFolder(owner, { projectId: project.id, stageKey, name: `Native ${stageKey}`, assignedExecutorId: executor.id, deadline: new Date(Date.now() + 86400000).toISOString(), brief: "<p>Create artwork</p>" });
    assert("folder" in made && made.folder, JSON.stringify(made));
    const concept = made.folder, native: TaskSource = { type: "CONCEPT", id: concept.id };
    await startProjectStageWork(executor, { projectId: project.id, stageId: concept.taskerStageId });
    const nativeRequest = await create({ title: "Native needs layout", assigneeId: owner.id, coOwnerId: null, participantIds: [], dependencyOf: { source: native, requestPause: true, reason: "Need an owner response" } }, executor);
    const nativeEdge = (await getTaskDependencies(owner, native)).links[0]; await decide(native, nativeEdge.id, "APPROVE_PAUSE");
    const pausedContext = await getProjectConceptChatContext(executor, { projectId: project.id, folderId: concept.id, stageKey });
    assert(pausedContext?.chatMode.dependencyPaused); assert.equal(pausedContext.chatMode.canRequestCompletion, false);
    const pausedFolder = (await getProjectConceptFolders(owner, project.id, stageKey))?.folders.find((f) => f.id === concept.id);
    assert(pausedFolder?.dependencyPaused); assert.equal(pausedFolder.canCompleteWithoutFile, false);
    await assert.rejects(requestProjectConceptTaskCompletion(executor, { projectId: project.id, folderId: concept.id, stageKey }), /paused/);
    await assert.rejects(completeProjectConceptTaskWithoutFile(owner, { projectId: project.id, folderId: concept.id, stageKey }), /paused/);
    if (stageKey === "CONCEPT_CREATION") {
      const blocked = await completeStageThreeConcepts(owner, { projectId: project.id, completeOpenTasks: true }).catch((e: Error) => ({ error: e.message }));
      assert("error" in blocked && /paused/.test(blocked.error), JSON.stringify(blocked));
    }
    const attachment = await prisma.projectAttachment.create({ data: { projectId: project.id, stageId: concept.taskerStageId, uploadedById: executor.id, fileName: "design.pdf", originalFileName: "design.pdf", mimeType: "application/pdf", fileSize: 10, bucket: "test", storageKey: `native/${randomUUID()}`, assetType: "REVISION_ORIGINAL", status: "READY" } });
    await assert.rejects(createStageRevision(executor, { projectId: project.id, stageId: concept.taskerStageId, attachmentIds: [attachment.id] }), /paused/);
    await createStageTextCommentFast(executor, { projectId: project.id, stageId: concept.taskerStageId, body: "Discussion while paused" });
    await act(owner, nativeRequest, "SUBMIT", { note: "Layout provided" }); await act(executor, nativeRequest, "ACCEPT");
    const revision = await createStageRevision(executor, { projectId: project.id, stageId: concept.taskerStageId, attachmentIds: [attachment.id] });
    assert(revision.id);
    const awaitingNative = await create(), nativeRequired = await link(source(awaitingNative), native); await decide(source(awaitingNative), nativeRequired, "APPROVE_PAUSE");
    const approve = stageKey === "CONCEPT_CREATION" ? markProjectConceptApprovedAttachment : markStageFourFinalApprovedAttachment;
    const blocker = await create(), blockerEdge = await link(native, source(blocker)); await decide(native, blockerEdge, "APPROVE_PAUSE");
    await assert.rejects(approve(owner, { projectId: project.id, folderId: concept.id, attachmentId: attachment.id }), /paused/);
    await act(owner, blocker, "CANCEL", { note: "Not needed" });
    const approved = await approve(owner, { projectId: project.id, folderId: concept.id, attachmentId: attachment.id });
    assert(!("error" in approved), JSON.stringify(approved));
    assert(!(await dependencyState(prisma, source(awaitingNative))).paused, "Native final-file approval resolves its dependencies");
  }
  const fileless = await createProjectConceptFolder(owner, { projectId: project.id, stageKey: "PROJECT_DEVELOPMENT", name: "Fileless", assignedExecutorId: executor.id, deadline: new Date(Date.now() + 86400000).toISOString(), brief: "<p>Research</p>" });
  assert("folder" in fileless && fileless.folder);
  const fsource: TaskSource = { type: "CONCEPT", id: fileless.folder.id }, waiting = await create();
  const fedge = await link(source(waiting), fsource); await decide(source(waiting), fedge, "APPROVE_PAUSE");
  assert(!("error" in await completeProjectConceptTaskWithoutFile(owner, { projectId: project.id, stageKey: "PROJECT_DEVELOPMENT", folderId: fileless.folder.id })));
  assert(!(await dependencyState(prisma, source(waiting))).paused);
  const removed = await createProjectConceptFolder(owner, { projectId: project.id, stageKey: "PROJECT_DEVELOPMENT", name: "Deleted concept", assignedExecutorId: executor.id, deadline: new Date(Date.now() + 86400000).toISOString(), brief: "<p>Research</p>" });
  assert("folder" in removed && removed.folder);
  const deletedSource: TaskSource = { type: "CONCEPT", id: removed.folder.id }, dEdge = await link(source(waiting), deletedSource); await decide(source(waiting), dEdge, "APPROVE_PAUSE");
  assert(!("error" in await deleteProjectConceptFolder(owner, { projectId: project.id, stageKey: "PROJECT_DEVELOPMENT", folderId: removed.folder.id })));
  assert(!(await dependencyState(prisma, source(waiting))).paused);
  assert((await getTaskDependencies(owner, source(waiting))).links.some((l) => l.outcome === "DELETED" && l.relatedTask === null));

  const flexible = await prisma.flexibleProject.create({ data: { name: "Flexible", slug: `dependencies-${randomUUID()}`, ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: new Date(), collaborators: { create: { userId: executor.id } } } });
  const flexBase = { projectId: flexible.id, projectType: "FLEXIBLE" as const, kind: "GENERAL" as const, title: "Flexible revision", brief: "Late correction", assigneeId: executor.id };
  const fm = await createTask(owner, flexBase), fr = await createTask(executor, { ...flexBase, assigneeId: owner.id, dependencyOf: { source: source(fm), requestPause: true, reason: "Input for correction" } });
  await decide(source(fm), (await getTaskDependencies(owner, source(fm))).links[0].id, "APPROVE_PAUSE");
  await act(owner, fr, "SUBMIT", { note: "Input provided" }); await act(executor, fr, "ACCEPT");
  assert(!(await dependencyState(prisma, source(fm))).paused);
  assert.equal((await prisma.flexibleProject.findUniqueOrThrow({ where: { id: flexible.id } })).status, "COMPLETED", "Dependencies never reopen projects or stages");
  assert.equal((await prisma.projectWorkflowStage.findUniqueOrThrow({ where: { projectId_stageKey: { projectId: project.id, stageKey: "FINAL_LAYOUT" } } })).status, "LOCKED");

  const delivery = await prisma.taskerDelivery.findFirstOrThrow({ where: { dedupeKey: { startsWith: "tasker-dependency:" }, conceptId: { not: null }, userId: executor.id } });
  await prisma.taskerDelivery.updateMany({ where: { id: { not: delivery.id } }, data: { sentAt: new Date() } });
  let email = "";
  assert.equal((await deliverTaskerEmails({ send: async (input) => { email = input.text!; return { ok: true }; } })).sent, 1);
  assert(email.includes(`/tasks/concepts/${delivery.conceptId}/dependencies`));
  await prisma.taskerDelivery.update({ where: { id: delivery.id }, data: { sentAt: null, availableAt: new Date(0) } });
  await prisma.projectConceptFolder.updateMany({ where: { projectId: project.id, assignedExecutorId: executor.id }, data: { assignedExecutorId: observer.id } });
  await prisma.projectExecutor.delete({ where: { projectId_userId: { projectId: project.id, userId: executor.id } } });
  assert.equal((await deliverTaskerEmails({ send: async () => { throw new Error("Removed participants must not receive dependency mail"); } })).sent, 0);
  console.log("Phase 3 dependencies passed: owner decisions, multiple/nested holds, access isolation, cancellation/deletion, atomic creation, cycle and decision races, native Stage 3/4 guards/resolution, flexible projects and notifications.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

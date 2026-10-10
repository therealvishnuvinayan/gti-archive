import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getProjectReopening, reopenProject } from "@/lib/project-reopening";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS, getProjectWorkflowSequenceState } from "@/lib/project-workflow";
import { closeStageSevenProject, decidePhysicalSampleRound, deleteProductionSampleRound } from "@/lib/stage-seven";
import { completeStageFive, completeStageSix, configureMarketingDirector, getStageSixWorkspaceData } from "@/lib/stage-six";
import { setFlexibleMilestoneCompleted, duplicateFlexibleMilestone } from "@/lib/flexible-projects";
import { createTask, getTaskDetail } from "@/lib/tasker/service";
import { deleteAttachmentForUser } from "@/lib/project-history";
import type { TaskProjectRef } from "@/lib/tasker/types";

async function main() {
  const [owner, coOwner, executor, outsider] = await Promise.all(["owner", "coowner", "executor", "outsider"].map((name) => prisma.user.create({ data: { name, email: `${name}@reopening.example.test`, passwordHash: "test-only", role: name === "owner" ? "ADMIN" : name === "outsider" ? "SUPER_ADMIN" : "USER" } })));
  const issuedAt = new Date("2026-01-01T00:00:00Z");
  async function fixture() {
    const project = await prisma.project.create({ data: { name: "Completed artwork", ownerId: owner.id, createdById: owner.id, completedAt: issuedAt, coOwners: { create: { userId: coOwner.id } }, executors: { create: { userId: executor.id } }, workflowStages: { create: PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((s) => ({ stageKey: s.key, status: "COMPLETED", unlockedAt: issuedAt, completedAt: issuedAt })) }, closures: { create: { closedById: owner.id, closedAt: issuedAt } } } });
    const ref: TaskProjectRef = { projectType: "STRUCTURED", projectId: project.id };
    const attachment = await prisma.projectAttachment.create({ data: { projectId: project.id, uploadedById: owner.id, fileName: "artwork.pdf", originalFileName: "Artwork.pdf", mimeType: "application/pdf", fileSize: 100, bucket: "test-only", storageKey: `reopening/${randomUUID()}`, assetType: "GENERAL_PROJECT_ASSET", status: "READY" } });
    const handoff = await prisma.projectStageFileHandoff.create({ data: { projectId: project.id, sourceWorkflowStageKey: "FINAL_LAYOUT", targetWorkflowStageKey: "FINAL_LAYOUT", sourceAttachmentId: attachment.id, handedOffById: owner.id } });
    const checklist = await prisma.projectFileChecklist.create({ data: { projectId: project.id, handoffId: handoff.id, sourceAttachmentId: attachment.id } });
    const unit = await prisma.projectProductionUnit.create({ data: { projectId: project.id, sourceHandoffId: handoff.id, sourceChecklistId: checklist.id, sourceAttachmentId: attachment.id, createdById: owner.id, status: "HANDED_OVER", approvedAt: issuedAt, handedOverAt: issuedAt,
      approvalSteps: { create: { sequence: 1, isMarketingDirectorRequired: true, status: "APPROVED", decidedAt: issuedAt, sharedSnapshot: { issued: "Approval v1" } } },
      handover: { create: { clientRequestId: randomUUID(), route: "PURCHASE_DEPARTMENT", recipientType: "EXISTING_COLLABORATOR", recipientName: "Purchasing", recipientEmail: "purchasing@example.test", contentSnapshot: { issued: "Handover v1" }, requestedById: owner.id, deliveryStatus: "SENT", sentAt: issuedAt } },
      supervision: { create: { projectId: project.id, status: "SIGNED_OFF", signedOffById: owner.id, signedOffAt: issuedAt, sampleRounds: { create: { projectId: project.id, sequence: 1, name: "Approved sample", type: "CUSTOM", customTypeName: "Proof", deadline: issuedAt, createdById: owner.id, status: "COMPLETED", decision: "ACCEPTED", decidedAt: issuedAt, decidedById: owner.id, createdAt: issuedAt } } } },
    }, include: { approvalSteps: true, handover: true, supervision: { include: { sampleRounds: true } } } });
    const archive = await prisma.projectArchive.create({ data: { projectId: project.id, archivedById: owner.id, projectName: project.name, projectCategory: "Artwork", status: "SAVED", archivedAt: issuedAt } });
    return { project, ref, attachment, unit, archive };
  }
  const input = async (ref: TaskProjectRef, targetRef: string) => ({ ...ref, targetRef, reason: "Owner approved a product revision", expectedUpdatedAt: (await getProjectReopening(owner, ref)).expectedUpdatedAt });
  const first = await fixture();
  const request = await input(first.ref, "6");
  const pendingTask = await createTask(owner, { ...first.ref, kind: "GENERAL", title: "Late work", brief: "Collect revised artwork", assigneeId: executor.id });
  for (const user of [coOwner, executor, outsider]) await assert.rejects(reopenProject(user, request), /Only the project owner/);
  await assert.rejects(getProjectReopening(executor, first.ref), /Only the project owner/);
  assert.equal((await getProjectReopening(coOwner, first.ref)).canReopen, false);
  await assert.rejects(reopenProject(owner, { ...request, targetRef: "8" }), /valid stage/);
  await assert.rejects(reopenProject(owner, { ...request, reason: " " }), /reason/);
  await assert.rejects(reopenProject(owner, { ...request, expectedUpdatedAt: issuedAt.toISOString() }), /changed/);
  const race = await Promise.allSettled([reopenProject(owner, request), reopenProject(owner, request)]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await prisma.projectReopening.count({ where: { projectId: first.project.id } }), 1);
  const live = await prisma.project.findUniqueOrThrow({ where: { id: first.project.id }, include: { workflowStages: true } });
  assert.equal(live.completedAt, null); assert.equal(live.workflowCycle, 2);
  const sequence = getProjectWorkflowSequenceState(live.workflowStages);
  assert.equal(sequence.kind, "ACTIVE"); assert.equal(sequence.currentStage?.number, 6);
  const oldUnit = await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: first.unit.id }, include: { approvalSteps: true, handover: true } });
  assert(oldUnit.retiredAt); assert.equal(oldUnit.status, "HANDED_OVER");
  assert.deepEqual(oldUnit.approvalSteps, first.unit.approvalSteps); assert.deepEqual(oldUnit.handover, first.unit.handover);
  assert.deepEqual(await prisma.projectArchive.findUniqueOrThrow({ where: { id: first.archive.id } }), first.archive);
  assert.equal((await getTaskDetail(executor, pendingTask)).status, "ASSIGNED");
  const current = await prisma.projectProductionUnit.findFirstOrThrow({ where: { projectId: live.id, retiredAt: null }, include: { approvalSteps: true } });
  assert.equal(current.cycle, 2); assert.equal(current.status, "PREPARATION"); assert.equal(current.approvalSteps[0].status, "WAITING");
  assert.equal((await getStageSixWorkspaceData(owner, live.id))?.units.length, 1);
  assert("error" in await completeStageSix(owner, { projectId: live.id }), "Old approvals cannot complete the new cycle");
  assert("error" in await configureMarketingDirector(owner, { projectId: live.id, productionUnitId: oldUnit.id, clientRequestId: randomUUID(), recipientType: "EXISTING_COLLABORATOR", recipientUserId: coOwner.id, sharedFieldKeys: [], selectedFileIds: [first.attachment.id] }), "Historical units cannot be changed");
  await assert.rejects(deleteAttachmentForUser(owner, first.attachment.id), /snapshot/);
  const history = await getProjectReopening(owner, first.ref);
  assert.equal(history.history.length, 1); assert.equal(history.history[0].reason, request.reason);
  assert.equal((history.history[0].snapshot as { workflowCycle: number }).workflowCycle, 1);
  const coOwnerHistory = (await getProjectReopening(coOwner, first.ref)).history[0].snapshot;
  assert(!JSON.stringify(coOwnerHistory).includes("productionUnits") && !JSON.stringify(coOwnerHistory).includes("concepts"), "Reopening history must not grant co-owners access to unrelated task content");

  // Reopen Stage 7, require new physical review, and issue another closure without replacing the first.
  const seven = await fixture(); await reopenProject(owner, await input(seven.ref, "7"));
  await assert.rejects(closeStageSevenProject(owner, { projectId: seven.project.id }), /samples must be accepted/);
  const round1 = seven.unit.supervision!.sampleRounds[0];
  await assert.rejects(deleteProductionSampleRound(owner, { projectId: seven.project.id, productionUnitId: seven.unit.id, sampleRoundId: round1.id }), /previous completed workflow/);
  const withdrawn = await prisma.productionSampleRound.create({ data: { projectId: seven.project.id, supervisionId: seven.unit.supervision!.id, sequence: 2, name: "Withdrawn request", type: "CUSTOM", customTypeName: "Proof", deadline: new Date(), createdById: owner.id } });
  await deleteProductionSampleRound(owner, { projectId: seven.project.id, productionUnitId: seven.unit.id, sampleRoundId: withdrawn.id });
  assert.equal((await prisma.projectProductionSupervision.findUniqueOrThrow({ where: { id: seven.unit.supervision!.id } })).status, "NOT_STARTED", "Deleting a new request must not reuse a previous cycle's sign-off");
  const round2 = await prisma.productionSampleRound.create({ data: { projectId: seven.project.id, supervisionId: seven.unit.supervision!.id, sequence: 2, name: "Revised sample", type: "CUSTOM", customTypeName: "Proof", deadline: new Date(), createdById: owner.id, status: "UNDER_REVIEW", deliveredAt: new Date(), recipientUserId: owner.id } });
  await decidePhysicalSampleRound(owner, { projectId: seven.project.id, productionUnitId: seven.unit.id, sampleRoundId: round2.id, decision: "ACCEPTED" });
  assert.equal((await closeStageSevenProject(owner, { projectId: seven.project.id })).duplicate, false);
  assert.equal((await closeStageSevenProject(owner, { projectId: seven.project.id })).duplicate, true);
  assert.equal(await prisma.projectClosure.count({ where: { projectId: seven.project.id } }), 2);
  assert.deepEqual(await prisma.productionSampleRound.findUniqueOrThrow({ where: { id: round1.id } }), round1);
  await reopenProject(owner, await input(seven.ref, "5"));
  const fiveResult = await completeStageFive(owner, { projectId: seven.project.id }); assert(!("error" in fiveResult), JSON.stringify(fiveResult));
  assert.equal(await prisma.projectProductionUnit.count({ where: { projectId: seven.project.id, retiredAt: null, cycle: 3 } }), 1);
  assert.equal(await prisma.projectReopening.count({ where: { projectId: seven.project.id } }), 2);

  // Every earlier stage resumes a valid completed-prefix/available/locked-suffix workflow.
  for (const stage of ["1", "2", "3", "4"]) {
    const fixtureProject = await fixture(); await reopenProject(owner, await input(fixtureProject.ref, stage));
    const stages = await prisma.projectWorkflowStage.findMany({ where: { projectId: fixtureProject.project.id } });
    assert.equal(getProjectWorkflowSequenceState(stages).currentStage?.number, Number(stage));
    assert.equal(await prisma.projectProductionUnit.count({ where: { projectId: fixtureProject.project.id, retiredAt: null } }), 0);
  }

  const flexible = await prisma.flexibleProject.create({ data: { name: "Completed event", slug: `reopen-${randomUUID()}`, ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: issuedAt, collaborators: { create: { userId: executor.id } }, milestones: { create: [1, 2, 3].map((n) => ({ name: `Milestone ${n}`, sortOrder: n, status: "COMPLETED", completedAt: issuedAt, completedById: owner.id })) } }, include: { milestones: { orderBy: { sortOrder: "asc" } } } });
  const flexRef: TaskProjectRef = { projectType: "FLEXIBLE", projectId: flexible.id };
  assert("error" in await setFlexibleMilestoneCompleted(executor, flexible.id, flexible.milestones[1].id, false));
  assert("error" in await duplicateFlexibleMilestone(owner, flexible.id, flexible.milestones[1].id));
  await assert.rejects(reopenProject(owner, await input(flexRef, first.project.id)), /milestone in this project/);
  const flexInput = await input(flexRef, flexible.milestones[1].id);
  await assert.rejects(reopenProject(executor, flexInput), /Only the project owner/);
  const flexRace = await Promise.allSettled([reopenProject(owner, flexInput), reopenProject(owner, flexInput)]);
  assert.equal(flexRace.filter((r) => r.status === "fulfilled").length, 1);
  const milestones = await prisma.flexibleMilestone.findMany({ where: { projectId: flexible.id }, orderBy: { sortOrder: "asc" } });
  assert.deepEqual(milestones[0], flexible.milestones[0]); assert.equal(milestones[1].status, "PENDING"); assert.deepEqual(milestones[2], flexible.milestones[2]);
  assert(!("error" in await setFlexibleMilestoneCompleted(owner, flexible.id, milestones[1].id, true)));
  assert.equal((await prisma.flexibleProject.findUniqueOrThrow({ where: { id: flexible.id } })).status, "COMPLETED");
  await reopenProject(owner, await input(flexRef, milestones[2].id));
  assert.equal((await getProjectReopening(owner, flexRef)).history.length, 2);
  console.log("Project reopening passed: owner authority, stale and concurrent requests, stages 1–7, flexible milestones, fresh approvals, repeated closure, sample review and immutable snapshots/task history.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

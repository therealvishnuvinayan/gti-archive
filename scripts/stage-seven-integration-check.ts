import { randomUUID } from "node:crypto";
import {
  AttachmentAssetType,
  AttachmentStatus,
  ProductionApprovalRecipientType,
  ProductionDispatchStatus,
  ProductionSampleCriterion,
  ProductionSampleDecision,
  ProductionSampleRoundType,
  ProductionSupervisionStatus,
  ProjectProductionUnitStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import type { SendEmailInput } from "../src/lib/email/resend";
import { prisma } from "../src/lib/prisma";
import { requestAttachmentUpload } from "../src/lib/project-history";
import {
  addProductionSampleEvidence,
  addProductionSampleParticipant,
  closeStageSevenProject,
  completeProductionSampleMilestone,
  completeProductionSampleRound,
  createProductionSampleRound,
  getStageSevenFeedbackDraft,
  getStageSevenWorkspaceData,
  processStageSevenOverdueDeadlines,
  sendStageSevenFeedback,
  signOffProductionUnit,
  STAGE_SEVEN_CRITERIA,
  updateProductionSampleEvaluation,
  updateProductionSampleRoundDecision,
} from "../src/lib/stage-seven";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage 7 integration check failed: ${message}`);
}

async function expectRejected(task: Promise<unknown>, message: string) {
  try {
    await task;
  } catch {
    return;
  }
  throw new Error(`Stage 7 integration check failed: ${message}`);
}

function dueDates(offsetHours = 24) {
  const base = Date.now() + offsetHours * 60 * 60 * 1000;
  return {
    submissionDueAt: new Date(base).toISOString(),
    reviewDueAt: new Date(base + 60 * 60 * 1000).toISOString(),
    revisionSignoffDueAt: new Date(base + 2 * 60 * 60 * 1000).toISOString(),
    deliveryDueAt: new Date(base + 3 * 60 * 60 * 1000).toISOString(),
  };
}

async function createProjectFixture(input: {
  id: string;
  ownerId: string;
  coOwnerId: string;
  executorId: string;
  collaboratorId: string;
  unitCount: number;
  runId: string;
}) {
  await prisma.project.create({
    data: {
      id: input.id,
      name: `Stage 7 ${input.id}`,
      createdById: input.ownerId,
      ownerId: input.ownerId,
      coOwners: { create: [{ userId: input.coOwnerId, addedById: input.ownerId }] },
      executors: { create: [{ userId: input.executorId, addedById: input.ownerId }] },
      collaborators: {
        create: [{ userId: input.collaboratorId, addedById: input.ownerId, canInteract: true }],
      },
      workflowStages: {
        create: getInitialProjectWorkflowStageData().map((stage) => ({
          ...stage,
          status:
            stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER
              ? ProjectWorkflowStageStatus.COMPLETED
              : stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION
                ? ProjectWorkflowStageStatus.AVAILABLE
                : stage.status,
          ...(stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION
            ? { unlockedAt: new Date() }
            : {}),
        })),
      },
    },
  });
  const units = [];
  for (let index = 0; index < input.unitCount; index += 1) {
    const source = await prisma.projectAttachment.create({
      data: {
        projectId: input.id,
        uploadedById: input.ownerId,
        fileName: `unit-${index}.pdf`,
        originalFileName: `Production Unit ${index + 1}.pdf`,
        mimeType: "application/pdf",
        fileSize: 1024,
        bucket: "stage-seven-integration",
        storageKey: `stage-seven/${input.runId}/${input.id}/unit-${index}`,
        assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
        status: AttachmentStatus.READY,
      },
    });
    const handoff = await prisma.projectStageFileHandoff.create({
      data: {
        projectId: input.id,
        sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
        sourceAttachmentId: source.id,
        targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
        handedOffById: input.ownerId,
      },
    });
    const checklist = await prisma.projectFileChecklist.create({
      data: {
        projectId: input.id,
        handoffId: handoff.id,
        sourceAttachmentId: source.id,
      },
    });
    units.push(
      await prisma.projectProductionUnit.create({
        data: {
          projectId: input.id,
          sourceHandoffId: handoff.id,
          sourceChecklistId: checklist.id,
          sourceAttachmentId: source.id,
          status: ProjectProductionUnitStatus.HANDED_OVER,
          createdById: input.ownerId,
          approvedAt: new Date(),
          handedOverAt: new Date(),
        },
      }),
    );
  }
  return units;
}

async function evaluateRound(
  actor: { id: string; role: UserRole },
  input: { projectId: string; productionUnitId: string; sampleRoundId: string },
  overallDecision: ProductionSampleDecision,
) {
  await addProductionSampleParticipant(actor, {
    ...input,
    participantUserId: actor.id,
  });
  for (const [index, criterion] of STAGE_SEVEN_CRITERIA.entries()) {
    await updateProductionSampleEvaluation(actor, {
      ...input,
      criterion,
      decision:
        index === 1
          ? ProductionSampleDecision.CONDITIONAL
          : index === 2
            ? ProductionSampleDecision.FAIL
            : ProductionSampleDecision.PASS,
      comment: `Criterion ${index + 1} audited`,
    });
  }
  await updateProductionSampleRoundDecision(actor, {
    ...input,
    decision: overallDecision,
    notes: `Independent ${overallDecision} decision`,
  });
  for (const milestone of ["SUBMISSION", "REVIEW", "REVISION_SIGNOFF", "DELIVERY"] as const) {
    await completeProductionSampleMilestone(actor, { ...input, milestone });
  }
}

async function main() {
  process.env.AWS_REGION ||= "us-east-1";
  process.env.AWS_ACCESS_KEY_ID ||= "stage-seven-test";
  process.env.AWS_SECRET_ACCESS_KEY ||= "stage-seven-test-secret";
  process.env.AWS_S3_BUCKET ||= "stage-seven-integration";
  process.env.S3_USE_ACCELERATE_ENDPOINT ||= "false";
  const runId = randomUUID();
  const ids = {
    owner: `s7-owner-${runId}`,
    coOwner: `s7-coowner-${runId}`,
    executor: `s7-executor-${runId}`,
    collaborator: `s7-collab-${runId}`,
    admin: `s7-admin-${runId}`,
    superAdmin: `s7-super-${runId}`,
    outsider: `s7-outsider-${runId}`,
    project: `s7-main-${runId}`,
    foreignProject: `s7-foreign-${runId}`,
  };
  const userIds = [ids.owner, ids.coOwner, ids.executor, ids.collaborator, ids.admin, ids.superAdmin, ids.outsider];
  const projectIds = [ids.project, ids.foreignProject];
  const owner = { id: ids.owner, role: UserRole.COLLABORATOR };
  const coOwner = { id: ids.coOwner, role: UserRole.COLLABORATOR };
  const executor = { id: ids.executor, role: UserRole.COLLABORATOR };
  const collaborator = { id: ids.collaborator, role: UserRole.COLLABORATOR };
  const admin = { id: ids.admin, role: UserRole.ADMIN };
  const superAdmin = { id: ids.superAdmin, role: UserRole.SUPER_ADMIN };
  const emailLog: SendEmailInput[] = [];
  const sendSuccess = async (email: SendEmailInput) => {
    emailLog.push(email);
    return { ok: true as const, id: `stage-seven-${emailLog.length}` };
  };
  const sendFailure = async () => ({ ok: false as const, error: "Mock email failure" });

  try {
    await prisma.user.createMany({
      data: [
        [ids.owner, UserRole.COLLABORATOR],
        [ids.coOwner, UserRole.COLLABORATOR],
        [ids.executor, UserRole.COLLABORATOR],
        [ids.collaborator, UserRole.COLLABORATOR],
        [ids.admin, UserRole.ADMIN],
        [ids.superAdmin, UserRole.SUPER_ADMIN],
        [ids.outsider, UserRole.COLLABORATOR],
      ].map(([id, role]) => ({
        id,
        email: `${id}@example.test`,
        name: id,
        passwordHash: "integration-only",
        role: role as UserRole,
      })),
    });
    const units = await createProjectFixture({ id: ids.project, ownerId: ids.owner, coOwnerId: ids.coOwner, executorId: ids.executor, collaboratorId: ids.collaborator, unitCount: 2, runId });
    const foreignUnits = await createProjectFixture({ id: ids.foreignProject, ownerId: ids.outsider, coOwnerId: ids.coOwner, executorId: ids.executor, collaboratorId: ids.collaborator, unitCount: 1, runId });
    const initial = await getStageSevenWorkspaceData(owner, ids.project);
    check(initial?.units.length === 2, "loader must derive only real Stage 6 HANDED_OVER units");
    check(initial.units.every((unit) => unit.status === ProductionSupervisionStatus.NOT_STARTED), "missing supervision must derive NOT_STARTED without writes");
    check((await prisma.projectProductionSupervision.count({ where: { projectId: ids.project } })) === 0, "loader must not create supervision rows");
    const [ownerUploadActor, adminUploadActor, executorUploadActor] = await Promise.all(
      [ids.owner, ids.admin, ids.executor].map((id) =>
        prisma.user.findUniqueOrThrow({ where: { id } }),
      ),
    );
    const imagePreparation = await requestAttachmentUpload(ownerUploadActor, { projectId: ids.project, originalFileName: "Evidence.jpg", mimeType: "image/jpeg", fileSize: 100, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE });
    const videoPreparation = await requestAttachmentUpload(ownerUploadActor, { projectId: ids.project, originalFileName: "Evidence.mp4", mimeType: "video/mp4", fileSize: 200, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE });
    check(!("error" in imagePreparation) && !("error" in videoPreparation), "manager must be able to prepare image and video evidence uploads");
    check("error" in await requestAttachmentUpload(adminUploadActor, { projectId: ids.project, originalFileName: "Admin.jpg", mimeType: "image/jpeg", fileSize: 100, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE }), "ADMIN alone must not prepare Stage 7 evidence uploads");
    check("error" in await requestAttachmentUpload(executorUploadActor, { projectId: ids.project, originalFileName: "Executor.mp4", mimeType: "video/mp4", fileSize: 100, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE }), "executor must not prepare Stage 7 evidence uploads");

    await expectRejected(createProductionSampleRound(admin, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `admin-round-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates() }), "ADMIN alone must not manage Stage 7");
    await expectRejected(createProductionSampleRound(executor, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `exec-round-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates() }), "executor must not manage Stage 7");
    await expectRejected(createProductionSampleRound(collaborator, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `collab-round-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates() }), "collaborator must not manage Stage 7");
    await expectRejected(createProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `bad-date-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates(), reviewDueAt: new Date(Date.now() - 1000).toISOString() }), "server must reject invalid deadline chronology");

    const roundOne = await createProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `round-one-${runId}`, type: ProductionSampleRoundType.CUSTOM, customTypeName: "Colour-corrected proof", initialNotes: "Initial note", ...dueDates(-48) });
    check(!roundOne.duplicate, "custom Round 1 must be created");
    const roundOneRow = await prisma.productionSampleRound.findUniqueOrThrow({ where: { id: roundOne.id }, include: { evaluations: true } });
    check(roundOneRow.sequence === 1 && roundOneRow.customTypeName === "Colour-corrected proof", "custom name and per-unit sequence must persist");
    check(roundOneRow.evaluations.length === 7 && new Set(roundOneRow.evaluations.map((item) => item.criterion)).size === 7, "exactly seven unique criteria must be created");
    check((await prisma.projectProductionSupervision.count({ where: { productionUnitId: units[0].id } })) === 1, "first action must create exactly one supervision");
    await expectRejected(completeProductionSampleMilestone(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, milestone: "REVIEW" }), "out-of-order milestone must be rejected");
    await expectRejected(completeProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id }), "completion must require criteria, overall decision, participant, and milestones");
    await addProductionSampleParticipant(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, participantUserId: ids.owner });
    await expectRejected(addProductionSampleParticipant(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, participantUserId: ids.owner }), "duplicate participant must be rejected");

    const image = await prisma.projectAttachment.create({ data: { projectId: ids.project, uploadedById: ids.owner, fileName: "proof.jpg", originalFileName: "Proof.jpg", mimeType: "image/jpeg", fileSize: 2048, bucket: "stage-seven-integration", storageKey: `stage-seven/${runId}/proof.jpg`, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE, status: AttachmentStatus.READY } });
    const video = await prisma.projectAttachment.create({ data: { projectId: ids.project, uploadedById: ids.owner, fileName: "test.mp4", originalFileName: "Test.mp4", mimeType: "video/mp4", fileSize: 4096, bucket: "stage-seven-integration", storageKey: `stage-seven/${runId}/test.mp4`, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE, status: AttachmentStatus.READY } });
    const foreignEvidence = await prisma.projectAttachment.create({ data: { projectId: ids.foreignProject, uploadedById: ids.outsider, fileName: "foreign.jpg", originalFileName: "Foreign.jpg", mimeType: "image/jpeg", fileSize: 100, bucket: "stage-seven-integration", storageKey: `stage-seven/${runId}/foreign.jpg`, assetType: AttachmentAssetType.SAMPLE_ROUND_EVIDENCE, status: AttachmentStatus.READY } });
    await addProductionSampleEvidence(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, attachmentId: image.id, criterion: ProductionSampleCriterion.GRAPHIC_REPRODUCTION });
    await addProductionSampleEvidence(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, attachmentId: video.id });
    await expectRejected(addProductionSampleEvidence(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, attachmentId: foreignEvidence.id }), "cross-project evidence must be rejected");

    for (const criterion of STAGE_SEVEN_CRITERIA) {
      await updateProductionSampleEvaluation(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, criterion, decision: ProductionSampleDecision.PASS, comment: `${criterion} comment` });
    }
    await updateProductionSampleEvaluation(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, criterion: ProductionSampleCriterion.CONSTRUCTION, decision: ProductionSampleDecision.CONDITIONAL, comment: "Construction conditional" });
    await updateProductionSampleEvaluation(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, criterion: ProductionSampleCriterion.GRAPHIC_ELEMENTS, decision: ProductionSampleDecision.FAIL, comment: "Graphic failure" });
    await updateProductionSampleRoundDecision(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, decision: ProductionSampleDecision.FAIL, notes: "Overall fail is independent" });
    for (const milestone of ["SUBMISSION", "REVIEW", "REVISION_SIGNOFF", "DELIVERY"] as const) await completeProductionSampleMilestone(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, milestone });
    await completeProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id });
    check((await prisma.projectProductionSupervision.findUniqueOrThrow({ where: { productionUnitId: units[0].id } })).status === ProductionSupervisionStatus.REVISIONS_NEEDED, "FAIL must set REVISIONS_NEEDED");
    check((await completeProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id })).duplicate, "double Round Complete must be idempotent");
    await expectRejected(updateProductionSampleRoundDecision(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, decision: ProductionSampleDecision.PASS }), "completed round must be locked");

    const concurrent = await Promise.all([
      createProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `concurrent-a-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates() }),
      createProductionSampleRound(coOwner, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `concurrent-b-${runId}`, type: ProductionSampleRoundType.FINAL_MASS_PRODUCTION_SIGN_OFF, ...dueDates() }),
    ]);
    const concurrentRows = await prisma.productionSampleRound.findMany({ where: { id: { in: concurrent.map((item) => item.id) } }, orderBy: { sequence: "asc" } });
    check(concurrentRows.length === 2 && concurrentRows[0].sequence !== concurrentRows[1].sequence, "concurrent creation must allocate unique per-unit sequences");
    check((await prisma.projectProductionSupervision.findUniqueOrThrow({ where: { productionUnitId: units[0].id } })).status === ProductionSupervisionStatus.IN_REVIEW, "new round after revisions must return unit to IN_REVIEW");
    const finalRoundA = concurrentRows.at(-1)!;
    await prisma.productionSampleRound.delete({ where: { id: concurrentRows[0].id } });
    await evaluateRound(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: finalRoundA.id }, ProductionSampleDecision.PASS);
    await completeProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: finalRoundA.id });
    check((await prisma.projectProductionSupervision.findUniqueOrThrow({ where: { productionUnitId: units[0].id } })).status === ProductionSupervisionStatus.IN_REVIEW, "PASS must not auto-sign-off unit");
    await signOffProductionUnit(owner, { projectId: ids.project, productionUnitId: units[0].id });
    check((await signOffProductionUnit(owner, { projectId: ids.project, productionUnitId: units[0].id })).duplicate, "double sign-off must be idempotent");
    check((await prisma.projectProductionUnit.findUniqueOrThrow({ where: { id: units[0].id } })).status === ProjectProductionUnitStatus.HANDED_OVER, "Stage 6 HANDED_OVER status must remain unchanged");
    await expectRejected(createProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[0].id, clientRequestId: `signed-round-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates() }), "signed-off unit must be read-only");

    const unitBRound = await createProductionSampleRound(superAdmin, { projectId: ids.project, productionUnitId: units[1].id, clientRequestId: `unit-b-${runId}`, type: ProductionSampleRoundType.PRODUCTION_SAMPLE, ...dueDates(-24) });
    await expectRejected(updateProductionSampleRoundDecision(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: unitBRound.id, decision: ProductionSampleDecision.PASS }), "cross-unit manipulation must be rejected");
    await expectRejected(updateProductionSampleRoundDecision(owner, { projectId: ids.project, productionUnitId: units[1].id, sampleRoundId: roundOne.id, decision: ProductionSampleDecision.PASS }), "round cannot cross Production Units");
    await expectRejected(updateProductionSampleRoundDecision(owner, { projectId: ids.foreignProject, productionUnitId: foreignUnits[0].id, sampleRoundId: unitBRound.id, decision: ProductionSampleDecision.PASS }), "cross-project manipulation must be rejected");

    await completeProductionSampleMilestone(owner, { projectId: ids.project, productionUnitId: units[1].id, sampleRoundId: unitBRound.id, milestone: "SUBMISSION" });
    const overdueBefore = await processStageSevenOverdueDeadlines(new Date());
    check(overdueBefore.attemptedNotifications >= 3, "overdue processor must find only uncompleted due milestones");
    await processStageSevenOverdueDeadlines(new Date());
    const overdueNotifications = await prisma.notification.findMany({ where: { type: "STAGE_SEVEN_OVERDUE", entityId: unitBRound.id } });
    check(overdueNotifications.length === 6, "three overdue milestones must notify owner and co-owner exactly once");
    check(overdueNotifications.every((item) => item.userId === ids.owner || item.userId === ids.coOwner), "overdue alerts must target only Owner and Co-Owners");
    check(overdueNotifications.every((item) => item.userId !== ids.superAdmin), "SUPER_ADMIN must not be auto-notified");

    await evaluateRound(owner, { projectId: ids.project, productionUnitId: units[1].id, sampleRoundId: unitBRound.id }, ProductionSampleDecision.PASS);
    await completeProductionSampleRound(owner, { projectId: ids.project, productionUnitId: units[1].id, sampleRoundId: unitBRound.id });
    await expectRejected(closeStageSevenProject(owner, { projectId: ids.project }), "closure must be blocked while a unit is unsigned");
    await signOffProductionUnit(coOwner, { projectId: ids.project, productionUnitId: units[1].id });

    const draft = await getStageSevenFeedbackDraft(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, selectedEvidenceIds: [image.id].filter(() => false) });
    check(draft.text.includes("Production Unit 1.pdf") && !draft.text.includes("Production Unit 2.pdf"), "feedback draft must contain only selected unit/round data");
    const evidenceDraft = await getStageSevenFeedbackDraft(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id });
    check(evidenceDraft.evidenceLinks.length === 2 && evidenceDraft.evidenceLinks.every((item) => item.url.includes("X-Amz-")), "feedback must use expiring signed evidence links");
    await expectRejected(sendStageSevenFeedback(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, clientRequestId: `feedback-fail-${runId}`, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Purchase", recipientEmail: "purchase@example.test" }, { sendEmail: sendFailure }), "failed feedback email must return failure");
    check((await prisma.productionSampleFeedback.findUniqueOrThrow({ where: { clientRequestId: `feedback-fail-${runId}` } })).status === ProductionDispatchStatus.FAILED, "failed feedback must not be marked SENT");
    await sendStageSevenFeedback(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, clientRequestId: `feedback-fail-${runId}`, recipientType: ProductionApprovalRecipientType.EXTERNAL_EMAIL, recipientName: "Purchase", recipientEmail: "purchase@example.test", subject: "Edited subject", message: "Edited professional message" }, { sendEmail: sendSuccess });
    check((await prisma.productionSampleFeedback.findUniqueOrThrow({ where: { clientRequestId: `feedback-fail-${runId}` } })).status === ProductionDispatchStatus.SENT, "failed feedback retry must become SENT");
    const internal = await sendStageSevenFeedback(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, clientRequestId: `feedback-internal-${runId}`, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.collaborator }, { sendEmail: sendSuccess });
    check(!internal.duplicate && emailLog.at(-1)?.to === `${ids.collaborator}@example.test`, "internal Purchase feedback must use saved validated email");
    check((await sendStageSevenFeedback(owner, { projectId: ids.project, productionUnitId: units[0].id, sampleRoundId: roundOne.id, clientRequestId: `feedback-internal-${runId}`, recipientType: ProductionApprovalRecipientType.EXISTING_COLLABORATOR, recipientUserId: ids.collaborator }, { sendEmail: sendSuccess })).duplicate, "double feedback-send must not resend");

    const workspace = await getStageSevenWorkspaceData(owner, ids.project, units[1].id, unitBRound.id);
    check(workspace?.summary.totalUnits === 2 && workspace.summary.signedOffUnits === 2 && workspace.summary.activeRounds === 0, "real summary and selected-unit data must reflect persisted state");
    const archiveCount = await prisma.projectArchive.count({ where: { projectId: ids.project } });
    const closure = await closeStageSevenProject(owner, { projectId: ids.project });
    check(!closure.duplicate, "all signed-off units must permit project closure");
    check((await closeStageSevenProject(owner, { projectId: ids.project })).duplicate, "double Close Project must be idempotent");
    const closedProject = await prisma.project.findUniqueOrThrow({ where: { id: ids.project }, include: { closure: true, workflowStages: true } });
    check(Boolean(closedProject.closure && closedProject.completedAt), "manual project closure audit and completedAt must persist");
    check(closedProject.archivedAt === null && (await prisma.projectArchive.count({ where: { projectId: ids.project } })) === archiveCount, "project closure must not archive or mutate archive records");
    check(closedProject.workflowStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION)?.status === ProjectWorkflowStageStatus.COMPLETED, "Stage 7 must become COMPLETED");
    console.log("Stage 7 supervision, security, evidence, overdue, feedback, sign-off, and manual closure integration checks passed.");
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

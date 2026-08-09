import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectRevisionStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  StageStatus,
  UserRole,
} from "@prisma/client";

import {
  createProjectConceptFolder,
  editProjectConceptFolder,
  getProjectConceptChatContext,
  getProjectConceptFolders,
} from "../src/lib/project-concepts";
import {
  canManageProjectConcept,
  canViewProjectConcept,
  canWorkOnProjectConcept,
  getProjectConceptAccessContext,
} from "../src/lib/project-concept-access";
import {
  assertProjectAttachmentVisibilityForUser,
  createStageTextCommentFast,
  getProjectStageChatMessages,
  reviewProjectRevision,
  reviewStageSubmission,
  startProjectStageWork,
} from "../src/lib/project-history";
import { getVisibleStageEventRecipientUserIds } from "../src/lib/notification-center/recipients";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Concept Round 1 integration check failed: ${message}`);
}

function isErrorResult(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function expectRejected(task: Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await task;
  } catch {
    rejected = true;
  }
  check(rejected, message);
}

async function main() {
  const runId = randomUUID();
  const projectId = `concept-round-one-${runId}`;
  const userSpecs = [
    ["super", UserRole.SUPER_ADMIN],
    ["owner", UserRole.COLLABORATOR],
    ["coowner", UserRole.ADMIN],
    ["executor-a", UserRole.COLLABORATOR],
    ["executor-b", UserRole.COLLABORATOR],
    ["collaborator", UserRole.COLLABORATOR],
    ["admin-outsider", UserRole.ADMIN],
  ] as const;
  const userIds = userSpecs.map(([label]) => `concept-${label}-${runId}`);

  try {
    await prisma.user.createMany({
      data: userSpecs.map(([label, role], index) => ({
        id: userIds[index],
        email: `${label}-${runId}@example.test`,
        name: label.replaceAll("-", " "),
        passwordHash: "round-one-test-only",
        role,
      })),
    });
    const [superAdmin, owner, coOwner, executorA, executorB, collaborator, adminOutsider] =
      await Promise.all(
        userIds.map((id) =>
          prisma.user.findUniqueOrThrow({
            where: { id },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              collaboratorType: true,
            },
          }),
        ),
      );

    await prisma.project.create({
      data: {
        id: projectId,
        name: `Concept Round 1 ${runId}`,
        ownerId: owner.id,
        createdById: superAdmin.id,
        coOwners: { create: [{ userId: coOwner.id, addedById: superAdmin.id }] },
        executors: {
          create: [
            { userId: executorA.id, addedById: owner.id },
            { userId: executorB.id, addedById: owner.id },
          ],
        },
        collaborators: {
          create: [{ userId: collaborator.id, addedById: owner.id }],
        },
        workflowStages: {
          create: getInitialProjectWorkflowStageData().map((stage) => ({
            ...stage,
            status:
              stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ||
              stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT
                ? ProjectWorkflowStageStatus.AVAILABLE
                : stage.status,
            unlockedAt:
              stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ||
              stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT
                ? new Date()
                : stage.unlockedAt,
          })),
        },
      },
    });

    const countBeforeReads = await prisma.projectConceptFolder.count({ where: { projectId } });
    const emptyStageThree = await getProjectConceptFolders(
      owner,
      projectId,
      ProjectWorkflowStageKey.CONCEPT_CREATION,
    );
    const emptyStageFour = await getProjectConceptFolders(
      superAdmin,
      projectId,
      ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
    );
    check(emptyStageThree?.folders.length === 0, "Stage 3 must render an empty state");
    check(emptyStageFour?.folders.length === 0, "Stage 4 must render an empty state");
    check(
      (await prisma.projectConceptFolder.count({ where: { projectId } })) === countBeforeReads,
      "reading Stage 3/4 must not create Concept 1",
    );

    const missingExecutor = await createProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: "Concept 1",
      assignedExecutorId: "",
      brief: "First direction",
    });
    check(isErrorResult(missingExecutor), "new concepts must require an executor");

    const invalidExecutor = await createProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: "Concept 1",
      assignedExecutorId: collaborator.id,
      brief: "First direction",
    });
    check(isErrorResult(invalidExecutor), "a normal collaborator cannot be assigned");

    const conceptA = await createProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: "  Concept   1  ",
      assignedExecutorId: executorA.id,
      brief: "  First direction  ",
    });
    check(!isErrorResult(conceptA), "owner must create a concept");
    const taskerA = await prisma.projectStage.findUniqueOrThrow({
      where: { id: conceptA.folder.taskerStageId },
    });
    check(taskerA.description === "First direction", "brief must use ProjectStage.description");
    check(taskerA.actualStartedAt === null, "new tasker must not be accepted automatically");
    check(taskerA.startedById === null, "new tasker starter must remain null");
    check(taskerA.status === StageStatus.ONGOING, "new tasker must remain ONGOING");
    check(!taskerA.invoiceRequired, "concept taskers must not require invoices");

    const duplicate = await createProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: " concept 1 ",
      assignedExecutorId: executorA.id,
    });
    check(isErrorResult(duplicate), "normalized duplicate names must be rejected");

    const conceptB = await createProjectConceptFolder(coOwner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: "Concept 2",
      assignedExecutorId: executorB.id,
      brief: "Second direction",
    });
    check(!isErrorResult(conceptB), "co-owner must create a concept");

    const ownerView = await getProjectConceptFolders(owner, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION);
    const coOwnerView = await getProjectConceptFolders(coOwner, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION);
    const superView = await getProjectConceptFolders(superAdmin, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION);
    const executorAView = await getProjectConceptFolders(executorA, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION);
    const executorATamperedView = await getProjectConceptFolders(
      executorA,
      projectId,
      ProjectWorkflowStageKey.CONCEPT_CREATION,
      { executorId: executorB.id },
    );
    check(ownerView?.folders.length === 2, "owner must see every concept");
    check(coOwnerView?.folders.length === 2, "co-owner must see every concept");
    check(superView?.folders.length === 2, "SUPER_ADMIN must see every concept");
    check(
      executorAView?.folders.length === 1 && executorAView.folders[0].id === conceptA.folder.id,
      "executor A must see only its assigned concept",
    );
    check(
      executorATamperedView?.folders.length === 1 &&
        executorATamperedView.folders[0].id === conceptA.folder.id &&
        !executorATamperedView.canManage,
      "executor query tampering must not broaden access or expose the switcher",
    );
    check(
      (await getProjectConceptFolders(collaborator, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION)) === null,
      "normal collaborator must be denied",
    );
    check(
      (await getProjectConceptFolders(adminOutsider, projectId, ProjectWorkflowStageKey.CONCEPT_CREATION)) === null,
      "ADMIN role alone must not grant concept access",
    );

    const accessA = await getProjectConceptAccessContext({
      projectId,
      folderId: conceptA.folder.id,
    });
    check(accessA, "concept access context must resolve");
    check(canManageProjectConcept(owner, accessA), "owner must manage concepts");
    check(canManageProjectConcept(coOwner, accessA), "co-owner must manage concepts");
    check(canViewProjectConcept(superAdmin, accessA), "SUPER_ADMIN must view concepts");
    check(canWorkOnProjectConcept(executorA, accessA), "assigned executor must work");
    check(!canViewProjectConcept(executorB, accessA), "other executor must not view");
    check(!canViewProjectConcept(adminOutsider, accessA), "unrelated ADMIN must not view");

    check(
      await getProjectConceptChatContext(executorA, {
        projectId,
        stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
        folderId: conceptA.folder.id,
      }),
      "assigned executor must open its folder route",
    );
    check(
      (await getProjectConceptChatContext(executorA, {
        projectId,
        stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
        folderId: conceptB.folder.id,
      })) === null,
      "executor must not guess another folder URL",
    );
    await expectRejected(
      getProjectStageChatMessages(executorA, projectId, conceptB.folder.taskerStageId),
      "executor must not guess another taskerStageId",
    );

    await expectRejected(
      startProjectStageWork(executorB, {
        projectId,
        stageId: conceptA.folder.taskerStageId,
      }),
      "other executor must not accept the concept",
    );
    await startProjectStageWork(executorA, {
      projectId,
      stageId: conceptA.folder.taskerStageId,
    });
    const startedA = await prisma.projectStage.findUniqueOrThrow({
      where: { id: conceptA.folder.taskerStageId },
    });
    check(startedA.actualStartedAt !== null, "acceptance must set actualStartedAt");
    check(startedA.startedById === executorA.id, "acceptance must record assigned executor");

    const lockedEdit = await editProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      folderId: conceptA.folder.id,
      name: "Renamed Accepted Concept",
      assignedExecutorId: executorB.id,
      brief: "Changed after acceptance",
    });
    check(isErrorResult(lockedEdit), "accepted assignment and brief must be locked");
    const renameOnly = await editProjectConceptFolder(owner, {
      projectId,
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      folderId: conceptA.folder.id,
      name: "Renamed Accepted Concept",
    });
    check(!isErrorResult(renameOnly), "safe display rename may remain available");
    check(
      renameOnly.folder.taskerStageId === conceptA.folder.taskerStageId,
      "rename must preserve tasker/chat identity",
    );

    await startProjectStageWork(executorB, {
      projectId,
      stageId: conceptB.folder.taskerStageId,
    });
    const commentA = await createStageTextCommentFast(executorA, {
      projectId,
      stageId: conceptA.folder.taskerStageId,
      body: `Only concept A ${runId}`,
      mentionedUserIds: [owner.id, coOwner.id, executorB.id, collaborator.id],
    });
    const commentB = await createStageTextCommentFast(executorB, {
      projectId,
      stageId: conceptB.folder.taskerStageId,
      body: `Only concept B ${runId}`,
    });
    check(
      commentA.mentions.some((mention) => mention.mentionedUserId === owner.id) &&
        commentA.mentions.some((mention) => mention.mentionedUserId === coOwner.id) &&
        !commentA.mentions.some((mention) => mention.mentionedUserId === executorB.id) &&
        !commentA.mentions.some((mention) => mention.mentionedUserId === collaborator.id),
      "concept mentions must be owner/co-owner/assigned-executor scoped",
    );
    const historyA = await getProjectStageChatMessages(
      executorA,
      projectId,
      conceptA.folder.taskerStageId,
      { includeWorkflowCards: "never" },
    );
    check(
      historyA.entries.some((entry) => entry.id === commentA.id) &&
        !historyA.entries.some((entry) => entry.id === commentB.id),
      "concept messages must remain isolated by taskerStageId",
    );

    const attachmentA = await prisma.projectAttachment.create({
      data: {
        projectId,
        stageId: conceptA.folder.taskerStageId,
        uploadedById: owner.id,
        fileName: `concept-a-${runId}.txt`,
        originalFileName: "concept-a.txt",
        mimeType: "text/plain",
        fileSize: 12,
        bucket: "integration-test",
        storageKey: `integration/${runId}/concept-a.txt`,
        assetType: AttachmentAssetType.GENERAL_PROJECT_ASSET,
        status: AttachmentStatus.READY,
      },
    });
    await assertProjectAttachmentVisibilityForUser(owner, {
      projectId,
      stageId: conceptA.folder.taskerStageId,
      createdAt: attachmentA.createdAt,
      project: { ownerId: owner.id, coOwners: [{ userId: coOwner.id }] },
    });
    await expectRejected(
      assertProjectAttachmentVisibilityForUser(executorB, {
        projectId,
        stageId: conceptA.folder.taskerStageId,
        createdAt: attachmentA.createdAt,
        project: { ownerId: owner.id, coOwners: [{ userId: coOwner.id }] },
      }),
      "another executor must not retrieve a concept attachment",
    );

    const recipients = await getVisibleStageEventRecipientUserIds(projectId, new Date(), {
      stageId: conceptA.folder.taskerStageId,
      excludeUserId: executorA.id,
    });
    check(recipients.includes(owner.id) && recipients.includes(coOwner.id), "concept notifications must include managers");
    check(!recipients.includes(executorB.id), "concept notifications must exclude other executors");
    check(!recipients.includes(collaborator.id), "concept notifications must exclude collaborators");
    check(!recipients.includes(superAdmin.id), "SUPER_ADMIN must not be auto-notified");

    const legacyTaskerSubmission = await prisma.projectAttachment.create({
      data: {
        projectId,
        stageId: conceptA.folder.taskerStageId,
        uploadedById: executorA.id,
        fileName: `legacy-tasker-submission-${runId}.png`,
        originalFileName: "legacy-tasker-submission.png",
        mimeType: "image/png",
        fileSize: 12,
        bucket: "integration-test",
        storageKey: `integration/${runId}/legacy-tasker-submission.png`,
        assetType: AttachmentAssetType.STAGE_SUBMISSION,
        status: AttachmentStatus.READY,
        submissionReviewStatus: "PENDING_REVIEW",
      },
    });
    await expectRejected(
      reviewStageSubmission(owner, {
        attachmentId: legacyTaskerSubmission.id,
        status: "APPROVED",
      }),
      "legacy direct attachment approval must also be blocked for taskers",
    );
    const legacyRejection = await reviewStageSubmission(owner, {
      attachmentId: legacyTaskerSubmission.id,
      status: "REJECTED",
      note: "Request changes through the safe legacy path.",
    });
    check(
      legacyRejection.submissionReviewStatus === "REJECTED",
      "legacy attachment rejection must remain available",
    );

    const taskerRevision = await prisma.projectRevision.create({
      data: {
        projectId,
        stageId: conceptA.folder.taskerStageId,
        createdById: executorA.id,
        revisionNumber: 1,
        title: "Concept A submission",
        status: ProjectRevisionStatus.PENDING_REVIEW,
      },
    });
    await expectRejected(
      reviewProjectRevision(owner, {
        projectId,
        stageId: conceptA.folder.taskerStageId,
        revisionId: taskerRevision.id,
        status: "APPROVED",
      }),
      "legacy tasker approval must be blocked",
    );
    const stillPending = await prisma.projectRevision.findUniqueOrThrow({
      where: { id: taskerRevision.id },
    });
    check(stillPending.status === ProjectRevisionStatus.PENDING_REVIEW, "blocked approval must not mutate revision");
    check(
      (await prisma.projectCompletionWorkflow.count({ where: { projectId } })) === 0,
      "blocked tasker approval must not initialize project completion",
    );
    const requestedChanges = await reviewProjectRevision(owner, {
      projectId,
      stageId: conceptA.folder.taskerStageId,
      revisionId: taskerRevision.id,
      status: "REJECTED",
      reason: "Please revise this direction.",
    });
    check(requestedChanges.status === ProjectRevisionStatus.REJECTED, "Request Changes must remain available");

    const normalStage = await prisma.projectStage.create({
      data: {
        projectId,
        name: "Normal regression stage",
        description: "Non-tasker approval control",
        invoiceRequired: false,
        isTasker: false,
        actualStartedAt: new Date(),
        startedById: executorA.id,
        status: StageStatus.ONGOING,
        order: 1,
      },
    });
    const normalRevision = await prisma.projectRevision.create({
      data: {
        projectId,
        stageId: normalStage.id,
        createdById: executorA.id,
        revisionNumber: 1,
        title: "Normal stage submission",
      },
    });
    const normalApproval = await reviewProjectRevision(owner, {
      projectId,
      stageId: normalStage.id,
      revisionId: normalRevision.id,
      status: "APPROVED",
    });
    check(normalApproval.status === ProjectRevisionStatus.APPROVED, "normal stage approval must remain healthy");
  } finally {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Stage 3/4 Round 1 concept integration checks passed.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

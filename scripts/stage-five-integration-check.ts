import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  StageStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import type { SendEmailInput } from "../src/lib/email/resend";
import {
  getStageFiveWorkspaceData,
  handoffStageFourFiles,
  requestStageFiveChecklistInformation,
  saveStageFiveChecklist,
} from "../src/lib/stage-five";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage 5 integration check failed: ${message}`);
}

function isError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function main() {
  const runId = randomUUID();
  const isolated = process.env.STAGE_FIVE_ISOLATED === "1";
  const createdUserIds = isolated
    ? [
        `stage-five-super-admin-${runId}`,
        `stage-five-owner-${runId}`,
        `stage-five-recipient-${runId}`,
        `stage-five-outsider-${runId}`,
      ]
    : [];
  if (isolated) {
    await prisma.user.createMany({
      data: createdUserIds.map((id, index) => ({
        id,
        email: `${id}@example.test`,
        name: ["Stage Five Super Admin", "Stage Five Owner", "Stage Five Recipient", "Stage Five Outsider"][index],
        passwordHash: "isolated-integration-test-only",
        role: index === 0 ? UserRole.SUPER_ADMIN : index === 1 ? UserRole.ADMIN : UserRole.COLLABORATOR,
      })),
    });
  }
  const users = await prisma.user.findMany({
    ...(isolated ? { where: { id: { in: createdUserIds } } } : {}),
    select: { id: true, name: true, email: true, role: true, collaboratorType: true },
    orderBy: { createdAt: "asc" },
  });
  const superAdmin = users.find((user) => user.role === UserRole.SUPER_ADMIN);
  const owner = users.find((user) => user.role !== UserRole.SUPER_ADMIN);
  const recipient = users.find(
    (user) => user.role === UserRole.COLLABORATOR && user.id !== owner?.id,
  );
  const outsider = users.find(
    (user) =>
      user.role === UserRole.COLLABORATOR &&
      user.id !== owner?.id &&
      user.id !== recipient?.id,
  );
  check(superAdmin, "an existing SUPER_ADMIN is required");
  check(owner, "an existing non-SUPER_ADMIN owner is required");
  check(recipient, "an existing collaborator recipient is required");
  check(outsider, "an unrelated collaborator is required");

  const projectId = `stage-five-integration-${runId}`;
  const foreignProjectId = `stage-five-foreign-${runId}`;
  const stageId = `stage-five-stage-four-${runId}`;
  const foreignStageId = `stage-five-foreign-stage-${runId}`;
  const attachmentAId = `stage-five-file-a-${runId}`;
  const attachmentBId = `stage-five-file-b-${runId}`;
  const foreignAttachmentId = `stage-five-file-foreign-${runId}`;
  const checklistAttachmentId = `stage-five-checklist-file-${runId}`;
  const foreignChecklistAttachmentId = `stage-five-checklist-foreign-${runId}`;

  try {
    await prisma.project.createMany({
      data: [projectId, foreignProjectId].map((id, index) => ({
        id,
        name: index ? `Foreign Stage 5 ${runId}` : `Stage 5 Integration ${runId}`,
        ownerId: owner.id,
        createdById: superAdmin.id,
      })),
    });
    await prisma.projectCollaborator.create({
      data: {
        projectId,
        userId: recipient.id,
        canInteract: true,
        addedById: owner.id,
      },
    });
    await prisma.projectWorkflowStage.createMany({
      data: [projectId, foreignProjectId].flatMap((id) =>
        getInitialProjectWorkflowStageData().map((stage) => ({
          projectId: id,
          ...stage,
          status:
            stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT ||
            stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT
              ? ProjectWorkflowStageStatus.AVAILABLE
              : stage.status,
          unlockedAt:
            stage.stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT ||
            stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT
              ? new Date()
              : stage.unlockedAt,
        })),
      ),
    });
    await prisma.projectStage.createMany({
      data: [
        {
          id: stageId,
          projectId,
          name: "Final Concept Test Folder",
          isTasker: true,
          invoiceRequired: false,
          status: StageStatus.ONGOING,
          order: 40_001,
        },
        {
          id: foreignStageId,
          projectId: foreignProjectId,
          name: "Foreign Final Concept Test Folder",
          isTasker: true,
          invoiceRequired: false,
          status: StageStatus.ONGOING,
          order: 40_001,
        },
      ],
    });
    await prisma.projectConceptFolder.createMany({
      data: [
        {
          id: `stage-five-folder-${runId}`,
          projectId,
          workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          taskerStageId: stageId,
          name: "Final Concept Test Folder",
          normalizedName: "final concept test folder",
          createdById: owner.id,
        },
        {
          id: `stage-five-foreign-folder-${runId}`,
          projectId: foreignProjectId,
          workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          taskerStageId: foreignStageId,
          name: "Foreign Final Concept Test Folder",
          normalizedName: "foreign final concept test folder",
          createdById: owner.id,
        },
      ],
    });
    await prisma.projectAttachment.createMany({
      data: [
        [attachmentAId, projectId, stageId, "Package_Artwork_Final.ai"],
        [attachmentBId, projectId, stageId, "Print_Master.pdf"],
        [foreignAttachmentId, foreignProjectId, foreignStageId, "Foreign.pdf"],
      ].map(([id, targetProjectId, targetStageId, name]) => ({
        id,
        projectId: targetProjectId,
        stageId: targetStageId,
        uploadedById: owner.id,
        fileName: name,
        originalFileName: name,
        mimeType: name.endsWith(".pdf") ? "application/pdf" : "application/postscript",
        fileSize: 1024,
        bucket: "stage-five-integration",
        storageKey: `stage-five-integration/${id}`,
        assetType: AttachmentAssetType.COMMENT_ATTACHMENT,
        status: AttachmentStatus.READY,
      })),
    });

    const chatCountBefore = await prisma.projectComment.count({ where: { projectId } });
    const handoff = await handoffStageFourFiles(owner, {
      projectId,
      attachmentIds: [attachmentAId, attachmentBId],
    });
    check(!isError(handoff) && handoff.handoffs.length === 2, "multiple Stage 4 files must be handed off");
    const duplicate = await handoffStageFourFiles(owner, {
      projectId,
      attachmentIds: [attachmentAId, attachmentBId],
    });
    check(!isError(duplicate), "repeated handoff must be idempotent");
    check(
      (await prisma.projectStageFileHandoff.count({ where: { projectId } })) === 2,
      "duplicate handoff rows must be prevented",
    );
    const crossProject = await handoffStageFourFiles(owner, {
      projectId,
      attachmentIds: [foreignAttachmentId],
    });
    check(isError(crossProject), "cross-project Stage 4 handoff must fail");
    check(
      (await prisma.projectComment.count({ where: { projectId } })) === chatCountBefore,
      "handoff must not mutate Stage 4 chat",
    );

    const initial = await getStageFiveWorkspaceData(owner, projectId);
    check(initial?.files.length === 2, "Stage 5 must list every handed-off file");
    check(
      initial.files.every((file) => file.items.length === 15),
      "every file must expose all 15 independent checklist fields",
    );
    const fileA = initial.files.find((file) => file.sourceAttachment.id === attachmentAId);
    const fileB = initial.files.find((file) => file.sourceAttachment.id === attachmentBId);
    check(fileA && fileB, "both handed-off files must have checklists");

    await prisma.projectAttachment.createMany({
      data: [
        [checklistAttachmentId, projectId],
        [foreignChecklistAttachmentId, foreignProjectId],
      ].map(([id, targetProjectId]) => ({
        id,
        projectId: targetProjectId,
        uploadedById: owner.id,
        fileName: `${id}.pdf`,
        originalFileName: `${id}.pdf`,
        mimeType: "application/pdf",
        fileSize: 2048,
        bucket: "stage-five-integration",
        storageKey: `stage-five-integration/${id}`,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
        status: AttachmentStatus.READY,
      })),
    });

    const savedA = await saveStageFiveChecklist(owner, {
      projectId,
      handoffId: fileA.handoffId,
      items: [
        {
          fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
          value: { text: "Carton Artwork" },
          attachmentIds: [],
        },
        {
          fieldKey: ProjectFileChecklistField.PRINTING_TECHNOLOGY,
          value: { values: ["Offset Printing", "UV Coating"] },
          attachmentIds: [],
        },
        {
          fieldKey: ProjectFileChecklistField.TECHNICAL_DRAWING,
          value: {},
          attachmentIds: [checklistAttachmentId],
        },
      ],
    });
    check(!isError(savedA), "File A text, multi-values, and attachment must save");
    const savedB = await saveStageFiveChecklist(owner, {
      projectId,
      handoffId: fileB.handoffId,
      items: [
        {
          fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
          value: { text: "Inner Pack Artwork" },
          attachmentIds: [],
        },
      ],
    });
    check(!isError(savedB), "File B must save independently");

    const persisted = await getStageFiveWorkspaceData(owner, projectId);
    const persistedA = persisted?.files.find((file) => file.handoffId === fileA.handoffId);
    const persistedB = persisted?.files.find((file) => file.handoffId === fileB.handoffId);
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.OUTPUT_NAME)?.value.text === "Carton Artwork",
      "File A Output Name must persist",
    );
    check(
      persistedB?.items.find((item) => item.fieldKey === ProjectFileChecklistField.OUTPUT_NAME)?.value.text === "Inner Pack Artwork",
      "File B Output Name must remain isolated",
    );
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.TECHNICAL_DRAWING)?.attachments.length === 1,
      "checklist attachment association must persist",
    );
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.COMPULSORY_TEXT)?.status === ProjectFileChecklistItemStatus.PENDING,
      "an empty item must remain PENDING",
    );
    const crossChecklistAttachment = await saveStageFiveChecklist(owner, {
      projectId,
      handoffId: fileA.handoffId,
      items: [{ fieldKey: ProjectFileChecklistField.INVOICE, value: {}, attachmentIds: [foreignChecklistAttachmentId] }],
    });
    check(isError(crossChecklistAttachment), "cross-project checklist attachment injection must fail");

    const unrelatedRequest = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: `unrelated_${randomUUID()}`,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: outsider.id,
    });
    check(isError(unrelatedRequest), "an unrelated user must not receive an in-app request");

    const inAppId = `inapp_${randomUUID()}`;
    const inApp = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: inAppId,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: recipient.id,
      message: "Please provide the approved compulsory copy.",
    });
    check(!isError(inApp), "existing project participant request must succeed");
    const repeatedInApp = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: inAppId,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: recipient.id,
    });
    check(!isError(repeatedInApp) && repeatedInApp.duplicate, "the same submission must be idempotent");
    const notifications = await prisma.notification.findMany({
      where: { projectId, type: "CHECKLIST_INFORMATION_REQUESTED" },
    });
    check(notifications.length === 1, "one in-app submission must create exactly one notification");
    check(
      notifications[0].url?.includes(`file=${fileA.handoffId}`) &&
        notifications[0].url?.includes("field=COMPULSORY_TEXT") &&
        notifications[0].url?.includes("mode=edit"),
      "notification must deep-link to the correct file and field",
    );

    const invalidEmail = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: `invalid_${randomUUID()}`,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.TAX_STAMP,
      channel: ProjectFileChecklistRequestChannel.EMAIL,
      recipientEmail: "not-an-email",
    });
    check(isError(invalidEmail), "manual email must be validated server-side");

    let capturedEmail: SendEmailInput | null = null;
    const sentEmail = await requestStageFiveChecklistInformation(
      owner,
      {
        clientRequestId: `email_${randomUUID()}`,
        projectId,
        handoffId: fileA.handoffId,
        fieldKey: ProjectFileChecklistField.TAX_STAMP,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        recipientName: "External Reviewer",
        recipientEmail: "reviewer@example.com",
        message: "Please reply with the tax stamp artwork.",
      },
      {
        sendEmail: async (email) => {
          capturedEmail = email;
          return { ok: true, id: "test-email" };
        },
      },
    );
    check(!isError(sentEmail), "manual email request must succeed after provider confirmation");
    const deliveredEmail = capturedEmail as SendEmailInput | null;
    check(
      deliveredEmail?.subject.includes("Tax Stamp") &&
        deliveredEmail.subject.includes(`Stage 5 Integration ${runId}`) &&
        deliveredEmail.html.includes("Package_Artwork_Final.ai") &&
        deliveredEmail.text.includes("Please reply to this email"),
      "email subject and HTML/text bodies must include project, file, field, and reply instructions",
    );
    const failedClientRequestId = `failed_${randomUUID()}`;
    const failedEmail = await requestStageFiveChecklistInformation(
      owner,
      {
        clientRequestId: failedClientRequestId,
        projectId,
        handoffId: fileA.handoffId,
        fieldKey: ProjectFileChecklistField.QR_CODE,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        recipientEmail: "failure@example.com",
      },
      { sendEmail: async () => ({ ok: false, error: "Mock provider failure" }) },
    );
    check(isError(failedEmail), "provider failure must be returned to the caller");
    const recordedFailure = await prisma.projectFileChecklistRequest.findUnique({
      where: { clientRequestId: failedClientRequestId },
    });
    check(
      recordedFailure?.status === ProjectFileChecklistRequestStatus.FAILED &&
        recordedFailure.failedAt &&
        !recordedFailure.sentAt,
      "failed delivery must be stored as FAILED and never SENT",
    );
    const qrItem = await prisma.projectFileChecklistItem.findUnique({
      where: {
        checklistId_fieldKey: {
          checklistId: fileA.checklistId,
          fieldKey: ProjectFileChecklistField.QR_CODE,
        },
      },
    });
    check(qrItem?.status === ProjectFileChecklistItemStatus.PENDING, "failed email must not mark the item REQUESTED");

    const finalData = await getStageFiveWorkspaceData(owner, projectId);
    check(
      finalData?.files
        .find((file) => file.handoffId === fileA.handoffId)
        ?.items.find((item) => item.fieldKey === ProjectFileChecklistField.TAX_STAMP)
        ?.status === ProjectFileChecklistItemStatus.REQUESTED,
      "successful dispatch must mark an empty item REQUESTED",
    );
    check(
      (await prisma.projectFileChecklistRequest.count({ where: { projectId } })) === 3,
      "request history must preserve successful in-app, successful email, and failed email records",
    );
    const workflow = await prisma.projectWorkflowStage.findMany({
      where: {
        projectId,
        stageKey: {
          in: [
            ProjectWorkflowStageKey.FINAL_LAYOUT,
            ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
          ],
        },
      },
      select: { stageKey: true, status: true },
    });
    check(
      workflow.find((stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT)?.status === ProjectWorkflowStageStatus.AVAILABLE &&
        workflow.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER)?.status === ProjectWorkflowStageStatus.LOCKED,
      "Stage 5 persistence must not complete Stage 5 or unlock Stage 6",
    );
  } finally {
    await prisma.notification.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: { in: [projectId, foreignProjectId] } } });
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log("Stage 5 persistence and request integration checks passed."))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

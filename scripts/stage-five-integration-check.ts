import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  StageStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import type { SendEmailInput } from "../src/lib/email/resend";
import {
  acceptStageFiveChecklistRequest,
  declineStageFiveChecklistRequest,
  getStageFiveChecklistRequestData,
  getStageFiveWorkspaceData,
  handoffStageFourFiles,
  requestStageFiveChecklistInformation,
  saveStageFiveChecklist,
  submitStageFiveChecklistResponse,
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
  const responseAttachmentId = `stage-five-response-file-${runId}`;
  const foreignResponseAttachmentId = `stage-five-response-foreign-${runId}`;

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
    const fileA = initial.files.find((file) => file.sourceAttachment.id === attachmentAId);
    const fileB = initial.files.find((file) => file.sourceAttachment.id === attachmentBId);
    check(fileA && fileB, "both handed-off files must have checklists");
    check(fileA.items.length === 15, "the selected file must expose all 15 checklist fields");
    const selectedFileB = await getStageFiveWorkspaceData(owner, projectId, fileB.handoffId);
    check(
      selectedFileB?.files.find((file) => file.handoffId === fileB.handoffId)?.items.length === 15,
      "each final file must expose its own 15-field checklist when selected",
    );

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
    const persistedFileBData = await getStageFiveWorkspaceData(owner, projectId, fileB.handoffId);
    const persistedA = persisted?.files.find((file) => file.handoffId === fileA.handoffId);
    const persistedB = persistedFileBData?.files.find((file) => file.handoffId === fileB.handoffId);
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
    const activeDuplicate = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: `active_duplicate_${randomUUID()}`,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: recipient.id,
    });
    check(
      !isError(activeDuplicate) && activeDuplicate.duplicate,
      "a second active request for the same checklist, file, field, and recipient must be reused",
    );
    const notifications = await prisma.notification.findMany({
      where: { projectId, type: "CHECKLIST_INFORMATION_REQUESTED" },
    });
    check(notifications.length === 1, "one in-app submission must create exactly one notification");
    check(
      notifications[0].url === `/requests/checklist/${inApp.request.id}`,
      "notification must deep-link to the dedicated authenticated request page",
    );

    check(
      (await getStageFiveChecklistRequestData(outsider, inApp.request.id)) === null,
      "an unrelated collaborator must not view another recipient's request",
    );
    check(
      (await getStageFiveChecklistRequestData(superAdmin, inApp.request.id))?.status ===
        ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
      "SUPER_ADMIN must have support visibility into the request",
    );
    check(
      isError(await acceptStageFiveChecklistRequest(outsider, inApp.request.id)),
      "an unrelated collaborator must not accept another recipient's request",
    );
    check(
      isError(
        await submitStageFiveChecklistResponse(recipient, {
          requestId: inApp.request.id,
          value: { text: "Approved compulsory copy" },
          attachmentIds: [],
        }),
      ),
      "a request must be accepted before a response is submitted",
    );
    const acceptedRequest = await acceptStageFiveChecklistRequest(recipient, inApp.request.id);
    check(
      !isError(acceptedRequest) &&
        acceptedRequest.status === ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
      "the exact recipient must be able to accept the request",
    );
    const completedTextResponse = await submitStageFiveChecklistResponse(recipient, {
      requestId: inApp.request.id,
      value: { text: "Approved compulsory copy" },
      attachmentIds: [],
    });
    check(!isError(completedTextResponse), "the accepted recipient text response must complete");
    const completedRequestData = await getStageFiveChecklistRequestData(recipient, inApp.request.id);
    check(
      completedRequestData?.status === ProjectFileChecklistRequestWorkflowStatus.COMPLETED &&
        completedRequestData.completedAt &&
        completedRequestData.acceptedAt &&
        completedRequestData.response.value.text === "Approved compulsory copy",
      "the completed request page must retain acceptance, completion, and response data",
    );
    const completedTextItem = await prisma.projectFileChecklistItem.findUnique({
      where: {
        checklistId_fieldKey: {
          checklistId: fileA.checklistId,
          fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
        },
      },
    });
    check(
      completedTextItem?.status === ProjectFileChecklistItemStatus.FILLED &&
        (completedTextItem.value as { text?: string } | null)?.text === "Approved compulsory copy",
      "the collaborator response must update the real per-file checklist item",
    );

    const graphicsRequest = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: `graphics_${randomUUID()}`,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.RELATED_GRAPHICS,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: recipient.id,
    });
    check(!isError(graphicsRequest), "a new field request must be allowed after completion");
    check(
      !isError(await acceptStageFiveChecklistRequest(recipient, graphicsRequest.request.id)),
      "the graphics request must be accepted",
    );
    await prisma.projectAttachment.createMany({
      data: [
        [responseAttachmentId, projectId],
        [foreignResponseAttachmentId, foreignProjectId],
      ].map(([id, targetProjectId]) => ({
        id,
        projectId: targetProjectId,
        uploadedById: recipient.id,
        fileName: `${id}.png`,
        originalFileName: `${id}.png`,
        mimeType: "image/png",
        fileSize: 4096,
        bucket: "stage-five-integration",
        storageKey: `stage-five-integration/${id}`,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
        checklistResponseRequestId: graphicsRequest.request.id,
        status: AttachmentStatus.READY,
      })),
    });
    check(
      isError(
        await submitStageFiveChecklistResponse(recipient, {
          requestId: graphicsRequest.request.id,
          value: {},
          attachmentIds: [foreignResponseAttachmentId],
        }),
      ),
      "cross-project response attachment injection must fail",
    );
    const graphicsResponse = await submitStageFiveChecklistResponse(recipient, {
      requestId: graphicsRequest.request.id,
      value: {},
      attachmentIds: [responseAttachmentId],
    });
    check(!isError(graphicsResponse), "a READY same-project response attachment must complete");
    check(
      (await prisma.projectFileChecklistItemAttachment.count({
        where: {
          attachmentId: responseAttachmentId,
          checklistItem: {
            checklistId: fileA.checklistId,
            fieldKey: ProjectFileChecklistField.RELATED_GRAPHICS,
          },
        },
      })) === 1,
      "the response attachment must associate only with the requested checklist field",
    );

    const declinedRequest = await requestStageFiveChecklistInformation(owner, {
      clientRequestId: `decline_${randomUUID()}`,
      projectId,
      handoffId: fileA.handoffId,
      fieldKey: ProjectFileChecklistField.BARCODE,
      channel: ProjectFileChecklistRequestChannel.IN_APP,
      recipientUserId: recipient.id,
    });
    check(!isError(declinedRequest), "a decline-path request must be created");
    const declined = await declineStageFiveChecklistRequest(recipient, {
      requestId: declinedRequest.request.id,
      reason: "The approved barcode has not been issued yet.",
    });
    check(!isError(declined), "the exact recipient must be able to decline with a reason");
    const declinedData = await getStageFiveChecklistRequestData(recipient, declinedRequest.request.id);
    check(
      declinedData?.status === ProjectFileChecklistRequestWorkflowStatus.DECLINED &&
        declinedData.declinedAt &&
        declinedData.declineReason === "The approved barcode has not been issued yet.",
      "declined requests must remain readable with timestamp and reason",
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
      (await prisma.notification.count({
        where: { projectId, type: "CHECKLIST_INFORMATION_COMPLETED" },
      })) === 2,
      "each completed collaborator response must notify the original requester",
    );
    check(
      (await prisma.notification.count({
        where: { projectId, type: "CHECKLIST_INFORMATION_DECLINED" },
      })) === 1,
      "a declined collaborator request must notify the original requester",
    );
    check(
      (await prisma.projectFileChecklistRequest.count({ where: { projectId } })) === 5,
      "request history must preserve completed, declined, successful email, and failed email records",
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

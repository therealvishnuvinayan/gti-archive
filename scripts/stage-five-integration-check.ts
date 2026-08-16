import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectAttachmentUploadSource,
  ProjectFileChecklistField,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectFileChecklistResponseSource,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  StageStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import { hashExternalChecklistToken } from "../src/lib/checklist-external-token";
import type { SendEmailInput } from "../src/lib/email/resend";
import {
  acceptStageFiveChecklistRequest,
  cancelStageFiveChecklistRequest,
  declineStageFiveChecklistRequest,
  getStageFiveChecklistRequestData,
  getStageFiveWorkspaceData,
  requestStageFiveChecklistInformation,
  resendStageFiveExternalChecklistRequest,
  saveStageFiveChecklist,
  submitStageFiveChecklistResponse,
} from "../src/lib/stage-five";
import {
  declineExternalChecklistRequest,
  getExternalChecklistRequestData,
  prepareExternalChecklistAttachment,
  submitExternalChecklistResponse,
} from "../src/lib/stage-five-external";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage 5 integration check failed: ${message}`);
}

function isError(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function getExternalToken(email: SendEmailInput | null) {
  const token = email?.text.match(/\/external\/checklist-request\/([A-Za-z0-9_-]{43})/)?.[1];
  check(token, "manual email must contain a 32-byte base64url external token");
  return token;
}

async function ensureStageFiveHandoffFixtures(input: {
  projectId: string;
  attachmentIds: string[];
  handedOffById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const handoffs: Array<{ id: string; sourceAttachmentId: string }> = [];

    for (const sourceAttachmentId of input.attachmentIds) {
      const handoff = await tx.projectStageFileHandoff.upsert({
        where: {
          projectId_sourceAttachmentId_targetWorkflowStageKey: {
            projectId: input.projectId,
            sourceAttachmentId,
            targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
          },
        },
        update: {},
        create: {
          projectId: input.projectId,
          sourceWorkflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
          sourceAttachmentId,
          targetWorkflowStageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
          handedOffById: input.handedOffById,
        },
        select: { id: true, sourceAttachmentId: true },
      });
      await tx.projectFileChecklist.upsert({
        where: { handoffId: handoff.id },
        update: {},
        create: {
          projectId: input.projectId,
          handoffId: handoff.id,
          sourceAttachmentId,
        },
      });
      handoffs.push(handoff);
    }

    return handoffs;
  });
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
        role: index === 0 ? UserRole.SUPER_ADMIN : index === 1 ? UserRole.ADMIN : UserRole.USER,
      })),
    });
  }
  const users = await prisma.user.findMany({
    ...(isolated ? { where: { id: { in: createdUserIds } } } : {}),
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  const superAdmin = users.find((user) => user.role === UserRole.SUPER_ADMIN);
  const owner = users.find((user) => user.role !== UserRole.SUPER_ADMIN);
  const recipient = users.find(
    (user) => user.role === UserRole.USER && user.id !== owner?.id,
  );
  const outsider = users.find(
    (user) =>
      user.role === UserRole.USER &&
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
  const checklistAttachmentId = `stage-five-checklist-file-${runId}`;
  const checklistAttachmentTwoId = `stage-five-checklist-file-two-${runId}`;
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
        getInitialProjectWorkflowStageData().map((stage, index) => {
          const now = new Date();
          return {
            projectId: id,
            ...stage,
            status:
              index < 4
                ? ProjectWorkflowStageStatus.COMPLETED
                : index === 4
                  ? ProjectWorkflowStageStatus.AVAILABLE
                  : ProjectWorkflowStageStatus.LOCKED,
            unlockedAt: index <= 4 ? now : null,
            completedAt: index < 4 ? now : null,
          };
        }),
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
    const handoff = await ensureStageFiveHandoffFixtures({
      projectId,
      attachmentIds: [attachmentAId, attachmentBId],
      handedOffById: owner.id,
    });
    check(handoff.length === 2, "multiple Stage 4 files must be handed off");
    const duplicate = await ensureStageFiveHandoffFixtures({
      projectId,
      attachmentIds: [attachmentAId, attachmentBId],
      handedOffById: owner.id,
    });
    check(duplicate.length === 2, "repeated fixture setup must be idempotent");
    check(
      (await prisma.projectStageFileHandoff.count({ where: { projectId } })) === 2,
      "duplicate handoff rows must be prevented",
    );
    check(
      (await prisma.projectComment.count({ where: { projectId } })) === chatCountBefore,
      "Stage 5 fixture setup must not mutate Stage 4 chat",
    );

    const initial = await getStageFiveWorkspaceData(owner, projectId);
    check(initial?.files.length === 2, "Stage 5 must list every handed-off file");
    const fileA = initial.files.find((file) => file.sourceAttachment.id === attachmentAId);
    const fileB = initial.files.find((file) => file.sourceAttachment.id === attachmentBId);
    check(fileA && fileB, "both handed-off files must have checklists");
    check(fileA.items.length === 16, "the selected file must expose all 16 checklist fields");
    const selectedFileB = await getStageFiveWorkspaceData(owner, projectId, fileB.handoffId);
    check(
      selectedFileB?.files.find((file) => file.handoffId === fileB.handoffId)?.items.length === 16,
      "each final file must expose its own 16-field checklist when selected",
    );
    check(
      (await getStageFiveWorkspaceData(recipient, projectId)) === null,
      "project membership must not expose the Stage 5 manager workspace to a USER",
    );
    const forgedChecklistSave = await saveStageFiveChecklist(recipient, {
      projectId,
      handoffId: fileA.handoffId,
      items: [],
    });
    check(
      isError(forgedChecklistSave),
      "a project USER must not save the Stage 5 manager checklist",
    );
    const forgedInformationRequest = await requestStageFiveChecklistInformation(
      recipient,
      {
        clientRequestId: `forged-user-${runId}`,
        projectId,
        handoffId: fileA.handoffId,
        fieldKey: ProjectFileChecklistField.OUTPUT_NAME,
        channel: ProjectFileChecklistRequestChannel.IN_APP,
        recipientUserId: owner.id,
      },
    );
    check(
      isError(forgedInformationRequest),
      "a project USER must not send Stage 5 manager information requests",
    );

    await prisma.projectAttachment.createMany({
      data: [
        [checklistAttachmentId, projectId],
        [checklistAttachmentTwoId, projectId],
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
          attachmentIds: [checklistAttachmentId, checklistAttachmentTwoId],
        },
        {
          fieldKey: ProjectFileChecklistField.TAR,
          value: { text: "8 mg" },
          attachmentIds: [],
        },
        {
          fieldKey: ProjectFileChecklistField.NICOTINE,
          value: { text: "0.7 mg" },
          attachmentIds: [],
        },
        {
          fieldKey: ProjectFileChecklistField.COMPULSORY_TEXT,
          value: { values: ["Government warning", "Sale restrictions"] },
          attachmentIds: [],
        },
        {
          fieldKey: ProjectFileChecklistField.MARKETING_COPY,
          value: { values: ["Approved campaign line", "Secondary pack line"] },
          attachmentIds: [],
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
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.TECHNICAL_DRAWING)?.attachments.length === 2,
      "multiple checklist attachment associations must persist",
    );
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.TAR)?.value.text === "8 mg" &&
        persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.NICOTINE)?.value.text === "0.7 mg",
      "Tar and Nicotine must persist as separate checklist values",
    );
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.COMPULSORY_TEXT)?.value.values?.length === 2 &&
        persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.MARKETING_COPY)?.value.values?.length === 2,
      "Compulsory Text and Marketing Copy must persist repeatable values",
    );
    check(
      persistedA?.items.find((item) => item.fieldKey === ProjectFileChecklistField.BARCODE)?.status === ProjectFileChecklistItemStatus.PENDING,
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
          value: { values: ["Approved compulsory copy"] },
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
      value: { values: ["Approved compulsory copy"] },
      attachmentIds: [],
    });
    check(!isError(completedTextResponse), "the accepted recipient text response must complete");
    const completedRequestData = await getStageFiveChecklistRequestData(recipient, inApp.request.id);
    check(
      completedRequestData?.status === ProjectFileChecklistRequestWorkflowStatus.COMPLETED &&
        completedRequestData.completedAt &&
        completedRequestData.acceptedAt &&
        completedRequestData.response.value.values?.[0] === "Approved compulsory copy",
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
        (completedTextItem.value as { values?: string[] } | null)?.values?.[0] === "Approved compulsory copy",
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
        declinedData.declineReason === "<p>The approved barcode has not been issued yet.</p>",
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
        deliveredEmail.html.includes("Provide Information") &&
        deliveredEmail.text.includes("/external/checklist-request/"),
      "email subject and HTML/text bodies must include project, file, field, and secure response link",
    );
    const externalToken = getExternalToken(deliveredEmail);
    let duplicateEmailSent = false;
    const duplicateExternal = await requestStageFiveChecklistInformation(
      owner,
      {
        clientRequestId: `email_duplicate_${randomUUID()}`,
        projectId,
        handoffId: fileA.handoffId,
        fieldKey: ProjectFileChecklistField.TAX_STAMP,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        recipientEmail: "reviewer@example.com",
      },
      {
        sendEmail: async () => {
          duplicateEmailSent = true;
          return { ok: true };
        },
      },
    );
    check(
      !isError(duplicateExternal) &&
        duplicateExternal.duplicate &&
        duplicateExternal.request.id === sentEmail.request.id &&
        !duplicateEmailSent,
      "the exact active email request must be reused without sending a duplicate link",
    );
    const sentExternalRecord = await prisma.projectFileChecklistRequest.findUnique({
      where: { id: sentEmail.request.id },
    });
    check(
      sentExternalRecord?.externalTokenHash === hashExternalChecklistToken(externalToken) &&
        sentExternalRecord.externalTokenExpiresAt &&
        sentExternalRecord.externalTokenCreatedAt &&
        !JSON.stringify(sentExternalRecord).includes(externalToken),
      "manual email requests must persist only the SHA-256 token hash and explicit expiry",
    );
    check(
      (await getExternalChecklistRequestData("not-a-valid-token")).state === "invalid",
      "an invalid external token must reveal no request information",
    );
    const activeExternalData = await getExternalChecklistRequestData(externalToken);
    check(
      activeExternalData.state === "active" &&
        activeExternalData.projectName === `Stage 5 Integration ${runId}` &&
        activeExternalData.file.name === "Package_Artwork_Final.ai" &&
        activeExternalData.field.title === "Tax Stamp",
      "a valid token must expose only its exact project file and requested field",
    );
    check(
      isError(
        await prepareExternalChecklistAttachment(externalToken, {
          originalFileName: "malware.exe",
          mimeType: "application/octet-stream",
          fileSize: 1024,
        }),
      ),
      "external uploads must preserve the normal executable/file-type restrictions",
    );
    check(
      isError(
        await prepareExternalChecklistAttachment(externalToken, {
          originalFileName: "oversized-reference.png",
          mimeType: "image/png",
          fileSize: Number.MAX_SAFE_INTEGER,
        }),
      ),
      "external uploads must preserve the configured project-asset size limit",
    );
    const externalTextResponse = await submitExternalChecklistResponse(externalToken, {
      value: { text: "Approved external tax stamp reference" },
      attachmentIds: [],
    });
    check(!isError(externalTextResponse), "an external text response must complete without login");
    check(
      isError(
        await submitExternalChecklistResponse(externalToken, {
          value: { text: "Second submission" },
          attachmentIds: [],
        }),
      ),
      "a completed external token must not be reusable for another submission",
    );
    check(
      (await getExternalChecklistRequestData(externalToken)).state === "completed",
      "refreshing a completed external link must return a read-only success state",
    );
    const completedExternalRecord = await prisma.projectFileChecklistRequest.findUnique({
      where: { id: sentEmail.request.id },
    });
    check(
      completedExternalRecord?.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.COMPLETED &&
        completedExternalRecord.responseSource === ProjectFileChecklistResponseSource.EXTERNAL_EMAIL &&
        completedExternalRecord.externalResponderName === "External Reviewer" &&
        completedExternalRecord.externalResponderEmail === "reviewer@example.com" &&
        completedExternalRecord.completedAt &&
        completedExternalRecord.externalTokenRevokedAt,
      "external completion must persist responder identity, source, timestamp, and token revocation",
    );
    const externalTextItem = await prisma.projectFileChecklistItem.findUnique({
      where: {
        checklistId_fieldKey: {
          checklistId: fileA.checklistId,
          fieldKey: ProjectFileChecklistField.TAX_STAMP,
        },
      },
    });
    check(
      externalTextItem?.status === ProjectFileChecklistItemStatus.FILLED &&
        (externalTextItem.value as { text?: string } | null)?.text ===
          "<p>Approved external tax stamp reference</p>",
      "external response data must update the real selected-file checklist item",
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
        !recordedFailure.sentAt &&
        recordedFailure.externalTokenRevokedAt,
      "failed delivery must be stored as FAILED, never SENT, and its token must be revoked",
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
    const externalOwner = owner;
    const externalFile = fileA;

    async function createExternalRequest(
      fieldKey: ProjectFileChecklistField,
      recipientEmail: string,
      recipientName = "External Test Recipient",
    ) {
      let email: SendEmailInput | null = null;
      const result = await requestStageFiveChecklistInformation(
        externalOwner,
        {
          clientRequestId: `external_${randomUUID()}`,
          projectId,
          handoffId: externalFile.handoffId,
          fieldKey,
          channel: ProjectFileChecklistRequestChannel.EMAIL,
          recipientName,
          recipientEmail,
        },
        {
          sendEmail: async (input) => {
            email = input;
            return { ok: true, id: `external-${fieldKey}` };
          },
        },
      );
      check(!isError(result), `external ${fieldKey} request must be dispatched`);
      return { request: result.request, token: getExternalToken(email) };
    }

    const invoiceExternal = await createExternalRequest(
      ProjectFileChecklistField.INVOICE,
      "invoice.external@example.com",
    );
    const invoiceAttachmentId = `stage-five-external-invoice-${runId}`;
    const foreignInvoiceAttachmentId = `stage-five-external-invoice-foreign-${runId}`;
    await prisma.projectAttachment.createMany({
      data: [
        [invoiceAttachmentId, projectId],
        [foreignInvoiceAttachmentId, foreignProjectId],
      ].map(([id, targetProjectId]) => ({
        id,
        projectId: targetProjectId,
        uploadedById: owner.id,
        fileName: `${id}.pdf`,
        originalFileName: `${id}.pdf`,
        mimeType: "application/pdf",
        fileSize: 4096,
        bucket: "stage-five-integration",
        storageKey: `stage-five-integration/${id}`,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
        checklistResponseRequestId: invoiceExternal.request.id,
        uploadSource: ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST,
        externalUploaderName: "External Test Recipient",
        externalUploaderEmail: "invoice.external@example.com",
        status: AttachmentStatus.READY,
      })),
    });
    check(
      isError(
        await submitExternalChecklistResponse(invoiceExternal.token, {
          value: {},
          attachmentIds: [foreignInvoiceAttachmentId],
        }),
      ),
      "cross-project external file injection must fail",
    );
    check(
      !isError(
        await submitExternalChecklistResponse(invoiceExternal.token, {
          value: {},
          attachmentIds: [invoiceAttachmentId],
        }),
      ),
      "a valid request-bound external single-file response must complete",
    );
    const invoiceAttachment = await prisma.projectAttachment.findUnique({
      where: { id: invoiceAttachmentId },
    });
    check(
      invoiceAttachment?.uploadSource ===
        ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST &&
        invoiceAttachment.externalUploaderEmail === "invoice.external@example.com" &&
        invoiceAttachment.checklistResponseRequestId === invoiceExternal.request.id,
      "external attachment provenance must retain source, recipient email, and exact request",
    );

    const multiExternal = await createExternalRequest(
      ProjectFileChecklistField.RELATED_GRAPHICS,
      "graphics.external@example.com",
    );
    const multiAttachmentIds = [
      `stage-five-external-graphic-a-${runId}`,
      `stage-five-external-graphic-b-${runId}`,
    ];
    await prisma.projectAttachment.createMany({
      data: multiAttachmentIds.map((id) => ({
        id,
        projectId,
        uploadedById: owner.id,
        fileName: `${id}.png`,
        originalFileName: `${id}.png`,
        mimeType: "image/png",
        fileSize: 4096,
        bucket: "stage-five-integration",
        storageKey: `stage-five-integration/${id}`,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
        checklistResponseRequestId: multiExternal.request.id,
        uploadSource: ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST,
        externalUploaderName: "External Test Recipient",
        externalUploaderEmail: "graphics.external@example.com",
        status: AttachmentStatus.READY,
      })),
    });
    check(
      isError(
        await submitExternalChecklistResponse(multiExternal.token, {
          value: {},
          attachmentIds: [invoiceAttachmentId],
        }),
      ),
      "cross-request external file injection must fail even within the same project",
    );
    check(
      !isError(
        await submitExternalChecklistResponse(multiExternal.token, {
          value: {},
          attachmentIds: multiAttachmentIds,
        }),
      ),
      "a request-bound external multi-file response must complete",
    );

    let initialResendEmail: SendEmailInput | null = null;
    const resendRequest = await requestStageFiveChecklistInformation(
      owner,
      {
        clientRequestId: `resend_${randomUUID()}`,
        projectId,
        handoffId: fileA.handoffId,
        fieldKey: ProjectFileChecklistField.BARCODE,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
        recipientEmail: "resend.external@example.com",
      },
      {
        sendEmail: async (input) => {
          initialResendEmail = input;
          return { ok: true, id: "initial-resend-email" };
        },
      },
    );
    check(!isError(resendRequest), "resend-path request must be dispatched");
    const initialResendToken = getExternalToken(initialResendEmail);
    let replacementEmail: SendEmailInput | null = null;
    const resent = await resendStageFiveExternalChecklistRequest(
      owner,
      resendRequest.request.id,
      {
        sendEmail: async (input) => {
          replacementEmail = input;
          return { ok: true, id: "replacement-email" };
        },
      },
    );
    check(!isError(resent), "an active manual-email request must support resend");
    const replacementToken = getExternalToken(replacementEmail);
    check(initialResendToken !== replacementToken, "resend must rotate the raw access token");
    check(
      (await getExternalChecklistRequestData(initialResendToken)).state === "invalid" &&
        (await getExternalChecklistRequestData(replacementToken)).state === "active",
      "resend must invalidate the prior token while activating the replacement",
    );
    check(
      !isError(await cancelStageFiveChecklistRequest(owner, resendRequest.request.id)),
      "the original requester must be able to cancel an active external request",
    );
    check(
      (await getExternalChecklistRequestData(replacementToken)).state === "unavailable",
      "cancel must revoke the replacement token",
    );

    const expiredExternal = await createExternalRequest(
      ProjectFileChecklistField.QR_CODE,
      "expired.external@example.com",
    );
    await prisma.projectFileChecklistRequest.update({
      where: { id: expiredExternal.request.id },
      data: { externalTokenExpiresAt: new Date(Date.now() - 1_000) },
    });
    check(
      (await getExternalChecklistRequestData(expiredExternal.token)).state === "expired",
      "expired tokens must show only the branded expired state",
    );

    const declinedExternal = await createExternalRequest(
      ProjectFileChecklistField.TRACK_TRACE,
      "decline.external@example.com",
    );
    check(
      !isError(
        await declineExternalChecklistRequest(
          declinedExternal.token,
          "The required tracking reference is unavailable.",
        ),
      ),
      "an external recipient must be able to decline consistently",
    );
    check(
      (await getExternalChecklistRequestData(declinedExternal.token)).state === "declined",
      "declined external links must remain read-only",
    );

    const finalData = await getStageFiveWorkspaceData(owner, projectId);
    check(
      finalData?.files
        .find((file) => file.handoffId === fileA.handoffId)
        ?.items.find((item) => item.fieldKey === ProjectFileChecklistField.TAX_STAMP)
        ?.status === ProjectFileChecklistItemStatus.FILLED,
      "the owner Stage 5 view must immediately show the external response as FILLED",
    );
    check(
      (await prisma.notification.count({
        where: { projectId, type: "CHECKLIST_INFORMATION_COMPLETED" },
      })) === 5,
      "each authenticated or external completed response must notify the original requester",
    );
    check(
      (await prisma.notification.count({
        where: { projectId, type: "CHECKLIST_INFORMATION_DECLINED" },
      })) === 2,
      "authenticated and external declines must notify the original requester",
    );
    check(
      (await prisma.projectFileChecklistRequest.count({ where: { projectId } })) === 10,
      "request history must preserve authenticated, completed, declined, failed, expired, cancelled, and external records",
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

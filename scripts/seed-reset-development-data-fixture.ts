import process from "node:process";

import { PrismaClient } from "@prisma/client";

import { hashAuthPassword } from "../src/lib/auth-password";
import { getPasswordValidationErrors } from "../src/lib/password-rules";

const DATABASE_PREFIX = "gti_archive_reset_test_";
const FIXTURE_PREFIX = "reset-fixture";
const prisma = new PrismaClient();

function assertDisposableLocalTarget() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    !database.startsWith(DATABASE_PREFIX)
  ) {
    throw new Error(
      `Fixture generation is restricted to local databases named ${DATABASE_PREFIX}*.`,
    );
  }
}

async function createAttachment(input: {
  id: string;
  projectId: string;
  stageId?: string;
  revisionId?: string;
  commentId?: string;
  uploadedById: string;
  checklistResponseRequestId?: string;
}) {
  return prisma.projectAttachment.create({
    data: {
      ...input,
      fileName: `${input.id}.pdf`,
      originalFileName: `${input.id}.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      bucket: "reset-fixture-bucket",
      storageKey: `${FIXTURE_PREFIX}/project/${input.id}.pdf`,
      assetType: "GENERAL_PROJECT_ASSET",
      status: "READY",
    },
  });
}

function artworkMetadataData(input: {
  id: string;
  artworkId: string;
  archivedById: string;
  projectId?: string;
  archiveFileId?: string;
  manualArchiveFileId?: string;
  sourceAttachmentId?: string;
  sourceType: "PROJECT_FINAL_FILE" | "DIRECT_UPLOAD";
}) {
  const now = new Date("2026-08-15T00:00:00.000Z");

  return {
    ...input,
    titleWorkingName: `Fixture ${input.artworkId}`,
    versionRevision: "v1",
    languageMarket: "English / UAE",
    artworkType: "Packaging",
    brandSubBrand: "Fixture Brand",
    colourSpace: "CMYK",
    fileFormats: "PDF",
    creationDate: now,
    lastModifiedDate: now,
    archiveStatus: "Approved",
    createdByName: "Fixture Root",
    createdByUserId: input.archivedById,
    approvedByName: "Fixture Admin",
    approvedByUserId: input.archivedById,
    approvedAt: now,
    clientBrandOwner: "Fixture Client",
    fontsUsed: "Inter",
    imagesPhotography: "Fixture image",
    illustrationsIcons: "Fixture icons",
    colourCodes: "C0 M0 Y0 K100",
    changeLog: "Synthetic reset fixture",
  };
}

async function main() {
  assertDisposableLocalTarget();

  const [existingFixtureUsers, existingProjects, permissionDefinitions] = await Promise.all([
    prisma.user.count({ where: { id: { startsWith: FIXTURE_PREFIX } } }),
    prisma.project.count(),
    prisma.permissionDefinition.count(),
  ]);

  if (existingFixtureUsers > 0 || existingProjects > 0) {
    throw new Error("Disposable fixture target already contains fixture users or projects.");
  }

  if (permissionDefinitions === 0) {
    throw new Error("Run pnpm permissions:sync against the disposable database first.");
  }

  const now = new Date("2026-08-15T00:00:00.000Z");
  const tomorrow = new Date("2026-08-16T00:00:00.000Z");
  const fixturePassword = process.env.RESET_FIXTURE_PASSWORD;

  if (!fixturePassword) {
    throw new Error("RESET_FIXTURE_PASSWORD is required for synthetic users.");
  }

  const fixturePasswordErrors = getPasswordValidationErrors(fixturePassword);

  if (fixturePasswordErrors.length > 0) {
    throw new Error(
      `RESET_FIXTURE_PASSWORD is invalid: ${fixturePasswordErrors.join(" ")}`,
    );
  }

  const ids = {
    root: `${FIXTURE_PREFIX}-root`,
    admin: `${FIXTURE_PREFIX}-admin`,
    collaborator: `${FIXTURE_PREFIX}-collaborator`,
    user: `${FIXTURE_PREFIX}-user`,
    project: `${FIXTURE_PREFIX}-project`,
    category: `${FIXTURE_PREFIX}-category`,
    projectTag: `${FIXTURE_PREFIX}-project-tag`,
    assetTag: `${FIXTURE_PREFIX}-asset-tag`,
    archiveCategory: `${FIXTURE_PREFIX}-archive-category`,
    stages: Array.from({ length: 7 }, (_, index) =>
      `${FIXTURE_PREFIX}-stage-${index + 1}`,
    ),
  };
  const passwordHash = hashAuthPassword(fixturePassword);

  await prisma.projectCategory.upsert({
    where: { name: "Reset Fixture Category" },
    create: { id: ids.category, name: "Reset Fixture Category", isActive: true },
    update: { isActive: true },
  });
  await prisma.projectTag.upsert({
    where: { name: "Reset Fixture Tag" },
    create: { id: ids.projectTag, name: "Reset Fixture Tag", isActive: true },
    update: { isActive: true },
  });
  await prisma.assetTag.upsert({
    where: { name: "Reset Fixture Asset Tag" },
    create: { id: ids.assetTag, name: "Reset Fixture Asset Tag", isActive: true },
    update: { isActive: true },
  });
  await prisma.archiveCategory.upsert({
    where: { slug: "reset-fixture-archive-category" },
    create: {
      id: ids.archiveCategory,
      name: "Reset Fixture Archive Category",
      slug: "reset-fixture-archive-category",
      isActive: true,
      isSystem: false,
    },
    update: { isActive: true },
  });

  await prisma.user.createMany({
    data: [
      {
        id: ids.root,
        name: "Fixture Root",
        email: "old-root@reset-fixture.example.test",
        passwordHash,
        role: "SUPER_ADMIN",
        collaboratorType: "GTI_INTERNAL_CLIENT",
        avatarUrl: `users/${ids.root}/avatar/fixture.png`,
      },
      {
        id: ids.admin,
        name: "Fixture Admin",
        email: "old-admin@reset-fixture.example.test",
        passwordHash,
        role: "ADMIN",
        collaboratorType: "GTI_INTERNAL_CLIENT",
      },
      {
        id: ids.collaborator,
        name: "Fixture Collaborator",
        email: "old-collaborator@reset-fixture.example.test",
        passwordHash,
        role: "COLLABORATOR",
        collaboratorType: "EXTERNAL_AGENCY",
      },
      {
        id: ids.user,
        name: "Fixture User",
        email: "old-user@reset-fixture.example.test",
        passwordHash,
        role: "USER",
        collaboratorType: "GTI_INTERNAL_CLIENT",
      },
    ],
  });
  await prisma.session.create({
    data: {
      id: `${FIXTURE_PREFIX}-session`,
      token: `${FIXTURE_PREFIX}-session-token`,
      userId: ids.root,
      expiresAt: tomorrow,
    },
  });
  await prisma.passwordResetToken.create({
    data: {
      id: `${FIXTURE_PREFIX}-password-reset`,
      userId: ids.user,
      tokenHash: `${FIXTURE_PREFIX}-token-hash`,
      expiresAt: tomorrow,
    },
  });

  const status = await prisma.projectStatusOption.findFirst({
    orderBy: { sortOrder: "asc" },
  });
  await prisma.project.create({
    data: {
      id: ids.project,
      name: "RESET FIXTURE OLD QA PROJECT",
      category: "Reset Fixture Category",
      description: "Synthetic Stage 1-7 reset fixture",
      executionType: "INTERNAL",
      budgetRequired: true,
      budget: 1000,
      currency: "USD",
      statusId: status?.id,
      priority: "HIGH",
      ownerId: ids.root,
      createdById: ids.root,
      stageCount: 7,
    },
  });
  await prisma.projectStage.createMany({
    data: ids.stages.map((id, index) => ({
      id,
      projectId: ids.project,
      name: `Fixture Stage ${index + 1}`,
      order: index + 1,
      isTasker: index === 2 || index === 3,
      status: index < 6 ? ("COMPLETED" as const) : ("ONGOING" as const),
      startedById: ids.root,
    })),
  });
  const workflowKeys = [
    "PROJECT_INQUIRY",
    "PROJECT_RESEARCH_AND_PLANNING",
    "CONCEPT_CREATION",
    "PROJECT_DEVELOPMENT",
    "FINAL_LAYOUT",
    "PRODUCTION_AND_HANDOVER",
    "IMPLEMENTATION_AND_SUPERVISION",
  ] as const;
  await prisma.projectWorkflowStage.createMany({
    data: workflowKeys.map((stageKey, index) => ({
      id: `${FIXTURE_PREFIX}-workflow-${index + 1}`,
      projectId: ids.project,
      stageKey,
      status: index < 6 ? ("COMPLETED" as const) : ("AVAILABLE" as const),
    })),
  });
  await prisma.projectCoOwner.create({
    data: { projectId: ids.project, userId: ids.admin, addedById: ids.root },
  });
  await prisma.projectCollaborator.createMany({
    data: [ids.collaborator, ids.user].map((userId) => ({
      projectId: ids.project,
      userId,
      participantType: "GTI_INTERNAL_CLIENT" as const,
      canInteract: true,
      addedById: ids.root,
    })),
  });
  await prisma.projectCollaboratorVisibilityPause.create({
    data: {
      id: `${FIXTURE_PREFIX}-visibility-pause`,
      projectId: ids.project,
      userId: ids.collaborator,
      pausedAt: now,
      createdById: ids.root,
    },
  });
  await prisma.projectExecutor.create({
    data: {
      projectId: ids.project,
      userId: ids.collaborator,
      addedById: ids.root,
    },
  });
  await prisma.projectTagAssignment.create({
    data: { projectId: ids.project, tagId: ids.projectTag },
  });
  await prisma.projectFormDraft.create({
    data: {
      id: `${FIXTURE_PREFIX}-form-draft`,
      projectId: ids.project,
      userId: ids.root,
      formKey: "fixture",
      payload: { stale: true },
      clientId: "fixture-client",
    },
  });

  const attachmentIds = {
    inquiry: `${FIXTURE_PREFIX}-attachment-inquiry`,
    research: `${FIXTURE_PREFIX}-attachment-research`,
    concept3: `${FIXTURE_PREFIX}-attachment-concept-3`,
    concept4: `${FIXTURE_PREFIX}-attachment-concept-4`,
    compareBase: `${FIXTURE_PREFIX}-attachment-compare-base`,
    compareOther: `${FIXTURE_PREFIX}-attachment-compare-other`,
    checklist: `${FIXTURE_PREFIX}-attachment-checklist`,
    checklistItem: `${FIXTURE_PREFIX}-attachment-checklist-item`,
    production: `${FIXTURE_PREFIX}-attachment-production`,
    evidence: `${FIXTURE_PREFIX}-attachment-evidence`,
    archive: `${FIXTURE_PREFIX}-attachment-archive`,
  };

  for (const [name, id] of Object.entries(attachmentIds)) {
    const stageId =
      name === "inquiry"
        ? ids.stages[0]
        : name === "research"
          ? ids.stages[1]
          : name.startsWith("concept") || name.startsWith("compare")
            ? ids.stages[2]
            : name === "checklist" || name === "checklistItem"
              ? ids.stages[4]
              : name === "production"
                ? ids.stages[5]
                : ids.stages[6];
    await createAttachment({
      id,
      projectId: ids.project,
      stageId,
      uploadedById: ids.root,
    });
  }

  await prisma.projectInquiry.create({
    data: {
      id: `${FIXTURE_PREFIX}-inquiry`,
      projectId: ids.project,
      clientOrigin: "EXTERNAL",
      initialBrief: "Synthetic reset fixture brief",
      inquiryDate: now,
      priority: "HIGH",
    },
  });
  await prisma.contactDirectoryEntry.create({
    data: {
      id: `${FIXTURE_PREFIX}-contact`,
      name: "Fixture Contact",
      email: "contact@reset-fixture.example.test",
      createdById: ids.root,
    },
  });
  await prisma.projectInquiryParty.createMany({
    data: [
      {
        id: `${FIXTURE_PREFIX}-inquiry-user-party`,
        inquiryId: `${FIXTURE_PREFIX}-inquiry`,
        role: "CLIENT",
        source: "USER",
        userId: ids.user,
        snapshotName: "Fixture User",
      },
      {
        id: `${FIXTURE_PREFIX}-inquiry-contact-party`,
        inquiryId: `${FIXTURE_PREFIX}-inquiry`,
        role: "FINAL_BENEFICIARY",
        source: "MANUAL_CONTACT",
        contactId: `${FIXTURE_PREFIX}-contact`,
        snapshotName: "Fixture Contact",
      },
    ],
  });
  await prisma.projectInquiryTargetMarket.create({
    data: {
      id: `${FIXTURE_PREFIX}-target-market`,
      inquiryId: `${FIXTURE_PREFIX}-inquiry`,
      label: "UAE",
      normalizedLabel: "uae",
      kind: "COUNTRY",
    },
  });
  await prisma.projectInquiryDeliverable.create({
    data: {
      id: `${FIXTURE_PREFIX}-deliverable`,
      inquiryId: `${FIXTURE_PREFIX}-inquiry`,
      label: "Packaging",
      normalizedLabel: "packaging",
    },
  });
  await prisma.projectInquiryAttachment.create({
    data: {
      inquiryId: `${FIXTURE_PREFIX}-inquiry`,
      attachmentId: attachmentIds.inquiry,
      field: "INITIAL_BRIEF",
    },
  });

  await prisma.projectResearchWorkspace.create({
    data: {
      id: `${FIXTURE_PREFIX}-research-workspace`,
      projectId: ids.project,
      ownerUserId: ids.user,
    },
  });
  await prisma.projectResearchFolder.create({
    data: {
      id: `${FIXTURE_PREFIX}-research-folder`,
      workspaceId: `${FIXTURE_PREFIX}-research-workspace`,
      name: "Fixture Research",
      normalizedName: "fixture research",
      createdById: ids.user,
    },
  });
  await prisma.projectResearchFolderFile.create({
    data: {
      id: `${FIXTURE_PREFIX}-research-file`,
      folderId: `${FIXTURE_PREFIX}-research-folder`,
      attachmentId: attachmentIds.research,
      addedById: ids.user,
    },
  });

  await prisma.projectConceptFolder.create({
    data: {
      id: `${FIXTURE_PREFIX}-concept-stage-3`,
      projectId: ids.project,
      workflowStageKey: "CONCEPT_CREATION",
      taskerStageId: ids.stages[2],
      assignedExecutorId: ids.collaborator,
      approvedAttachmentId: attachmentIds.concept3,
      approvedById: ids.root,
      approvedAt: now,
      name: "Fixture Stage 3 Concept",
      normalizedName: "fixture stage 3 concept",
      createdById: ids.root,
    },
  });
  await prisma.projectConceptFolder.create({
    data: {
      id: `${FIXTURE_PREFIX}-concept-stage-4`,
      projectId: ids.project,
      workflowStageKey: "PROJECT_DEVELOPMENT",
      taskerStageId: ids.stages[3],
      assignedExecutorId: ids.collaborator,
      approvedAttachmentId: attachmentIds.concept4,
      approvedById: ids.root,
      approvedAt: now,
      sourceStage3ConceptId: `${FIXTURE_PREFIX}-concept-stage-3`,
      sourceStage3ApprovedAttachmentId: attachmentIds.concept3,
      name: "Fixture Stage 4 Concept",
      normalizedName: "fixture stage 4 concept",
      createdById: ids.root,
    },
  });

  await prisma.projectRevision.create({
    data: {
      id: `${FIXTURE_PREFIX}-revision`,
      projectId: ids.project,
      stageId: ids.stages[2],
      createdById: ids.collaborator,
      reviewedById: ids.root,
      revisionNumber: 1,
      title: "Fixture revision",
      status: "APPROVED",
      reviewedAt: now,
    },
  });
  await prisma.projectComment.create({
    data: {
      id: `${FIXTURE_PREFIX}-comment`,
      projectId: ids.project,
      stageId: ids.stages[2],
      revisionId: `${FIXTURE_PREFIX}-revision`,
      authorId: ids.collaborator,
      body: "Synthetic old QA comment",
    },
  });
  await prisma.projectCommentMention.create({
    data: {
      id: `${FIXTURE_PREFIX}-mention`,
      commentId: `${FIXTURE_PREFIX}-comment`,
      mentionedUserId: ids.root,
    },
  });
  await prisma.comparisonComment.create({
    data: {
      id: `${FIXTURE_PREFIX}-comparison`,
      projectId: ids.project,
      stageId: ids.stages[2],
      baseAttachmentId: attachmentIds.compareBase,
      compareAttachmentId: attachmentIds.compareOther,
      xPercent: 25,
      yPercent: 50,
      body: "Fixture comparison",
      createdById: ids.root,
    },
  });
  await prisma.fileFavorite.create({
    data: {
      id: `${FIXTURE_PREFIX}-file-favorite`,
      userId: ids.user,
      attachmentId: attachmentIds.compareBase,
    },
  });
  await prisma.projectAttachmentAssetTagAssignment.create({
    data: { attachmentId: attachmentIds.archive, tagId: ids.assetTag },
  });
  await prisma.projectActivityLog.create({
    data: {
      id: `${FIXTURE_PREFIX}-activity`,
      projectId: ids.project,
      stageId: ids.stages[2],
      revisionId: `${FIXTURE_PREFIX}-revision`,
      actorId: ids.root,
      action: "REVISION_CREATED",
      metadata: { fixture: true },
    },
  });

  await prisma.projectStageFileHandoff.create({
    data: {
      id: `${FIXTURE_PREFIX}-handoff`,
      projectId: ids.project,
      sourceWorkflowStageKey: "PROJECT_DEVELOPMENT",
      sourceAttachmentId: attachmentIds.checklist,
      targetWorkflowStageKey: "FINAL_LAYOUT",
      handedOffById: ids.root,
    },
  });
  await prisma.projectFileChecklist.create({
    data: {
      id: `${FIXTURE_PREFIX}-checklist`,
      projectId: ids.project,
      handoffId: `${FIXTURE_PREFIX}-handoff`,
      sourceAttachmentId: attachmentIds.checklist,
    },
  });
  await prisma.projectFileChecklistItem.create({
    data: {
      id: `${FIXTURE_PREFIX}-checklist-item`,
      checklistId: `${FIXTURE_PREFIX}-checklist`,
      fieldKey: "OUTPUT_NAME",
      value: "Fixture output",
      status: "FILLED",
      updatedById: ids.user,
    },
  });
  await prisma.projectFileChecklistItemAttachment.create({
    data: {
      checklistItemId: `${FIXTURE_PREFIX}-checklist-item`,
      attachmentId: attachmentIds.checklistItem,
    },
  });
  await prisma.projectFileChecklistRequest.create({
    data: {
      id: `${FIXTURE_PREFIX}-checklist-request`,
      clientRequestId: `${FIXTURE_PREFIX}-checklist-client-request`,
      projectId: ids.project,
      checklistId: `${FIXTURE_PREFIX}-checklist`,
      checklistItemId: `${FIXTURE_PREFIX}-checklist-item`,
      fieldKey: "OUTPUT_NAME",
      requestedById: ids.root,
      channel: "IN_APP",
      recipientUserId: ids.user,
      recipientName: "Fixture User",
      status: "SENT",
    },
  });
  await createAttachment({
    id: `${FIXTURE_PREFIX}-attachment-checklist-response`,
    projectId: ids.project,
    stageId: ids.stages[4],
    uploadedById: ids.user,
    checklistResponseRequestId: `${FIXTURE_PREFIX}-checklist-request`,
  });
  await prisma.stageInvoiceRequest.create({
    data: {
      id: `${FIXTURE_PREFIX}-invoice-request`,
      projectId: ids.project,
      stageId: ids.stages[4],
      requestedById: ids.root,
      requestedFromId: ids.admin,
    },
  });

  await prisma.projectProductionUnit.create({
    data: {
      id: `${FIXTURE_PREFIX}-production-unit`,
      projectId: ids.project,
      sourceHandoffId: `${FIXTURE_PREFIX}-handoff`,
      sourceChecklistId: `${FIXTURE_PREFIX}-checklist`,
      sourceAttachmentId: attachmentIds.checklist,
      status: "APPROVAL_PENDING",
      createdById: ids.root,
    },
  });
  await prisma.projectProductionUnitFile.create({
    data: {
      id: `${FIXTURE_PREFIX}-production-file`,
      productionUnitId: `${FIXTURE_PREFIX}-production-unit`,
      attachmentId: attachmentIds.production,
      addedById: ids.root,
    },
  });
  await prisma.productionApprovalStep.create({
    data: {
      id: `${FIXTURE_PREFIX}-approval-step`,
      clientRequestId: `${FIXTURE_PREFIX}-approval-client-request`,
      productionUnitId: `${FIXTURE_PREFIX}-production-unit`,
      sequence: 1,
      recipientType: "EXISTING_COLLABORATOR",
      recipientUserId: ids.admin,
      recipientName: "Fixture Admin",
      recipientEmail: "old-admin@reset-fixture.example.test",
      requestedById: ids.root,
      status: "APPROVED",
      decidedByUserId: ids.admin,
      decidedAt: now,
    },
  });
  await prisma.projectProductionHandover.create({
    data: {
      id: `${FIXTURE_PREFIX}-production-handover`,
      clientRequestId: `${FIXTURE_PREFIX}-handover-client-request`,
      productionUnitId: `${FIXTURE_PREFIX}-production-unit`,
      route: "PURCHASE_DEPARTMENT",
      recipientType: "EXISTING_COLLABORATOR",
      recipientUserId: ids.admin,
      recipientName: "Fixture Admin",
      recipientEmail: "old-admin@reset-fixture.example.test",
      contentSnapshot: { fixture: true },
      requestedById: ids.root,
      handedOverById: ids.root,
      deliveryStatus: "SENT",
      sentAt: now,
    },
  });

  await prisma.projectProductionSupervision.create({
    data: {
      id: `${FIXTURE_PREFIX}-supervision`,
      projectId: ids.project,
      productionUnitId: `${FIXTURE_PREFIX}-production-unit`,
      status: "IN_REVIEW",
      signedOffById: ids.root,
    },
  });
  await prisma.productionSampleRound.create({
    data: {
      id: `${FIXTURE_PREFIX}-sample-round`,
      clientRequestId: `${FIXTURE_PREFIX}-sample-client-request`,
      projectId: ids.project,
      supervisionId: `${FIXTURE_PREFIX}-supervision`,
      sequence: 1,
      name: "Fixture physical sample",
      type: "PRE_PRODUCTION_SAMPLE",
      deadline: tomorrow,
      recipientRoute: "PURCHASE_DEPARTMENT",
      recipientType: "EXISTING_COLLABORATOR",
      recipientUserId: ids.user,
      recipientName: "Fixture User",
      recipientEmail: "old-user@reset-fixture.example.test",
      createdById: ids.root,
      status: "UNDER_REVIEW",
    },
  });
  await prisma.productionSampleEvaluation.create({
    data: {
      id: `${FIXTURE_PREFIX}-sample-evaluation`,
      sampleRoundId: `${FIXTURE_PREFIX}-sample-round`,
      criterion: "MATERIAL_QUALITY",
      decision: "PASS",
    },
  });
  await prisma.productionSampleRoundParticipant.create({
    data: {
      sampleRoundId: `${FIXTURE_PREFIX}-sample-round`,
      userId: ids.user,
      addedById: ids.root,
    },
  });
  await prisma.productionSampleRoundEvidence.create({
    data: {
      id: `${FIXTURE_PREFIX}-sample-evidence`,
      sampleRoundId: `${FIXTURE_PREFIX}-sample-round`,
      attachmentId: attachmentIds.evidence,
      criterion: "MATERIAL_QUALITY",
      addedById: ids.root,
    },
  });
  await prisma.productionSampleFeedback.create({
    data: {
      id: `${FIXTURE_PREFIX}-sample-feedback`,
      clientRequestId: `${FIXTURE_PREFIX}-feedback-client-request`,
      sampleRoundId: `${FIXTURE_PREFIX}-sample-round`,
      recipientType: "EXISTING_COLLABORATOR",
      recipientUserId: ids.user,
      recipientName: "Fixture User",
      recipientEmail: "old-user@reset-fixture.example.test",
      subject: "Fixture feedback",
      messageSnapshot: "Synthetic feedback",
      status: "SENT",
      sentById: ids.root,
      sentAt: now,
    },
  });

  await prisma.projectClosure.create({
    data: {
      id: `${FIXTURE_PREFIX}-closure`,
      projectId: ids.project,
      closedById: ids.root,
      closedAt: now,
    },
  });
  await prisma.projectCompletionWorkflow.create({
    data: {
      id: `${FIXTURE_PREFIX}-completion-workflow`,
      projectId: ids.project,
      approvalRequired: true,
      approvalStatus: "COMPLETED",
      approvalContactUserId: ids.admin,
      copyrightRequired: false,
      copyrightStatus: "NOT_REQUIRED",
      invoiceRequired: true,
      invoiceStatus: "COMPLETED",
      invoiceContactUserId: ids.admin,
      completedAt: now,
    },
  });
  await prisma.projectCompletionDocument.create({
    data: {
      id: `${FIXTURE_PREFIX}-completion-document`,
      projectId: ids.project,
      workflowId: `${FIXTURE_PREFIX}-completion-workflow`,
      type: "INVOICE",
      originalFileName: "fixture-invoice.pdf",
      archiveFileName: "fixture-invoice.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      bucket: "reset-fixture-bucket",
      storageKey: `${FIXTURE_PREFIX}/completion/invoice.pdf`,
      uploadedById: ids.root,
      uploadedAt: now,
    },
  });
  await prisma.projectArchive.create({
    data: {
      id: `${FIXTURE_PREFIX}-project-archive`,
      projectId: ids.project,
      finalStageId: ids.stages[6],
      archivedById: ids.root,
      projectName: "RESET FIXTURE OLD QA PROJECT",
      projectCategory: "Reset Fixture Category",
      projectTag: "Reset Fixture Tag",
      archiveCategoryId: ids.archiveCategory,
      status: "ARCHIVED",
      archivedAt: now,
    },
  });
  await prisma.archivedProjectFile.create({
    data: {
      id: `${FIXTURE_PREFIX}-archived-file`,
      archiveId: `${FIXTURE_PREFIX}-project-archive`,
      projectId: ids.project,
      sourceAttachmentId: attachmentIds.archive,
      sourceRevisionId: `${FIXTURE_PREFIX}-revision`,
      finalArchiveFileName: "fixture-final.pdf",
      originalFileName: "fixture-final.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      bucket: "reset-fixture-bucket",
      storageKey: `${FIXTURE_PREFIX}/archive/final.pdf`,
      archivedById: ids.root,
      archivedAt: now,
    },
  });
  await prisma.archiveArtworkMetadata.create({
    data: artworkMetadataData({
      id: `${FIXTURE_PREFIX}-archive-metadata`,
      artworkId: "FIXTURE-PROJECT-001",
      archivedById: ids.root,
      projectId: ids.project,
      archiveFileId: `${FIXTURE_PREFIX}-archived-file`,
      sourceAttachmentId: attachmentIds.archive,
      sourceType: "PROJECT_FINAL_FILE",
    }),
  });

  await prisma.manualArchiveFile.create({
    data: {
      id: `${FIXTURE_PREFIX}-manual-archive`,
      fileName: "fixture-manual-archive.pdf",
      originalFileName: "fixture-manual-archive.pdf",
      projectName: "Fixture Manual Archive",
      archiveCategoryId: ids.archiveCategory,
      mimeType: "application/pdf",
      fileSize: 1024,
      bucket: "reset-fixture-bucket",
      storageKey: `${FIXTURE_PREFIX}/manual/archive.pdf`,
      status: "READY",
      uploadedById: ids.root,
    },
  });
  await prisma.archiveArtworkMetadata.create({
    data: artworkMetadataData({
      id: `${FIXTURE_PREFIX}-manual-archive-metadata`,
      artworkId: "FIXTURE-MANUAL-001",
      archivedById: ids.root,
      manualArchiveFileId: `${FIXTURE_PREFIX}-manual-archive`,
      sourceType: "DIRECT_UPLOAD",
    }),
  });
  await prisma.manualArchiveFileAssetTagAssignment.create({
    data: {
      archiveFileId: `${FIXTURE_PREFIX}-manual-archive`,
      tagId: ids.assetTag,
    },
  });
  await prisma.manualLibraryAsset.create({
    data: {
      id: `${FIXTURE_PREFIX}-manual-library`,
      assetName: "Fixture library asset",
      originalFileName: "fixture-library.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      bucket: "reset-fixture-bucket",
      storageKey: `${FIXTURE_PREFIX}/manual/library.pdf`,
      status: "READY",
      uploadedById: ids.root,
    },
  });
  await prisma.manualLibraryAssetTagAssignment.create({
    data: {
      assetId: `${FIXTURE_PREFIX}-manual-library`,
      tagId: ids.assetTag,
    },
  });
  await prisma.manualLibraryAssetFavorite.create({
    data: {
      id: `${FIXTURE_PREFIX}-manual-library-favorite`,
      userId: ids.user,
      manualLibraryAssetId: `${FIXTURE_PREFIX}-manual-library`,
    },
  });
  await prisma.userArchiveAccess.create({
    data: {
      id: `${FIXTURE_PREFIX}-archive-access`,
      userId: ids.user,
      level: "PARTIAL",
      grantedById: ids.root,
    },
  });
  await prisma.userArchiveAssetAccess.createMany({
    data: [
      {
        id: `${FIXTURE_PREFIX}-archive-project-access`,
        userId: ids.user,
        archivedProjectFileId: `${FIXTURE_PREFIX}-archived-file`,
        grantedById: ids.root,
      },
      {
        id: `${FIXTURE_PREFIX}-archive-manual-access`,
        userId: ids.user,
        manualArchiveFileId: `${FIXTURE_PREFIX}-manual-archive`,
        grantedById: ids.root,
      },
    ],
  });
  await prisma.archiveCategoryAccess.create({
    data: {
      archiveCategoryId: ids.archiveCategory,
      userId: ids.user,
      createdById: ids.root,
    },
  });

  await prisma.fluxAiConversation.create({
    data: {
      id: `${FIXTURE_PREFIX}-flux-conversation`,
      userId: ids.user,
      title: "Old fixture conversation",
    },
  });
  await prisma.fluxAiMessage.create({
    data: {
      id: `${FIXTURE_PREFIX}-flux-message`,
      conversationId: `${FIXTURE_PREFIX}-flux-conversation`,
      role: "USER",
      content: "Find old fixture artwork",
    },
  });
  await prisma.fluxAiSearchHistory.create({
    data: {
      id: `${FIXTURE_PREFIX}-flux-search`,
      userId: ids.user,
      query: "old fixture artwork",
      normalizedQuery: "old fixture artwork",
    },
  });
  await prisma.notification.create({
    data: {
      id: `${FIXTURE_PREFIX}-notification`,
      userId: ids.user,
      type: "PROJECT_CREATED",
      title: "Old fixture notification",
      message: "This must be cleared",
      entityType: "PROJECT",
      entityId: ids.project,
      projectId: ids.project,
      dedupeKey: `${FIXTURE_PREFIX}-notification-dedupe`,
    },
  });
  await prisma.calendarEvent.create({
    data: {
      id: `${FIXTURE_PREFIX}-calendar-event`,
      title: "Old fixture calendar event",
      startAt: now,
      endAt: tomorrow,
      type: "PROJECTS",
      tone: "GREEN",
      createdById: ids.root,
    },
  });
  await prisma.calendarCollaborator.create({
    data: {
      id: `${FIXTURE_PREFIX}-calendar-collaborator`,
      userId: ids.user,
      addedById: ids.root,
    },
  });

  const populatedTables = await prisma.$queryRawUnsafe<
    Array<{ populated_tables: number }>
  >(`
    SELECT COUNT(*)::int AS populated_tables
    FROM information_schema.tables table_record
    WHERE table_record.table_schema = current_schema()
      AND table_record.table_type = 'BASE TABLE'
      AND table_record.table_name <> '_prisma_migrations'
      AND (xpath('/row/count/text()', query_to_xml(
        format('SELECT count(*) AS count FROM %I.%I', table_record.table_schema, table_record.table_name),
        false,
        true,
        ''
      )))[1]::text::int > 0
  `);

  console.log("Synthetic reset fixture created.");
  console.log(`Users: ${await prisma.user.count()}`);
  console.log(`Projects: ${await prisma.project.count()}`);
  console.log(`Project attachments: ${await prisma.projectAttachment.count()}`);
  console.log(`Populated application/config tables: ${populatedTables[0]?.populated_tables ?? 0}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "CollaboratorType" AS ENUM ('INTERNAL', 'EXTERNAL', 'GTI_INTERNAL_CLIENT', 'GTI_SISTER_COMPANY_INTERNAL_CLIENT', 'EXTERNAL_FREELANCER', 'EXTERNAL_AGENCY', 'EXTERNAL_VENDOR', 'CLIENT_OF_GTI');

-- CreateEnum
CREATE TYPE "ProjectCollaboratorParticipantType" AS ENUM ('GTI_INTERNAL_CLIENT', 'GTI_SISTER_COMPANY_INTERNAL_CLIENT', 'EXTERNAL_FREELANCER', 'EXTERNAL_AGENCY', 'EXTERNAL_VENDOR', 'CLIENT_OF_GTI');

-- CreateEnum
CREATE TYPE "CollaboratorAccess" AS ENUM ('FULL', 'LIMITED', 'NONE');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'ONGOING', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectExecutionType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProjectExecutorRole" AS ENUM ('MAIN_EXECUTOR', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('PROJECTS', 'EVENTS', 'REMINDERS', 'PAYMENTS');

-- CreateEnum
CREATE TYPE "CalendarEventTone" AS ENUM ('GREEN', 'PURPLE', 'BLUE', 'AMBER');

-- CreateEnum
CREATE TYPE "AttachmentAssetType" AS ENUM ('REVISION_ORIGINAL', 'STAGE_SUBMISSION', 'REVISION_PREVIEW', 'REVISION_THUMBNAIL', 'COMMENT_ATTACHMENT', 'STAGE_INVOICE', 'FINAL_ARCHIVE', 'GENERAL_PROJECT_ASSET');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "SubmissionReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectRevisionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityLogAction" AS ENUM ('ASSET_UPLOADED', 'COMMENT_ATTACHMENT_UPLOADED', 'REVISION_CREATED', 'FINAL_ARCHIVED');

-- CreateEnum
CREATE TYPE "ArchiveRecordStatus" AS ENUM ('COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectCompletionStepStatus" AS ENUM ('NOT_STARTED', 'NOT_REQUIRED', 'PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectCompletionDocumentType" AS ENUM ('AUTHORITY_APPROVAL_PROOF', 'COPYRIGHT_TRANSFER', 'INVOICE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROJECT_ASSIGNED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'COLLABORATOR_ADDED', 'COLLABORATOR_REMOVED', 'BRIEF_ACCEPTED', 'REVISION_SUBMITTED', 'REVISION_APPROVED', 'REVISION_REJECTED', 'SUBMISSION_PENDING_REVIEW', 'SUBMISSION_COMPLETED', 'SUBMISSION_REVISION_REQUESTED', 'STAGE_COMPLETED', 'NEXT_STAGE_ACTIVATED', 'COMMENT_ADDED', 'MENTION', 'FILE_UPLOADED', 'PROJECT_ARCHIVED', 'APPROVAL_REQUIRED', 'APPROVAL_PROOF_UPLOADED', 'COPYRIGHT_TRANSFER_REQUIRED', 'COPYRIGHT_DOCUMENT_UPLOADED', 'INVOICE_REQUESTED', 'INVOICE_UPLOADED');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('PROJECT', 'STAGE', 'REVISION', 'COMMENT', 'ATTACHMENT', 'ARCHIVE', 'COMPLETION_WORKFLOW', 'COMPLETION_DOCUMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "department" TEXT,
    "phoneNumber" TEXT,
    "jobTitle" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'COLLABORATOR',
    "collaboratorType" "CollaboratorType" NOT NULL DEFAULT 'GTI_INTERNAL_CLIENT',
    "projectAccess" "CollaboratorAccess" NOT NULL DEFAULT 'NONE',
    "calendarAccess" "CollaboratorAccess" NOT NULL DEFAULT 'NONE',
    "libraryAccess" "CollaboratorAccess" NOT NULL DEFAULT 'NONE',
    "archiveAccess" "CollaboratorAccess" NOT NULL DEFAULT 'NONE',
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "inviteAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratorTypePermission" (
    "id" TEXT NOT NULL,
    "collaboratorType" "CollaboratorType" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaboratorTypePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPresetPermission" (
    "id" TEXT NOT NULL,
    "accessPreset" "CollaboratorAccess" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessPresetPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "executorName" TEXT,
    "executorUserId" TEXT,
    "description" TEXT NOT NULL,
    "executionType" "ProjectExecutionType" NOT NULL DEFAULT 'EXTERNAL',
    "budget" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "statusId" TEXT,
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currentStageName" TEXT,
    "stageCount" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "groupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatusOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusGroupOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatusGroupOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTagAssignment" (
    "projectId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTagAssignment_pkey" PRIMARY KEY ("projectId","tagId")
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "iconKey" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttachmentAssetTagAssignment" (
    "attachmentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAttachmentAssetTagAssignment_pkey" PRIMARY KEY ("attachmentId","tagId")
);

-- CreateTable
CREATE TABLE "ManualArchiveFileAssetTagAssignment" (
    "archiveFileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualArchiveFileAssetTagAssignment_pkey" PRIMARY KEY ("archiveFileId","tagId")
);

-- CreateTable
CREATE TABLE "ManualLibraryAssetTagAssignment" (
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualLibraryAssetTagAssignment_pkey" PRIMARY KEY ("assetId","tagId")
);

CREATE TABLE "ProjectCollaborator" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "participantType" "ProjectCollaboratorParticipantType",
    "chatVisibilityPaused" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCollaborator_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectExecutor" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectExecutorRole" NOT NULL DEFAULT 'EXECUTOR',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExecutor_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectCollaboratorVisibilityPause" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCollaboratorVisibilityPause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCollaborator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" "CollaboratorAccess" NOT NULL DEFAULT 'LIMITED',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "budget" INTEGER,
    "plannedStartAt" TIMESTAMP(3),
    "plannedDueAt" TIMESTAMP(3),
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT true,
    "actualStartedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "ProjectRevisionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "revisionId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT,
    "revisionId" TEXT,
    "commentId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "assetType" "AttachmentAssetType" NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "submissionReviewStatus" "SubmissionReviewStatus",
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageInvoiceRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedFromId" TEXT NOT NULL,
    "note" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageInvoiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "baseAttachmentId" TEXT NOT NULL,
    "compareAttachmentId" TEXT NOT NULL,
    "xPercent" DOUBLE PRECISION NOT NULL,
    "yPercent" DOUBLE PRECISION NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComparisonComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT,
    "revisionId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" "ActivityLogAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectArchive" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "finalStageId" TEXT NOT NULL,
    "archivedById" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectCategory" TEXT NOT NULL,
    "projectTag" TEXT,
    "archiveCategoryId" TEXT,
    "status" "ArchiveRecordStatus" NOT NULL DEFAULT 'ARCHIVED',
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedProjectFile" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceAttachmentId" TEXT NOT NULL,
    "sourceRevisionId" TEXT,
    "finalArchiveFileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "archivedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchivedProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCompletionWorkflow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "approvalRequired" BOOLEAN,
    "approvalStatus" "ProjectCompletionStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "approvalContactUserId" TEXT,
    "approvalNote" TEXT,
    "approvalSelectedArchivedFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalRequestedAt" TIMESTAMP(3),
    "approvalCompletedAt" TIMESTAMP(3),
    "copyrightRequired" BOOLEAN,
    "copyrightStatus" "ProjectCompletionStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "copyrightContactUserId" TEXT,
    "copyrightNote" TEXT,
    "copyrightRequestedAt" TIMESTAMP(3),
    "copyrightCompletedAt" TIMESTAMP(3),
    "invoiceStatus" "ProjectCompletionStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "invoiceCompletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCompletionWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCompletionDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" "ProjectCompletionDocumentType" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "archiveFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCompletionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualArchiveFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "projectName" TEXT,
    "projectCreatedBy" TEXT,
    "archiveCategoryId" TEXT,
    "projectDate" TIMESTAMP(3),
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualArchiveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualLibraryAsset" (
    "id" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "createdByName" TEXT,
    "description" TEXT,
    "category" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualLibraryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" "NotificationEntityType",
    "entityId" TEXT,
    "projectId" TEXT,
    "stageId" TEXT,
    "revisionId" TEXT,
    "commentId" TEXT,
    "attachmentId" TEXT,
    "archiveId" TEXT,
    "url" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "type" "CalendarEventType" NOT NULL,
    "tone" "CalendarEventTone" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionDefinition_key_key" ON "PermissionDefinition"("key");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE INDEX "RolePermission_permissionKey_idx" ON "RolePermission"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permissionKey_key" ON "RolePermission"("role", "permissionKey");

-- CreateIndex
CREATE INDEX "CollaboratorTypePermission_collaboratorType_idx" ON "CollaboratorTypePermission"("collaboratorType");

-- CreateIndex
CREATE INDEX "CollaboratorTypePermission_permissionKey_idx" ON "CollaboratorTypePermission"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratorTypePermission_collaboratorType_permissionKey_key" ON "CollaboratorTypePermission"("collaboratorType", "permissionKey");

-- CreateIndex
CREATE INDEX "AccessPresetPermission_accessPreset_idx" ON "AccessPresetPermission"("accessPreset");

-- CreateIndex
CREATE INDEX "AccessPresetPermission_permissionKey_idx" ON "AccessPresetPermission"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccessPresetPermission_accessPreset_permissionKey_key" ON "AccessPresetPermission"("accessPreset", "permissionKey");

-- CreateIndex
CREATE INDEX "Project_statusId_idx" ON "Project"("statusId");

-- CreateIndex
CREATE INDEX "Project_isPinned_idx" ON "Project"("isPinned");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_executorUserId_idx" ON "Project"("executorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCategory_name_key" ON "ProjectCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatusOption_slug_key" ON "ProjectStatusOption"("slug");

-- CreateIndex
CREATE INDEX "ProjectStatusOption_slug_idx" ON "ProjectStatusOption"("slug");

-- CreateIndex
CREATE INDEX "ProjectStatusOption_groupId_isActive_sortOrder_idx" ON "ProjectStatusOption"("groupId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStatusGroupOption_slug_key" ON "ProjectStatusGroupOption"("slug");

-- CreateIndex
CREATE INDEX "ProjectStatusGroupOption_slug_idx" ON "ProjectStatusGroupOption"("slug");

-- CreateIndex
CREATE INDEX "ProjectStatusGroupOption_isActive_sortOrder_idx" ON "ProjectStatusGroupOption"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTag_name_key" ON "ProjectTag"("name");

-- CreateIndex
CREATE INDEX "ProjectTagAssignment_tagId_idx" ON "ProjectTagAssignment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTag_name_key" ON "AssetTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveCategory_slug_key" ON "ArchiveCategory"("slug");

-- CreateIndex
CREATE INDEX "ArchiveCategory_slug_idx" ON "ArchiveCategory"("slug");

-- CreateIndex
CREATE INDEX "ArchiveCategory_parentId_idx" ON "ArchiveCategory"("parentId");

-- CreateIndex
CREATE INDEX "ArchiveCategory_isActive_sortOrder_idx" ON "ArchiveCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectAttachmentAssetTagAssignment_tagId_idx" ON "ProjectAttachmentAssetTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "ManualArchiveFileAssetTagAssignment_tagId_idx" ON "ManualArchiveFileAssetTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "ManualLibraryAssetTagAssignment_tagId_idx" ON "ManualLibraryAssetTagAssignment"("tagId");

CREATE INDEX "ProjectCollaborator_userId_idx" ON "ProjectCollaborator"("userId");

-- CreateIndex
CREATE INDEX "ProjectCollaborator_addedById_idx" ON "ProjectCollaborator"("addedById");

-- CreateIndex
CREATE INDEX "ProjectExecutor_userId_idx" ON "ProjectExecutor"("userId");

-- CreateIndex
CREATE INDEX "ProjectExecutor_addedById_idx" ON "ProjectExecutor"("addedById");

-- CreateIndex
CREATE INDEX "ProjectExecutor_role_idx" ON "ProjectExecutor"("role");

-- CreateIndex
CREATE INDEX "ProjectCollaboratorVisibilityPause_projectId_userId_pausedA_idx" ON "ProjectCollaboratorVisibilityPause"("projectId", "userId", "pausedAt");

-- CreateIndex
CREATE INDEX "ProjectCollaboratorVisibilityPause_projectId_pausedAt_resum_idx" ON "ProjectCollaboratorVisibilityPause"("projectId", "pausedAt", "resumedAt");

-- CreateIndex
CREATE INDEX "ProjectCollaboratorVisibilityPause_createdById_idx" ON "ProjectCollaboratorVisibilityPause"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCollaborator_userId_key" ON "CalendarCollaborator"("userId");

-- CreateIndex
CREATE INDEX "CalendarCollaborator_addedById_idx" ON "CalendarCollaborator"("addedById");

-- CreateIndex
CREATE INDEX "ProjectStage_projectId_order_idx" ON "ProjectStage"("projectId", "order");

-- CreateIndex
CREATE INDEX "ProjectStage_startedById_idx" ON "ProjectStage"("startedById");

-- CreateIndex
CREATE INDEX "ProjectRevision_projectId_stageId_createdAt_idx" ON "ProjectRevision"("projectId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectRevision_createdById_idx" ON "ProjectRevision"("createdById");

-- CreateIndex
CREATE INDEX "ProjectRevision_reviewedById_idx" ON "ProjectRevision"("reviewedById");

-- CreateIndex
CREATE INDEX "ProjectRevision_status_idx" ON "ProjectRevision"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRevision_stageId_revisionNumber_key" ON "ProjectRevision"("stageId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ProjectComment_projectId_stageId_createdAt_idx" ON "ProjectComment"("projectId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectComment_revisionId_idx" ON "ProjectComment"("revisionId");

-- CreateIndex
CREATE INDEX "ProjectComment_authorId_idx" ON "ProjectComment"("authorId");

-- CreateIndex
CREATE INDEX "ProjectCommentMention_mentionedUserId_createdAt_idx" ON "ProjectCommentMention"("mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectCommentMention_commentId_createdAt_idx" ON "ProjectCommentMention"("commentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCommentMention_commentId_mentionedUserId_key" ON "ProjectCommentMention"("commentId", "mentionedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttachment_storageKey_key" ON "ProjectAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ProjectAttachment_projectId_createdAt_idx" ON "ProjectAttachment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAttachment_stageId_createdAt_idx" ON "ProjectAttachment"("stageId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAttachment_revisionId_createdAt_idx" ON "ProjectAttachment"("revisionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAttachment_commentId_createdAt_idx" ON "ProjectAttachment"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectAttachment_uploadedById_idx" ON "ProjectAttachment"("uploadedById");

-- CreateIndex
CREATE INDEX "ProjectAttachment_reviewedById_idx" ON "ProjectAttachment"("reviewedById");

-- CreateIndex
CREATE INDEX "ProjectAttachment_status_idx" ON "ProjectAttachment"("status");

-- CreateIndex
CREATE INDEX "ProjectAttachment_submissionReviewStatus_idx" ON "ProjectAttachment"("submissionReviewStatus");

-- CreateIndex
CREATE INDEX "StageInvoiceRequest_projectId_createdAt_idx" ON "StageInvoiceRequest"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "StageInvoiceRequest_requestedById_idx" ON "StageInvoiceRequest"("requestedById");

-- CreateIndex
CREATE INDEX "StageInvoiceRequest_requestedFromId_idx" ON "StageInvoiceRequest"("requestedFromId");

-- CreateIndex
CREATE INDEX "StageInvoiceRequest_fulfilledAt_idx" ON "StageInvoiceRequest"("fulfilledAt");

-- CreateIndex
CREATE UNIQUE INDEX "StageInvoiceRequest_stageId_key" ON "StageInvoiceRequest"("stageId");

-- CreateIndex
CREATE INDEX "FileFavorite_userId_idx" ON "FileFavorite"("userId");

-- CreateIndex
CREATE INDEX "FileFavorite_attachmentId_idx" ON "FileFavorite"("attachmentId");

-- CreateIndex
CREATE INDEX "FileFavorite_userId_createdAt_idx" ON "FileFavorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileFavorite_userId_attachmentId_key" ON "FileFavorite"("userId", "attachmentId");

-- CreateIndex
CREATE INDEX "ComparisonComment_projectId_stageId_createdAt_idx" ON "ComparisonComment"("projectId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "ComparisonComment_baseAttachmentId_compareAttachmentId_crea_idx" ON "ComparisonComment"("baseAttachmentId", "compareAttachmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ComparisonComment_createdById_idx" ON "ComparisonComment"("createdById");

-- CreateIndex
CREATE INDEX "ProjectActivityLog_projectId_createdAt_idx" ON "ProjectActivityLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivityLog_stageId_createdAt_idx" ON "ProjectActivityLog"("stageId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivityLog_revisionId_createdAt_idx" ON "ProjectActivityLog"("revisionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivityLog_actorId_idx" ON "ProjectActivityLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectArchive_projectId_key" ON "ProjectArchive"("projectId");

-- CreateIndex
CREATE INDEX "ProjectArchive_archiveCategoryId_archivedAt_idx" ON "ProjectArchive"("archiveCategoryId", "archivedAt");

-- CreateIndex
CREATE INDEX "ProjectArchive_archivedById_idx" ON "ProjectArchive"("archivedById");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_projectId_archivedAt_idx" ON "ArchivedProjectFile"("projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_sourceAttachmentId_idx" ON "ArchivedProjectFile"("sourceAttachmentId");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_sourceRevisionId_idx" ON "ArchivedProjectFile"("sourceRevisionId");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_archivedById_idx" ON "ArchivedProjectFile"("archivedById");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedProjectFile_archiveId_finalArchiveFileName_key" ON "ArchivedProjectFile"("archiveId", "finalArchiveFileName");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedProjectFile_archiveId_sourceAttachmentId_key" ON "ArchivedProjectFile"("archiveId", "sourceAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompletionWorkflow_projectId_key" ON "ProjectCompletionWorkflow"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCompletionWorkflow_approvalStatus_idx" ON "ProjectCompletionWorkflow"("approvalStatus");

-- CreateIndex
CREATE INDEX "ProjectCompletionWorkflow_copyrightStatus_idx" ON "ProjectCompletionWorkflow"("copyrightStatus");

-- CreateIndex
CREATE INDEX "ProjectCompletionWorkflow_invoiceStatus_idx" ON "ProjectCompletionWorkflow"("invoiceStatus");

-- CreateIndex
CREATE INDEX "ProjectCompletionWorkflow_approvalContactUserId_idx" ON "ProjectCompletionWorkflow"("approvalContactUserId");

-- CreateIndex
CREATE INDEX "ProjectCompletionWorkflow_copyrightContactUserId_idx" ON "ProjectCompletionWorkflow"("copyrightContactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompletionDocument_storageKey_key" ON "ProjectCompletionDocument"("storageKey");

-- CreateIndex
CREATE INDEX "ProjectCompletionDocument_projectId_type_uploadedAt_idx" ON "ProjectCompletionDocument"("projectId", "type", "uploadedAt");

-- CreateIndex
CREATE INDEX "ProjectCompletionDocument_uploadedById_idx" ON "ProjectCompletionDocument"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompletionDocument_workflowId_type_key" ON "ProjectCompletionDocument"("workflowId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ManualArchiveFile_storageKey_key" ON "ManualArchiveFile"("storageKey");

-- CreateIndex
CREATE INDEX "ManualArchiveFile_archiveCategoryId_uploadedAt_idx" ON "ManualArchiveFile"("archiveCategoryId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ManualArchiveFile_uploadedById_idx" ON "ManualArchiveFile"("uploadedById");

-- CreateIndex
CREATE INDEX "ManualArchiveFile_status_idx" ON "ManualArchiveFile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ManualLibraryAsset_storageKey_key" ON "ManualLibraryAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ManualLibraryAsset_category_uploadedAt_idx" ON "ManualLibraryAsset"("category", "uploadedAt");

-- CreateIndex
CREATE INDEX "ManualLibraryAsset_uploadedById_idx" ON "ManualLibraryAsset"("uploadedById");

-- CreateIndex
CREATE INDEX "ManualLibraryAsset_status_idx" ON "ManualLibraryAsset"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_projectId_createdAt_idx" ON "Notification"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_endAt_idx" ON "CalendarEvent"("endAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_createdById_idx" ON "CalendarEvent"("createdById");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratorTypePermission" ADD CONSTRAINT "CollaboratorTypePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPresetPermission" ADD CONSTRAINT "AccessPresetPermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_executorUserId_fkey" FOREIGN KEY ("executorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ProjectStatusOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusOption" ADD CONSTRAINT "ProjectStatusOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProjectStatusGroupOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTagAssignment" ADD CONSTRAINT "ProjectTagAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTagAssignment" ADD CONSTRAINT "ProjectTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ProjectTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachmentAssetTagAssignment" ADD CONSTRAINT "ProjectAttachmentAssetTagAssignment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachmentAssetTagAssignment" ADD CONSTRAINT "ProjectAttachmentAssetTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualArchiveFileAssetTagAssignment" ADD CONSTRAINT "ManualArchiveFileAssetTagAssignment_archiveFileId_fkey" FOREIGN KEY ("archiveFileId") REFERENCES "ManualArchiveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualArchiveFileAssetTagAssignment" ADD CONSTRAINT "ManualArchiveFileAssetTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualLibraryAssetTagAssignment" ADD CONSTRAINT "ManualLibraryAssetTagAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ManualLibraryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualLibraryAssetTagAssignment" ADD CONSTRAINT "ManualLibraryAssetTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaboratorVisibilityPause" ADD CONSTRAINT "ProjectCollaboratorVisibilityPause_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "ProjectCollaborator"("projectId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaboratorVisibilityPause" ADD CONSTRAINT "ProjectCollaboratorVisibilityPause_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCollaborator" ADD CONSTRAINT "CalendarCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCollaborator" ADD CONSTRAINT "CalendarCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComment" ADD CONSTRAINT "ProjectComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommentMention" ADD CONSTRAINT "ProjectCommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ProjectComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommentMention" ADD CONSTRAINT "ProjectCommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ProjectComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInvoiceRequest" ADD CONSTRAINT "StageInvoiceRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInvoiceRequest" ADD CONSTRAINT "StageInvoiceRequest_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInvoiceRequest" ADD CONSTRAINT "StageInvoiceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInvoiceRequest" ADD CONSTRAINT "StageInvoiceRequest_requestedFromId_fkey" FOREIGN KEY ("requestedFromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFavorite" ADD CONSTRAINT "FileFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFavorite" ADD CONSTRAINT "FileFavorite_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonComment" ADD CONSTRAINT "ComparisonComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonComment" ADD CONSTRAINT "ComparisonComment_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonComment" ADD CONSTRAINT "ComparisonComment_baseAttachmentId_fkey" FOREIGN KEY ("baseAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonComment" ADD CONSTRAINT "ComparisonComment_compareAttachmentId_fkey" FOREIGN KEY ("compareAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonComment" ADD CONSTRAINT "ComparisonComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityLog" ADD CONSTRAINT "ProjectActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityLog" ADD CONSTRAINT "ProjectActivityLog_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityLog" ADD CONSTRAINT "ProjectActivityLog_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivityLog" ADD CONSTRAINT "ProjectActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_finalStageId_fkey" FOREIGN KEY ("finalStageId") REFERENCES "ProjectStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_archiveCategoryId_fkey" FOREIGN KEY ("archiveCategoryId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "ProjectArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionWorkflow" ADD CONSTRAINT "ProjectCompletionWorkflow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionWorkflow" ADD CONSTRAINT "ProjectCompletionWorkflow_approvalContactUserId_fkey" FOREIGN KEY ("approvalContactUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionWorkflow" ADD CONSTRAINT "ProjectCompletionWorkflow_copyrightContactUserId_fkey" FOREIGN KEY ("copyrightContactUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionDocument" ADD CONSTRAINT "ProjectCompletionDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionDocument" ADD CONSTRAINT "ProjectCompletionDocument_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ProjectCompletionWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCompletionDocument" ADD CONSTRAINT "ProjectCompletionDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualArchiveFile" ADD CONSTRAINT "ManualArchiveFile_archiveCategoryId_fkey" FOREIGN KEY ("archiveCategoryId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualArchiveFile" ADD CONSTRAINT "ManualArchiveFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualLibraryAsset" ADD CONSTRAINT "ManualLibraryAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ArchiveCategory" ("id", "name", "slug", "iconKey", "sortOrder", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('archive_category_artworks', 'Artworks', 'artworks', 'shapes', 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_promotions', 'Promotions', 'promotions', 'sparkles', 20, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_advertisements', 'Advertisements', 'advertisements', 'megaphone', 30, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_website_data', 'Website Data', 'website-data', 'panel-top', 40, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_revisions', 'Revisions', 'revisions', 'file-stack', 50, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_product_renders', 'Product Renders', 'product-renders', 'images', 60, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_3d_assets', '3D Assets', '3d-assets', 'box', 70, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_videos', 'Videos', 'videos', 'play', 80, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_documents', 'Documents', 'documents', 'scroll-text', 90, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_health_warnings', 'Health Warnings', 'health-warnings', 'shield-alert', 100, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_catalogues_flyers', 'Catalogues/Flyers', 'catalogues-flyers', 'newspaper', 110, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_exhibition_materials', 'Exhibition Materials', 'exhibition-materials', 'badge-check', 120, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ProjectStatusGroupOption" ("id", "name", "slug", "color", "sortOrder", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('project_status_group_pending', 'Pending', 'pending', '#8b8f99', 10, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_group_active', 'Active', 'active', '#34a853', 20, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_group_on_hold', 'On Hold', 'on-hold', '#64748b', 30, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_group_completed', 'Completed', 'completed', '#2563eb', 40, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_group_archived', 'Archived', 'archived', '#475569', 50, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_group_cancelled', 'Cancelled', 'cancelled', '#ef4444', 60, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ProjectStatusOption" ("id", "name", "slug", "color", "groupId", "sortOrder", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('project_status_pending', 'Pending', 'pending', '#8b8f99', 'project_status_group_pending', 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_briefing', 'Briefing', 'briefing', '#4f7cff', 'project_status_group_pending', 20, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_in_progress', 'In Progress', 'in-progress', '#34a853', 'project_status_group_active', 30, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_under_review', 'Under Review', 'under-review', '#8b5cf6', 'project_status_group_active', 40, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_revision_required', 'Revision Required', 'revision-required', '#f59e0b', 'project_status_group_active', 50, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_approved', 'Approved', 'approved', '#0f9ba8', 'project_status_group_active', 60, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_on_hold', 'On Hold', 'on-hold', '#64748b', 'project_status_group_on_hold', 70, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_completed', 'Completed', 'completed', '#2563eb', 'project_status_group_completed', 80, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_archived', 'Archived', 'archived', '#475569', 'project_status_group_archived', 90, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_cancelled', 'Cancelled', 'cancelled', '#ef4444', 'project_status_group_cancelled', 100, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

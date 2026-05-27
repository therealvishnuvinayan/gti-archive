-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
    'PROJECT_ASSIGNED',
    'PROJECT_CREATED',
    'PROJECT_UPDATED',
    'COLLABORATOR_ADDED',
    'COLLABORATOR_REMOVED',
    'BRIEF_ACCEPTED',
    'REVISION_SUBMITTED',
    'REVISION_APPROVED',
    'REVISION_REJECTED',
    'SUBMISSION_PENDING_REVIEW',
    'SUBMISSION_COMPLETED',
    'SUBMISSION_REVISION_REQUESTED',
    'STAGE_COMPLETED',
    'NEXT_STAGE_ACTIVATED',
    'COMMENT_ADDED',
    'FILE_UPLOADED',
    'PROJECT_ARCHIVED',
    'APPROVAL_REQUIRED',
    'APPROVAL_PROOF_UPLOADED',
    'COPYRIGHT_TRANSFER_REQUIRED',
    'COPYRIGHT_DOCUMENT_UPLOADED',
    'INVOICE_UPLOADED'
);

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM (
    'PROJECT',
    'STAGE',
    'REVISION',
    'COMMENT',
    'ATTACHMENT',
    'ARCHIVE',
    'COMPLETION_WORKFLOW',
    'COMPLETION_DOCUMENT'
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

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_projectId_createdAt_idx" ON "Notification"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

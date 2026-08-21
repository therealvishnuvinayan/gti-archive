CREATE TYPE "FlexibleProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED');

CREATE TYPE "FlexibleMilestoneStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "FlexibleProject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FlexibleProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "scope" "ProjectExecutionType" NOT NULL DEFAULT 'INTERNAL',
    "deadline" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlexibleProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlexibleProjectCollaborator" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlexibleProjectCollaborator_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE "FlexibleMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "responsibleUserId" TEXT,
    "deadline" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL,
    "status" "FlexibleMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlexibleMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlexibleProjectAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlexibleProjectAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlexibleProject_slug_key" ON "FlexibleProject"("slug");
CREATE INDEX "FlexibleProject_ownerId_updatedAt_idx" ON "FlexibleProject"("ownerId", "updatedAt");
CREATE INDEX "FlexibleProject_createdById_idx" ON "FlexibleProject"("createdById");
CREATE INDEX "FlexibleProject_status_updatedAt_idx" ON "FlexibleProject"("status", "updatedAt");
CREATE INDEX "FlexibleProjectCollaborator_userId_projectId_idx" ON "FlexibleProjectCollaborator"("userId", "projectId");
CREATE INDEX "FlexibleProjectCollaborator_addedById_idx" ON "FlexibleProjectCollaborator"("addedById");
CREATE UNIQUE INDEX "FlexibleMilestone_projectId_sortOrder_key" ON "FlexibleMilestone"("projectId", "sortOrder");
CREATE INDEX "FlexibleMilestone_projectId_status_idx" ON "FlexibleMilestone"("projectId", "status");
CREATE INDEX "FlexibleMilestone_responsibleUserId_idx" ON "FlexibleMilestone"("responsibleUserId");
CREATE INDEX "FlexibleMilestone_completedById_idx" ON "FlexibleMilestone"("completedById");
CREATE UNIQUE INDEX "FlexibleProjectAttachment_storageKey_key" ON "FlexibleProjectAttachment"("storageKey");
CREATE INDEX "FlexibleProjectAttachment_projectId_createdAt_idx" ON "FlexibleProjectAttachment"("projectId", "createdAt");
CREATE INDEX "FlexibleProjectAttachment_uploadedById_idx" ON "FlexibleProjectAttachment"("uploadedById");
CREATE INDEX "FlexibleProjectAttachment_status_idx" ON "FlexibleProjectAttachment"("status");

ALTER TABLE "FlexibleProject" ADD CONSTRAINT "FlexibleProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlexibleProject" ADD CONSTRAINT "FlexibleProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlexibleProjectCollaborator" ADD CONSTRAINT "FlexibleProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlexibleProjectCollaborator" ADD CONSTRAINT "FlexibleProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlexibleProjectCollaborator" ADD CONSTRAINT "FlexibleProjectCollaborator_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlexibleMilestone" ADD CONSTRAINT "FlexibleMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlexibleMilestone" ADD CONSTRAINT "FlexibleMilestone_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlexibleMilestone" ADD CONSTRAINT "FlexibleMilestone_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlexibleProjectAttachment" ADD CONSTRAINT "FlexibleProjectAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlexibleProjectAttachment" ADD CONSTRAINT "FlexibleProjectAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

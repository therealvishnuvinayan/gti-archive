-- CreateEnum
CREATE TYPE "ProjectCompletionStepStatus" AS ENUM (
    'NOT_STARTED',
    'NOT_REQUIRED',
    'PENDING',
    'COMPLETED'
);

-- CreateEnum
CREATE TYPE "ProjectCompletionDocumentType" AS ENUM (
    'AUTHORITY_APPROVAL_PROOF',
    'COPYRIGHT_TRANSFER',
    'INVOICE'
);

-- CreateTable
CREATE TABLE "ProjectCompletionWorkflow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "approvalRequired" BOOLEAN,
    "approvalStatus" "ProjectCompletionStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "approvalContactUserId" TEXT,
    "approvalNote" TEXT,
    "approvalSelectedArchivedFileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
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
CREATE UNIQUE INDEX "ProjectCompletionDocument_workflowId_type_key" ON "ProjectCompletionDocument"("workflowId", "type");

-- CreateIndex
CREATE INDEX "ProjectCompletionDocument_projectId_type_uploadedAt_idx" ON "ProjectCompletionDocument"("projectId", "type", "uploadedAt");

-- CreateIndex
CREATE INDEX "ProjectCompletionDocument_uploadedById_idx" ON "ProjectCompletionDocument"("uploadedById");

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

-- CreateTable
CREATE TABLE "ProjectFormDraft" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formKey" VARCHAR(191) NOT NULL,
    "payload" JSONB NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "clientRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFormDraft_projectId_userId_formKey_key"
ON "ProjectFormDraft"("projectId", "userId", "formKey");

-- CreateIndex
CREATE INDEX "ProjectFormDraft_userId_updatedAt_idx"
ON "ProjectFormDraft"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectFormDraft_projectId_updatedAt_idx"
ON "ProjectFormDraft"("projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ProjectFormDraft"
ADD CONSTRAINT "ProjectFormDraft_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFormDraft"
ADD CONSTRAINT "ProjectFormDraft_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

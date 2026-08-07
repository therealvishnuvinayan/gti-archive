-- Mark the legacy project-stage rows used as concept taskers without changing
-- the existing message, revision, or attachment storage model.
ALTER TABLE "ProjectStage"
ADD COLUMN "isTasker" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProjectConceptFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskerStageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectConceptFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectConceptFolder_taskerStageId_key"
ON "ProjectConceptFolder"("taskerStageId");

CREATE UNIQUE INDEX "ProjectConceptFolder_projectId_normalizedName_key"
ON "ProjectConceptFolder"("projectId", "normalizedName");

CREATE INDEX "ProjectConceptFolder_projectId_sortOrder_idx"
ON "ProjectConceptFolder"("projectId", "sortOrder");

CREATE INDEX "ProjectConceptFolder_createdById_idx"
ON "ProjectConceptFolder"("createdById");

CREATE INDEX "ProjectStage_projectId_isTasker_order_idx"
ON "ProjectStage"("projectId", "isTasker", "order");

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_taskerStageId_fkey"
FOREIGN KEY ("taskerStageId") REFERENCES "ProjectStage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

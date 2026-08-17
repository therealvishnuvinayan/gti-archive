ALTER TABLE "ProjectConceptFolder"
ADD COLUMN "sourceStage3ImportedAt" TIMESTAMP(3),
ADD COLUMN "sourceStage3ImportedById" TEXT;

UPDATE "ProjectConceptFolder"
SET
  "sourceStage3ImportedAt" = "updatedAt",
  "sourceStage3ImportedById" = COALESCE("createdById", "approvedById")
WHERE
  "sourceStage3ConceptId" IS NOT NULL
  AND "sourceStage3ApprovedAttachmentId" IS NOT NULL;

CREATE INDEX "ProjectConceptFolder_sourceStage3ImportedById_idx"
ON "ProjectConceptFolder"("sourceStage3ImportedById");

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_sourceStage3ImportedById_fkey"
FOREIGN KEY ("sourceStage3ImportedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

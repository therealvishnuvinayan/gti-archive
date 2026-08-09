ALTER TABLE "ProjectConceptFolder"
ADD COLUMN "approvedAttachmentId" TEXT,
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "sourceStage3ConceptId" TEXT,
ADD COLUMN "sourceStage3ApprovedAttachmentId" TEXT;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_approval_audit_check"
CHECK (
  ("approvedAttachmentId" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL)
  OR
  ("approvedAttachmentId" IS NOT NULL AND "approvedAt" IS NOT NULL)
);

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_source_pair_check"
CHECK (
  ("sourceStage3ConceptId" IS NULL AND "sourceStage3ApprovedAttachmentId" IS NULL)
  OR
  ("sourceStage3ConceptId" IS NOT NULL AND "sourceStage3ApprovedAttachmentId" IS NOT NULL)
);

CREATE UNIQUE INDEX "ProjectConceptFolder_approvedAttachmentId_key"
ON "ProjectConceptFolder"("approvedAttachmentId");

CREATE UNIQUE INDEX "ProjectConceptFolder_sourceStage3ConceptId_key"
ON "ProjectConceptFolder"("sourceStage3ConceptId");

CREATE UNIQUE INDEX "ProjectConceptFolder_sourceStage3ApprovedAttachmentId_key"
ON "ProjectConceptFolder"("sourceStage3ApprovedAttachmentId");

CREATE INDEX "ProjectConceptFolder_approvedById_idx"
ON "ProjectConceptFolder"("approvedById");

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_approvedAttachmentId_fkey"
FOREIGN KEY ("approvedAttachmentId")
REFERENCES "ProjectAttachment"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_approvedById_fkey"
FOREIGN KEY ("approvedById")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_sourceStage3ConceptId_fkey"
FOREIGN KEY ("sourceStage3ConceptId")
REFERENCES "ProjectConceptFolder"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_sourceStage3ApprovedAttachmentId_fkey"
FOREIGN KEY ("sourceStage3ApprovedAttachmentId")
REFERENCES "ProjectAttachment"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

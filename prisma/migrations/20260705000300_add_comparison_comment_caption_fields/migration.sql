-- Extend the existing comparison comment record so captions can target a single
-- submitted attachment without introducing a separate artwork entity.
ALTER TABLE "ComparisonComment"
  ADD COLUMN "captionAttachmentId" TEXT,
  ADD COLUMN "isCaption" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "comparisonOpacity" DOUBLE PRECISION;

ALTER TABLE "ComparisonComment"
  ADD CONSTRAINT "ComparisonComment_captionAttachmentId_fkey"
  FOREIGN KEY ("captionAttachmentId")
  REFERENCES "ProjectAttachment"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "ComparisonComment_captionAttachmentId_createdAt_idx"
  ON "ComparisonComment"("captionAttachmentId", "createdAt");

CREATE INDEX "ComparisonComment_projectId_stageId_isCaption_createdAt_idx"
  ON "ComparisonComment"("projectId", "stageId", "isCaption", "createdAt");

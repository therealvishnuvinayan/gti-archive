-- Stage 5 rows are project-owned. Removing their source or field attachment must
-- remove the association instead of blocking the parent project deletion path.
ALTER TABLE "ProjectStageFileHandoff"
DROP CONSTRAINT "ProjectStageFileHandoff_sourceAttachmentId_fkey";

ALTER TABLE "ProjectFileChecklist"
DROP CONSTRAINT "ProjectFileChecklist_sourceAttachmentId_fkey";

ALTER TABLE "ProjectFileChecklistItemAttachment"
DROP CONSTRAINT "ProjectFileChecklistItemAttachment_attachmentId_fkey";

ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_sourceAttachmentId_fkey"
FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklist"
ADD CONSTRAINT "ProjectFileChecklist_sourceAttachmentId_fkey"
FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklistItemAttachment"
ADD CONSTRAINT "ProjectFileChecklistItemAttachment_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

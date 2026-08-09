-- Bind collaborator uploads to the exact authenticated checklist request that
-- authorized them, preventing same-project cross-request attachment reuse.
ALTER TABLE "ProjectAttachment"
ADD COLUMN "checklistResponseRequestId" TEXT;

ALTER TABLE "ProjectAttachment"
ADD CONSTRAINT "ProjectAttachment_checklistResponseRequestId_fkey"
FOREIGN KEY ("checklistResponseRequestId") REFERENCES "ProjectFileChecklistRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectAttachment_checklistResponseRequestId_idx"
ON "ProjectAttachment"("checklistResponseRequestId");

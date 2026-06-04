ALTER TABLE "Project" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Project_isPinned_idx" ON "Project"("isPinned");

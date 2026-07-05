ALTER TABLE "ProjectCollaborator"
  ADD COLUMN "canInteract" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canAddCaptions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canDownloadFiles" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewBudget" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewVendorInfo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canAccessProjectArchives" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProjectCollaborator" pc
SET "canInteract" = true
FROM "ProjectExecutor" pe
WHERE pe."projectId" = pc."projectId"
  AND pe."userId" = pc."userId";

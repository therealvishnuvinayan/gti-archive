ALTER TYPE "AttachmentAssetType" ADD VALUE 'PROJECT_RESEARCH_FILE';

CREATE TYPE "ProjectResearchFolderSystemKey" AS ENUM (
  'BRIEF',
  'MARKET_COMPETITION',
  'TECH',
  'VENDORS',
  'FINANCE',
  'LEGAL',
  'PITCH'
);

CREATE TABLE "ProjectResearchWorkspace" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectResearchWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectResearchFolder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "systemKey" "ProjectResearchFolderSystemKey",
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 1000,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectResearchFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectResearchFolderFile" (
  "id" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectResearchFolderFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectResearchWorkspace_projectId_ownerUserId_key"
ON "ProjectResearchWorkspace"("projectId", "ownerUserId");
CREATE INDEX "ProjectResearchWorkspace_ownerUserId_idx"
ON "ProjectResearchWorkspace"("ownerUserId");

CREATE UNIQUE INDEX "ProjectResearchFolder_workspaceId_normalizedName_key"
ON "ProjectResearchFolder"("workspaceId", "normalizedName");
CREATE UNIQUE INDEX "ProjectResearchFolder_workspaceId_systemKey_key"
ON "ProjectResearchFolder"("workspaceId", "systemKey");
CREATE INDEX "ProjectResearchFolder_workspaceId_sortOrder_idx"
ON "ProjectResearchFolder"("workspaceId", "sortOrder");
CREATE INDEX "ProjectResearchFolder_createdById_idx"
ON "ProjectResearchFolder"("createdById");

CREATE UNIQUE INDEX "ProjectResearchFolderFile_attachmentId_key"
ON "ProjectResearchFolderFile"("attachmentId");
CREATE UNIQUE INDEX "ProjectResearchFolderFile_folderId_attachmentId_key"
ON "ProjectResearchFolderFile"("folderId", "attachmentId");
CREATE INDEX "ProjectResearchFolderFile_folderId_createdAt_idx"
ON "ProjectResearchFolderFile"("folderId", "createdAt");
CREATE INDEX "ProjectResearchFolderFile_addedById_idx"
ON "ProjectResearchFolderFile"("addedById");

ALTER TABLE "ProjectResearchWorkspace"
ADD CONSTRAINT "ProjectResearchWorkspace_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchWorkspace"
ADD CONSTRAINT "ProjectResearchWorkspace_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchFolder"
ADD CONSTRAINT "ProjectResearchFolder_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "ProjectResearchWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchFolder"
ADD CONSTRAINT "ProjectResearchFolder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchFolderFile"
ADD CONSTRAINT "ProjectResearchFolderFile_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "ProjectResearchFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchFolderFile"
ADD CONSTRAINT "ProjectResearchFolderFile_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectResearchFolderFile"
ADD CONSTRAINT "ProjectResearchFolderFile_addedById_fkey"
FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Some development databases received the Stage 1 schema before its migration was
-- baselined. Reconcile any missing fixed-workflow rows without changing existing
-- statuses or timestamps. On a normal migration chain this is a duplicate-safe no-op.
INSERT INTO "ProjectWorkflowStage" (
  "id",
  "projectId",
  "stageKey",
  "status",
  "unlockedAt",
  "completedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'workflow:' || project."id" || ':' || stage."stageKey",
  project."id",
  stage."stageKey"::"ProjectWorkflowStageKey",
  CASE
    WHEN stage."stageKey" = 'PROJECT_INQUIRY'
      THEN 'AVAILABLE'::"ProjectWorkflowStageStatus"
    ELSE 'LOCKED'::"ProjectWorkflowStageStatus"
  END,
  CASE WHEN stage."stageKey" = 'PROJECT_INQUIRY' THEN project."createdAt" ELSE NULL END,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" AS project
CROSS JOIN (
  VALUES
    ('PROJECT_INQUIRY'),
    ('PROJECT_RESEARCH_AND_PLANNING'),
    ('CONCEPT_CREATION'),
    ('PROJECT_DEVELOPMENT'),
    ('FINAL_LAYOUT'),
    ('PRODUCTION_AND_HANDOVER'),
    ('IMPLEMENTATION_AND_SUPERVISION')
) AS stage("stageKey")
ON CONFLICT ("projectId", "stageKey") DO NOTHING;

-- Every actual project participant receives one workspace. Manual inquiry contacts are
-- deliberately absent because they are not application users or project participants.
WITH participant AS (
  SELECT project."id" AS "projectId", project."ownerId" AS "ownerUserId"
  FROM "Project" AS project
  WHERE project."ownerId" IS NOT NULL
  UNION
  SELECT "projectId", "userId" FROM "ProjectCoOwner"
  UNION
  SELECT "projectId", "userId" FROM "ProjectExecutor"
  UNION
  SELECT "projectId", "userId" FROM "ProjectCollaborator"
)
INSERT INTO "ProjectResearchWorkspace" (
  "id", "projectId", "ownerUserId", "createdAt", "updatedAt"
)
SELECT
  'research-workspace:' || participant."projectId" || ':' || participant."ownerUserId",
  participant."projectId",
  participant."ownerUserId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM participant
ON CONFLICT ("projectId", "ownerUserId") DO NOTHING;

-- Seed the fixed business-ordered folder set for every workspace, including all
-- workspaces inserted by the participant backfill above.
INSERT INTO "ProjectResearchFolder" (
  "id",
  "workspaceId",
  "name",
  "normalizedName",
  "systemKey",
  "isSystem",
  "sortOrder",
  "createdById",
  "createdAt",
  "updatedAt"
)
SELECT
  'research-folder:' || workspace."id" || ':' || folder."systemKey",
  workspace."id",
  folder."name",
  folder."normalizedName",
  folder."systemKey"::"ProjectResearchFolderSystemKey",
  true,
  folder."sortOrder",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProjectResearchWorkspace" AS workspace
CROSS JOIN (
  VALUES
    ('BRIEF', 'Brief', 'brief', 1),
    ('MARKET_COMPETITION', 'Market & Competition', 'market & competition', 2),
    ('TECH', 'Tech', 'tech', 3),
    ('VENDORS', 'Vendors', 'vendors', 4),
    ('FINANCE', 'Finance', 'finance', 5),
    ('LEGAL', 'Legal', 'legal', 6),
    ('PITCH', 'Pitch', 'pitch', 7)
) AS folder("systemKey", "name", "normalizedName", "sortOrder")
ON CONFLICT ("workspaceId", "normalizedName") DO NOTHING;

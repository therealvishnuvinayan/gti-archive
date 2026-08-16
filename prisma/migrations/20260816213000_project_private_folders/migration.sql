ALTER TYPE "AttachmentAssetType" ADD VALUE 'PROJECT_PRIVATE_FILE';

CREATE TABLE "ProjectPrivateFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPrivateFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProjectAttachment"
ADD COLUMN "privateFolderId" TEXT;

CREATE UNIQUE INDEX "ProjectPrivateFolder_projectId_ownerUserId_key"
ON "ProjectPrivateFolder"("projectId", "ownerUserId");

CREATE INDEX "ProjectPrivateFolder_ownerUserId_idx"
ON "ProjectPrivateFolder"("ownerUserId");

CREATE INDEX "ProjectAttachment_privateFolderId_createdAt_idx"
ON "ProjectAttachment"("privateFolderId", "createdAt");

ALTER TABLE "ProjectPrivateFolder"
ADD CONSTRAINT "ProjectPrivateFolder_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectPrivateFolder"
ADD CONSTRAINT "ProjectPrivateFolder_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachment"
ADD CONSTRAINT "ProjectAttachment_privateFolderId_fkey"
FOREIGN KEY ("privateFolderId") REFERENCES "ProjectPrivateFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProjectPrivateFolder" (
    "id",
    "projectId",
    "ownerUserId",
    "createdAt",
    "updatedAt"
)
SELECT
    'private-folder-' || md5(participant."projectId" || ':' || participant."ownerUserId"),
    participant."projectId",
    participant."ownerUserId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT project."id" AS "projectId", project."ownerId" AS "ownerUserId"
    FROM "Project" project
    WHERE project."ownerId" IS NOT NULL

    UNION

    SELECT co_owner."projectId", co_owner."userId"
    FROM "ProjectCoOwner" co_owner

    UNION

    SELECT executor."projectId", executor."userId"
    FROM "ProjectExecutor" executor

    UNION

    SELECT collaborator."projectId", collaborator."userId"
    FROM "ProjectCollaborator" collaborator
) participant
ON CONFLICT ("projectId", "ownerUserId") DO NOTHING;

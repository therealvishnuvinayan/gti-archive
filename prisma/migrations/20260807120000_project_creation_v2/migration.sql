-- Phase 2 introduces explicit operational ownership while preserving audit authorship.
ALTER TABLE "Project"
ADD COLUMN "ownerId" TEXT;

-- Existing creators are a safe legacy owner fallback only when they are not SUPER_ADMIN.
-- SUPER_ADMIN-created legacy projects intentionally remain ownerless for manual assignment.
UPDATE "Project" AS project
SET "ownerId" = project."createdById"
FROM "User" AS creator
WHERE creator."id" = project."createdById"
  AND creator."role" <> 'SUPER_ADMIN'::"UserRole";

CREATE TABLE "ProjectCoOwner" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCoOwner_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX "ProjectCoOwner_userId_idx" ON "ProjectCoOwner"("userId");
CREATE INDEX "ProjectCoOwner_addedById_idx" ON "ProjectCoOwner"("addedById");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectCoOwner"
ADD CONSTRAINT "ProjectCoOwner_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCoOwner"
ADD CONSTRAINT "ProjectCoOwner_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCoOwner"
ADD CONSTRAINT "ProjectCoOwner_addedById_fkey"
FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy workflow data remains available, but V2 projects no longer receive fabricated values.
ALTER TABLE "Project" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "executionType" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "executionType" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "budgetRequired" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "budgetRequired" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "currency" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "priority" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "endDate" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "stageCount" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "stageCount" DROP NOT NULL;

-- Every existing assignment is retained; only the obsolete hierarchy metadata is removed.
DROP INDEX IF EXISTS "ProjectExecutor_role_idx";
ALTER TABLE "ProjectExecutor" DROP COLUMN "role";
DROP TYPE "ProjectExecutorRole";

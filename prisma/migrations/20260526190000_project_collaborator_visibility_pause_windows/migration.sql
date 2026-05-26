ALTER TABLE "ProjectCollaborator"
ADD COLUMN IF NOT EXISTS "chatVisibilityPaused" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ProjectCollaboratorVisibilityPause" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCollaboratorVisibilityPause_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "ProjectCollaboratorVisibilityPause"
    ADD CONSTRAINT "ProjectCollaboratorVisibilityPause_projectId_userId_fkey"
    FOREIGN KEY ("projectId", "userId")
    REFERENCES "ProjectCollaborator"("projectId", "userId")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "ProjectCollaboratorVisibilityPause"
    ADD CONSTRAINT "ProjectCollaboratorVisibilityPause_createdById_fkey"
    FOREIGN KEY ("createdById")
    REFERENCES "User"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectCollaboratorVisibilityPause_projectId_userId_pausedAt_idx"
ON "ProjectCollaboratorVisibilityPause"("projectId", "userId", "pausedAt");

CREATE INDEX IF NOT EXISTS "ProjectCollaboratorVisibilityPause_projectId_pausedAt_resumedAt_idx"
ON "ProjectCollaboratorVisibilityPause"("projectId", "pausedAt", "resumedAt");

CREATE INDEX IF NOT EXISTS "ProjectCollaboratorVisibilityPause_createdById_idx"
ON "ProjectCollaboratorVisibilityPause"("createdById");

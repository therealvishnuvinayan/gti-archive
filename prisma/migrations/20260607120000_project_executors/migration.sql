-- CreateEnum
CREATE TYPE "ProjectExecutorRole" AS ENUM ('MAIN_EXECUTOR', 'EXECUTOR');

-- CreateTable
CREATE TABLE "ProjectExecutor" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectExecutorRole" NOT NULL DEFAULT 'EXECUTOR',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExecutor_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "ProjectExecutor_userId_idx" ON "ProjectExecutor"("userId");

-- CreateIndex
CREATE INDEX "ProjectExecutor_addedById_idx" ON "ProjectExecutor"("addedById");

-- CreateIndex
CREATE INDEX "ProjectExecutor_role_idx" ON "ProjectExecutor"("role");

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExecutor" ADD CONSTRAINT "ProjectExecutor_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy single executors as Main Executors.
INSERT INTO "ProjectExecutor" ("projectId", "userId", "role", "createdAt", "updatedAt")
SELECT "id", "executorUserId", 'MAIN_EXECUTOR'::"ProjectExecutorRole", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project"
WHERE "executorUserId" IS NOT NULL
ON CONFLICT ("projectId", "userId") DO NOTHING;

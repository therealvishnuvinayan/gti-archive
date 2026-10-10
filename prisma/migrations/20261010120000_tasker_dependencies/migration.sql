-- CreateEnum
CREATE TYPE "TaskerPauseStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TaskerDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "mainType" TEXT NOT NULL,
    "mainId" TEXT NOT NULL,
    "requiredType" TEXT NOT NULL,
    "requiredId" TEXT NOT NULL,
    "pauseStatus" "TaskerPauseStatus" NOT NULL DEFAULT 'NONE',
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskerDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerDependencyEvent" (
    "id" TEXT NOT NULL,
    "dependencyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerDependencyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskerDependency_projectId_resolvedAt_idx" ON "TaskerDependency"("projectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "TaskerDependency_flexibleProjectId_resolvedAt_idx" ON "TaskerDependency"("flexibleProjectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "TaskerDependency_mainType_mainId_resolvedAt_pauseStatus_idx" ON "TaskerDependency"("mainType", "mainId", "resolvedAt", "pauseStatus");

-- CreateIndex
CREATE INDEX "TaskerDependency_requiredType_requiredId_resolvedAt_idx" ON "TaskerDependency"("requiredType", "requiredId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerDependency_mainType_mainId_requiredType_requiredId_key" ON "TaskerDependency"("mainType", "mainId", "requiredType", "requiredId");

-- CreateIndex
CREATE INDEX "TaskerDependencyEvent_dependencyId_createdAt_idx" ON "TaskerDependencyEvent"("dependencyId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskerDependency" ADD CONSTRAINT "TaskerDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDependency" ADD CONSTRAINT "TaskerDependency_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDependencyEvent" ADD CONSTRAINT "TaskerDependencyEvent_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "TaskerDependency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDependencyEvent" ADD CONSTRAINT "TaskerDependencyEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "TaskerDependency"
  ADD CONSTRAINT "TaskerDependency_one_project" CHECK (num_nonnulls("projectId", "flexibleProjectId") = 1),
  ADD CONSTRAINT "TaskerDependency_valid_sources" CHECK ("mainType" IN ('TASK', 'CONCEPT') AND "requiredType" IN ('TASK', 'CONCEPT') AND ("flexibleProjectId" IS NULL OR ("mainType" = 'TASK' AND "requiredType" = 'TASK'))),
  ADD CONSTRAINT "TaskerDependency_not_self" CHECK ("mainType" <> "requiredType" OR "mainId" <> "requiredId"),
  ADD CONSTRAINT "TaskerDependency_resolution" CHECK (("resolvedAt" IS NULL) = ("outcome" IS NULL)),
  ADD CONSTRAINT "TaskerDependency_valid_outcome" CHECK ("outcome" IS NULL OR "outcome" IN ('COMPLETED', 'REJECTED', 'CANCELLED', 'DELETED', 'MAIN_ENDED'));

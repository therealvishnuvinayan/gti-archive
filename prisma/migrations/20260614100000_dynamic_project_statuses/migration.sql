CREATE TYPE "ProjectStatusGroup" AS ENUM (
  'ACTIVE',
  'PENDING',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED'
);

CREATE TYPE "StageStatus" AS ENUM (
  'PENDING',
  'ONGOING',
  'ON_HOLD',
  'COMPLETED'
);

CREATE TABLE "ProjectStatusOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "group" "ProjectStatusGroup" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectStatusOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectStatusOption_slug_key" ON "ProjectStatusOption"("slug");
CREATE INDEX "ProjectStatusOption_slug_idx" ON "ProjectStatusOption"("slug");
CREATE INDEX "ProjectStatusOption_group_isActive_sortOrder_idx" ON "ProjectStatusOption"("group", "isActive", "sortOrder");

INSERT INTO "ProjectStatusOption" ("id", "name", "slug", "color", "group", "sortOrder", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('project_status_pending', 'Pending', 'pending', '#8b8f99', 'PENDING', 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_briefing', 'Briefing', 'briefing', '#4f7cff', 'PENDING', 20, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_in_progress', 'In Progress', 'in-progress', '#34a853', 'ACTIVE', 30, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_under_review', 'Under Review', 'under-review', '#8b5cf6', 'ACTIVE', 40, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_revision_required', 'Revision Required', 'revision-required', '#f59e0b', 'ACTIVE', 50, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_approved', 'Approved', 'approved', '#0f9ba8', 'ACTIVE', 60, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_on_hold', 'On Hold', 'on-hold', '#64748b', 'ON_HOLD', 70, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_completed', 'Completed', 'completed', '#2563eb', 'COMPLETED', 80, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_archived', 'Archived', 'archived', '#475569', 'ARCHIVED', 90, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('project_status_cancelled', 'Cancelled', 'cancelled', '#ef4444', 'CANCELLED', 100, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Project" ADD COLUMN "statusId" TEXT;

UPDATE "Project"
SET "statusId" = CASE "status"::text
  WHEN 'PENDING' THEN 'project_status_pending'
  WHEN 'BRIEFING' THEN 'project_status_briefing'
  WHEN 'ONGOING' THEN 'project_status_in_progress'
  WHEN 'UNDER_REVIEW' THEN 'project_status_under_review'
  WHEN 'REVISION_REQUIRED' THEN 'project_status_revision_required'
  WHEN 'APPROVED' THEN 'project_status_approved'
  WHEN 'ON_HOLD' THEN 'project_status_on_hold'
  WHEN 'COMPLETED' THEN 'project_status_completed'
  WHEN 'ARCHIVED' THEN 'project_status_archived'
  WHEN 'CANCELLED' THEN 'project_status_cancelled'
  ELSE 'project_status_in_progress'
END;

ALTER TABLE "ProjectStage" ADD COLUMN "stageStatus" "StageStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "ProjectStage"
SET "stageStatus" = CASE "status"::text
  WHEN 'PENDING' THEN 'PENDING'::"StageStatus"
  WHEN 'ON_HOLD' THEN 'ON_HOLD'::"StageStatus"
  WHEN 'COMPLETED' THEN 'COMPLETED'::"StageStatus"
  WHEN 'ARCHIVED' THEN 'COMPLETED'::"StageStatus"
  WHEN 'CANCELLED' THEN 'ON_HOLD'::"StageStatus"
  ELSE 'ONGOING'::"StageStatus"
END;

DROP INDEX IF EXISTS "Project_status_idx";

ALTER TABLE "ProjectStage" DROP COLUMN "status";
ALTER TABLE "ProjectStage" RENAME COLUMN "stageStatus" TO "status";
ALTER TABLE "Project" DROP COLUMN "status";

ALTER TABLE "Project"
ADD CONSTRAINT "Project_statusId_fkey"
FOREIGN KEY ("statusId") REFERENCES "ProjectStatusOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_statusId_idx" ON "Project"("statusId");

DROP TYPE "ProjectStatus";

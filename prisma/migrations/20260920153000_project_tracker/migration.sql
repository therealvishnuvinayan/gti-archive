CREATE TYPE "ProjectTrackerColumnType" AS ENUM (
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'DATETIME',
  'DROPDOWN',
  'MULTI_SELECT',
  'BOOLEAN',
  'CHECKBOX',
  'PERSON',
  'CLIENT',
  'VENDOR',
  'PROJECT',
  'BRAND',
  'URL',
  'FILE',
  'STATUS',
  'PRIORITY',
  'PERCENTAGE',
  'TAGS',
  'NOTES'
);

CREATE TABLE "ProjectTracker" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Marketing Project Tracker',
  "settings" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTracker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTrackerColumn" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ProjectTrackerColumnType" NOT NULL DEFAULT 'TEXT',
  "sourceFieldKey" TEXT,
  "options" JSONB,
  "sortOrder" INTEGER NOT NULL,
  "width" INTEGER NOT NULL DEFAULT 180,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "frozen" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTrackerColumn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTrackerRow" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "structuredProjectId" TEXT,
  "flexibleProjectId" TEXT,
  "linkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTrackerRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTrackerCell" (
  "id" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "value" JSONB,
  "isLocalOverride" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncedValue" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectTrackerCell_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTrackerActivity" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "rowId" TEXT,
  "columnId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTrackerActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTracker_createdAt_idx" ON "ProjectTracker"("createdAt");
CREATE INDEX "ProjectTracker_createdById_idx" ON "ProjectTracker"("createdById");
CREATE INDEX "ProjectTrackerColumn_trackerId_sortOrder_idx" ON "ProjectTrackerColumn"("trackerId", "sortOrder");
CREATE INDEX "ProjectTrackerColumn_sourceFieldKey_idx" ON "ProjectTrackerColumn"("sourceFieldKey");
CREATE INDEX "ProjectTrackerRow_trackerId_sortOrder_idx" ON "ProjectTrackerRow"("trackerId", "sortOrder");
CREATE INDEX "ProjectTrackerRow_structuredProjectId_idx" ON "ProjectTrackerRow"("structuredProjectId");
CREATE INDEX "ProjectTrackerRow_flexibleProjectId_idx" ON "ProjectTrackerRow"("flexibleProjectId");
CREATE UNIQUE INDEX "ProjectTrackerCell_rowId_columnId_key" ON "ProjectTrackerCell"("rowId", "columnId");
CREATE INDEX "ProjectTrackerCell_columnId_idx" ON "ProjectTrackerCell"("columnId");
CREATE INDEX "ProjectTrackerActivity_trackerId_createdAt_idx" ON "ProjectTrackerActivity"("trackerId", "createdAt");
CREATE INDEX "ProjectTrackerActivity_rowId_idx" ON "ProjectTrackerActivity"("rowId");
CREATE INDEX "ProjectTrackerActivity_columnId_idx" ON "ProjectTrackerActivity"("columnId");
CREATE INDEX "ProjectTrackerActivity_actorId_idx" ON "ProjectTrackerActivity"("actorId");

ALTER TABLE "ProjectTracker" ADD CONSTRAINT "ProjectTracker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerColumn" ADD CONSTRAINT "ProjectTrackerColumn_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "ProjectTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerRow" ADD CONSTRAINT "ProjectTrackerRow_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "ProjectTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerRow" ADD CONSTRAINT "ProjectTrackerRow_structuredProjectId_fkey" FOREIGN KEY ("structuredProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerRow" ADD CONSTRAINT "ProjectTrackerRow_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerCell" ADD CONSTRAINT "ProjectTrackerCell_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "ProjectTrackerRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerCell" ADD CONSTRAINT "ProjectTrackerCell_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ProjectTrackerColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerActivity" ADD CONSTRAINT "ProjectTrackerActivity_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "ProjectTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerActivity" ADD CONSTRAINT "ProjectTrackerActivity_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "ProjectTrackerRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerActivity" ADD CONSTRAINT "ProjectTrackerActivity_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ProjectTrackerColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTrackerActivity" ADD CONSTRAINT "ProjectTrackerActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

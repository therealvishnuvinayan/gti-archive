-- Persisted recurring reminders shared by Stage 5 checklist requests and
-- Stage 7 physical-sample rounds. Existing requests receive no row and remain
-- opted out.
CREATE TYPE "RequestReminderDeliveryStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "RequestReminder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageFiveRequestId" TEXT,
    "stageSevenSampleRoundId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalHours" INTEGER NOT NULL,
    "nextReminderAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "processingToken" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "configuredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RequestReminder_exactly_one_target_check" CHECK (
      (("stageFiveRequestId" IS NOT NULL)::integer +
       ("stageSevenSampleRoundId" IS NOT NULL)::integer) = 1
    ),
    CONSTRAINT "RequestReminder_interval_hours_check" CHECK ("intervalHours" IN (24, 48, 72)),
    CONSTRAINT "RequestReminder_enabled_schedule_check" CHECK (NOT "enabled" OR "nextReminderAt" IS NOT NULL)
);

CREATE TABLE "RequestReminderDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "RequestReminderDeliveryStatus" NOT NULL DEFAULT 'PROCESSING',
    "recipientUserId" TEXT,
    "recipientEmail" TEXT,
    "channelSummary" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestReminderDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RequestReminder_stageFiveRequestId_key" ON "RequestReminder"("stageFiveRequestId");
CREATE UNIQUE INDEX "RequestReminder_stageSevenSampleRoundId_key" ON "RequestReminder"("stageSevenSampleRoundId");
CREATE UNIQUE INDEX "RequestReminder_processingToken_key" ON "RequestReminder"("processingToken");
CREATE INDEX "RequestReminder_enabled_nextReminderAt_idx" ON "RequestReminder"("enabled", "nextReminderAt");
CREATE INDEX "RequestReminder_projectId_enabled_idx" ON "RequestReminder"("projectId", "enabled");
CREATE INDEX "RequestReminder_processingStartedAt_idx" ON "RequestReminder"("processingStartedAt");
CREATE INDEX "RequestReminder_configuredById_idx" ON "RequestReminder"("configuredById");
CREATE UNIQUE INDEX "RequestReminderDeliveryAttempt_reminderId_scheduledFor_key" ON "RequestReminderDeliveryAttempt"("reminderId", "scheduledFor");
CREATE INDEX "RequestReminderDeliveryAttempt_status_startedAt_idx" ON "RequestReminderDeliveryAttempt"("status", "startedAt");

ALTER TABLE "RequestReminder" ADD CONSTRAINT "RequestReminder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestReminder" ADD CONSTRAINT "RequestReminder_stageFiveRequestId_fkey" FOREIGN KEY ("stageFiveRequestId") REFERENCES "ProjectFileChecklistRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestReminder" ADD CONSTRAINT "RequestReminder_stageSevenSampleRoundId_fkey" FOREIGN KEY ("stageSevenSampleRoundId") REFERENCES "ProductionSampleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestReminder" ADD CONSTRAINT "RequestReminder_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestReminderDeliveryAttempt" ADD CONSTRAINT "RequestReminderDeliveryAttempt_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "RequestReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

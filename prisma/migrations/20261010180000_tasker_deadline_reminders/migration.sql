-- Reminders are opt-in. Existing tasks and delivery records remain unchanged.
ALTER TABLE "TaskerTask"
  ADD COLUMN "reminderIntervalHours" INTEGER,
  ADD COLUMN "reminderNextAt" TIMESTAMP(3),
  ADD COLUMN "reminderLastAt" TIMESTAMP(3),
  ADD COLUMN "reminderGeneration" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_reminder_interval_check"
  CHECK ("reminderIntervalHours" IS NULL OR ("reminderIntervalHours" IN (24, 48, 72) AND "dueAt" IS NOT NULL));
CREATE INDEX "TaskerTask_reminderNextAt_id_idx" ON "TaskerTask"("reminderNextAt", "id");

ALTER TABLE "TaskerDelivery"
  ADD COLUMN "reminderGeneration" INTEGER,
  ADD COLUMN "reminderExpiresAt" TIMESTAMP(3);

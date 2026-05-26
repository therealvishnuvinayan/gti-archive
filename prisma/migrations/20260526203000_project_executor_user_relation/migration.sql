ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "executorUserId" TEXT;

DO $$
BEGIN
    ALTER TABLE "Project"
    ADD CONSTRAINT "Project_executorUserId_fkey"
    FOREIGN KEY ("executorUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Project_executorUserId_idx"
ON "Project"("executorUserId");

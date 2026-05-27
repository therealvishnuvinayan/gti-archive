DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ProjectPriority'
  ) THEN
    CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
  END IF;
END $$;

ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "priority" "ProjectPriority";

ALTER TABLE "Project"
ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';

UPDATE "Project"
SET "priority" = 'MEDIUM'
WHERE "priority" IS NULL;

ALTER TABLE "Project"
ALTER COLUMN "priority" SET NOT NULL;

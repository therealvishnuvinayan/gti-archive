CREATE TYPE "ProjectExecutionType" AS ENUM ('INTERNAL', 'EXTERNAL');

ALTER TABLE "Project"
  ADD COLUMN "executionType" "ProjectExecutionType" NOT NULL DEFAULT 'EXTERNAL';

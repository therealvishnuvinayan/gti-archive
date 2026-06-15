-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_executorUserId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Project_executorUserId_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN IF EXISTS "executorName",
DROP COLUMN IF EXISTS "executorUserId";

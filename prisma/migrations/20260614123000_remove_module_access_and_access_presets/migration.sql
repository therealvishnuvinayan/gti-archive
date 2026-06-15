-- DropForeignKey
ALTER TABLE IF EXISTS "AccessPresetPermission" DROP CONSTRAINT IF EXISTS "AccessPresetPermission_permissionKey_fkey";

-- DropIndex
DROP INDEX IF EXISTS "AccessPresetPermission_accessPreset_idx";
DROP INDEX IF EXISTS "AccessPresetPermission_permissionKey_idx";
DROP INDEX IF EXISTS "AccessPresetPermission_accessPreset_permissionKey_key";

-- DropTable
DROP TABLE IF EXISTS "AccessPresetPermission";

-- AlterTable
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "projectAccess",
  DROP COLUMN IF EXISTS "calendarAccess",
  DROP COLUMN IF EXISTS "libraryAccess",
  DROP COLUMN IF EXISTS "archiveAccess";

-- AlterTable
ALTER TABLE "CalendarCollaborator"
  DROP COLUMN IF EXISTS "access";

-- DropEnum
DROP TYPE IF EXISTS "CollaboratorAccess";

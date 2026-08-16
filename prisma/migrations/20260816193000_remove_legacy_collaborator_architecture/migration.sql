-- Refuse to remove the legacy architecture if development business data has
-- reappeared since the approved reset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "role"::text = 'COLLABORATOR'
  ) THEN
    RAISE EXCEPTION 'Migration blocked: User rows still use role COLLABORATOR.';
  END IF;

  IF EXISTS (SELECT 1 FROM "Project") THEN
    RAISE EXCEPTION 'Migration blocked: Project rows exist.';
  END IF;

  IF EXISTS (SELECT 1 FROM "ProjectCollaborator") THEN
    RAISE EXCEPTION 'Migration blocked: ProjectCollaborator rows exist.';
  END IF;
END
$$;

-- Preserve the existing configurable internal-user role profile under USER.
DELETE FROM "RolePermission" AS legacy
USING "RolePermission" AS current_user_profile
WHERE legacy."role"::text = 'COLLABORATOR'
  AND current_user_profile."role"::text = 'USER'
  AND current_user_profile."permissionKey" = legacy."permissionKey";

UPDATE "RolePermission"
SET "role" = 'USER'
WHERE "role"::text = 'COLLABORATOR';

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

DROP TABLE "CollaboratorTypePermission";
DELETE FROM "RolePermission" WHERE "permissionKey" = 'collaborator.changeType';
DELETE FROM "PermissionDefinition" WHERE "key" = 'collaborator.changeType';
ALTER TABLE "User" DROP COLUMN "collaboratorType";
ALTER TABLE "ProjectCollaborator" DROP COLUMN "participantType";

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole"),
  ALTER COLUMN "role" SET DEFAULT 'USER';

ALTER TABLE "RolePermission"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::text::"UserRole");

DROP TYPE "UserRole_old";
DROP TYPE "ProjectCollaboratorParticipantType";
DROP TYPE "CollaboratorType";

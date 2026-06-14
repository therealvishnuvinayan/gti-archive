-- Remove unused catalog-only permission keys and dependent profile rows.
DELETE FROM "RolePermission"
WHERE "permissionKey" IN ('archive.delete', 'notification.manageSettings');

DELETE FROM "CollaboratorTypePermission"
WHERE "permissionKey" IN ('archive.delete', 'notification.manageSettings');

DELETE FROM "PermissionDefinition"
WHERE "key" IN ('archive.delete', 'notification.manageSettings');

-- Remap old generic collaborator types before removing enum values.
UPDATE "User"
SET "collaboratorType" = 'GTI_INTERNAL_CLIENT'
WHERE "collaboratorType"::text = 'INTERNAL';

UPDATE "User"
SET "collaboratorType" = 'EXTERNAL_FREELANCER'
WHERE "collaboratorType"::text = 'EXTERNAL';

-- Legacy collaborator-type permission rows are no longer valid after enum cleanup.
DELETE FROM "CollaboratorTypePermission"
WHERE "collaboratorType"::text IN ('INTERNAL', 'EXTERNAL');

ALTER TYPE "CollaboratorType" RENAME TO "CollaboratorType_old";

CREATE TYPE "CollaboratorType" AS ENUM (
  'GTI_INTERNAL_CLIENT',
  'GTI_SISTER_COMPANY_INTERNAL_CLIENT',
  'EXTERNAL_FREELANCER',
  'EXTERNAL_AGENCY',
  'EXTERNAL_VENDOR',
  'CLIENT_OF_GTI'
);

ALTER TABLE "User"
  ALTER COLUMN "collaboratorType" DROP DEFAULT,
  ALTER COLUMN "collaboratorType" TYPE "CollaboratorType"
  USING ("collaboratorType"::text::"CollaboratorType"),
  ALTER COLUMN "collaboratorType" SET DEFAULT 'GTI_INTERNAL_CLIENT';

ALTER TABLE "CollaboratorTypePermission"
  ALTER COLUMN "collaboratorType" TYPE "CollaboratorType"
  USING ("collaboratorType"::text::"CollaboratorType");

DROP TYPE "CollaboratorType_old";

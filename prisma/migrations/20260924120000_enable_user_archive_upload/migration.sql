-- Regular users with Full Archive Scope may upload manual archive files.
UPDATE "RolePermission"
SET "enabled" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'USER'
  AND "permissionKey" = 'archive.uploadFile';

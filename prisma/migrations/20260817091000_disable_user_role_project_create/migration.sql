UPDATE "RolePermission"
SET "enabled" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'USER'
  AND "permissionKey" = 'project.create';

-- Regular users must start without project-creation access. Administrators can
-- grant the per-user exception again from Users & Permissions when required.
UPDATE "User"
SET "projectCreationAccessGranted" = false
WHERE "role" = 'USER'
  AND "projectCreationAccessGranted" = true;

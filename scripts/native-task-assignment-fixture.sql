-- Historical fixtures for the original assignment-attribution migration.
    INSERT INTO "User" (id, email, name, "passwordHash", role, "updatedAt") VALUES
      ('legacy-task-admin', 'legacy-task-admin@example.test', 'Legacy Admin', 'x', 'ADMIN', NOW()),
      ('legacy-task-user', 'legacy-task-user@example.test', 'Legacy User', 'x', 'USER', NOW());
    INSERT INTO "Project" (id, name, "createdById", "ownerId", "updatedAt") VALUES ('legacy-task-project', 'Legacy tasks', 'legacy-task-admin', 'legacy-task-admin', NOW());
    INSERT INTO "ProjectExecutor" ("projectId", "userId", "updatedAt") VALUES ('legacy-task-project', 'legacy-task-user', NOW());
    INSERT INTO "ProjectStage" (id, "projectId", name, "order", "isTasker", "updatedAt") VALUES
      ('legacy-assigned-stage', 'legacy-task-project', 'Assigned', 301, true, NOW()),
      ('legacy-unassigned-stage', 'legacy-task-project', 'Unassigned', 302, true, NOW()),
      ('legacy-unknown-stage', 'legacy-task-project', 'Unknown creator', 303, true, NOW());
    INSERT INTO "ProjectConceptFolder" (id, "projectId", "taskerStageId", "assignedExecutorId", name, "normalizedName", "createdById", "updatedAt") VALUES
      ('legacy-assigned-task', 'legacy-task-project', 'legacy-assigned-stage', 'legacy-task-user', 'Assigned', 'assigned', 'legacy-task-admin', NOW()),
      ('legacy-unassigned-task', 'legacy-task-project', 'legacy-unassigned-stage', NULL, 'Unassigned', 'unassigned', 'legacy-task-admin', NOW()),
      ('legacy-unknown-creator-task', 'legacy-task-project', 'legacy-unknown-stage', 'legacy-task-user', 'Unknown creator', 'unknown creator', NULL, NOW());

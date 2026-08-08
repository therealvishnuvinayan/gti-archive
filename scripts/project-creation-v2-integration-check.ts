import { PrismaClient, UserRole } from "@prisma/client";

import { createProjectV2 } from "../src/lib/project-creation";
import { hasProjectPermission } from "../src/lib/permissions/resolver";
import { prisma as servicePrisma } from "../src/lib/prisma";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValidationError(
  result: Awaited<ReturnType<typeof createProjectV2>>,
  field: "ownerId" | "coOwnerIds" | "executorIds" | "collaboratorIds",
) {
  assert("error" in result, `Expected ${field} validation to fail.`);
  assert(result.fieldErrors?.[field], `Expected a ${field} field error.`);
}

async function main() {
  await prisma.user.createMany({
    data: [
      {
        id: "creator-sa",
        email: "creator-sa@example.test",
        passwordHash: "x",
        role: UserRole.SUPER_ADMIN,
      },
      {
        id: "owner-admin",
        email: "owner-admin@example.test",
        passwordHash: "x",
        role: UserRole.ADMIN,
      },
      {
        id: "co-owner",
        email: "co-owner@example.test",
        passwordHash: "x",
        role: UserRole.COLLABORATOR,
        collaboratorType: "GTI_INTERNAL_CLIENT",
      },
      {
        id: "executor-a",
        email: "executor-a@example.test",
        passwordHash: "x",
        role: UserRole.COLLABORATOR,
        collaboratorType: "EXTERNAL_AGENCY",
      },
      {
        id: "executor-b",
        email: "executor-b@example.test",
        passwordHash: "x",
        role: UserRole.COLLABORATOR,
        collaboratorType: "GTI_INTERNAL_CLIENT",
      },
      {
        id: "collaborator-a",
        email: "collaborator-a@example.test",
        passwordHash: "x",
        role: UserRole.COLLABORATOR,
        collaboratorType: "EXTERNAL_VENDOR",
      },
      {
        id: "collaborator-b",
        email: "collaborator-b@example.test",
        passwordHash: "x",
        role: UserRole.COLLABORATOR,
        collaboratorType: "GTI_INTERNAL_CLIENT",
      },
      {
        id: "other-sa",
        email: "other-sa@example.test",
        passwordHash: "x",
        role: UserRole.SUPER_ADMIN,
      },
    ],
  });

  const success = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "V2 collaborator integration success",
      ownerId: "owner-admin",
      coOwnerIds: ["co-owner"],
      executorIds: ["executor-a", "executor-b"],
      collaboratorIds: ["collaborator-a", "collaborator-b", "collaborator-a"],
    },
  );
  assert("projectId" in success, "Valid V2 creation must succeed.");

  const created = await prisma.project.findUnique({
    where: { id: success.projectId },
    include: {
      coOwners: true,
      executors: true,
      collaborators: true,
      workflowStages: true,
      stages: true,
      researchWorkspaces: { include: { folders: true } },
    },
  });
  assert(created, "Created project must be persisted.");
  assert(
    created.createdById === "creator-sa",
    "Creator audit identity must remain separate.",
  );
  assert(created.ownerId === "owner-admin", "Operational owner must be persisted.");
  assert(
    !created.coOwners.some((item) => item.userId === "creator-sa"),
    "SUPER_ADMIN creator must not be a co-owner.",
  );
  assert(created.executors.length === 2, "Every executor assignment must persist.");
  assert(
    created.collaborators.length === 4,
    "Executors and additional collaborators must share one membership table.",
  );
  assert(
    new Set(created.collaborators.map((item) => item.userId)).size === 4,
    "Duplicate collaborator IDs must be normalized to one membership row.",
  );
  assert(
    !created.collaborators.some(
      (item) => item.userId === "owner-admin" || item.userId === "co-owner",
    ),
    "Owner and co-owner access must not require duplicate collaborator membership.",
  );
  assert(
    created.collaborators.find((item) => item.userId === "executor-a")
      ?.participantType === "EXTERNAL_AGENCY",
    "Executor participant type must match the selected user.",
  );

  const externalCollaborator = created.collaborators.find(
    (item) => item.userId === "collaborator-a",
  );
  const internalCollaborator = created.collaborators.find(
    (item) => item.userId === "collaborator-b",
  );
  assert(externalCollaborator, "External collaborator membership must exist.");
  assert(internalCollaborator, "Internal collaborator membership must exist.");
  assert(
    !externalCollaborator.canInteract &&
      !externalCollaborator.canAddCaptions &&
      !externalCollaborator.canDownloadFiles &&
      !externalCollaborator.canViewBudget &&
      !externalCollaborator.canViewVendorInfo &&
      !externalCollaborator.canAccessProjectArchives,
    "External collaborators must receive existing default permission grants only.",
  );
  assert(
    internalCollaborator.canInteract &&
      !internalCollaborator.canViewBudget &&
      !internalCollaborator.canViewVendorInfo,
    "Internal collaborators must receive the existing internal defaults.",
  );
  assert(
    !hasProjectPermission(
      {
        id: "collaborator-a",
        role: UserRole.COLLABORATOR,
        collaboratorType: "EXTERNAL_VENDOR",
      },
      created,
      "project.manageCollaborators",
    ),
    "Additional collaborator membership must not grant owner-level permissions.",
  );

  assert(created.stages.length === 0, "V2 creation must not create dynamic stages.");
  assert(
    created.workflowStages.length === 7,
    "V2 creation must create exactly seven fixed workflow rows.",
  );
  assert(
    created.workflowStages.find((stage) => stage.stageKey === "PROJECT_INQUIRY")
      ?.status === "AVAILABLE",
    "Stage 1 must start AVAILABLE.",
  );
  assert(
    created.workflowStages
      .filter((stage) => stage.stageKey !== "PROJECT_INQUIRY")
      .every((stage) => stage.status === "LOCKED"),
    "Stages 2-7 must start LOCKED.",
  );
  assert(
    created.researchWorkspaces.length === 6,
    "Every distinct owner, co-owner, executor, and collaborator needs one Stage 2 workspace.",
  );
  assert(
    created.researchWorkspaces.every(
      (workspace) =>
        workspace.folders.length === 7 &&
        new Set(workspace.folders.map((folder) => folder.systemKey)).size === 7,
    ),
    "Every Stage 2 workspace needs exactly seven unique predefined folders.",
  );
  assert(
    created.category === null &&
      created.description === null &&
      created.executionType === null &&
      created.budgetRequired === null &&
      created.currency === null &&
      created.priority === null &&
      created.startDate === null &&
      created.endDate === null &&
      created.stageCount === null,
    "V2 creation must not persist fabricated legacy defaults.",
  );

  const notifications = await prisma.notification.findMany({
    where: { projectId: created.id },
  });
  assert(
    notifications.length === 6,
    "Owner, co-owner, executors, and additional collaborators must each be notified once.",
  );
  assert(
    notifications.filter((item) => item.type === "COLLABORATOR_ADDED").length ===
      2,
    "Additional collaborators must receive COLLABORATOR_ADDED notifications.",
  );

  const overlap = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "V2 executor collaborator overlap",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-a"],
      collaboratorIds: ["executor-a", "collaborator-a"],
    },
  );
  assert("projectId" in overlap, "Executor/collaborator overlap must be accepted.");
  assert(
    (await prisma.projectCollaborator.count({
      where: { projectId: overlap.projectId },
    })) === 2,
    "Executor overlap must create one unified membership row per user.",
  );
  assert(
    (await prisma.notification.count({
      where: {
        projectId: overlap.projectId,
        userId: "executor-a",
      },
    })) === 1,
    "An executor/collaborator overlap must receive only one assignment notification.",
  );
  assert(
    (await prisma.notification.count({
      where: {
        projectId: overlap.projectId,
        userId: "executor-a",
        type: "COLLABORATOR_ADDED",
      },
    })) === 0,
    "Executor precedence must suppress a duplicate collaborator notification.",
  );

  const zeroCollaborators = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "V2 zero collaborators",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-b"],
      collaboratorIds: [],
    },
  );
  assert("projectId" in zeroCollaborators, "Zero additional collaborators must work.");
  assert(
    (await prisma.projectCollaborator.count({
      where: { projectId: zeroCollaborators.projectId },
    })) === 1,
    "Zero additional collaborators must retain the executor membership behavior.",
  );

  const legacyFourFieldInput = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "V2 omitted collaborators",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-a"],
    },
  );
  assert(
    "projectId" in legacyFourFieldInput,
    "Omitting the optional collaboratorIds field must preserve existing behavior.",
  );

  const projectCountBeforeValidation = await prisma.project.count();

  const duplicateExecutors = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "Duplicate executors",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-a", "executor-a"],
    },
  );
  assertValidationError(duplicateExecutors, "executorIds");

  const invalidUsers = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "Invalid users",
      ownerId: "missing-owner",
      coOwnerIds: [],
      executorIds: ["missing-executor"],
      collaboratorIds: ["missing-collaborator"],
    },
  );
  assert("error" in invalidUsers, "Invalid user IDs must fail.");
  assert(
    invalidUsers.fieldErrors?.ownerId &&
      invalidUsers.fieldErrors?.executorIds &&
      invalidUsers.fieldErrors?.collaboratorIds,
    "Invalid owner, executor, and collaborator IDs must be identified.",
  );

  const ineligibleCollaborator = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "Ineligible collaborator role",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-a"],
      collaboratorIds: ["other-sa"],
    },
  );
  assertValidationError(ineligibleCollaborator, "collaboratorIds");

  const malformedCollaborator = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "Malformed collaborator ID",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: ["executor-a"],
      collaboratorIds: [42] as unknown as string[],
    },
  );
  assertValidationError(malformedCollaborator, "collaboratorIds");

  const ownerAsCoOwner = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "Owner overlap",
      ownerId: "owner-admin",
      coOwnerIds: ["owner-admin"],
      executorIds: ["executor-a"],
    },
  );
  assertValidationError(ownerAsCoOwner, "coOwnerIds");

  const noExecutors = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "No executors",
      ownerId: "owner-admin",
      coOwnerIds: [],
      executorIds: [],
    },
  );
  assertValidationError(noExecutors, "executorIds");

  const superAdminOwner = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "SA owner",
      ownerId: "other-sa",
      coOwnerIds: [],
      executorIds: ["executor-a"],
    },
  );
  assertValidationError(superAdminOwner, "ownerId");

  const superAdminCoOwner = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "SA co-owner",
      ownerId: "owner-admin",
      coOwnerIds: ["other-sa"],
      executorIds: ["executor-a"],
    },
  );
  assertValidationError(superAdminCoOwner, "coOwnerIds");

  assert(
    (await prisma.project.count()) === projectCountBeforeValidation,
    "Validation failures must not create partial projects.",
  );

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_v2_notification_insert() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced notification failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_v2_notification_insert
    BEFORE INSERT ON "Notification"
    FOR EACH ROW EXECUTE FUNCTION fail_v2_notification_insert()
  `);

  let rollbackFailed = false;
  try {
    await createProjectV2(
      { id: "creator-sa" },
      {
        name: "Must roll back",
        ownerId: "owner-admin",
        coOwnerIds: ["co-owner"],
        executorIds: ["executor-a"],
        collaboratorIds: ["collaborator-a"],
      },
    );
  } catch {
    rollbackFailed = true;
  }
  assert(rollbackFailed, "Forced notification failure must reach the transaction boundary.");
  assert(
    (await prisma.project.count({ where: { name: "Must roll back" } })) === 0,
    "A late transaction failure must roll back project, memberships, workflow, workspaces, and notifications.",
  );

  await prisma.$executeRawUnsafe(
    `DROP TRIGGER fail_v2_notification_insert ON "Notification"`,
  );
  await prisma.$executeRawUnsafe(`DROP FUNCTION fail_v2_notification_insert()`);

  console.log("Project creation V2 collaborator integration checks passed.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await servicePrisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

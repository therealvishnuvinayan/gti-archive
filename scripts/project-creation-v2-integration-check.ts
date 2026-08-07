import { PrismaClient, UserRole } from "@prisma/client";

import { createProjectV2 } from "../src/lib/project-creation";
import { prisma as servicePrisma } from "../src/lib/prisma";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValidationError(
  result: Awaited<ReturnType<typeof createProjectV2>>,
  field: "ownerId" | "coOwnerIds" | "executorIds",
) {
  assert("error" in result, `Expected ${field} validation to fail.`);
  assert(result.fieldErrors?.[field], `Expected a ${field} field error.`);
}

async function main() {
  await prisma.user.createMany({
    data: [
      { id: "creator-sa", email: "creator-sa@example.test", passwordHash: "x", role: UserRole.SUPER_ADMIN },
      { id: "owner-admin", email: "owner-admin@example.test", passwordHash: "x", role: UserRole.ADMIN },
      { id: "co-owner", email: "co-owner@example.test", passwordHash: "x", role: UserRole.COLLABORATOR },
      { id: "executor-a", email: "executor-a@example.test", passwordHash: "x", role: UserRole.COLLABORATOR, collaboratorType: "EXTERNAL_AGENCY" },
      { id: "executor-b", email: "executor-b@example.test", passwordHash: "x", role: UserRole.COLLABORATOR },
      { id: "other-sa", email: "other-sa@example.test", passwordHash: "x", role: UserRole.SUPER_ADMIN },
    ],
  });

  const success = await createProjectV2(
    { id: "creator-sa" },
    {
      name: "V2 integration success",
      ownerId: "owner-admin",
      coOwnerIds: ["co-owner"],
      executorIds: ["executor-a", "executor-b"],
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
    },
  });
  assert(created, "Created project must be persisted.");
  assert(created.createdById === "creator-sa", "Creator audit identity must remain separate.");
  assert(created.ownerId === "owner-admin", "Operational owner must be persisted.");
  assert(!created.coOwners.some((item) => item.userId === "creator-sa"), "SUPER_ADMIN creator must not be a co-owner.");
  assert(created.executors.length === 2, "Every executor assignment must be persisted.");
  assert(created.collaborators.length === 2, "Executors must receive collaborator records.");
  assert(
    created.collaborators.find((item) => item.userId === "executor-a")?.participantType ===
      "EXTERNAL_AGENCY",
    "Executor participant type must match the selected user exactly.",
  );
  assert(created.stages.length === 0, "V2 creation must not create dynamic stages.");
  assert(created.workflowStages.length === 7, "V2 creation must create exactly seven fixed workflow rows.");
  assert(
    created.workflowStages.find((stage) => stage.stageKey === "PROJECT_INQUIRY")?.status ===
      "AVAILABLE",
    "Stage 1 must start AVAILABLE.",
  );
  assert(
    created.workflowStages.filter((stage) => stage.stageKey !== "PROJECT_INQUIRY")
      .every((stage) => stage.status === "LOCKED"),
    "Stages 2-7 must start LOCKED.",
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
  assert(
    (await prisma.notification.count({ where: { projectId: created.id } })) === 4,
    "Owner, co-owner, and executors must be notified.",
  );

  const projectCountAfterSuccess = await prisma.project.count();

  const duplicateExecutors = await createProjectV2(
    { id: "creator-sa" },
    { name: "Duplicate executors", ownerId: "owner-admin", coOwnerIds: [], executorIds: ["executor-a", "executor-a"] },
  );
  assertValidationError(duplicateExecutors, "executorIds");

  const invalidUsers = await createProjectV2(
    { id: "creator-sa" },
    { name: "Invalid users", ownerId: "missing-owner", coOwnerIds: [], executorIds: ["missing-executor"] },
  );
  assert("error" in invalidUsers, "Invalid user IDs must fail.");
  assert(invalidUsers.fieldErrors?.ownerId && invalidUsers.fieldErrors?.executorIds, "Invalid owner and executor IDs must be identified.");

  const ownerAsCoOwner = await createProjectV2(
    { id: "creator-sa" },
    { name: "Owner overlap", ownerId: "owner-admin", coOwnerIds: ["owner-admin"], executorIds: ["executor-a"] },
  );
  assertValidationError(ownerAsCoOwner, "coOwnerIds");

  const noExecutors = await createProjectV2(
    { id: "creator-sa" },
    { name: "No executors", ownerId: "owner-admin", coOwnerIds: [], executorIds: [] },
  );
  assertValidationError(noExecutors, "executorIds");

  const superAdminOwner = await createProjectV2(
    { id: "creator-sa" },
    { name: "SA owner", ownerId: "other-sa", coOwnerIds: [], executorIds: ["executor-a"] },
  );
  assertValidationError(superAdminOwner, "ownerId");

  const superAdminCoOwner = await createProjectV2(
    { id: "creator-sa" },
    { name: "SA co-owner", ownerId: "owner-admin", coOwnerIds: ["other-sa"], executorIds: ["executor-a"] },
  );
  assertValidationError(superAdminCoOwner, "coOwnerIds");

  assert(
    (await prisma.project.count()) === projectCountAfterSuccess,
    "Validation failures must not create partial projects.",
  );

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_v2_executor_insert() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced nested write failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_v2_executor_insert
    BEFORE INSERT ON "ProjectExecutor"
    FOR EACH ROW EXECUTE FUNCTION fail_v2_executor_insert()
  `);

  let rollbackFailed = false;
  try {
    await createProjectV2(
      { id: "creator-sa" },
      { name: "Must roll back", ownerId: "owner-admin", coOwnerIds: ["co-owner"], executorIds: ["executor-a"] },
    );
  } catch {
    rollbackFailed = true;
  }
  assert(rollbackFailed, "Forced nested write failure must reach the transaction boundary.");
  assert(
    (await prisma.project.count({ where: { name: "Must roll back" } })) === 0,
    "A nested write failure must roll back the project and all related writes.",
  );

  await prisma.$executeRawUnsafe(
    `DROP TRIGGER fail_v2_executor_insert ON "ProjectExecutor"`,
  );
  await prisma.$executeRawUnsafe(`DROP FUNCTION fail_v2_executor_insert()`);

  console.log("Project creation V2 database integration checks passed.");
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

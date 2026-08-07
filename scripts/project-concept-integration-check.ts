import { randomUUID } from "node:crypto";

import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import {
  createProjectConceptFolder,
  getProjectConceptChatContext,
  getProjectConceptFolders,
  renameProjectConceptFolder,
} from "../src/lib/project-concepts";
import {
  createStageTextCommentFast,
  getProjectStageChatMessages,
} from "../src/lib/project-history";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Concept integration check failed: ${message}`);
}

function isErrorResult(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

async function snapshotPreservedData() {
  const [users, projects, inquiries, workflowStages, researchWorkspaces, conceptFolders] =
    await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.projectInquiry.count(),
      prisma.projectWorkflowStage.count(),
      prisma.projectResearchWorkspace.count(),
      prisma.projectConceptFolder.count(),
    ]);

  return {
    users,
    projects,
    inquiries,
    workflowStages,
    researchWorkspaces,
    conceptFolders,
  };
}

async function main() {
  const before = await snapshotPreservedData();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      collaboratorType: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const superAdmin = users.find((user) => user.role === UserRole.SUPER_ADMIN);
  const owner = users.find((user) => user.role !== UserRole.SUPER_ADMIN);
  const outsider = users.find(
    (user) => user.role === UserRole.COLLABORATOR && user.id !== owner?.id,
  );

  check(superAdmin, "an existing SUPER_ADMIN is required");
  check(owner, "an existing eligible non-SUPER_ADMIN owner is required");
  check(outsider, "an existing non-member COLLABORATOR is required");

  const runId = randomUUID();
  const projectIds = [
    `concept-integration-a-${runId}`,
    `concept-integration-b-${runId}`,
  ];

  try {
    await prisma.project.createMany({
      data: projectIds.map((id, index) => ({
        id,
        name: `Concept integration ${index + 1} ${runId}`,
        ownerId: owner.id,
        createdById: superAdmin.id,
      })),
    });
    await prisma.projectWorkflowStage.createMany({
      data: projectIds.flatMap((projectId) =>
        getInitialProjectWorkflowStageData().map((stage) => ({
          projectId,
          ...stage,
          status:
            stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION
              ? ProjectWorkflowStageStatus.AVAILABLE
              : stage.status,
          unlockedAt:
            stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION
              ? new Date()
              : stage.unlockedAt,
        })),
      ),
    });

    const firstStageThree = await getProjectConceptFolders(
      owner,
      projectIds[0],
      ProjectWorkflowStageKey.CONCEPT_CREATION,
    );
    check(firstStageThree?.length === 1, "Stage 3 must idempotently create Concept 1");
    check(firstStageThree[0].name === "Concept 1", "the default folder must be Concept 1");

    const reopenedStageThree = await getProjectConceptFolders(
      owner,
      projectIds[0],
      ProjectWorkflowStageKey.CONCEPT_CREATION,
    );
    check(
      reopenedStageThree?.length === 1 &&
        reopenedStageThree[0].id === firstStageThree[0].id &&
        reopenedStageThree[0].taskerStageId === firstStageThree[0].taskerStageId,
      "reopening Stage 3 must not duplicate or replace Concept 1/chat identity",
    );

    const created = await createProjectConceptFolder(owner, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: "  Concept   2  ",
    });
    check(!isErrorResult(created), "an authorized owner must create Concept 2");
    check(created.folder.name === "Concept 2", "folder whitespace must be normalized");
    check(
      created.folder.taskerStageId !== firstStageThree[0].taskerStageId,
      "each folder must have an isolated tasker identity",
    );

    const duplicate = await createProjectConceptFolder(owner, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      name: " concept 2 ",
    });
    check(isErrorResult(duplicate), "same-stage names must be case-insensitively unique");

    const originalTaskerStageId = created.folder.taskerStageId;
    const renamed = await renameProjectConceptFolder(owner, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      folderId: created.folder.id,
      name: "Primary Direction",
    });
    check(!isErrorResult(renamed), "an authorized owner must rename a concept folder");
    check(
      renamed.folder.taskerStageId === originalTaskerStageId,
      "rename must retain the persistent chat identity",
    );

    const renamedDefault = await renameProjectConceptFolder(owner, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      folderId: firstStageThree[0].id,
      name: "Packaging Direction",
    });
    check(!isErrorResult(renamedDefault), "the default folder must be renameable");
    check(
      renamedDefault.folder.taskerStageId === firstStageThree[0].taskerStageId,
      "renaming default Concept 1 must retain its chat identity",
    );
    const afterDefaultRename = await getProjectConceptFolders(
      owner,
      projectIds[0],
      ProjectWorkflowStageKey.CONCEPT_CREATION,
    );
    check(
      afterDefaultRename?.length === 2 &&
        afterDefaultRename.some(
          (folder) =>
            folder.id === firstStageThree[0].id &&
            folder.name === "Packaging Direction",
        ) &&
        !afterDefaultRename.some((folder) => folder.name === "Concept 1"),
      "reopening after renaming default Concept 1 must not recreate a new default/chat",
    );

    const ownerLockedStageFour = await getProjectConceptFolders(
      owner,
      projectIds[0],
      ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
    );
    check(ownerLockedStageFour === null, "ordinary users must not bypass a locked Stage 4");

    const superAdminStageFour = await getProjectConceptFolders(
      superAdmin,
      projectIds[0],
      ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
    );
    check(
      superAdminStageFour?.length === 1 && superAdminStageFour[0].name === "Concept 1",
      "SUPER_ADMIN must open locked Stage 4 and get its independent Concept 1",
    );
    check(
      superAdminStageFour[0].taskerStageId !== firstStageThree[0].taskerStageId,
      "Stage 3 and Stage 4 Concept 1 chats must be isolated",
    );
    const persistedStageFour = await prisma.projectWorkflowStage.findUniqueOrThrow({
      where: {
        projectId_stageKey: {
          projectId: projectIds[0],
          stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
        },
      },
    });
    check(
      persistedStageFour.status === ProjectWorkflowStageStatus.LOCKED,
      "the SUPER_ADMIN bypass must not mutate persisted workflow status",
    );

    const secondProjectStageThree = await getProjectConceptFolders(
      superAdmin,
      projectIds[1],
      ProjectWorkflowStageKey.CONCEPT_CREATION,
    );
    check(
      secondProjectStageThree?.length === 1 &&
        secondProjectStageThree[0].taskerStageId !== firstStageThree[0].taskerStageId,
      "the same folder name in another project must have a separate chat",
    );

    const messages = [
      {
        stageId: firstStageThree[0].taskerStageId,
        body: `Stage 3 Concept 1 ${runId}`,
      },
      { stageId: originalTaskerStageId, body: `Stage 3 renamed folder ${runId}` },
      {
        stageId: superAdminStageFour[0].taskerStageId,
        body: `Stage 4 Concept 1 ${runId}`,
      },
    ];
    for (const message of messages) {
      await createStageTextCommentFast(superAdmin, {
        projectId: projectIds[0],
        stageId: message.stageId,
        body: message.body,
      });
    }

    for (const expected of messages) {
      const history = await getProjectStageChatMessages(
        superAdmin,
        projectIds[0],
        expected.stageId,
        { includeWorkflowCards: "never" },
      );
      check(history.activeStageId === expected.stageId, "chat history must select the exact tasker");
      check(
        history.entries.length === 1 && history.entries[0].body === expected.body,
        "chat messages must not leak across folders or workflow stages",
      );
    }

    const allowedContext = await getProjectConceptChatContext(superAdmin, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
      folderId: superAdminStageFour[0].id,
    });
    check(
      allowedContext?.folder.taskerStageId === superAdminStageFour[0].taskerStageId,
      "the dedicated route context must resolve the exact mapped tasker",
    );
    const ownerLockedContext = await getProjectConceptChatContext(owner, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
      folderId: superAdminStageFour[0].id,
    });
    check(ownerLockedContext === null, "locked Stage 4 chat must remain unavailable to the owner");
    const outsiderContext = await getProjectConceptChatContext(outsider, {
      projectId: projectIds[0],
      stageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
      folderId: firstStageThree[0].id,
    });
    check(outsiderContext === null, "workflow bypass must never bypass project authorization");

    const folderRows = await prisma.projectConceptFolder.findMany({
      where: { projectId: { in: projectIds } },
      include: { taskerStage: true },
    });
    check(
      folderRows.every(
        (folder) =>
          folder.taskerStage.projectId === folder.projectId && folder.taskerStage.isTasker,
      ),
      "every folder must map one-to-one to a tasker in the same project",
    );
    check(
      new Set(folderRows.map((folder) => folder.taskerStageId)).size === folderRows.length,
      "no tasker may be shared by two folders",
    );
    check(
      (await prisma.projectRevision.count({ where: { projectId: { in: projectIds } } })) === 0 &&
        (await prisma.projectAttachment.count({ where: { projectId: { in: projectIds } } })) === 0,
      "folder chat must not create file handoff, submission, or completion records",
    );
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  }

  const after = await snapshotPreservedData();
  check(
    JSON.stringify(after) === JSON.stringify(before),
    `temporary integration data cleanup changed preserved counts: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );

  console.log(
    `Stage 3/4 concept integration checks passed; preserved ${after.users} users, ${after.projects} projects, ${after.inquiries} inquiries, ${after.researchWorkspaces} Stage 2 workspaces, and ${after.conceptFolders} existing concept folders.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

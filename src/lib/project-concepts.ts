import {
  Prisma,
  ProjectWorkflowStageKey,
  StageStatus,
} from "@prisma/client";

import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  getProjectStageAccessRecordById,
  projectStageAccessSelect,
  type ProjectStageAccessRecord,
} from "@/lib/project-stage-data";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";

export type ConceptWorkflowStageKey =
  | typeof ProjectWorkflowStageKey.CONCEPT_CREATION
  | typeof ProjectWorkflowStageKey.PROJECT_DEVELOPMENT;

export type ProjectConceptFolderRecord = {
  id: string;
  name: string;
  sortOrder: number;
  taskerStageId: string;
};

const DEFAULT_CONCEPT_FOLDER_NAME = "Concept 1";
export const CONCEPT_FOLDER_NAME_MAX_LENGTH = 120;

type ConceptProject = ProjectStageAccessRecord;

function isSupportedConceptStageKey(
  stageKey: ProjectWorkflowStageKey,
): stageKey is ConceptWorkflowStageKey {
  return (
    stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ||
    stageKey === ProjectWorkflowStageKey.PROJECT_DEVELOPMENT
  );
}

function cleanConceptFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeConceptFolderName(value: string) {
  return cleanConceptFolderName(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

function validateConceptFolderName(value: string):
  | { error: string }
  | { name: string; normalizedName: string } {
  const name = cleanConceptFolderName(value);

  if (!name) {
    return { error: "Folder name is required." };
  }

  if (name.length > CONCEPT_FOLDER_NAME_MAX_LENGTH) {
    return {
      error: `Folder names can be up to ${CONCEPT_FOLDER_NAME_MAX_LENGTH} characters.`,
    };
  }

  return {
    name,
    normalizedName: normalizeConceptFolderName(name),
  };
}

function getWorkflowStageStatus(
  project: ConceptProject,
  stageKey: ConceptWorkflowStageKey,
) {
  return project.workflowStages.find((stage) => stage.stageKey === stageKey)?.status;
}

async function getAuthorizedConceptProject(
  user: PermissionUser,
  projectId: string,
  stageKey: ProjectWorkflowStageKey,
) {
  if (!isSupportedConceptStageKey(stageKey)) {
    return null;
  }

  const project = await getProjectStageAccessRecordById(projectId);

  if (!project || !hasProjectPermission(user, project, "project.view")) {
    return null;
  }

  if (
    !canOpenImplementedWorkflowStage({
      user,
      stageKey,
      status: getWorkflowStageStatus(project, stageKey),
    })
  ) {
    return null;
  }

  return project;
}

function getTaskerStageOrder(stageKey: ConceptWorkflowStageKey, sortOrder: number) {
  const stageBase =
    stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 30_000 : 40_000;

  return stageBase + sortOrder;
}

function getDefaultTaskerStageId(
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
) {
  return `concept-tasker:${projectId}:${stageKey.toLowerCase()}:concept-1`;
}

const conceptFolderSelect = {
  id: true,
  name: true,
  sortOrder: true,
  taskerStageId: true,
} satisfies Prisma.ProjectConceptFolderSelect;

async function findExistingConceptFolder(
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
) {
  return withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        projectId,
        workflowStageKey: stageKey,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: conceptFolderSelect,
    }),
  );
}

export async function ensureDefaultProjectConceptFolder(
  user: PermissionUser,
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
  options: { skipExistingLookup?: boolean } = {},
) {
  const project = await getAuthorizedConceptProject(user, projectId, stageKey);

  if (!project) {
    return null;
  }

  const existing = options.skipExistingLookup
    ? null
    : await findExistingConceptFolder(projectId, stageKey);

  if (existing) {
    return existing;
  }

  const normalizedName = normalizeConceptFolderName(DEFAULT_CONCEPT_FOLDER_NAME);
  const taskerStageId = getDefaultTaskerStageId(projectId, stageKey);

  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const concurrentExisting = await tx.projectConceptFolder.findFirst({
            where: {
              projectId,
              workflowStageKey: stageKey,
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: conceptFolderSelect,
          });

          if (concurrentExisting) {
            return concurrentExisting;
          }

          await tx.projectStage.upsert({
            where: { id: taskerStageId },
            update: { isTasker: true },
            create: {
              id: taskerStageId,
              projectId,
              name: DEFAULT_CONCEPT_FOLDER_NAME,
              description: "Discussion thread for this concept.",
              invoiceRequired: false,
              isTasker: true,
              actualStartedAt: new Date(),
              startedById: user.id,
              status: StageStatus.ONGOING,
              order: getTaskerStageOrder(stageKey, 1),
            },
          });

          return tx.projectConceptFolder.create({
            data: {
              projectId,
              workflowStageKey: stageKey,
              taskerStageId,
              name: DEFAULT_CONCEPT_FOLDER_NAME,
              normalizedName,
              sortOrder: 1,
              createdById: user.id,
            },
            select: conceptFolderSelect,
          });
        },
        { maxWait: 5_000, timeout: 15_000 },
      ),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return findExistingConceptFolder(projectId, stageKey);
    }

    throw error;
  }
}

export async function getProjectConceptFolders(
  user: PermissionUser,
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
) {
  const project = await getAuthorizedConceptProject(user, projectId, stageKey);
  if (!project) {
    return null;
  }

  const folders = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findMany({
      where: {
        projectId,
        workflowStageKey: stageKey,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: conceptFolderSelect,
    }),
  );

  if (folders.length > 0) {
    return folders;
  }

  const defaultFolder = await ensureDefaultProjectConceptFolder(
    user,
    projectId,
    stageKey,
    { skipExistingLookup: true },
  );
  return defaultFolder ? [defaultFolder] : null;
}

export async function createProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    name: string;
  },
) {
  const validatedName = validateConceptFolderName(input.name);

  if ("error" in validatedName) {
    return validatedName;
  }

  const project = await getAuthorizedConceptProject(
    user,
    input.projectId,
    input.stageKey,
  );

  if (!project || !hasProjectPermission(user, project, "project.update")) {
    return { error: "You do not have permission to create concept folders." } as const;
  }

  try {
    const folder = await withPrismaRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.projectConceptFolder.findUnique({
            where: {
              projectId_workflowStageKey_normalizedName: {
                projectId: input.projectId,
                workflowStageKey: input.stageKey,
                normalizedName: validatedName.normalizedName,
              },
            },
            select: { id: true },
          });

          if (duplicate) {
            throw new Error("DUPLICATE_CONCEPT_FOLDER");
          }

          const lastFolder = await tx.projectConceptFolder.findFirst({
            where: {
              projectId: input.projectId,
              workflowStageKey: input.stageKey,
            },
            orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
            select: { sortOrder: true },
          });
          const sortOrder = (lastFolder?.sortOrder ?? 0) + 1;
          const taskerStage = await tx.projectStage.create({
            data: {
              projectId: input.projectId,
              name: validatedName.name,
              description: "Discussion thread for this concept.",
              invoiceRequired: false,
              isTasker: true,
              actualStartedAt: new Date(),
              startedById: user.id,
              status: StageStatus.ONGOING,
              order: getTaskerStageOrder(input.stageKey, sortOrder),
            },
            select: { id: true },
          });

          return tx.projectConceptFolder.create({
            data: {
              projectId: input.projectId,
              workflowStageKey: input.stageKey,
              taskerStageId: taskerStage.id,
              name: validatedName.name,
              normalizedName: validatedName.normalizedName,
              sortOrder,
              createdById: user.id,
            },
            select: conceptFolderSelect,
          });
        },
        { maxWait: 5_000, timeout: 15_000 },
      ),
    );

    return { folder } as const;
  } catch (error) {
    if (
      (error instanceof Error && error.message === "DUPLICATE_CONCEPT_FOLDER") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return { error: "A concept folder with this name already exists." } as const;
    }

    throw error;
  }
}

export async function renameProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
    name: string;
  },
) {
  const validatedName = validateConceptFolderName(input.name);

  if ("error" in validatedName) {
    return validatedName;
  }

  const project = await getAuthorizedConceptProject(
    user,
    input.projectId,
    input.stageKey,
  );

  if (!project || !hasProjectPermission(user, project, "project.update")) {
    return { error: "You do not have permission to rename concept folders." } as const;
  }

  const folder = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        id: input.folderId,
        projectId: input.projectId,
        workflowStageKey: input.stageKey,
      },
      select: {
        id: true,
        taskerStageId: true,
      },
    }),
  );

  if (!folder) {
    return { error: "Concept folder not found." } as const;
  }

  try {
    await withPrismaRetry(() =>
      prisma.$transaction([
        prisma.projectConceptFolder.update({
          where: { id: folder.id },
          data: {
            name: validatedName.name,
            normalizedName: validatedName.normalizedName,
          },
        }),
        prisma.projectStage.update({
          where: { id: folder.taskerStageId },
          data: { name: validatedName.name },
        }),
      ]),
    );

    return {
      folder: {
        id: folder.id,
        name: validatedName.name,
        taskerStageId: folder.taskerStageId,
      },
    } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A concept folder with this name already exists." } as const;
    }

    throw error;
  }
}

export async function getProjectConceptChatContext(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
  },
) {
  const record = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        id: input.folderId,
        projectId: input.projectId,
        workflowStageKey: input.stageKey,
        taskerStage: {
          projectId: input.projectId,
          isTasker: true,
        },
      },
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        taskerStageId: true,
        project: { select: projectStageAccessSelect },
      },
    }),
  );

  if (
    !record ||
    !hasProjectPermission(user, record.project, "chat.view") ||
    !canOpenImplementedWorkflowStage({
      user,
      stageKey: input.stageKey,
      status: getWorkflowStageStatus(record.project, input.stageKey),
    })
  ) {
    return null;
  }

  return {
    projectId: input.projectId,
    workflowStageKey: input.stageKey,
    folder: {
      id: record.id,
      name: record.name,
      taskerStageId: record.taskerStageId,
    },
  };
}

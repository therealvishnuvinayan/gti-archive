import {
  Prisma,
  ProjectWorkflowStageKey,
  StageStatus,
} from "@prisma/client";

import {
  type PermissionUser,
} from "@/lib/permissions/resolver";
import {
  canManageProjectConcept,
  canViewProjectConcept,
  getProjectConceptParticipantUserIds,
  type ConceptAccessContext,
} from "@/lib/project-concept-access";
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
  assignedExecutorId: string | null;
  assignedExecutor: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  brief: string | null;
  actualStartedAt: Date | null;
  briefAttachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    fileSize: number;
  }>;
};

export type ProjectConceptChatMode = {
  type: "concept";
  folderId: string;
  workflowStageKey: ConceptWorkflowStageKey;
  stageNumber: 3 | 4;
  stageLabel: "Stage 3 - Initial Concept" | "Stage 4 - Final Concept";
  conceptName: string;
  assignedExecutor: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  canManage: boolean;
  canReview: boolean;
  isAssignedExecutor: boolean;
  participantUserIds: string[];
  backHref: string;
  compareHref: string;
};

export const DEFAULT_CONCEPT_FOLDER_NAME = "Concept 1";
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

  if (!project) {
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

const conceptFolderSelect = {
  id: true,
  name: true,
  sortOrder: true,
  taskerStageId: true,
  assignedExecutorId: true,
  assignedExecutor: {
    select: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  },
  taskerStage: {
    select: {
      description: true,
      actualStartedAt: true,
      attachments: {
        where: {
          revisionId: null,
          commentId: null,
          assetType: "GENERAL_PROJECT_ASSET",
          status: "READY",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectConceptFolderSelect;

function getConceptAccessContext(
  project: ConceptProject,
  folder: { id: string; taskerStageId: string; assignedExecutorId: string | null },
  stageKey: ConceptWorkflowStageKey,
): ConceptAccessContext {
  return {
    folderId: folder.id,
    projectId: project.id,
    taskerStageId: folder.taskerStageId,
    workflowStageKey: stageKey,
    assignedExecutorId: folder.assignedExecutorId,
    ownerId: project.ownerId,
    coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
  };
}

function mapConceptFolder(
  folder: Prisma.ProjectConceptFolderGetPayload<{
    select: typeof conceptFolderSelect;
  }>,
): ProjectConceptFolderRecord {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    taskerStageId: folder.taskerStageId,
    assignedExecutorId: folder.assignedExecutorId,
    assignedExecutor: folder.assignedExecutor?.user ?? null,
    brief: folder.taskerStage.description,
    actualStartedAt: folder.taskerStage.actualStartedAt,
    briefAttachments: folder.taskerStage.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    })),
  };
}

export async function getProjectConceptFolders(
  user: PermissionUser,
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
  options: { executorId?: string | null } = {},
) {
  const project = await getAuthorizedConceptProject(user, projectId, stageKey);
  if (!project) {
    return null;
  }

  const managerContext: ConceptAccessContext = {
    folderId: "",
    projectId,
    taskerStageId: "",
    workflowStageKey: stageKey,
    assignedExecutorId: null,
    ownerId: project.ownerId,
    coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
  };
  const canManage = canManageProjectConcept(user, managerContext);
  const requestedExecutor = options.executorId?.trim() || null;
  const requestedExecutorId = canManage
    ? requestedExecutor &&
      project.executors.some((executor) => executor.userId === requestedExecutor)
      ? requestedExecutor
      : null
    : user.id;
  const folders = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findMany({
      where: {
        projectId,
        workflowStageKey: stageKey,
        ...(requestedExecutorId
          ? { assignedExecutorId: requestedExecutorId }
          : canManage
            ? {}
            : { assignedExecutorId: user.id }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: conceptFolderSelect,
    }),
  );

  const visibleFolders = folders.filter((folder) =>
    canViewProjectConcept(user, getConceptAccessContext(project, folder, stageKey)),
  );

  if (!canManage && visibleFolders.length === 0) {
    return null;
  }

  return {
    folders: visibleFolders.map(mapConceptFolder),
    canManage,
    selectedExecutorId: requestedExecutorId,
    executors: canManage
      ? project.executors.map((executor) => ({
          id: executor.user.id,
          name: executor.user.name,
          email: executor.user.email,
          avatarUrl: executor.user.avatarUrl,
        }))
      : [],
  };
}

export async function createProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    name: string;
    assignedExecutorId: string;
    brief?: string | null;
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

  const managerContext: ConceptAccessContext | null = project
    ? {
        folderId: "",
        projectId: input.projectId,
        taskerStageId: "",
        workflowStageKey: input.stageKey,
        assignedExecutorId: null,
        ownerId: project.ownerId,
        coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
      }
    : null;

  if (!project || !managerContext || !canManageProjectConcept(user, managerContext)) {
    return { error: "You do not have permission to create concept folders." } as const;
  }

  if (input.stageKey !== ProjectWorkflowStageKey.CONCEPT_CREATION) {
    return {
      error: "Stage 4 concepts are created from approved Stage 3 concepts in a later workflow round.",
    } as const;
  }

  const assignedExecutorId = input.assignedExecutorId.trim();
  if (!assignedExecutorId) {
    return { error: "Assigned Executor is required." } as const;
  }

  if (!project.executors.some((executor) => executor.userId === assignedExecutorId)) {
    return { error: "Assigned Executor must be a current project executor." } as const;
  }

  const brief = input.brief?.trim() || null;

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
              description: brief,
              invoiceRequired: false,
              isTasker: true,
              actualStartedAt: null,
              startedById: null,
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
              assignedExecutorId,
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

    return { folder: mapConceptFolder(folder) } as const;
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

  return editProjectConceptFolder(user, input);
}

export async function editProjectConceptFolder(
  user: PermissionUser,
  input: {
    projectId: string;
    stageKey: ConceptWorkflowStageKey;
    folderId: string;
    name: string;
    assignedExecutorId?: string;
    brief?: string | null;
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

  if (!project) {
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
        assignedExecutorId: true,
        taskerStage: {
          select: {
            actualStartedAt: true,
            description: true,
          },
        },
      },
    }),
  );

  if (!folder) {
    return { error: "Concept folder not found." } as const;
  }

  const accessContext = getConceptAccessContext(project, folder, input.stageKey);
  if (!canManageProjectConcept(user, accessContext)) {
    return { error: "You do not have permission to edit concept folders." } as const;
  }

  const requestedExecutorId = input.assignedExecutorId?.trim();
  const assignmentChanged =
    requestedExecutorId !== undefined &&
    requestedExecutorId !== folder.assignedExecutorId;
  const requestedBrief =
    input.brief === undefined ? undefined : input.brief?.trim() || null;
  const briefChanged =
    requestedBrief !== undefined && requestedBrief !== folder.taskerStage.description;

  if (requestedExecutorId === "") {
    return { error: "Assigned Executor is required." } as const;
  }

  if (
    requestedExecutorId &&
    !project.executors.some((executor) => executor.userId === requestedExecutorId)
  ) {
    return { error: "Assigned Executor must be a current project executor." } as const;
  }

  if (folder.taskerStage.actualStartedAt && (briefChanged || (assignmentChanged && folder.assignedExecutorId))) {
    return {
      error: "Assigned Executor and Concept Brief are locked after work starts.",
    } as const;
  }

  try {
    await withPrismaRetry(() =>
      prisma.$transaction([
        prisma.projectConceptFolder.update({
          where: { id: folder.id },
          data: {
            name: validatedName.name,
            normalizedName: validatedName.normalizedName,
            ...(requestedExecutorId !== undefined
              ? { assignedExecutorId: requestedExecutorId }
              : {}),
          },
        }),
        prisma.projectStage.update({
          where: { id: folder.taskerStageId },
          data: {
            name: validatedName.name,
            ...(requestedBrief !== undefined ? { description: requestedBrief } : {}),
          },
        }),
      ]),
    );

    return {
      folder: {
        id: folder.id,
        name: validatedName.name,
        taskerStageId: folder.taskerStageId,
        assignedExecutorId: requestedExecutorId ?? folder.assignedExecutorId,
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
        assignedExecutorId: true,
        assignedExecutor: {
          select: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        project: { select: projectStageAccessSelect },
      },
    }),
  );

  if (
    !record ||
    !canViewProjectConcept(
      user,
      getConceptAccessContext(record.project, record, input.stageKey),
    ) ||
    !canOpenImplementedWorkflowStage({
      user,
      stageKey: input.stageKey,
      status: getWorkflowStageStatus(record.project, input.stageKey),
    })
  ) {
    return null;
  }

  const accessContext = getConceptAccessContext(
    record.project,
    record,
    input.stageKey,
  );
  const stageNumber =
    input.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 3 : 4;
  const conceptPath = `/projects/${encodeURIComponent(input.projectId)}/stages/${stageNumber}/concepts/${encodeURIComponent(record.id)}`;
  const canManage = canManageProjectConcept(user, accessContext);

  return {
    projectId: input.projectId,
    workflowStageKey: input.stageKey,
    folder: {
      id: record.id,
      name: record.name,
      taskerStageId: record.taskerStageId,
    },
    chatMode: {
      type: "concept",
      folderId: record.id,
      workflowStageKey: input.stageKey,
      stageNumber,
      stageLabel:
        stageNumber === 3
          ? "Stage 3 - Initial Concept"
          : "Stage 4 - Final Concept",
      conceptName: record.name,
      assignedExecutor: record.assignedExecutor?.user ?? null,
      canManage,
      canReview: canManage,
      isAssignedExecutor: record.assignedExecutorId === user.id,
      participantUserIds: getProjectConceptParticipantUserIds(accessContext),
      backHref: `/projects/${encodeURIComponent(input.projectId)}/stages/${stageNumber}`,
      compareHref: `${conceptPath}/compare`,
    } satisfies ProjectConceptChatMode,
  };
}

import {
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProjectResearchFolderSystemKey,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import { hasProjectPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { getWorkflowStageCompletionMode } from "@/lib/project-workflow";
import { getProjectStageAccessRecordById } from "@/lib/project-stage-data";
import { getProjectResearchAccess } from "@/lib/project-research-access";

export const PROJECT_RESEARCH_SYSTEM_FOLDERS = [
  { key: ProjectResearchFolderSystemKey.BRIEF, name: "Brief", sortOrder: 1 },
  {
    key: ProjectResearchFolderSystemKey.MARKET_COMPETITION,
    name: "Market & Competition",
    sortOrder: 2,
  },
  { key: ProjectResearchFolderSystemKey.TECH, name: "Tech", sortOrder: 3 },
  { key: ProjectResearchFolderSystemKey.VENDORS, name: "Vendors", sortOrder: 4 },
  { key: ProjectResearchFolderSystemKey.FINANCE, name: "Finance", sortOrder: 5 },
  { key: ProjectResearchFolderSystemKey.LEGAL, name: "Legal", sortOrder: 6 },
  { key: ProjectResearchFolderSystemKey.PITCH, name: "Pitch", sortOrder: 7 },
] as const;

export const PROJECT_RESEARCH_CUSTOM_FOLDER_NAME_MAX_LENGTH = 120;

type ResearchUser = Pick<PermissionUser, "id" | "role">;

export function normalizeProjectResearchFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function cleanProjectResearchFolderName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function ensureProjectResearchWorkspaceTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerUserId: string,
) {
  const existingWorkspace = await tx.projectResearchWorkspace.findUnique({
    where: { projectId_ownerUserId: { projectId, ownerUserId } },
    select: { id: true },
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  return tx.projectResearchWorkspace.create({
    data: {
      projectId,
      ownerUserId,
      folders: {
        create: PROJECT_RESEARCH_SYSTEM_FOLDERS.map((folder) => ({
          name: folder.name,
          normalizedName: normalizeProjectResearchFolderName(folder.name),
          systemKey: folder.key,
          isSystem: true,
          sortOrder: folder.sortOrder,
        })),
      },
    },
    select: { id: true },
  });
}

export async function ensureProjectResearchWorkspace(
  projectId: string,
  ownerUserId: string,
) {
  return withPrismaRetry(() =>
    prisma.$transaction((tx) =>
      ensureProjectResearchWorkspaceTx(tx, projectId, ownerUserId),
    ),
  );
}

export async function ensureProjectResearchWorkspacesForProjectTx(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      coOwners: { select: { userId: true } },
      executors: { select: { userId: true } },
      collaborators: { select: { userId: true } },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  const participantIds = new Set([
    ...(project.ownerId ? [project.ownerId] : []),
    ...project.coOwners.map((record) => record.userId),
    ...project.executors.map((record) => record.userId),
    ...project.collaborators.map((record) => record.userId),
  ]);

  for (const participantId of participantIds) {
    await ensureProjectResearchWorkspaceTx(tx, projectId, participantId);
  }

  return [...participantIds];
}

export async function ensureProjectResearchWorkspacesForProject(projectId: string) {
  return withPrismaRetry(() =>
    prisma.$transaction(
      (tx) => ensureProjectResearchWorkspacesForProjectTx(tx, projectId),
      { timeout: 30_000 },
    ),
  );
}

const researchProjectSelect = {
  id: true,
  name: true,
  ownerId: true,
  owner: { select: { id: true, name: true, email: true } },
  coOwners: {
    select: { userId: true, user: { select: { id: true, name: true, email: true } } },
  },
  executors: {
    select: { userId: true, user: { select: { id: true, name: true, email: true } } },
  },
  collaborators: {
    select: { userId: true, user: { select: { id: true, name: true, email: true } } },
  },
  workflowStages: {
    where: { stageKey: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING },
    select: { stageKey: true, status: true },
    take: 1,
  },
} satisfies Prisma.ProjectSelect;

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function assertStageTwoAvailable(status: ProjectWorkflowStageStatus | undefined) {
  if (
    status !== ProjectWorkflowStageStatus.AVAILABLE &&
    status !== ProjectWorkflowStageStatus.COMPLETED
  ) {
    throw new Error("Project Research and Planning is not available yet.");
  }
}

export type ProjectResearchPageData = Awaited<
  ReturnType<typeof getProjectResearchPageData>
>;

export async function getProjectResearchPageData(
  user: ResearchUser,
  projectId: string,
  requestedWorkspaceId?: string | null,
) {
  const project = await getProjectStageAccessRecordById(projectId);

  if (!project) {
    return null;
  }

  assertStageTwoAvailable(
    project.workflowStages.find(
      (stage) =>
        stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
    )?.status,
  );

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
  const isOwner = project.ownerId === user.id;
  const isCoOwner = project.coOwners.some((record) => record.userId === user.id);
  const isExecutor = project.executors.some((record) => record.userId === user.id);
  const isCollaborator = project.collaborators.some((record) => record.userId === user.id);
  const participantIds = new Set([
    ...(project.ownerId ? [project.ownerId] : []),
    ...project.coOwners.map((record) => record.userId),
    ...project.executors.map((record) => record.userId),
    ...project.collaborators.map((record) => record.userId),
  ]);

  if (!isSuperAdmin && !isOwner && !isCoOwner && !isExecutor && !isCollaborator) {
    return null;
  }

  const workspaces = await withPrismaRetry(() =>
    prisma.projectResearchWorkspace.findMany({
      where: {
        projectId,
        ownerUserId:
          !isSuperAdmin && !isOwner && !isCoOwner
            ? user.id
            : { in: [...participantIds] },
      },
      relationLoadStrategy: "join",
      select: {
        id: true,
        ownerUserId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  );

  if (workspaces.length === 0) {
    return null;
  }

  const ownWorkspace = workspaces.find((workspace) => workspace.ownerUserId === user.id);
  const requestedWorkspace = workspaces.find(
    (workspace) => workspace.id === requestedWorkspaceId,
  );
  const ownerWorkspace = workspaces.find(
    (workspace) => workspace.ownerUserId === project.ownerId,
  );
  const selectedWorkspace =
    requestedWorkspace ?? ownWorkspace ?? ownerWorkspace ?? workspaces[0];
  const access = getProjectResearchAccess(user, {
    projectId,
    workspaceId: selectedWorkspace.id,
    workspaceOwnerUserId: selectedWorkspace.ownerUserId,
    project,
  });

  if (!access.canRead) {
    return null;
  }

  const folders = await withPrismaRetry(() =>
    prisma.projectResearchFolder.findMany({
      where: { workspaceId: selectedWorkspace.id },
      relationLoadStrategy: "join",
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        isSystem: true,
        systemKey: true,
        sortOrder: true,
        _count: {
          select: {
            files: { where: { attachment: { status: AttachmentStatus.READY } } },
          },
        },
      },
    }),
  );

  const participantRole = new Map<string, string>();
  if (project.owner) participantRole.set(project.owner.id, "Project Owner");
  for (const record of project.coOwners) {
    if (!participantRole.has(record.userId)) participantRole.set(record.userId, "Project Co-Owner");
  }
  for (const record of project.executors) {
    if (!participantRole.has(record.userId)) participantRole.set(record.userId, "Project Executor");
  }
  for (const record of project.collaborators) {
    if (!participantRole.has(record.userId)) participantRole.set(record.userId, "Collaborator");
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      ownerName: project.owner ? displayName(project.owner) : "Not assigned",
      coOwnerNames: project.coOwners.map((record) => displayName(record.user)),
      executorNames: project.executors.map((record) => displayName(record.user)),
    },
    workflowStatus:
      project.workflowStages.find(
        (stage) =>
          stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
      )?.status ?? ProjectWorkflowStageStatus.LOCKED,
    selectedWorkspace: {
      id: selectedWorkspace.id,
      ownerUserId: selectedWorkspace.ownerUserId,
      ownerName: displayName(selectedWorkspace.owner),
      role: participantRole.get(selectedWorkspace.ownerUserId) ?? "Project Participant",
      canWrite: access.canWrite,
      canDeleteFolders: access.canWrite && access.isOwnWorkspace,
    },
    workspaceOptions: workspaces.map((workspace) => ({
      id: workspace.id,
      ownerUserId: workspace.ownerUserId,
      name: displayName(workspace.owner),
      role: participantRole.get(workspace.ownerUserId) ?? "Project Participant",
    })),
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      isSystem: folder.isSystem,
      systemKey: folder.systemKey,
      sortOrder: folder.sortOrder,
      fileCount: folder._count.files,
    })),
  };
}

export async function createProjectResearchFolder(
  user: ResearchUser,
  input: { projectId: string; workspaceId: string; name: string },
) {
  const name = cleanProjectResearchFolderName(input.name);

  if (!name) {
    return { error: "Folder name is required." } as const;
  }

  if (name.length > PROJECT_RESEARCH_CUSTOM_FOLDER_NAME_MAX_LENGTH) {
    return {
      error: `Folder names can be up to ${PROJECT_RESEARCH_CUSTOM_FOLDER_NAME_MAX_LENGTH} characters.`,
    } as const;
  }

  const workspace = await withPrismaRetry(() =>
    prisma.projectResearchWorkspace.findFirst({
      where: { id: input.workspaceId, projectId: input.projectId },
      select: {
        id: true,
        ownerUserId: true,
        project: { select: researchProjectSelect },
      },
    }),
  );

  if (!workspace) {
    return { error: "Folder set not found." } as const;
  }

  const access = getProjectResearchAccess(user, {
    projectId: input.projectId,
    workspaceId: workspace.id,
    workspaceOwnerUserId: workspace.ownerUserId,
    project: workspace.project,
  });

  if (!access.canWrite) {
    return { error: "This folder set is read-only for your account." } as const;
  }

  try {
    const folder = await withPrismaRetry(() =>
      prisma.projectResearchFolder.create({
        data: {
          workspaceId: input.workspaceId,
          name,
          normalizedName: normalizeProjectResearchFolderName(name),
          isSystem: false,
          sortOrder: 1000,
          createdById: user.id,
        },
        select: { id: true, name: true },
      }),
    );

    return { folder } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A folder with this name already exists in this folder set." } as const;
    }
    throw error;
  }
}

export async function getProjectResearchFolderPageData(
  user: ResearchUser,
  input: { projectId: string; folderId: string },
) {
  const folder = await withPrismaRetry(() =>
    prisma.projectResearchFolder.findFirst({
      where: {
        id: input.folderId,
        workspace: { projectId: input.projectId },
      },
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        isSystem: true,
        workspace: {
          select: {
            id: true,
            ownerUserId: true,
            owner: { select: { name: true, email: true } },
            project: { select: researchProjectSelect },
          },
        },
        files: {
          where: { attachment: { status: AttachmentStatus.READY } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            attachment: {
              select: {
                id: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
                uploadedBy: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  );

  if (!folder) {
    return null;
  }

  const access = getProjectResearchAccess(user, {
    projectId: input.projectId,
    workspaceId: folder.workspace.id,
    workspaceOwnerUserId: folder.workspace.ownerUserId,
    project: folder.workspace.project,
  });

  if (!access.canRead) {
    return null;
  }

  return {
    project: {
      id: folder.workspace.project.id,
      name: folder.workspace.project.name,
    },
    workspace: {
      id: folder.workspace.id,
      ownerUserId: folder.workspace.ownerUserId,
      ownerName: displayName(folder.workspace.owner),
    },
    folder: { id: folder.id, name: folder.name, isSystem: folder.isSystem },
    canWrite: access.canWrite,
    files: folder.files.map((record) => ({
      id: record.id,
      attachmentId: record.attachment.id,
      name: record.attachment.originalFileName,
      mimeType: record.attachment.mimeType,
      size: record.attachment.fileSize,
      uploadedAt: record.attachment.createdAt.toISOString(),
      uploadedBy: displayName(record.attachment.uploadedBy),
    })),
  };
}

export async function completeProjectResearchStage(
  user: ResearchUser,
  projectId: string,
) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerId: true,
        coOwners: { select: { userId: true } },
        executors: { select: { userId: true } },
        collaborators: { select: { userId: true } },
      },
    }),
  );

  if (!project) {
    return { error: "Project not found." } as const;
  }

  if (!hasProjectPermission(user, project, "project.update")) {
    return { error: "You do not have permission to complete this stage." } as const;
  }

  return withPrismaRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const workflowStages = await tx.projectWorkflowStage.findMany({
          where: { projectId },
          select: {
            id: true,
            stageKey: true,
            status: true,
            unlockedAt: true,
            completedAt: true,
          },
        });
        const stageTwo = workflowStages.find(
          (stage) =>
            stage.stageKey ===
            ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
        );
        const stageThree = workflowStages.find(
          (stage) => stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION,
        );
        const completionMode = getWorkflowStageCompletionMode(
          workflowStages,
          ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
        );

        if (!stageTwo || !stageThree || completionMode === "UNAVAILABLE") {
          return { error: "Project Research and Planning is not available yet." } as const;
        }

        const alreadyCompleted = completionMode === "RETRY";
        if (completionMode === "TRANSITION") {
          const now = new Date();
          const completed = await tx.projectWorkflowStage.updateMany({
            where: {
              id: stageTwo.id,
              status: ProjectWorkflowStageStatus.AVAILABLE,
            },
            data: {
              status: ProjectWorkflowStageStatus.COMPLETED,
              completedAt: now,
            },
          });

          if (completed.count === 1) {
            await tx.projectWorkflowStage.updateMany({
              where: {
                id: stageThree.id,
                status: ProjectWorkflowStageStatus.LOCKED,
              },
              data: {
                status: ProjectWorkflowStageStatus.AVAILABLE,
                unlockedAt: now,
              },
            });
          }
        }

        return { success: true, nextStage: 3, alreadyCompleted } as const;
      },
      { timeout: 30_000 },
    ),
  );
}

export function isProjectResearchAttachmentType(assetType: AttachmentAssetType) {
  return assetType === AttachmentAssetType.PROJECT_RESEARCH_FILE;
}

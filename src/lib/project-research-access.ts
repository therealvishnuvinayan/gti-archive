import {
  ProjectResearchFolderSystemKey,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import {
  isGlobalProjectAdministrator,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const researchAccessProjectSelect = {
  ownerId: true,
  coOwners: { select: { userId: true } },
  executors: { select: { userId: true } },
  collaborators: { select: { userId: true } },
  workflowStages: {
    where: { stageKey: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING },
    select: { stageKey: true, status: true },
    take: 1,
  },
} satisfies Prisma.ProjectSelect;

export type ProjectResearchAccess = {
  projectId: string;
  workspaceId: string;
  workspaceOwnerUserId: string;
  isCanonicalWorkspace: boolean;
  canRead: boolean;
  canWrite: boolean;
  isProjectOwner: boolean;
  isProjectCoOwner: boolean;
  isProjectParticipant: boolean;
};

export function getProjectResearchAccess(
  user: Pick<PermissionUser, "id" | "role">,
  context: {
    projectId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
    folderSystemKey?: ProjectResearchFolderSystemKey | null;
    project: Prisma.ProjectGetPayload<{
      select: typeof researchAccessProjectSelect;
    }>;
  },
): ProjectResearchAccess {
  const isGlobalAdministrator = isGlobalProjectAdministrator(user);
  const isProjectOwner = context.project.ownerId === user.id;
  const isProjectCoOwner = context.project.coOwners.some(
    (coOwner) => coOwner.userId === user.id,
  );
  const isExecutor = context.project.executors.some(
    (executor) => executor.userId === user.id,
  );
  const isCollaborator = context.project.collaborators.some(
    (collaborator) => collaborator.userId === user.id,
  );
  const isCanonicalWorkspace =
    context.workspaceOwnerUserId === context.project.ownerId;
  const isProjectParticipant =
    isProjectOwner || isProjectCoOwner || isExecutor || isCollaborator;
  const workflowStatus = context.project.workflowStages.find(
    (stage) =>
      stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
  )?.status;
  const stageAvailable =
    workflowStatus === ProjectWorkflowStageStatus.AVAILABLE ||
    workflowStatus === ProjectWorkflowStageStatus.COMPLETED;
  const isCanonicalSharedFolder =
    user.role === UserRole.USER &&
    isCanonicalWorkspace &&
    (context.folderSystemKey === ProjectResearchFolderSystemKey.BRIEF ||
      context.folderSystemKey === ProjectResearchFolderSystemKey.TECH) &&
    isProjectParticipant;

  return {
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    workspaceOwnerUserId: context.workspaceOwnerUserId,
    isCanonicalWorkspace,
    canRead:
      isCanonicalSharedFolder ||
      (isCanonicalWorkspace && stageAvailable && isGlobalAdministrator),
    canWrite: isCanonicalWorkspace && stageAvailable && isGlobalAdministrator,
    isProjectOwner,
    isProjectCoOwner,
    isProjectParticipant,
  };
}

export async function getResearchFolderAccess(
  user: Pick<PermissionUser, "id" | "role">,
  input: { projectId: string; folderId: string },
) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: researchAccessProjectSelect,
    }),
  );

  if (!project?.ownerId) {
    throw new Error("Research folder not found.");
  }
  const ownerUserId = project.ownerId;

  const folder = await withPrismaRetry(() =>
    prisma.projectResearchFolder.findFirst({
      where: {
        id: input.folderId,
        workspace: {
          projectId: input.projectId,
          ownerUserId,
        },
      },
      select: {
        id: true,
        systemKey: true,
        workspaceId: true,
        workspace: {
          select: { ownerUserId: true },
        },
      },
    }),
  );

  if (!folder) {
    throw new Error("Research folder not found.");
  }

  return {
    folder,
    access: getProjectResearchAccess(user, {
      projectId: input.projectId,
      workspaceId: folder.workspaceId,
      workspaceOwnerUserId: folder.workspace.ownerUserId,
      folderSystemKey: folder.systemKey,
      project,
    }),
  };
}

export async function assertResearchFolderReadAccess(
  user: Pick<PermissionUser, "id" | "role">,
  input: { projectId: string; folderId: string },
) {
  const result = await getResearchFolderAccess(user, input);

  if (!result.access.canRead) {
    throw new Error("You do not have permission to view this research folder.");
  }

  return result;
}

export async function assertResearchFolderWriteAccess(
  user: Pick<PermissionUser, "id" | "role">,
  input: { projectId: string; folderId: string },
) {
  const result = await getResearchFolderAccess(user, input);

  if (!result.access.canWrite) {
    throw new Error("This folder set is read-only for your account.");
  }

  return result;
}

export async function assertProjectResearchFileAccess(
  user: Pick<PermissionUser, "id" | "role">,
  attachmentId: string,
  mode: "read" | "write",
) {
  const association = await withPrismaRetry(() =>
    prisma.projectResearchFolderFile.findUnique({
      where: { attachmentId },
      select: {
        id: true,
        folderId: true,
        folder: {
          select: {
            workspace: { select: { projectId: true } },
          },
        },
      },
    }),
  );

  if (!association) {
    throw new Error("Research file not found.");
  }

  const result =
    mode === "write"
      ? await assertResearchFolderWriteAccess(user, {
          projectId: association.folder.workspace.projectId,
          folderId: association.folderId,
        })
      : await assertResearchFolderReadAccess(user, {
          projectId: association.folder.workspace.projectId,
          folderId: association.folderId,
        });

  return { association, ...result };
}

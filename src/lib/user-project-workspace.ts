import {
  AttachmentStatus,
  ProjectResearchFolderSystemKey,
  ProjectWorkflowStageKey,
  UserRole,
} from "@prisma/client";

import { hasPermission } from "@/lib/permissions/resolver";
import {
  buildAccessibleProjectsWhere,
  type ProjectAccessUser,
} from "@/lib/projects";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  deriveUserTaskDisplayState,
  type UserTaskDisplayState,
} from "@/lib/user-projects";

export type UserProjectWorkspaceData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    owner: { id: string; name: string } | null;
  };
  sharedFolders: Array<{
    key: "BRIEF" | "TECH";
    name: "Brief" | "Tech";
    folderId: string | null;
    fileCount: number;
    href: string | null;
  }>;
  myPrivateFolder: {
    id: string;
    href: string;
  } | null;
  classifiedFolders: Array<{
    key: string;
    ownerName: string;
    role: string;
  }>;
  assignedConcepts: Array<{
    id: string;
    name: string;
    href: string;
    dueAt: string | null;
    updatedAt: string;
    display: UserTaskDisplayState;
  }>;
};

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

const conceptStatusOrder: Record<UserTaskDisplayState["status"], number> = {
  NEEDS_ATTENTION: 0,
  IN_PROGRESS: 1,
  WAITING_FOR_REVIEW: 2,
  NOT_STARTED: 3,
  COMPLETED: 4,
};

export async function getUserProjectWorkspace(
  projectId: string,
  currentUser: ProjectAccessUser,
): Promise<UserProjectWorkspaceData | null> {
  if (
    currentUser.role !== UserRole.USER ||
    !hasPermission(currentUser, "project.list")
  ) {
    return null;
  }

  const project = await withPrismaRetry(() =>
    prisma.project.findFirst({
      where: {
        AND: [{ id: projectId }, buildAccessibleProjectsWhere(currentUser)],
      },
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            researchWorkspaces: {
              where: { projectId },
              take: 1,
              select: {
                folders: {
                  where: {
                    systemKey: {
                      in: [
                        ProjectResearchFolderSystemKey.BRIEF,
                        ProjectResearchFolderSystemKey.TECH,
                      ],
                    },
                  },
                  select: {
                    id: true,
                    systemKey: true,
                    _count: {
                      select: {
                        files: {
                          where: {
                            attachment: { status: AttachmentStatus.READY },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        coOwners: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        executors: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        collaborators: {
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
        privateFolders: {
          select: { id: true, ownerUserId: true },
        },
        conceptFolders: {
          where: { assignedExecutorId: currentUser.id },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            name: true,
            workflowStageKey: true,
            approvedAttachmentId: true,
            updatedAt: true,
            taskerStage: {
              select: {
                status: true,
                actualStartedAt: true,
                completedAt: true,
                plannedDueAt: true,
                updatedAt: true,
                revisions: {
                  orderBy: [
                    { updatedAt: "desc" },
                    { revisionNumber: "desc" },
                  ],
                  take: 1,
                  select: { status: true, updatedAt: true },
                },
              },
            },
          },
        },
      },
    }),
  );

  if (!project) return null;

  const canonicalFolders = project.owner?.researchWorkspaces[0]?.folders ?? [];
  const folderByKey = new Map(
    canonicalFolders.map((folder) => [folder.systemKey, folder] as const),
  );
  const sharedFolders = [
    {
      key: ProjectResearchFolderSystemKey.BRIEF,
      name: "Brief" as const,
    },
    {
      key: ProjectResearchFolderSystemKey.TECH,
      name: "Tech" as const,
    },
  ].map(({ key, name }) => {
    const folder = folderByKey.get(key);
    return {
      key,
      name,
      folderId: folder?.id ?? null,
      fileCount: folder?._count.files ?? 0,
      href: folder
        ? `/projects/${project.id}/workspace/shared/${folder.id}`
        : null,
    };
  });

  const participantById = new Map<
    string,
    { userId: string; name: string; role: string }
  >();
  if (project.owner) {
    participantById.set(project.owner.id, {
      userId: project.owner.id,
      name: displayName(project.owner),
      role: "Project Owner",
    });
  }
  for (const record of project.coOwners) {
    if (!participantById.has(record.userId)) {
      participantById.set(record.userId, {
        userId: record.userId,
        name: displayName(record.user),
        role: "Co-Owner",
      });
    }
  }
  for (const record of project.executors) {
    if (!participantById.has(record.userId)) {
      participantById.set(record.userId, {
        userId: record.userId,
        name: displayName(record.user),
        role: "Project Executor",
      });
    }
  }
  for (const record of project.collaborators) {
    if (!participantById.has(record.userId)) {
      participantById.set(record.userId, {
        userId: record.userId,
        name: displayName(record.user),
        role: "Project Participant",
      });
    }
  }

  const privateFolderByOwnerId = new Map(
    project.privateFolders.map((folder) => [folder.ownerUserId, folder] as const),
  );
  const ownPrivateFolder = privateFolderByOwnerId.get(currentUser.id);
  const classifiedFolders = [...participantById.values()]
    .filter(
      (participant) =>
        participant.userId !== currentUser.id &&
        privateFolderByOwnerId.has(participant.userId),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((participant, index) => ({
      key: `classified-${index + 1}`,
      ownerName: participant.name,
      role: participant.role,
    }));

  const assignedConcepts = project.conceptFolders
    .map((folder) => {
      const display = deriveUserTaskDisplayState(folder);
      const latestUpdatedAt = [
        folder.updatedAt,
        folder.taskerStage.updatedAt,
        folder.taskerStage.revisions[0]?.updatedAt,
      ].reduce<Date>((latest, value) =>
        value && value > latest ? value : latest,
      folder.updatedAt);
      const conceptNumber =
        folder.workflowStageKey === ProjectWorkflowStageKey.CONCEPT_CREATION
          ? 3
          : 4;

      return {
        id: folder.id,
        name: folder.name,
        href: `/projects/${project.id}/stages/${conceptNumber}/concepts/${folder.id}`,
        dueAt:
          display.status === "COMPLETED"
            ? null
            : folder.taskerStage.plannedDueAt?.toISOString() ?? null,
        updatedAt: latestUpdatedAt.toISOString(),
        display,
      };
    })
    .sort((left, right) => {
      const statusDifference =
        conceptStatusOrder[left.display.status] -
        conceptStatusOrder[right.display.status];
      return (
        statusDifference ||
        new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime() ||
        left.name.localeCompare(right.name)
      );
    });

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description?.trim() || null,
      owner: project.owner
        ? { id: project.owner.id, name: displayName(project.owner) }
        : null,
    },
    sharedFolders,
    myPrivateFolder: ownPrivateFolder
      ? {
          id: ownPrivateFolder.id,
          href: `/projects/${project.id}/workspace/private/${ownPrivateFolder.id}`,
        }
      : null,
    classifiedFolders,
    assignedConcepts,
  };
}

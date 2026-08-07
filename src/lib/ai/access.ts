import {
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { projectCollaboratorPermissionSelect } from "@/lib/project-collaborator-permissions";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { isProjectStatusCompleted } from "@/lib/project-statuses";

export const AI_PERMISSION_ERROR =
  "You do not have permission to use AI tools in this chat.";

export async function canUseChatAiTools(
  user: PermissionUser,
  input: {
    projectId?: string | null;
    stageId?: string | null;
  },
) {
  const projectId = input.projectId?.trim();

  if (!projectId) {
    return hasPermission(user, "chat.createComment");
  }

  const stageId = input.stageId?.trim();
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        ownerId: true,
        coOwners: { select: { userId: true } },
        executors: {
          select: {
            userId: true,
          },
        },
        status: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            group: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                isActive: true,
              },
            },
          },
        },
        collaborators: {
          select: projectCollaboratorPermissionSelect,
        },
        stages: {
          where: {
            id: stageId || "__stage_context_not_supplied__",
          },
          select: {
            id: true,
          },
        },
      },
    }),
  );

  if (!project || isProjectStatusCompleted(project.status)) {
    return false;
  }

  if (stageId && project.stages.length === 0) {
    return false;
  }

  return hasProjectPermission(user, project, "chat.createComment");
}

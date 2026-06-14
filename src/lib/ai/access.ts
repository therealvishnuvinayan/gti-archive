import {
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
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
  if (!hasPermission(user, "chat.createComment")) {
    return false;
  }

  const projectId = input.projectId?.trim();

  if (!projectId) {
    return true;
  }

  const stageId = input.stageId?.trim();
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        createdById: true,
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
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
          select: {
            userId: true,
          },
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

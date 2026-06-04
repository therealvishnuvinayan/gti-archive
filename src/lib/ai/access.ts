import { ProjectStatus } from "@prisma/client";

import {
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

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
        status: true,
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

  if (!project || project.status === ProjectStatus.COMPLETED) {
    return false;
  }

  if (stageId && project.stages.length === 0) {
    return false;
  }

  return hasProjectPermission(user, project, "chat.createComment");
}

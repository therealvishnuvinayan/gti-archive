import { UserRole, type ProjectWorkflowStageKey } from "@prisma/client";

import type { PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export type ConceptAccessContext = {
  folderId: string;
  projectId: string;
  taskerStageId: string;
  workflowStageKey: ProjectWorkflowStageKey;
  assignedExecutorId: string | null;
  ownerId: string | null;
  coOwnerIds: string[];
};

type ConceptAccessActor = Pick<PermissionUser, "id" | "role">;

export function canManageProjectConcept(
  user: ConceptAccessActor,
  context: ConceptAccessContext,
) {
  return (
    user.role === UserRole.SUPER_ADMIN ||
    context.ownerId === user.id ||
    context.coOwnerIds.includes(user.id)
  );
}

export function canViewProjectConcept(
  user: ConceptAccessActor,
  context: ConceptAccessContext,
) {
  return (
    canManageProjectConcept(user, context) ||
    context.assignedExecutorId === user.id
  );
}

export function canWorkOnProjectConcept(
  user: ConceptAccessActor,
  context: ConceptAccessContext,
) {
  return context.assignedExecutorId === user.id;
}

export function getProjectConceptParticipantUserIds(
  context: ConceptAccessContext,
  options: { excludeUserId?: string | null } = {},
) {
  return Array.from(
    new Set(
      [context.ownerId, ...context.coOwnerIds, context.assignedExecutorId].filter(
        (userId): userId is string =>
          Boolean(userId) && userId !== options.excludeUserId,
      ),
    ),
  );
}

const conceptAccessSelect = {
  id: true,
  projectId: true,
  taskerStageId: true,
  workflowStageKey: true,
  assignedExecutorId: true,
  project: {
    select: {
      ownerId: true,
      coOwners: { select: { userId: true } },
    },
  },
} as const;

function mapConceptAccessContext(record: {
  id: string;
  projectId: string;
  taskerStageId: string;
  workflowStageKey: ProjectWorkflowStageKey;
  assignedExecutorId: string | null;
  project: {
    ownerId: string | null;
    coOwners: Array<{ userId: string }>;
  };
}): ConceptAccessContext {
  return {
    folderId: record.id,
    projectId: record.projectId,
    taskerStageId: record.taskerStageId,
    workflowStageKey: record.workflowStageKey,
    assignedExecutorId: record.assignedExecutorId,
    ownerId: record.project.ownerId,
    coOwnerIds: record.project.coOwners.map((coOwner) => coOwner.userId),
  };
}

export async function getProjectConceptAccessContext(input: {
  projectId: string;
  folderId?: string;
  taskerStageId?: string;
}) {
  const record = await withPrismaRetry(() =>
    prisma.projectConceptFolder.findFirst({
      where: {
        projectId: input.projectId,
        ...(input.folderId ? { id: input.folderId } : {}),
        ...(input.taskerStageId ? { taskerStageId: input.taskerStageId } : {}),
      },
      select: conceptAccessSelect,
    }),
  );

  return record ? mapConceptAccessContext(record) : null;
}

export async function assertCanViewProjectConcept(
  user: ConceptAccessActor,
  input: { projectId: string; folderId?: string; taskerStageId?: string },
) {
  const context = await getProjectConceptAccessContext(input);

  if (!context || !canViewProjectConcept(user, context)) {
    throw new Error("You do not have access to this concept.");
  }

  return context;
}

export async function assertCanManageProjectConcept(
  user: ConceptAccessActor,
  input: { projectId: string; folderId?: string; taskerStageId?: string },
) {
  const context = await getProjectConceptAccessContext(input);

  if (!context || !canManageProjectConcept(user, context)) {
    throw new Error("You do not have permission to manage this concept.");
  }

  return context;
}

export async function assertCanWorkOnProjectConcept(
  user: ConceptAccessActor,
  input: { projectId: string; folderId?: string; taskerStageId?: string },
) {
  const context = await getProjectConceptAccessContext(input);

  if (!context || !canWorkOnProjectConcept(user, context)) {
    throw new Error("Only the assigned concept executor can perform this action.");
  }

  return context;
}

export async function assertConceptTaskerAccessIfNeeded(
  user: ConceptAccessActor,
  input: {
    projectId: string;
    stageId: string;
    mode?: "view" | "manage" | "work";
  },
) {
  const context = await getProjectConceptAccessContext({
    projectId: input.projectId,
    taskerStageId: input.stageId,
  });

  if (!context) {
    return null;
  }

  const allowed =
    input.mode === "manage"
      ? canManageProjectConcept(user, context)
      : input.mode === "work"
        ? canWorkOnProjectConcept(user, context)
        : canViewProjectConcept(user, context);

  if (!allowed) {
    throw new Error(
      input.mode === "work"
        ? "Only the assigned concept executor can perform this action."
        : "You do not have access to this concept.",
    );
  }

  return context;
}

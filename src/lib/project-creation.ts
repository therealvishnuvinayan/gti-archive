import { UserRole, type User } from "@prisma/client";

import {
  getCollaboratorTypeGroup,
  getDefaultProjectCollaboratorParticipantType,
  isProjectCollaboratorParticipantType,
} from "./project-collaborator-participant-types";
import { normalizeProjectCollaboratorPermissions } from "./project-collaborator-permissions";
import { prisma, withPrismaRetry } from "./prisma";
import { ensureProjectResearchWorkspaceTx } from "./project-research";
import { getInitialProjectWorkflowStageData } from "./project-workflow";

export type CreateProjectV2Input = {
  name: string;
  ownerId: string;
  coOwnerIds: string[];
  executorIds: string[];
  collaboratorIds?: string[];
};

export type CreateProjectV2FieldErrors = {
  name?: string;
  ownerId?: string;
  coOwnerIds?: string;
  executorIds?: string;
  collaboratorIds?: string;
};

export type CreateProjectV2Result =
  | {
      projectId: string;
    }
  | {
      error: string;
      fieldErrors?: CreateProjectV2FieldErrors;
    };

type ProjectCreator = Pick<User, "id">;

function normalizeIdList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function hasMalformedIds(values: unknown) {
  return (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !value.trim())
  );
}

function isValidIdList(values: unknown): values is string[] {
  return !hasMalformedIds(values);
}

export async function createProjectV2(
  creator: ProjectCreator,
  input: CreateProjectV2Input,
): Promise<CreateProjectV2Result> {
  const name = input.name.trim();
  const ownerId = input.ownerId.trim();
  const coOwnerIds = normalizeIdList(input.coOwnerIds);
  const executorIds = normalizeIdList(input.executorIds);
  const rawCollaboratorIds: unknown = input.collaboratorIds ?? [];
  const collaboratorIds = isValidIdList(rawCollaboratorIds)
    ? [...new Set(normalizeIdList(rawCollaboratorIds))]
    : [];
  const fieldErrors: CreateProjectV2FieldErrors = {};

  if (!name) {
    fieldErrors.name = "Project name is required.";
  }

  if (!ownerId) {
    fieldErrors.ownerId = "Select one project owner.";
  }

  if (hasDuplicates(coOwnerIds)) {
    fieldErrors.coOwnerIds = "A co-owner can only be selected once.";
  }

  if (ownerId && coOwnerIds.includes(ownerId)) {
    fieldErrors.coOwnerIds = "The project owner cannot also be a co-owner.";
  }

  if (executorIds.length === 0) {
    fieldErrors.executorIds = "Select at least one project executor.";
  } else if (hasDuplicates(executorIds)) {
    fieldErrors.executorIds = "An executor can only be selected once.";
  }

  if (hasMalformedIds(rawCollaboratorIds)) {
    fieldErrors.collaboratorIds =
      "Every collaborator selection must contain a valid user ID.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Review the highlighted fields.",
      fieldErrors,
    };
  }

  const participantIds = [
    ...new Set([ownerId, ...coOwnerIds, ...executorIds, ...collaboratorIds]),
  ];
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      where: {
        id: {
          in: participantIds,
        },
      },
      select: {
        id: true,
        role: true,
        collaboratorType: true,
      },
    }),
  );
  const userById = new Map(users.map((user) => [user.id, user] as const));
  const owner = userById.get(ownerId);

  if (!owner) {
    fieldErrors.ownerId = "The selected project owner no longer exists.";
  } else if (owner.role === UserRole.SUPER_ADMIN) {
    fieldErrors.ownerId = "Select an operational owner who is not a Super Admin.";
  }

  const invalidCoOwner = coOwnerIds.find((userId) => {
    const user = userById.get(userId);
    return !user || user.role === UserRole.SUPER_ADMIN;
  });

  if (invalidCoOwner) {
    fieldErrors.coOwnerIds =
      "Every co-owner must be an existing eligible user who is not a Super Admin.";
  }

  const invalidExecutor = executorIds.find(
    (userId) => userById.get(userId)?.role !== UserRole.COLLABORATOR,
  );

  if (invalidExecutor) {
    fieldErrors.executorIds =
      "Every executor must be an existing eligible collaborator.";
  }

  const invalidCollaborator = collaboratorIds.find(
    (userId) => userById.get(userId)?.role !== UserRole.COLLABORATOR,
  );

  if (invalidCollaborator) {
    fieldErrors.collaboratorIds =
      "Every project collaborator must be an existing eligible collaborator.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "One or more selected users are no longer eligible.",
      fieldErrors,
    };
  }

  const additionalCollaboratorIds = collaboratorIds.filter(
    (userId) => userId !== ownerId && !coOwnerIds.includes(userId),
  );
  const executorIdSet = new Set(executorIds);
  const membershipIds = [
    ...new Set([...executorIds, ...additionalCollaboratorIds]),
  ];
  const membershipUsers = membershipIds
    .map((userId) => userById.get(userId))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const createdProject = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          ownerId,
          createdById: creator.id,
          coOwners:
            coOwnerIds.length > 0
              ? {
                  createMany: {
                    data: coOwnerIds.map((userId) => ({
                      userId,
                      addedById: creator.id,
                    })),
                  },
                }
              : undefined,
          executors: {
            createMany: {
              data: executorIds.map((userId) => ({
                userId,
                addedById: creator.id,
              })),
            },
          },
          collaborators: {
            createMany: {
              data: membershipUsers.map((participant) => {
                const participantType = isProjectCollaboratorParticipantType(
                  participant.collaboratorType,
                )
                  ? participant.collaboratorType
                  : getDefaultProjectCollaboratorParticipantType(
                      getCollaboratorTypeGroup(participant.collaboratorType),
                    );

                return {
                  userId: participant.id,
                  addedById: creator.id,
                  participantType,
                  ...normalizeProjectCollaboratorPermissions(null, participantType, {
                    isExecutor: executorIdSet.has(participant.id),
                  }),
                };
              }),
              skipDuplicates: true,
            },
          },
          workflowStages: {
            createMany: {
              data: getInitialProjectWorkflowStageData(),
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      for (const participantId of participantIds) {
        await ensureProjectResearchWorkspaceTx(tx, project.id, participantId);
      }

      const ownerRecipientIds = [ownerId].filter((userId) => userId !== creator.id);
      const coOwnerRecipientIds = coOwnerIds.filter(
        (userId) => userId !== creator.id && !ownerRecipientIds.includes(userId),
      );
      const executorRecipientIds = executorIds.filter(
        (userId) =>
          userId !== creator.id &&
          !ownerRecipientIds.includes(userId) &&
          !coOwnerRecipientIds.includes(userId),
      );
      const collaboratorRecipientIds = additionalCollaboratorIds.filter(
        (userId) =>
          userId !== creator.id &&
          !ownerRecipientIds.includes(userId) &&
          !coOwnerRecipientIds.includes(userId) &&
          !executorRecipientIds.includes(userId),
      );
      const notificationUrl = `/projects/${project.id}`;
      const createdAt = new Date();

      if (ownerRecipientIds.length > 0) {
        await tx.notification.createMany({
          data: ownerRecipientIds.map((userId) => ({
            userId,
            type: "PROJECT_CREATED",
            title: "Project assigned to you",
            message: `You are the project owner for ${project.name}.`,
            entityType: "PROJECT",
            entityId: project.id,
            projectId: project.id,
            url: notificationUrl,
            createdAt,
            updatedAt: createdAt,
          })),
        });
      }

      if (coOwnerRecipientIds.length > 0) {
        await tx.notification.createMany({
          data: coOwnerRecipientIds.map((userId) => ({
            userId,
            type: "PROJECT_CREATED",
            title: "Project assigned to you",
            message: `You are a co-owner for ${project.name}.`,
            entityType: "PROJECT",
            entityId: project.id,
            projectId: project.id,
            url: notificationUrl,
            createdAt,
            updatedAt: createdAt,
          })),
        });
      }

      if (executorRecipientIds.length > 0) {
        await tx.notification.createMany({
          data: executorRecipientIds.map((userId) => ({
            userId,
            type: "PROJECT_ASSIGNED",
            title: "Project assigned to you",
            message: `You have been assigned as an executor for ${project.name}.`,
            entityType: "PROJECT",
            entityId: project.id,
            projectId: project.id,
            url: notificationUrl,
            createdAt,
            updatedAt: createdAt,
          })),
        });
      }

      if (collaboratorRecipientIds.length > 0) {
        await tx.notification.createMany({
          data: collaboratorRecipientIds.map((userId) => ({
            userId,
            type: "COLLABORATOR_ADDED",
            title: "Added to project",
            message: `You have been added to ${project.name}.`,
            entityType: "PROJECT",
            entityId: project.id,
            projectId: project.id,
            url: notificationUrl,
            createdAt,
            updatedAt: createdAt,
          })),
        });
      }

      return project;
    }, { timeout: 30_000 }),
  );

  return {
    projectId: createdProject.id,
  };
}

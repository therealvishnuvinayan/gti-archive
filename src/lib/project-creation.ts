import { runProjectMutation } from "@/lib/authorization/project-write";
import { UserRole, type User } from "@prisma/client";

import { resolveProjectTagIdsTx } from "./project-tag-assignments";
import { validateProjectTags } from "./project-tags";
import { normalizeProjectCollaboratorPermissions } from "./project-collaborator-permissions";
import { prisma, withPrismaRetry } from "./prisma";
import { ensureCanonicalProjectResearchWorkspaceTx } from "./project-research";
import { ensureProjectPrivateFolderTx } from "./project-private-folders";
import { getInitialProjectWorkflowStageData } from "./project-workflow";
import { isBusinessAdministratorRole } from "./user-role-compatibility";

export type CreateProjectV2Input = {
  name: string;
  tags: string[];
  ownerId: string;
  coOwnerIds: string[];
  executorIds: string[];
  collaboratorIds?: string[];
};

export type CreateProjectV2FieldErrors = {
  name?: string;
  tags?: string;
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

export type UpdateProjectV2Input = Omit<CreateProjectV2Input, "tags"> & {
  tags?: string[];
};

export type UpdateProjectV2Result = CreateProjectV2Result;

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

async function createProjectV2Implementation(
  creator: ProjectCreator,
  input: CreateProjectV2Input,
): Promise<CreateProjectV2Result> {
  const name = input.name.trim();
  const ownerId = creator.id;
  const coOwnerIds = normalizeIdList(input.coOwnerIds);
  const executorIds = normalizeIdList(input.executorIds);
  const rawCollaboratorIds: unknown = input.collaboratorIds ?? [];
  const collaboratorIds = isValidIdList(rawCollaboratorIds)
    ? [...new Set(normalizeIdList(rawCollaboratorIds))]
    : [];
  const fieldErrors: CreateProjectV2FieldErrors = {};

  const tagValidation = validateProjectTags(input.tags);
  if (tagValidation.error) fieldErrors.tags = tagValidation.error;

  if (!name) {
    fieldErrors.name = "Project name is required.";
  }

  if (hasDuplicates(coOwnerIds)) {
    fieldErrors.coOwnerIds = "A co-owner can only be selected once.";
  }

  if (ownerId && coOwnerIds.includes(ownerId)) {
    fieldErrors.coOwnerIds = "The project owner cannot also be a co-owner.";
  }

  if (hasDuplicates(executorIds)) {
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
        projectCreationAccessGranted: true,
      },
    }),
  );
  const userById = new Map(users.map((user) => [user.id, user] as const));
  const owner = userById.get(ownerId);

  if (!owner) {
    fieldErrors.ownerId = "The selected project owner no longer exists.";
  } else if (
    !isBusinessAdministratorRole(owner.role) &&
    !owner.projectCreationAccessGranted
  ) {
    fieldErrors.ownerId =
      "Only an Admin or a user granted Create Project access can own a new project.";
  }

  const invalidCoOwner = coOwnerIds.find((userId) => {
    const user = userById.get(userId);
    return !user || user.role !== UserRole.ADMIN;
  });

  if (invalidCoOwner) {
    fieldErrors.coOwnerIds =
      "Every co-owner must be an existing Admin user.";
  }

  const invalidExecutor = executorIds.find(
    (userId) => userById.get(userId)?.role !== UserRole.USER,
  );

  if (invalidExecutor) {
    fieldErrors.executorIds =
      "Every executor must be an existing User account.";
  }

  const invalidCollaborator = collaboratorIds.find(
    (userId) => userById.get(userId)?.role !== UserRole.USER,
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
      const tagIds = await resolveProjectTagIdsTx(tx, tagValidation.tags!);
      const project = await tx.project.create({
        data: {
          name,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
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
                return {
                  userId: participant.id,
                  addedById: creator.id,
                  ...normalizeProjectCollaboratorPermissions(null, {
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

      await ensureCanonicalProjectResearchWorkspaceTx(tx, project.id);
      for (const participantId of participantIds) {
        await ensureProjectPrivateFolderTx(tx, project.id, participantId);
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
      const notificationUrl = `/projects/${project.id}/stages/1`;
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

async function updateProjectV2Implementation(
  actor: ProjectCreator,
  projectId: string,
  input: UpdateProjectV2Input,
): Promise<UpdateProjectV2Result> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: {
    ownerId: true, coOwners: { select: { userId: true } }, executors: { select: { userId: true } }, collaborators: { select: { userId: true } },
  } });
  if (!project.ownerId || input.ownerId !== project.ownerId) return { error: "Ownership transfer requires a separate audited workflow." };
  if (!input.name?.trim() || !isValidIdList(input.coOwnerIds) || !isValidIdList(input.executorIds)) return { error: "Enter a name and valid participant IDs." };
  const coOwnerIds = normalizeIdList(input.coOwnerIds), executorIds = normalizeIdList(input.executorIds);
  if (hasDuplicates(coOwnerIds) || hasDuplicates(executorIds) || coOwnerIds.includes(project.ownerId)) return { error: "Participants must be unique and the owner cannot also be a co-owner." };
  const oldExecutors = new Set(project.executors.map(row => row.userId));
  const oldOwners = new Set([project.ownerId, ...project.coOwners.map(row => row.userId)]);
  const compatibilityIds = project.collaborators.filter(row => !oldExecutors.has(row.userId) && !oldOwners.has(row.userId)).map(row => row.userId).sort();
  if (input.collaboratorIds && JSON.stringify([...new Set(input.collaboratorIds)].sort()) !== JSON.stringify(compatibilityIds)) return { error: "Collaborator changes are disabled. Use Co-owners and Executors." };
  const roles = await prisma.userAuthorization.findMany({ where: { userId: { in: [...new Set([project.ownerId, ...coOwnerIds, ...executorIds])] } }, select: { userId: true, businessRole: true, accountStatus: true } });
  const byId = new Map(roles.map(row => [row.userId, row]));
  if (coOwnerIds.some(id => byId.get(id)?.accountStatus !== "ACTIVE" || !["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(byId.get(id)?.businessRole ?? ""))) return { error: "Co-owners must be active Senior or Junior Project Managers." };
  if (executorIds.some(id => byId.get(id)?.accountStatus !== "ACTIVE" || !byId.get(id)?.businessRole)) return { error: "Executors must have an active business role." };
  if (byId.get(project.ownerId)?.businessRole === "JUNIOR_PROJECT_MANAGER" && !coOwnerIds.some(id => byId.get(id)?.businessRole === "SENIOR_PROJECT_MANAGER")) return { error: "A Junior Project Manager's project must retain a Senior Project Manager co-owner." };
  const tags = input.tags === undefined ? undefined : validateProjectTags(input.tags);
  if (tags?.error) return { error: tags.error };
  return prisma.$transaction(async tx => {
    const removed = project.executors.filter(row => !executorIds.includes(row.userId)).map(row => row.userId);
    if (removed.length) await tx.projectConceptFolder.updateMany({ where: { projectId, assignedExecutorId: { in: removed } }, data: { assignedExecutorId: null } });
    const tagIds = tags?.tags ? await resolveProjectTagIdsTx(tx, tags.tags) : undefined;
    await tx.project.update({ where: { id: projectId }, data: { name: input.name.trim(), ...(tagIds ? { tags: { deleteMany: {}, create: tagIds.map(tagId => ({ tagId })) } } : {}) } });
    await tx.projectCoOwner.deleteMany({ where: { projectId, userId: { notIn: coOwnerIds } } });
    await tx.projectCoOwner.createMany({ data: coOwnerIds.map(userId => ({ projectId, userId, addedById: actor.id })), skipDuplicates: true });
    await tx.projectExecutor.deleteMany({ where: { projectId, userId: { notIn: executorIds } } });
    await tx.projectExecutor.createMany({ data: executorIds.map(userId => ({ projectId, userId, addedById: actor.id })), skipDuplicates: true });
    // Remove mirrored legacy executor grants when execution is revoked. Existing
    // non-executor compatibility relationships are retained without new grants.
    if (removed.length) await tx.projectCollaborator.deleteMany({ where: { projectId, userId: { in: removed } } });
    for (const userId of [project.ownerId!, ...coOwnerIds, ...executorIds]) await ensureProjectPrivateFolderTx(tx, projectId, userId);
    return { projectId };
  });
}

export async function updateProjectV2(
  actor: ProjectCreator,
  projectId: string,
  input: UpdateProjectV2Input,
): Promise<UpdateProjectV2Result> {
  return runProjectMutation(actor, "updateProjectV2", { kind: "structured", id: projectId }, async (trustedUser) =>
    updateProjectV2Implementation(trustedUser, projectId, input), input);
}

export async function createProjectV2(
  creator: ProjectCreator,
  input: CreateProjectV2Input,
): Promise<CreateProjectV2Result> {
  return runProjectMutation(creator, "createProjectV2", { kind: "structured", id: "creation" }, async (trustedUser) =>
    createProjectV2Implementation(trustedUser, input), input);
}

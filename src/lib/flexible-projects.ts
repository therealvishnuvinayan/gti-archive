import { randomUUID } from "node:crypto";

import {
  FlexibleMilestoneStatus,
  FlexibleProjectStatus,
  Prisma,
  ProjectExecutionType,
  ProjectPriority,
  type User,
} from "@prisma/client";

import { canCreateProjects, canUseProjects, hasPermission, isGlobalProjectAdministrator, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { compareProjectsByPriority } from "@/lib/project-priority";
import { sanitizeRichText } from "@/lib/rich-text";

export const FLEXIBLE_PROJECTS_CACHE_TAG = "flexible-projects";

const FLEXIBLE_PROJECT_PRIORITIES = new Set<ProjectPriority>([
  ProjectPriority.HIGH,
  ProjectPriority.MEDIUM,
  ProjectPriority.LOW,
]);
const FLEXIBLE_PROJECT_SCOPES = new Set<ProjectExecutionType>([
  ProjectExecutionType.INTERNAL,
  ProjectExecutionType.EXTERNAL,
]);
const NAME_MAX_LENGTH = 160;
const CATEGORY_MAX_LENGTH = 80;
const NOTE_MAX_LENGTH = 2_000;

export type FlexibleProjectUserOption = {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  avatarSrc: string | null;
};

export type FlexibleProjectListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: FlexibleProjectStatus;
  priority: ProjectPriority;
  scope: ProjectExecutionType;
  deadline: string | null;
  owner: { id: string; name: string };
  completedMilestones: number;
  totalMilestones: number;
  progress: number;
};

export type FlexibleMilestoneRecord = {
  id: string;
  order: number;
  name: string;
  description: string;
  category: string;
  responsibleUser: { id: string; name: string } | null;
  deadline: string | null;
  status: FlexibleMilestoneStatus;
  completedAt: string | null;
  attachments: FlexibleMilestoneAttachmentRecord[];
  notes: FlexibleMilestoneNoteRecord[];
};

export type FlexibleMilestoneAttachmentRecord = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
};

export type FlexibleMilestoneNoteRecord = {
  id: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  canDelete: boolean;
};

export type FlexibleProjectDetailRecord = FlexibleProjectListItem & {
  collaboratorIds: string[];
  collaborators: Array<{ id: string; name: string; email: string }>;
  milestones: FlexibleMilestoneRecord[];
  participantOptions: FlexibleProjectUserOption[];
  canManageProject: boolean;
  canManageMilestones: boolean;
  canUploadAttachments: boolean;
  canDeleteAttachments: boolean;
};

export type FlexibleProjectInput = {
  name: string;
  description?: string;
  ownerId: string;
  collaboratorIds: string[];
  deadline?: string;
  priority: ProjectPriority;
  scope: ProjectExecutionType;
};

export type FlexibleProjectFieldErrors = Partial<
  Record<
    "name" | "description" | "ownerId" | "collaboratorIds" | "deadline" | "priority" | "scope",
    string
  >
>;

export type FlexibleProjectMutationResult =
  | { projectId: string; slug: string }
  | { error: string; fieldErrors?: FlexibleProjectFieldErrors };

export type FlexibleMilestoneInput = {
  name: string;
  description?: string;
  category?: string;
  responsibleUserId?: string;
  deadline?: string;
};

export type FlexibleMilestoneFieldErrors = Partial<
  Record<"name" | "description" | "category" | "responsibleUserId" | "deadline", string>
>;

export type FlexibleMilestoneMutationResult =
  | { milestoneId: string }
  | { error: string; fieldErrors?: FlexibleMilestoneFieldErrors };

export type FlexibleMilestoneNoteInput = {
  content: string;
};

export type FlexibleMilestoneNoteFieldErrors = Partial<Record<"content", string>>;

export type FlexibleMilestoneNoteMutationResult =
  | { noteId: string }
  | { error: string; fieldErrors?: FlexibleMilestoneNoteFieldErrors };

type FlexibleProjectAccessContext = {
  ownerId: string;
  collaborators: Array<{ userId: string }>;
};

type ParsedProjectInput = {
  data?: {
    name: string;
    description: string | null;
    ownerId: string;
    collaboratorIds: string[];
    deadline: Date | null;
    priority: ProjectPriority;
    scope: ProjectExecutionType;
  };
  fieldErrors: FlexibleProjectFieldErrors;
};

type ParsedMilestoneInput = {
  data?: {
    name: string;
    description: string | null;
    category: string | null;
    responsibleUserId: string | null;
    deadline: Date | null;
  };
  fieldErrors: FlexibleMilestoneFieldErrors;
};

function getFallbackName(email: string) {
  const [localPart] = email.split("@");
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getUserName(user: { name: string | null; email: string }) {
  return user.name?.trim() || getFallbackName(user.email);
}

function parseOptionalDate(value: string | undefined, fieldErrors: { deadline?: string }) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    fieldErrors.deadline = "Enter a valid deadline.";
    return null;
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    fieldErrors.deadline = "Enter a valid deadline.";
    return null;
  }
  return date;
}

function normalizeIdList(values: unknown) {
  if (!Array.isArray(values)) return null;
  const normalized = values.map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  if (normalized.some((value) => !value)) return null;
  return normalized;
}

function parseProjectInput(input: FlexibleProjectInput): ParsedProjectInput {
  const fieldErrors: FlexibleProjectFieldErrors = {};
  const name = input.name?.trim() ?? "";
  const description = sanitizeRichText(input.description);
  const collaboratorIds = normalizeIdList(input.collaboratorIds);
  const ownerId = input.ownerId?.trim() ?? "";
  const deadline = parseOptionalDate(input.deadline, fieldErrors);

  if (!name) fieldErrors.name = "Project name is required.";
  else if (name.length > NAME_MAX_LENGTH) fieldErrors.name = `Project name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  if (!ownerId) fieldErrors.ownerId = "Select a project owner.";
  if (!collaboratorIds) fieldErrors.collaboratorIds = "Every collaborator must contain a valid user ID.";
  else if (new Set(collaboratorIds).size !== collaboratorIds.length) fieldErrors.collaboratorIds = "A collaborator can only be selected once.";
  else if (collaboratorIds.includes(ownerId)) fieldErrors.collaboratorIds = "The owner cannot also be a collaborator.";
  if (!FLEXIBLE_PROJECT_PRIORITIES.has(input.priority)) fieldErrors.priority = "Select a valid priority.";
  if (!FLEXIBLE_PROJECT_SCOPES.has(input.scope)) fieldErrors.scope = "Select a valid project scope.";

  return Object.keys(fieldErrors).length
    ? { fieldErrors }
    : {
        fieldErrors,
        data: {
          name,
          description: description || null,
          ownerId,
          collaboratorIds: collaboratorIds ?? [],
          deadline,
          priority: input.priority,
          scope: input.scope,
        },
      };
}

function parseMilestoneInput(input: FlexibleMilestoneInput): ParsedMilestoneInput {
  const fieldErrors: FlexibleMilestoneFieldErrors = {};
  const name = input.name?.trim() ?? "";
  const description = sanitizeRichText(input.description);
  const category = input.category?.trim() ?? "";
  const responsibleUserId = input.responsibleUserId?.trim() ?? "";
  const deadline = parseOptionalDate(input.deadline, fieldErrors);

  if (!name) fieldErrors.name = "Milestone name is required.";
  else if (name.length > NAME_MAX_LENGTH) fieldErrors.name = `Milestone name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  if (category.length > CATEGORY_MAX_LENGTH) fieldErrors.category = `Category must be ${CATEGORY_MAX_LENGTH} characters or fewer.`;

  return Object.keys(fieldErrors).length
    ? { fieldErrors }
    : {
        fieldErrors,
        data: {
          name,
          description: description || null,
          category: category || null,
          responsibleUserId: responsibleUserId || null,
          deadline,
        },
      };
}

function buildSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "project";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export function getFlexibleProjectAccessWhere(user: PermissionUser): Prisma.FlexibleProjectWhereInput {
  if (!canUseProjects(user)) return { id: "__permission_denied__" };
  if (isGlobalProjectAdministrator(user)) return {};
  return {
    OR: [
      { ownerId: user.id },
      { collaborators: { some: { userId: user.id } } },
    ],
  };
}

export function hasFlexibleProjectAccess(
  user: PermissionUser,
  project: FlexibleProjectAccessContext,
) {
  return (
    canUseProjects(user) &&
    (isGlobalProjectAdministrator(user) ||
      project.ownerId === user.id ||
      project.collaborators.some((collaborator) => collaborator.userId === user.id))
  );
}

export function canManageFlexibleProject(
  user: PermissionUser,
  project: FlexibleProjectAccessContext,
) {
  if (!hasFlexibleProjectAccess(user, project)) return false;
  if (isGlobalProjectAdministrator(user)) return hasPermission(user, "project.update");
  return project.ownerId === user.id && (hasPermission(user, "project.update") || canCreateProjects(user));
}

export function canManageFlexibleMilestones(
  user: PermissionUser,
  project: FlexibleProjectAccessContext,
) {
  return (
    hasFlexibleProjectAccess(user, project) &&
    (hasPermission(user, "stage.submitWork") ||
      hasPermission(user, "stage.updateTimeline") ||
      hasPermission(user, "project.update"))
  );
}

export function canUploadFlexibleMilestoneAttachments(
  user: PermissionUser,
  project: FlexibleProjectAccessContext,
) {
  return (
    hasFlexibleProjectAccess(user, project) &&
    (hasPermission(user, "file.uploadAttachment") ||
      canManageFlexibleProject(user, project))
  );
}

export function calculateFlexibleProjectProgress(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, completed) / total) * 100);
}

function mapProjectSummary(project: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: FlexibleProjectStatus;
  priority: ProjectPriority;
  scope: ProjectExecutionType;
  deadline: Date | null;
  owner: { id: string; name: string | null; email: string };
  milestones: Array<{ status: FlexibleMilestoneStatus }>;
}): FlexibleProjectListItem {
  const totalMilestones = project.milestones.length;
  const completedMilestones = project.milestones.filter(
    (milestone) => milestone.status === FlexibleMilestoneStatus.COMPLETED,
  ).length;
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    priority: project.priority,
    scope: project.scope,
    deadline: project.deadline?.toISOString() ?? null,
    owner: { id: project.owner.id, name: getUserName(project.owner) },
    completedMilestones,
    totalMilestones,
    progress: calculateFlexibleProjectProgress(completedMilestones, totalMilestones),
  };
}

export async function getFlexibleProjectUserOptions(): Promise<FlexibleProjectUserOption[]> {
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    }),
  );
  return users.map((user) => ({
    id: user.id,
    name: getUserName(user),
    email: user.email,
    role: user.role,
    avatarSrc: user.avatarUrl
      ? `/api/users/${encodeURIComponent(user.id)}/avatar?v=${encodeURIComponent(user.avatarUrl)}`
      : null,
  }));
}

export async function getFlexibleProjectsList(user: PermissionUser) {
  const projects = await withPrismaRetry(() =>
    prisma.flexibleProject.findMany({
      where: getFlexibleProjectAccessWhere(user),
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        status: true,
        priority: true,
        updatedAt: true,
        scope: true,
        deadline: true,
        owner: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        milestones: { select: { status: true } },
      },
    }),
  );
  return projects
    .sort((left, right) =>
      compareProjectsByPriority(
        {
          id: left.id,
          name: left.name,
          priority: left.priority,
          isCompleted: left.status === FlexibleProjectStatus.COMPLETED,
          updatedAt: left.updatedAt,
        },
        {
          id: right.id,
          name: right.name,
          priority: right.priority,
          isCompleted: right.status === FlexibleProjectStatus.COMPLETED,
          updatedAt: right.updatedAt,
        },
      ),
    )
    .map(mapProjectSummary);
}

export async function getFlexibleProjectDetail(slug: string, user: PermissionUser) {
  const project = await withPrismaRetry(() =>
    prisma.flexibleProject.findFirst({
      where: { slug, AND: getFlexibleProjectAccessWhere(user) },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        status: true,
        priority: true,
        scope: true,
        deadline: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        collaborators: {
          orderBy: { createdAt: "asc" },
          select: { userId: true, user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
        },
        milestones: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            sortOrder: true,
            name: true,
            description: true,
            category: true,
            deadline: true,
            status: true,
            completedAt: true,
            responsibleUser: { select: { id: true, name: true, email: true } },
            attachments: {
              where: { status: "READY" },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
                uploadedBy: { select: { id: true, name: true, email: true } },
              },
            },
            notes: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                content: true,
                createdAt: true,
                author: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  );
  if (!project) return null;

  const accessContext = {
    ownerId: project.ownerId,
    collaborators: project.collaborators.map(({ userId }) => ({ userId })),
  };
  const summary = mapProjectSummary(project);
  const participantUsers = [project.owner, ...project.collaborators.map(({ user: collaborator }) => collaborator)];
  const participantOptions = [...new Map(participantUsers.map((participant) => [participant.id, participant])).values()].map(
    (participant) => ({
      id: participant.id,
      name: getUserName(participant),
      email: participant.email,
      role: participant.role,
      avatarSrc: participant.avatarUrl
        ? `/api/users/${encodeURIComponent(participant.id)}/avatar?v=${encodeURIComponent(participant.avatarUrl)}`
      : null,
    }),
  );
  const canManageProjectAccess = canManageFlexibleProject(user, accessContext);
  const canManageMilestoneAccess = canManageFlexibleMilestones(user, accessContext);

  return {
    ...summary,
    collaboratorIds: project.collaborators.map(({ userId }) => userId),
    collaborators: project.collaborators.map(({ user: collaborator }) => ({
      id: collaborator.id,
      name: getUserName(collaborator),
      email: collaborator.email,
    })),
    milestones: project.milestones.map((milestone) => ({
      id: milestone.id,
      order: milestone.sortOrder,
      name: milestone.name,
      description: milestone.description ?? "",
      category: milestone.category ?? "Standard",
      responsibleUser: milestone.responsibleUser
        ? { id: milestone.responsibleUser.id, name: getUserName(milestone.responsibleUser) }
        : null,
      deadline: milestone.deadline?.toISOString() ?? null,
      status: milestone.status,
      completedAt: milestone.completedAt?.toISOString() ?? null,
      attachments: milestone.attachments.map((attachment) => ({
        id: attachment.id,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        uploadedBy: { id: attachment.uploadedBy.id, name: getUserName(attachment.uploadedBy) },
        createdAt: attachment.createdAt.toISOString(),
      })),
      notes: milestone.notes.map((note) => ({
        id: note.id,
        content: note.content,
        author: { id: note.author.id, name: getUserName(note.author) },
        createdAt: note.createdAt.toISOString(),
        canDelete:
          canManageMilestoneAccess &&
          (note.author.id === user.id || canManageProjectAccess),
      })),
    })),
    participantOptions,
    canManageProject: canManageProjectAccess,
    canManageMilestones: canManageMilestoneAccess,
    canUploadAttachments: canUploadFlexibleMilestoneAttachments(user, accessContext),
    canDeleteAttachments:
      canManageProjectAccess && hasPermission(user, "file.delete"),
  } satisfies FlexibleProjectDetailRecord;
}

export async function getFlexibleMilestoneDetail(
  projectSlug: string,
  milestoneId: string,
  user: PermissionUser,
) {
  const project = await getFlexibleProjectDetail(projectSlug, user);
  if (!project) return null;
  const milestone = project.milestones.find((item) => item.id === milestoneId);
  return milestone ? { project, milestone } : null;
}

async function validateProjectUsers(ownerId: string, collaboratorIds: string[]) {
  const requestedIds = [...new Set([ownerId, ...collaboratorIds])];
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({ where: { id: { in: requestedIds } }, select: { id: true } }),
  );
  const existingIds = new Set(users.map(({ id }) => id));
  const fieldErrors: FlexibleProjectFieldErrors = {};
  if (!existingIds.has(ownerId)) fieldErrors.ownerId = "The selected owner no longer exists.";
  if (collaboratorIds.some((id) => !existingIds.has(id))) fieldErrors.collaboratorIds = "One or more selected collaborators no longer exist.";
  return fieldErrors;
}

export async function createFlexibleProject(
  actor: PermissionUser,
  input: FlexibleProjectInput,
): Promise<FlexibleProjectMutationResult> {
  if (!canUseProjects(actor) || !canCreateProjects(actor)) return { error: "You are not allowed to create projects." };
  const parsed = parseProjectInput(input);
  if (!parsed.data) return { error: "Review the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const fieldErrors = await validateProjectUsers(parsed.data.ownerId, parsed.data.collaboratorIds);
  if (Object.keys(fieldErrors).length) return { error: "One or more selected users are no longer available.", fieldErrors };

  const project = await withPrismaRetry(() =>
    prisma.flexibleProject.create({
      data: {
        slug: buildSlug(parsed.data!.name),
        name: parsed.data!.name,
        description: parsed.data!.description,
        priority: parsed.data!.priority,
        scope: parsed.data!.scope,
        deadline: parsed.data!.deadline,
        ownerId: parsed.data!.ownerId,
        createdById: actor.id,
        collaborators: parsed.data!.collaboratorIds.length
          ? { createMany: { data: parsed.data!.collaboratorIds.map((userId) => ({ userId, addedById: actor.id })) } }
          : undefined,
      },
      select: { id: true, slug: true },
    }),
  );
  return { projectId: project.id, slug: project.slug };
}

async function loadProjectAccessContext(projectId: string) {
  return withPrismaRetry(() =>
    prisma.flexibleProject.findUnique({
      where: { id: projectId },
      select: { id: true, slug: true, ownerId: true, collaborators: { select: { userId: true } } },
    }),
  );
}

export async function updateFlexibleProject(
  actor: PermissionUser,
  projectId: string,
  input: FlexibleProjectInput,
): Promise<FlexibleProjectMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleProject(actor, project)) return { error: "You are not allowed to edit this Flexible Project." };
  const parsed = parseProjectInput(input);
  if (!parsed.data) return { error: "Review the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const fieldErrors = await validateProjectUsers(parsed.data.ownerId, parsed.data.collaboratorIds);
  if (Object.keys(fieldErrors).length) return { error: "One or more selected users are no longer available.", fieldErrors };

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.flexibleProject.update({
        where: { id: project.id },
        data: {
          name: parsed.data!.name,
          description: parsed.data!.description,
          priority: parsed.data!.priority,
          scope: parsed.data!.scope,
          deadline: parsed.data!.deadline,
          ownerId: parsed.data!.ownerId,
        },
      });
      await tx.flexibleProjectCollaborator.deleteMany({ where: { projectId: project.id } });
      if (parsed.data!.collaboratorIds.length) {
        await tx.flexibleProjectCollaborator.createMany({
          data: parsed.data!.collaboratorIds.map((userId) => ({ projectId: project.id, userId, addedById: actor.id })),
        });
      }
    }),
  );
  return { projectId: project.id, slug: project.slug };
}

async function lockFlexibleProject(tx: Prisma.TransactionClient, projectId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "FlexibleProject" WHERE "id" = ${projectId} FOR UPDATE`,
  );
  if (!rows.length) throw new Error("FLEXIBLE_PROJECT_NOT_FOUND");
}

async function syncFlexibleProjectStatus(tx: Prisma.TransactionClient, projectId: string) {
  const [total, completed] = await Promise.all([
    tx.flexibleMilestone.count({ where: { projectId } }),
    tx.flexibleMilestone.count({ where: { projectId, status: FlexibleMilestoneStatus.COMPLETED } }),
  ]);
  const isCompleted = total > 0 && completed === total;
  await tx.flexibleProject.update({
    where: { id: projectId },
    data: {
      status: isCompleted ? FlexibleProjectStatus.COMPLETED : FlexibleProjectStatus.ACTIVE,
      completedAt: isCompleted ? new Date() : null,
    },
  });
}

async function orderingTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 3): Promise<T> {
  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempts > 1) {
      return orderingTransaction(operation, attempts - 1);
    }
    throw error;
  }
}

async function validateResponsibleUser(
  tx: Prisma.TransactionClient,
  projectId: string,
  responsibleUserId: string | null,
) {
  if (!responsibleUserId) return true;
  const project = await tx.flexibleProject.findUnique({
    where: { id: projectId },
    select: { ownerId: true, collaborators: { where: { userId: responsibleUserId }, select: { userId: true } } },
  });
  return Boolean(project && (project.ownerId === responsibleUserId || project.collaborators.length));
}

export async function createFlexibleMilestone(
  actor: PermissionUser,
  projectId: string,
  input: FlexibleMilestoneInput,
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  const parsed = parseMilestoneInput(input);
  if (!parsed.data) return { error: "Review the highlighted fields.", fieldErrors: parsed.fieldErrors };

  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    if (!(await validateResponsibleUser(tx, projectId, parsed.data!.responsibleUserId))) {
      return { error: "The responsible user must be the owner or a project collaborator.", fieldErrors: { responsibleUserId: "Select a user associated with this project." } };
    }
    const aggregate = await tx.flexibleMilestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const milestone = await tx.flexibleMilestone.create({
      data: { projectId, ...parsed.data!, sortOrder: (aggregate._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    });
    await syncFlexibleProjectStatus(tx, projectId);
    return { milestoneId: milestone.id };
  });
}

export async function updateFlexibleMilestone(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
  input: FlexibleMilestoneInput,
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  const parsed = parseMilestoneInput(input);
  if (!parsed.data) return { error: "Review the highlighted fields.", fieldErrors: parsed.fieldErrors };

  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    const milestone = await tx.flexibleMilestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true } });
    if (!milestone) return { error: "Milestone not found." };
    if (!(await validateResponsibleUser(tx, projectId, parsed.data!.responsibleUserId))) {
      return { error: "The responsible user must be the owner or a project collaborator.", fieldErrors: { responsibleUserId: "Select a user associated with this project." } };
    }
    await tx.flexibleMilestone.update({ where: { id: milestone.id }, data: parsed.data! });
    return { milestoneId: milestone.id };
  });
}

export async function createFlexibleMilestoneNote(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
  input: FlexibleMilestoneNoteInput,
): Promise<FlexibleMilestoneNoteMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) {
    return { error: "You are not allowed to add notes to this milestone." };
  }

  const content = input.content?.trim() ?? "";
  if (!content) {
    return { error: "Enter a note before saving.", fieldErrors: { content: "Note is required." } };
  }
  if (content.length > NOTE_MAX_LENGTH) {
    return {
      error: "The note is too long.",
      fieldErrors: { content: `Note must be ${NOTE_MAX_LENGTH.toLocaleString()} characters or fewer.` },
    };
  }

  const milestone = await withPrismaRetry(() =>
    prisma.flexibleMilestone.findFirst({
      where: { id: milestoneId, projectId },
      select: { id: true },
    }),
  );
  if (!milestone) return { error: "Milestone not found." };

  const note = await withPrismaRetry(() =>
    prisma.flexibleMilestoneNote.create({
      data: { milestoneId: milestone.id, authorId: actor.id, content },
      select: { id: true },
    }),
  );
  return { noteId: note.id };
}

export async function deleteFlexibleMilestoneNote(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
  noteId: string,
): Promise<FlexibleMilestoneNoteMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) {
    return { error: "You are not allowed to delete notes from this milestone." };
  }

  const note = await withPrismaRetry(() =>
    prisma.flexibleMilestoneNote.findFirst({
      where: { id: noteId, milestoneId, milestone: { projectId } },
      select: { id: true, authorId: true },
    }),
  );
  if (!note) return { error: "Note not found." };
  if (note.authorId !== actor.id && !canManageFlexibleProject(actor, project)) {
    return { error: "You can only delete notes that you added." };
  }

  await withPrismaRetry(() =>
    prisma.flexibleMilestoneNote.delete({ where: { id: note.id } }),
  );
  return { noteId: note.id };
}

export async function setFlexibleMilestoneCompleted(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
  completed: boolean,
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    const updated = await tx.flexibleMilestone.updateMany({
      where: { id: milestoneId, projectId },
      data: {
        status: completed ? FlexibleMilestoneStatus.COMPLETED : FlexibleMilestoneStatus.PENDING,
        completedAt: completed ? new Date() : null,
        completedById: completed ? actor.id : null,
      },
    });
    if (!updated.count) return { error: "Milestone not found." };
    await syncFlexibleProjectStatus(tx, projectId);
    return { milestoneId };
  });
}

export async function moveFlexibleMilestone(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
  direction: "up" | "down",
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    const milestones = await tx.flexibleMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
    const index = milestones.findIndex(({ id }) => id === milestoneId);
    const destinationIndex = index + (direction === "up" ? -1 : 1);
    if (index < 0) return { error: "Milestone not found." };
    if (destinationIndex < 0 || destinationIndex >= milestones.length) return { error: `This milestone cannot move ${direction}.` };
    const current = milestones[index];
    const destination = milestones[destinationIndex];
    const temporaryOrder = -(milestones.length + 1);
    await tx.flexibleMilestone.update({ where: { id: current.id }, data: { sortOrder: temporaryOrder } });
    await tx.flexibleMilestone.update({ where: { id: destination.id }, data: { sortOrder: current.sortOrder } });
    await tx.flexibleMilestone.update({ where: { id: current.id }, data: { sortOrder: destination.sortOrder } });
    return { milestoneId };
  });
}

export async function duplicateFlexibleMilestone(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    const original = await tx.flexibleMilestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!original) return { error: "Milestone not found." };
    const maxOrder = await tx.flexibleMilestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const offset = (maxOrder._max.sortOrder ?? 0) + 1000;
    await tx.flexibleMilestone.updateMany({ where: { projectId, sortOrder: { gt: original.sortOrder } }, data: { sortOrder: { increment: offset } } });
    await tx.flexibleMilestone.updateMany({ where: { projectId, sortOrder: { gt: original.sortOrder + offset } }, data: { sortOrder: { decrement: offset - 1 } } });
    const copy = await tx.flexibleMilestone.create({
      data: {
        projectId,
        name: `${original.name} Copy`.slice(0, NAME_MAX_LENGTH),
        description: original.description,
        category: original.category,
        responsibleUserId: original.responsibleUserId,
        deadline: original.deadline,
        sortOrder: original.sortOrder + 1,
        status: FlexibleMilestoneStatus.PENDING,
        completedAt: null,
        completedById: null,
      },
      select: { id: true },
    });
    await syncFlexibleProjectStatus(tx, projectId);
    return { milestoneId: copy.id };
  });
}

export async function deleteFlexibleMilestone(
  actor: PermissionUser,
  projectId: string,
  milestoneId: string,
): Promise<FlexibleMilestoneMutationResult> {
  const project = await loadProjectAccessContext(projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canManageFlexibleMilestones(actor, project)) return { error: "You are not allowed to manage this project's milestones." };
  return orderingTransaction(async (tx) => {
    await lockFlexibleProject(tx, projectId);
    const milestone = await tx.flexibleMilestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true, sortOrder: true } });
    if (!milestone) return { error: "Milestone not found." };
    await tx.flexibleMilestone.delete({ where: { id: milestone.id } });
    await tx.flexibleMilestone.updateMany({ where: { projectId, sortOrder: { gt: milestone.sortOrder } }, data: { sortOrder: { decrement: 1 } } });
    await syncFlexibleProjectStatus(tx, projectId);
    return { milestoneId };
  });
}

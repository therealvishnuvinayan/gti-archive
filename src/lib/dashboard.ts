import { ProjectExecutorRole, ProjectStatus, type User } from "@prisma/client";

import { getRecentNotificationsForUser } from "@/lib/notification-center/service";
import { workflowNotificationTypes } from "@/lib/notification-center/presenter";
import { buildAccessibleProjectsWhere, getDashboardProjectCounts, getRecentProjects } from "@/lib/projects";
import { hasPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type DashboardUser = Pick<User, "id" | "role"> & PermissionUser;

type DashboardProjectRecord = {
  id: string;
  name: string;
  status: ProjectStatus;
  stageCount: number;
  currentStageName: string | null;
  endDate: Date;
  updatedAt: Date;
  createdById: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  executorUserId: string | null;
  executorUser: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  executors: Array<{
    role: ProjectExecutorRole;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  collaborators: Array<{
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  stages: Array<{
    id: string;
    name: string;
    status: ProjectStatus;
    plannedDueAt: Date | null;
    order: number;
  }>;
};

type DashboardStageRecord = {
  id: string;
  name: string;
  status: ProjectStatus;
  plannedDueAt: Date | null;
  order: number;
};

export type DashboardUpdateRecord = {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "success" | "warning";
  href?: string;
};

export type DashboardReminderRecord = {
  headline: string;
  project: string;
  actionHref: string;
  actionLabel: string;
};

export type DashboardCollaboratorRecord = {
  name: string;
  task: string;
  project: string;
  href?: string;
};

export type DashboardProgressRecord = {
  percentage: number;
  subtitle: string;
  segments: ReadonlyArray<{
    label: string;
    value: number;
    tone: "completed" | "progress" | "pending";
  }>;
};

export type DashboardDeadlineRecord = {
  project: string;
  detail: string;
  timeLabel: string;
  actionHref: string;
  overdue: boolean;
};

export type DashboardSnapshot = {
  counts: Awaited<ReturnType<typeof getDashboardProjectCounts>>;
  recentProjects: Awaited<ReturnType<typeof getRecentProjects>>;
  updates: DashboardUpdateRecord[];
  reminder: DashboardReminderRecord | null;
  collaborators: DashboardCollaboratorRecord[];
  progress: DashboardProgressRecord;
  deadline: DashboardDeadlineRecord | null;
};

function getDisplayName(person: { name: string | null; email: string }) {
  return person.name?.trim() || person.email;
}

function getExecutorRoleLabel(role: ProjectExecutorRole) {
  return role === ProjectExecutorRole.MAIN_EXECUTOR ? "Main Executor" : "Executor";
}

function buildSyntheticStages(project: DashboardProjectRecord): DashboardStageRecord[] {
  return Array.from({ length: Math.max(project.stageCount, 1) }, (_, index) => ({
    id: `${project.id}-stage-${index + 1}`,
    name:
      index === 0
        ? project.currentStageName?.trim() || `Stage ${index + 1}`
        : `Stage ${index + 1}`,
    status: index === 0 ? project.status : ProjectStatus.PENDING,
    plannedDueAt: project.endDate,
    order: index + 1,
  }));
}

function getProjectStages(project: DashboardProjectRecord) {
  if (project.stages.length > 0) {
    return [...project.stages].sort((left, right) => left.order - right.order);
  }

  return buildSyntheticStages(project);
}

function formatTimeDistance(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const overdue = diffMs < 0;
  const absoluteMs = Math.abs(diffMs);
  const totalHours = Math.floor(absoluteMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((absoluteMs % 3_600_000) / 60_000);

  const segments: string[] = [];

  if (days > 0) {
    segments.push(`${days}d`);
  }
  if (hours > 0 || segments.length === 0) {
    segments.push(`${hours}h`);
  }
  if (days === 0 && minutes > 0) {
    segments.push(`${minutes}m`);
  }

  return {
    overdue,
    label: overdue
      ? `Overdue by ${segments.join(" ")}`
      : `Due in ${segments.join(" ")}`,
  };
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "No date set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function mapNotificationTone(visualKind: string): DashboardUpdateRecord["tone"] {
  switch (visualKind) {
    case "revision-rejected":
    case "submission-pending":
    case "approval-required":
    case "copyright-transfer":
      return "critical";
    case "revision-approved":
    case "archive-created":
    case "approval-received":
    case "invoice-uploaded":
    case "stage-completed":
      return "success";
    default:
      return "warning";
  }
}

function buildReminderFromProjects(projects: DashboardProjectRecord[]): DashboardReminderRecord | null {
  const now = Date.now();

  const candidate = projects
    .flatMap((project) =>
      getProjectStages(project)
        .filter(
          (stage) =>
            stage.status !== ProjectStatus.COMPLETED &&
            stage.plannedDueAt,
        )
        .map((stage) => ({
          projectId: project.id,
          projectName: project.name,
          stageName: stage.name,
          dueAt: stage.plannedDueAt as Date,
        })),
    )
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())
    .find((item) => item.dueAt.getTime() - now <= 3 * 24 * 60 * 60 * 1000);

  if (!candidate) {
    return null;
  }

  const { overdue, label } = formatTimeDistance(candidate.dueAt);

  return {
    headline: overdue
      ? `${candidate.stageName} is overdue`
      : `${candidate.stageName} needs attention`,
    project: `${candidate.projectName} • ${label}`,
    actionHref: `/projects/${candidate.projectId}`,
    actionLabel: "Take Action",
  };
}

function buildCollaborationItems(
  projects: DashboardProjectRecord[],
  currentUser: DashboardUser,
): DashboardCollaboratorRecord[] {
  const activeProjects = projects.filter((project) => project.status !== ProjectStatus.COMPLETED);
  const seen = new Set<string>();
  const items: DashboardCollaboratorRecord[] = [];

  for (const project of activeProjects) {
    const people = [
      {
        id: project.createdBy.id,
        name: getDisplayName(project.createdBy),
        task: "Project Owner",
      },
      ...(project.executorUser
        ? [
            {
              id: project.executorUser.id,
              name: getDisplayName(project.executorUser),
              task: "Main Executor",
            },
          ]
        : []),
      ...project.executors
        .map((assignment) => ({
          id: assignment.user.id,
          name: getDisplayName(assignment.user),
          task: getExecutorRoleLabel(assignment.role),
        }))
        .sort((left, right) => {
          if (left.task !== right.task) {
            return left.task === "Main Executor" ? -1 : 1;
          }

          return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        }),
      ...project.collaborators.map((assignment) => ({
        id: assignment.user.id,
        name: getDisplayName(assignment.user),
        task: "Collaborator",
      })),
    ];

    for (const person of people) {
      if (person.id === currentUser.id || seen.has(person.id)) {
        continue;
      }

      seen.add(person.id);
      items.push({
        name: person.name,
        task: person.task,
        project: project.name,
        href: `/projects/${project.id}`,
      });

      if (items.length >= 5) {
        return items;
      }
    }
  }

  return items;
}

function buildProgressRecord(projects: DashboardProjectRecord[]): DashboardProgressRecord {
  const counts = {
    completed: 0,
    progress: 0,
    pending: 0,
  };

  for (const project of projects) {
    for (const stage of getProjectStages(project)) {
      if (stage.status === ProjectStatus.COMPLETED) {
        counts.completed += 1;
      } else if (stage.status === ProjectStatus.PENDING) {
        counts.pending += 1;
      } else {
        counts.progress += 1;
      }
    }
  }

  const total = counts.completed + counts.progress + counts.pending;
  const percentage = total > 0 ? Math.round((counts.completed / total) * 100) : 0;
  const toPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return {
    percentage,
    subtitle: total > 0 ? "Stages Completed" : "No stage progress yet",
    segments: [
      { label: `Completed (${counts.completed})`, value: toPercent(counts.completed), tone: "completed" },
      { label: `In Progress (${counts.progress})`, value: toPercent(counts.progress), tone: "progress" },
      { label: `Pending (${counts.pending})`, value: toPercent(counts.pending), tone: "pending" },
    ],
  };
}

function buildDeadlineRecord(projects: DashboardProjectRecord[]): DashboardDeadlineRecord | null {
  const candidates = projects.flatMap((project) => {
    const stages = getProjectStages(project)
      .filter(
        (stage) =>
          stage.status !== ProjectStatus.COMPLETED && stage.plannedDueAt,
      )
      .map((stage) => ({
        projectId: project.id,
        projectName: project.name,
        detail: `${stage.name} • ${formatDateTime(stage.plannedDueAt)}`,
        dueAt: stage.plannedDueAt as Date,
      }));

    if (stages.length > 0) {
      return stages;
    }

    if (project.status === ProjectStatus.COMPLETED) {
      return [];
    }

    return [
      {
        projectId: project.id,
        projectName: project.name,
        detail: `Project deadline • ${formatDateTime(project.endDate)}`,
        dueAt: project.endDate,
      },
    ];
  });

  const nearest = candidates.sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0];

  if (!nearest) {
    return null;
  }

  const { overdue, label } = formatTimeDistance(nearest.dueAt);

  return {
    project: nearest.projectName,
    detail: nearest.detail,
    timeLabel: label,
    actionHref: `/projects/${nearest.projectId}`,
    overdue,
  };
}

export async function getDashboardSnapshot(
  currentUser: DashboardUser,
): Promise<DashboardSnapshot> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);

  const canViewProjectCounts = hasPermission(currentUser, "dashboard.viewProjectCounts");
  const canViewRecentProjects = hasPermission(currentUser, "dashboard.viewRecentProjects");
  const [counts, recentProjects, projects, recentNotifications, unreadWorkflowNotification] =
    await Promise.all([
      canViewProjectCounts
        ? getDashboardProjectCounts(currentUser)
        : Promise.resolve({
            total: 0,
            ongoing: 0,
            onHold: 0,
            pending: 0,
            completed: 0,
          }),
      canViewRecentProjects
        ? getRecentProjects(5, currentUser)
        : Promise.resolve([]),
      withPrismaRetry(() =>
        prisma.project.findMany({
          where: accessibleWhere,
          orderBy: {
            updatedAt: "desc",
          },
          take: 24,
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            executorUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            executors: {
              select: {
                role: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            collaborators: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            stages: {
              select: {
                id: true,
                name: true,
                status: true,
                plannedDueAt: true,
                order: true,
              },
            },
          },
        }),
      ),
      getRecentNotificationsForUser(currentUser.id, 4),
      withPrismaRetry(() =>
        prisma.notification.findFirst({
          where: {
            userId: currentUser.id,
            isRead: false,
            type: {
              in: [...workflowNotificationTypes],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            title: true,
            message: true,
            url: true,
            projectId: true,
            stageId: true,
          },
        }),
      ),
    ]);

  const updates = recentNotifications.notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    detail: notification.description,
    tone: mapNotificationTone(notification.visualKind),
    href: notification.targetHref,
  }));

  const fallbackReminder = buildReminderFromProjects(projects);
  const reminder =
    unreadWorkflowNotification
      ? {
          headline: unreadWorkflowNotification.title,
          project: unreadWorkflowNotification.message,
          actionHref:
            unreadWorkflowNotification.url ||
            (unreadWorkflowNotification.projectId
              ? unreadWorkflowNotification.stageId
                ? `/projects/${unreadWorkflowNotification.projectId}/chat?stage=${unreadWorkflowNotification.stageId}`
                : `/projects/${unreadWorkflowNotification.projectId}`
              : "/notifications"),
          actionLabel: "Take Action",
        }
      : fallbackReminder;

  return {
    counts,
    recentProjects,
    updates,
    reminder,
    collaborators: buildCollaborationItems(projects, currentUser),
    progress: buildProgressRecord(projects),
    deadline: buildDeadlineRecord(projects),
  };
}

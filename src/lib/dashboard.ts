import {
  CalendarEventType,
  ProjectExecutorRole,
  ProjectStatus,
  UserRole,
  type Prisma,
  type User,
} from "@prisma/client";

import { getCalendarAccessState } from "@/lib/calendar";
import { getRecentNotificationsForUser } from "@/lib/notification-center/service";
import {
  buildAccessibleProjectsWhere,
  getDashboardProjectCounts,
  getRecentProjects,
  type DashboardProjectCounts,
} from "@/lib/projects";
import { hasPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type DashboardUser = Pick<User, "id" | "role" | "calendarAccess"> & PermissionUser;

type DashboardCollaborationProjectRecord = {
  id: string;
  name: string;
  status: ProjectStatus;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
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
};

type DashboardCalendarReminderRecord = {
  id: string;
  title: string;
  details: string | null;
  startAt: Date;
};

type DashboardDeadlineCandidate = {
  projectName: string;
  detail: string;
  dueAt: Date;
  actionHref: string;
};

export type DashboardUpdateRecord = {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "success" | "warning";
  href?: string;
};

export type DashboardReminderRecord = {
  id: string;
  headline: string;
  detail: string;
  context?: string;
  dateTimeLabel: string;
  statusLabel?: string;
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
    count: number;
    tone: "ongoing" | "pending" | "onHold" | "completed";
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
  reminders: DashboardReminderRecord[];
  collaborators: DashboardCollaboratorRecord[];
  progress: DashboardProgressRecord;
  deadlines: DashboardDeadlineRecord[];
};

function getDisplayName(person: { name: string | null; email: string }) {
  return person.name?.trim() || person.email;
}

function getExecutorRoleLabel(role: ProjectExecutorRole) {
  return role === ProjectExecutorRole.MAIN_EXECUTOR ? "Main Executor" : "Executor";
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

function toDashboardDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function mapDashboardReminder(
  event: DashboardCalendarReminderRecord,
): DashboardReminderRecord {
  const isOverdue = event.startAt.getTime() < Date.now();
  const dateKey = toDashboardDateKey(event.startAt);

  return {
    id: event.id,
    headline: event.title,
    detail: event.details || "Calendar reminder",
    context: "Calendar",
    dateTimeLabel: formatDateTime(event.startAt),
    statusLabel: isOverdue ? "Overdue" : undefined,
    actionHref: `/calendar?view=day&date=${dateKey}&event=${event.id}`,
    actionLabel: "View Reminder",
  };
}

const emptyDashboardCounts: DashboardProjectCounts = {
  total: 0,
  ongoing: 0,
  onHold: 0,
  pending: 0,
  completed: 0,
};

export async function getDashboardCounts(
  currentUser: DashboardUser,
): Promise<DashboardProjectCounts> {
  if (!hasPermission(currentUser, "dashboard.viewProjectCounts")) {
    return emptyDashboardCounts;
  }

  return getDashboardProjectCounts(currentUser);
}

export async function getDashboardUpdates(
  currentUser: DashboardUser,
  limit = 4,
): Promise<DashboardUpdateRecord[]> {
  if (!hasPermission(currentUser, "notification.view")) {
    return [];
  }

  const recentNotifications = await getRecentNotificationsForUser(currentUser.id, limit);

  return recentNotifications.notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    detail: notification.description,
    tone: mapNotificationTone(notification.visualKind),
    href: notification.targetHref,
  }));
}

export async function getDashboardReminders(
  currentUser: DashboardUser,
  limit = 8,
): Promise<DashboardReminderRecord[]> {
  if (!hasPermission(currentUser, "calendar.view")) {
    return [];
  }

  const access =
    currentUser.role === UserRole.SUPER_ADMIN || currentUser.role === UserRole.ADMIN
      ? { canViewSharedSchedule: true }
      : await getCalendarAccessState(currentUser);
  const now = new Date();
  const baseWhere: Prisma.CalendarEventWhereInput = {
    type: CalendarEventType.REMINDERS,
    ...(access.canViewSharedSchedule ? {} : { createdById: currentUser.id }),
  };

  const [future, overdue] = await withPrismaRetry(() =>
    Promise.all([
      prisma.calendarEvent.findMany({
        where: {
          ...baseWhere,
          startAt: {
            gte: now,
          },
        },
        orderBy: {
          startAt: "asc",
        },
        take: limit,
        select: {
          id: true,
          title: true,
          details: true,
          startAt: true,
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          ...baseWhere,
          startAt: {
            lt: now,
          },
        },
        orderBy: {
          startAt: "desc",
        },
        take: limit,
        select: {
          id: true,
          title: true,
          details: true,
          startAt: true,
        },
      }),
    ]),
  );

  return [...future, ...overdue].slice(0, limit).map(mapDashboardReminder);
}

function buildCollaborationItems(
  projects: DashboardCollaborationProjectRecord[],
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

export function buildProgressRecord(counts: DashboardProjectCounts): DashboardProgressRecord {
  const activeTotal = counts.ongoing + counts.pending + counts.onHold;
  const total = counts.total;
  const toPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return {
    percentage: toPercent(activeTotal),
    subtitle: total > 0 ? "Projects currently active" : "No projects yet.",
    segments: [
      { label: "Ongoing", value: toPercent(counts.ongoing), count: counts.ongoing, tone: "ongoing" },
      { label: "Pending", value: toPercent(counts.pending), count: counts.pending, tone: "pending" },
      { label: "On Hold", value: toPercent(counts.onHold), count: counts.onHold, tone: "onHold" },
      { label: "Completed", value: toPercent(counts.completed), count: counts.completed, tone: "completed" },
    ],
  };
}

function buildDeadlineRecords(
  candidates: DashboardDeadlineCandidate[],
  limit = 8,
): DashboardDeadlineRecord[] {
  const now = Date.now();
  return candidates
    .sort((left, right) => {
      const leftOverdue = left.dueAt.getTime() < now;
      const rightOverdue = right.dueAt.getTime() < now;

      if (leftOverdue !== rightOverdue) {
        return leftOverdue ? -1 : 1;
      }

      return left.dueAt.getTime() - right.dueAt.getTime();
    })
    .slice(0, limit)
    .map((deadline) => {
      const { overdue, label } = formatTimeDistance(deadline.dueAt);

      return {
        project: deadline.projectName,
        detail: deadline.detail,
        timeLabel: label,
        actionHref: deadline.actionHref,
        overdue,
      };
    });
}

function withAccessibleProjectScope(
  accessibleWhere: Prisma.ProjectWhereInput,
  ...clauses: Prisma.ProjectWhereInput[]
): Prisma.ProjectWhereInput {
  return {
    AND: [accessibleWhere, ...clauses],
  };
}

export async function getDashboardCollaboration(
  currentUser: DashboardUser,
): Promise<DashboardCollaboratorRecord[]> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const projects = await withPrismaRetry(() =>
    prisma.project.findMany({
      where: withAccessibleProjectScope(accessibleWhere, {
        status: {
          not: ProjectStatus.COMPLETED,
        },
      }),
      orderBy: {
        updatedAt: "desc",
      },
      take: 12,
      select: {
        id: true,
        name: true,
        status: true,
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
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
  );

  return buildCollaborationItems(projects, currentUser);
}

export async function getDashboardDeadlines(
  currentUser: DashboardUser,
  limit = 8,
): Promise<DashboardDeadlineRecord[]> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const activeProjectWhere = withAccessibleProjectScope(accessibleWhere, {
    status: {
      not: ProjectStatus.COMPLETED,
    },
  });
  const stageDeadlines = await withPrismaRetry(() =>
    prisma.projectStage.findMany({
      where: {
        status: {
          not: ProjectStatus.COMPLETED,
        },
        plannedDueAt: {
          not: null,
        },
        project: {
          is: activeProjectWhere,
        },
      },
      orderBy: {
        plannedDueAt: "asc",
      },
      take: Math.max(limit * 2, limit),
      select: {
        id: true,
        name: true,
        plannedDueAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  );
  const projectIdsWithStageDeadlines = [
    ...new Set(stageDeadlines.map((stage) => stage.project.id)),
  ];
  const projectFallbackWhere = withAccessibleProjectScope(
    accessibleWhere,
    {
      status: {
        not: ProjectStatus.COMPLETED,
      },
    },
    ...(projectIdsWithStageDeadlines.length > 0
      ? [{ id: { notIn: projectIdsWithStageDeadlines } }]
      : []),
  );
  const fallbackProjects = await withPrismaRetry(() =>
    prisma.project.findMany({
      where: projectFallbackWhere,
      orderBy: {
        endDate: "asc",
      },
      take: limit,
      select: {
        id: true,
        name: true,
        endDate: true,
      },
    }),
  );
  const candidates: DashboardDeadlineCandidate[] = [
    ...stageDeadlines.map((stage) => ({
      projectName: stage.project.name,
      detail: `${stage.name} • ${formatDateTime(stage.plannedDueAt)}`,
      dueAt: stage.plannedDueAt as Date,
      actionHref: `/projects/${stage.project.id}/chat?stage=${stage.id}`,
    })),
    ...fallbackProjects.map((project) => ({
      projectName: project.name,
      detail: `Project deadline • ${formatDateTime(project.endDate)}`,
      dueAt: project.endDate,
      actionHref: `/projects/${project.id}`,
    })),
  ];

  return buildDeadlineRecords(candidates, limit);
}

export async function getDashboardSnapshot(
  currentUser: DashboardUser,
): Promise<DashboardSnapshot> {
  const canViewRecentProjects = hasPermission(currentUser, "dashboard.viewRecentProjects");
  const [counts, recentProjects, updates, reminders, collaborators, deadlines] =
    await Promise.all([
      getDashboardCounts(currentUser),
      canViewRecentProjects ? getRecentProjects(5, currentUser) : Promise.resolve([]),
      getDashboardUpdates(currentUser),
      getDashboardReminders(currentUser),
      getDashboardCollaboration(currentUser),
      getDashboardDeadlines(currentUser),
    ]);

  return {
    counts,
    recentProjects,
    updates,
    reminders,
    collaborators,
    progress: buildProgressRecord(counts),
    deadlines,
  };
}

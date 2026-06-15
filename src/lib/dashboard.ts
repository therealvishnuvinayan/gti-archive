import {
  CalendarEventType,
  ProjectExecutorRole,
  ProjectStatus,
  UserRole,
  type Prisma,
  type User,
} from "@prisma/client";

import { getCalendarAccessState } from "@/lib/calendar";
import { mapNotificationToView } from "@/lib/notification-center/presenter";
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

type DashboardNotificationCandidate = {
  id: string;
  type: Parameters<typeof mapNotificationToView>[0]["type"];
  title: string;
  message: string;
  url: string | null;
  isRead: boolean;
  createdAt: Date;
  projectId: string | null;
  stageId: string | null;
};

type ProjectUrlTarget = {
  projectId: string;
  stageId: string | null;
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

function pluralizeDurationUnit(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function formatReadableDuration(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.floor(milliseconds / 60_000));
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const segments = [pluralizeDurationUnit(years, "year")];

    if (months > 0) {
      segments.push(pluralizeDurationUnit(months, "month"));
    }

    return segments.join(", ");
  }

  if (totalDays >= 60) {
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const segments = [pluralizeDurationUnit(months, "month")];

    if (days > 0) {
      segments.push(pluralizeDurationUnit(days, "day"));
    }

    return segments.join(", ");
  }

  if (totalDays > 0) {
    const hours = totalHours % 24;
    const segments = [pluralizeDurationUnit(totalDays, "day")];

    if (hours > 0) {
      segments.push(pluralizeDurationUnit(hours, "hour"));
    }

    return segments.join(", ");
  }

  if (totalHours > 0) {
    const minutes = totalMinutes % 60;
    const segments = [pluralizeDurationUnit(totalHours, "hour")];

    if (minutes > 0) {
      segments.push(pluralizeDurationUnit(minutes, "minute"));
    }

    return segments.join(", ");
  }

  return pluralizeDurationUnit(totalMinutes, "minute");
}

function formatTimeDistance(target: Date) {
  const diffMs = target.getTime() - Date.now();
  const overdue = diffMs < 0;
  const duration = formatReadableDuration(Math.abs(diffMs));

  return {
    overdue,
    label: overdue ? `Overdue by ${duration}` : `Due in ${duration}`,
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

function parseProjectUrlTarget(url: string | null): ProjectUrlTarget | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url, "http://gti.local");
    const segments = parsedUrl.pathname.split("/").filter(Boolean);

    if (segments[0] !== "projects" || !segments[1]) {
      return null;
    }

    return {
      projectId: decodeURIComponent(segments[1]),
      stageId: parsedUrl.searchParams.get("stage"),
    };
  } catch {
    return null;
  }
}

function getNotificationProjectTarget(
  notification: DashboardNotificationCandidate,
): ProjectUrlTarget | null {
  const urlTarget = parseProjectUrlTarget(notification.url);
  const projectId = notification.projectId ?? urlTarget?.projectId ?? null;
  const stageId = notification.stageId ?? urlTarget?.stageId ?? null;

  if (!projectId) {
    return null;
  }

  return {
    projectId,
    stageId,
  };
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

  const candidates = await withPrismaRetry(() =>
    prisma.notification.findMany({
      where: {
        userId: currentUser.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Math.max(limit * 10, 20),
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        url: true,
        isRead: true,
        createdAt: true,
        projectId: true,
        stageId: true,
      },
    }),
  );
  const targets = candidates.map(getNotificationProjectTarget);
  const projectIds = [
    ...new Set(targets.map((target) => target?.projectId).filter(Boolean)),
  ] as string[];
  const stageIds = [
    ...new Set(targets.map((target) => target?.stageId).filter(Boolean)),
  ] as string[];
  const accessibleProjects =
    projectIds.length > 0
      ? await withPrismaRetry(() =>
          prisma.project.findMany({
            where: {
              AND: [
                buildAccessibleProjectsWhere(currentUser),
                {
                  id: {
                    in: projectIds,
                  },
                },
              ],
            },
            select: {
              id: true,
            },
          }),
        )
      : [];
  const accessibleProjectIds = new Set(accessibleProjects.map((project) => project.id));
  const validStageIds =
    stageIds.length > 0
      ? new Set(
          (
            await withPrismaRetry(() =>
              prisma.projectStage.findMany({
                where: {
                  id: {
                    in: stageIds,
                  },
                  projectId: {
                    in: [...accessibleProjectIds],
                  },
                },
                select: {
                  id: true,
                },
              }),
            )
          ).map((stage) => stage.id),
        )
      : new Set<string>();

  return candidates
    .filter((notification) => {
      const target = getNotificationProjectTarget(notification);

      if (!target) {
        return true;
      }

      if (!accessibleProjectIds.has(target.projectId)) {
        return false;
      }

      return !target.stageId || validStageIds.has(target.stageId);
    })
    .slice(0, limit)
    .map((notification) => {
      const view = mapNotificationToView(notification);

      return {
        id: view.id,
        title: view.title,
        detail: view.description,
        tone: mapNotificationTone(view.visualKind),
        href: view.targetHref,
      };
    });
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

import { ProjectExecutorRole, ProjectStatus, type User } from "@prisma/client";

import { getCalendarEvents, type CalendarEventRecord } from "@/lib/calendar";
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

function getCalendarEventStart(event: CalendarEventRecord) {
  return new Date(`${event.date}T${event.start}:00`);
}

function formatCalendarReminderDate(event: CalendarEventRecord) {
  const startsAt = getCalendarEventStart(event);

  if (Number.isNaN(startsAt.getTime())) {
    return `${event.date} ${event.start}`;
  }

  return formatDateTime(startsAt);
}

function mapDashboardReminder(event: CalendarEventRecord): DashboardReminderRecord {
  const startsAt = getCalendarEventStart(event);
  const isOverdue = !Number.isNaN(startsAt.getTime()) && startsAt.getTime() < Date.now();

  return {
    id: event.id,
    headline: event.title,
    detail: event.details || "Calendar reminder",
    context: "Calendar",
    dateTimeLabel: formatCalendarReminderDate(event),
    statusLabel: isOverdue ? "Overdue" : undefined,
    actionHref: `/calendar?view=day&date=${event.date}&event=${event.id}`,
    actionLabel: "View Reminder",
  };
}

async function getDashboardCalendarReminders(
  currentUser: DashboardUser,
  limit = 8,
): Promise<DashboardReminderRecord[]> {
  if (!hasPermission(currentUser, "calendar.view")) {
    return [];
  }

  const now = Date.now();
  const reminders = (await getCalendarEvents(currentUser))
    .filter((event) => event.calendar === "Reminders")
    .map((event) => ({
      event,
      startsAt: getCalendarEventStart(event),
    }));

  const future = reminders
    .filter(({ startsAt }) => !Number.isNaN(startsAt.getTime()) && startsAt.getTime() >= now)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const overdue = reminders
    .filter(({ startsAt }) => Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now)
    .sort((left, right) => right.startsAt.getTime() - left.startsAt.getTime());

  return [...future, ...overdue].slice(0, limit).map(({ event }) => mapDashboardReminder(event));
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

function buildProgressRecord(counts: DashboardProjectCounts): DashboardProgressRecord {
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

function buildDeadlineRecords(projects: DashboardProjectRecord[]): DashboardDeadlineRecord[] {
  const candidates = projects.flatMap((project) => {
    const stages = getProjectStages(project)
      .filter(
        (stage) =>
          stage.status !== ProjectStatus.COMPLETED && stage.plannedDueAt,
      )
      .map((stage) => ({
        projectName: project.name,
        detail: `${stage.name} • ${formatDateTime(stage.plannedDueAt)}`,
        dueAt: stage.plannedDueAt as Date,
        actionHref: `/projects/${project.id}/chat?stage=${stage.id}`,
      }));

    if (stages.length > 0) {
      return stages;
    }

    if (project.status === ProjectStatus.COMPLETED) {
      return [];
    }

    return [
      {
        projectName: project.name,
        detail: `Project deadline • ${formatDateTime(project.endDate)}`,
        dueAt: project.endDate,
        actionHref: `/projects/${project.id}`,
      },
    ];
  });

  return candidates
    .sort((left, right) => {
      const leftOverdue = left.dueAt.getTime() < Date.now();
      const rightOverdue = right.dueAt.getTime() < Date.now();

      if (leftOverdue !== rightOverdue) {
        return leftOverdue ? -1 : 1;
      }

      return left.dueAt.getTime() - right.dueAt.getTime();
    })
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

export async function getDashboardSnapshot(
  currentUser: DashboardUser,
): Promise<DashboardSnapshot> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);

  const canViewProjectCounts = hasPermission(currentUser, "dashboard.viewProjectCounts");
  const canViewRecentProjects = hasPermission(currentUser, "dashboard.viewRecentProjects");
  const [counts, recentProjects, projects, recentNotifications, reminders] =
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
      getDashboardCalendarReminders(currentUser),
    ]);

  const updates = recentNotifications.notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    detail: notification.description,
    tone: mapNotificationTone(notification.visualKind),
    href: notification.targetHref,
  }));

  return {
    counts,
    recentProjects,
    updates,
    reminders,
    collaborators: buildCollaborationItems(projects, currentUser),
    progress: buildProgressRecord(counts),
    deadlines: buildDeadlineRecords(projects),
  };
}

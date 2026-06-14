import { unstable_cache } from "next/cache";
import type {
  CalendarEvent,
  CalendarEventTone,
  CalendarEventType,
  User,
} from "@prisma/client";
import { UserRole } from "@prisma/client";

import { CALENDAR_COLLABORATORS_CACHE_TAG } from "@/lib/collaboration";
import {
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const CALENDAR_CACHE_TAG = "calendar-events";

export type CalendarTypeLabel = "Projects" | "Events" | "Reminders" | "Payments";
export type EventToneLabel = "green" | "purple" | "blue" | "amber";

export type CalendarEventRecord = {
  id: string;
  title: string;
  details: string;
  date: string;
  start: string;
  end: string;
  calendar: CalendarTypeLabel;
  tone: EventToneLabel;
  canDelete: boolean;
  createdByName?: string;
  createdByEmail?: string;
};

export type SaveCalendarEventInput = {
  title: string;
  details: string;
  date: string;
  start: string;
  end: string;
  calendar: CalendarTypeLabel;
  tone: EventToneLabel;
};

export type CalendarEventValidationResult =
  | { error: string }
  | {
      data: {
        title: string;
        details: string | null;
        startAt: Date;
        endAt: Date;
        type: CalendarEventType;
        tone: CalendarEventTone;
      };
    };

export type CreateCalendarEventResult =
  | { error: string }
  | { event: CalendarEventRecord };
export type DeleteCalendarEventResult =
  | { error: string }
  | { success: true; deletedEventId: string };

export type CalendarView = "month" | "week" | "day";
export type CalendarAccessState = {
  canManageCollaborators: boolean;
  canViewSharedSchedule: boolean;
};
export type CalendarAccessUser = Pick<User, "id" | "role"> & PermissionUser;

type CalendarEventWithCreator = CalendarEvent & {
  createdBy?: Pick<User, "name" | "email"> | null;
};

const calendarTypeMap: Record<CalendarTypeLabel, CalendarEventType> = {
  Projects: "PROJECTS",
  Events: "EVENTS",
  Reminders: "REMINDERS",
  Payments: "PAYMENTS",
};

const eventToneMap: Record<EventToneLabel, CalendarEventTone> = {
  green: "GREEN",
  purple: "PURPLE",
  blue: "BLUE",
  amber: "AMBER",
};

const reverseCalendarTypeMap: Record<CalendarEventType, CalendarTypeLabel> = {
  PROJECTS: "Projects",
  EVENTS: "Events",
  REMINDERS: "Reminders",
  PAYMENTS: "Payments",
};

const reverseEventToneMap: Record<CalendarEventTone, EventToneLabel> = {
  GREEN: "green",
  PURPLE: "purple",
  BLUE: "blue",
  AMBER: "amber",
};

function toCalendarDate(date: Date | string | number) {
  return date instanceof Date ? date : new Date(date);
}

function toDateKey(date: Date | string | number) {
  const normalizedDate = toCalendarDate(date);

  const year = normalizedDate.getFullYear();
  const month = `${normalizedDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${normalizedDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(date: Date | string | number) {
  const normalizedDate = toCalendarDate(date);

  const hours = `${normalizedDate.getHours()}`.padStart(2, "0");
  const minutes = `${normalizedDate.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function canDeleteCalendarEvent(
  event: Pick<CalendarEvent, "createdById">,
  user: CalendarAccessUser,
  access: CalendarAccessState,
) {
  return (
    hasPermission(user, "calendar.delete") &&
    (user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN ||
      event.createdById === user.id ||
      access.canManageCollaborators)
  );
}

function mapCalendarEvent(
  event: CalendarEventWithCreator,
  user: CalendarAccessUser,
  access: CalendarAccessState,
): CalendarEventRecord {
  return {
    id: event.id,
    title: event.title,
    details: event.details ?? "",
    date: toDateKey(event.startAt),
    start: toTimeKey(event.startAt),
    end: toTimeKey(event.endAt),
    calendar: reverseCalendarTypeMap[event.type],
    tone: reverseEventToneMap[event.tone],
    canDelete: canDeleteCalendarEvent(event, user, access),
    createdByName: event.createdBy?.name ?? undefined,
    createdByEmail: event.createdBy?.email ?? undefined,
  };
}

export function isCalendarTypeLabel(value: string): value is CalendarTypeLabel {
  return value in calendarTypeMap;
}

export function isEventToneLabel(value: string): value is EventToneLabel {
  return value in eventToneMap;
}

export function parseCalendarEventInput(
  input: SaveCalendarEventInput,
): CalendarEventValidationResult {
  const title = input.title.trim();
  const details = input.details.trim();

  if (!title) {
    return { error: "Enter an event title." } as const;
  }

  if (!isCalendarTypeLabel(input.calendar)) {
    return { error: "Choose a valid calendar type." } as const;
  }

  if (!isEventToneLabel(input.tone)) {
    return { error: "Choose a valid event color." } as const;
  }

  const startAt = combineDateAndTime(input.date, input.start);
  const endAt = combineDateAndTime(input.date, input.end);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: "Choose a valid date and time range." } as const;
  }

  if (endAt <= startAt) {
    return { error: "Event end time must be after the start time." } as const;
  }

  return {
    data: {
      title,
      details: details || null,
      startAt,
      endAt,
      type: calendarTypeMap[input.calendar],
      tone: eventToneMap[input.tone],
    },
  } as const;
}

function buildCalendarAccessState(
  user: CalendarAccessUser,
  isAssignedCollaborator: boolean,
): CalendarAccessState {
  if (!hasPermission(user, "calendar.view")) {
    return {
      canManageCollaborators: false,
      canViewSharedSchedule: false,
    };
  }

  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return {
      canManageCollaborators: hasPermission(user, "calendar.assignParticipants"),
      canViewSharedSchedule: true,
    };
  }

  return {
    canManageCollaborators:
      isAssignedCollaborator &&
      hasPermission(user, "calendar.assignParticipants"),
    canViewSharedSchedule: isAssignedCollaborator,
  };
}

export async function getCalendarAccessState(
  user: CalendarAccessUser,
): Promise<CalendarAccessState> {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return buildCalendarAccessState(user, false);
  }

  const cachedAccessState = unstable_cache(
    async () => {
      const assignment = await withPrismaRetry(() =>
        prisma.calendarCollaborator.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        }),
      );

      return buildCalendarAccessState(user, Boolean(assignment));
    },
    [`calendar-access:${user.id}:${user.role}`],
    {
      revalidate: 20,
      tags: [CALENDAR_COLLABORATORS_CACHE_TAG],
    },
  );

  return cachedAccessState();
}

export async function getCalendarEvents(user: CalendarAccessUser) {
  const access = await getCalendarAccessState(user);
  const cacheKey = access.canViewSharedSchedule
    ? `calendar-events:shared:${user.role}:${user.id}`
    : `calendar-events:private:${user.id}`;

  const events = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.calendarEvent.findMany({
          where: access.canViewSharedSchedule
            ? undefined
            : {
                createdById: user.id,
              },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            startAt: "asc",
          },
        }),
      ),
    [cacheKey],
    { revalidate: 20, tags: [CALENDAR_CACHE_TAG, CALENDAR_COLLABORATORS_CACHE_TAG] },
  )();

  return events.map((event) => mapCalendarEvent(event, user, access));
}

export async function createCalendarEvent(
  user: CalendarAccessUser,
  input: SaveCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  if (!hasPermission(user, "calendar.create")) {
    return { error: "You are not allowed to create calendar events." };
  }

  const parsed = parseCalendarEventInput(input);

  if ("error" in parsed) {
    return parsed;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      ...parsed.data,
      createdById: user.id,
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    event: mapCalendarEvent(event, user, {
      canManageCollaborators: true,
      canViewSharedSchedule: true,
    }),
  } as const;
}

export async function deleteCalendarEvent(
  user: CalendarAccessUser,
  eventId: string,
): Promise<DeleteCalendarEventResult> {
  const normalizedId = eventId.trim();

  if (!normalizedId) {
    return { error: "Calendar event id is missing." };
  }

  const access = await getCalendarAccessState(user);
  const event = await withPrismaRetry(() =>
    prisma.calendarEvent.findUnique({
      where: {
        id: normalizedId,
      },
      select: {
        id: true,
        createdById: true,
      },
    }),
  );

  if (!event) {
    return { error: "This calendar event could not be found." };
  }

  if (!canDeleteCalendarEvent(event, user, access)) {
    return { error: "You are not allowed to delete this calendar event." };
  }

  await withPrismaRetry(() =>
    prisma.calendarEvent.delete({
      where: {
        id: normalizedId,
      },
    }),
  );

  return { success: true, deletedEventId: normalizedId };
}

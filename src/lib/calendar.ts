import type {
  CalendarEvent,
  CalendarEventTone,
  CalendarEventType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeKey(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function mapCalendarEvent(event: CalendarEvent): CalendarEventRecord {
  return {
    id: event.id,
    title: event.title,
    details: event.details ?? "",
    date: toDateKey(event.startAt),
    start: toTimeKey(event.startAt),
    end: toTimeKey(event.endAt),
    calendar: reverseCalendarTypeMap[event.type],
    tone: reverseEventToneMap[event.tone],
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

export async function getCalendarEvents() {
  const events = await prisma.calendarEvent.findMany({
    orderBy: {
      startAt: "asc",
    },
  });

  return events.map(mapCalendarEvent);
}

export async function createCalendarEvent(
  userId: string,
  input: SaveCalendarEventInput,
): Promise<CreateCalendarEventResult> {
  const parsed = parseCalendarEventInput(input);

  if ("error" in parsed) {
    return parsed;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      ...parsed.data,
      createdById: userId,
    },
  });

  return { event: mapCalendarEvent(event) } as const;
}

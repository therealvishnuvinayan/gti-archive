import { statuses, taskTypes } from "../tasker/contracts";
import { addCalendarDays, daysBetween, dubaiDate, monthStart, moveMonth, validCalendarDate, weekStart } from "./dates";
export const relationshipLabels = { assigned: "Assigned to me", owned: "Owned by me", observed: "Other permitted tasks", all: "All permitted tasks" } as const;
export const calendarStatusLabels = { OPEN: "Open", IN_PROGRESS: "In progress", COMPLETION_REQUESTED: "Completion requested", COMPLETED: "Completed", CLOSED: "Closed" } as const;
export const monthDayLimit = 3, weekDayLimit = 8, agendaLimit = 30;
export class CalendarError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export type CalendarQuery = { view: "month" | "week" | "agenda"; date: string; span: "month" | "day"; relationship: keyof typeof relationshipLabels;
  type: "all" | typeof taskTypes[number]; status: "all" | typeof statuses[number]; after?: string };
export function parseCalendarQuery(raw: unknown, today = dubaiDate(new Date())): CalendarQuery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CalendarError("INVALID_CALENDAR");
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(k => !["view", "date", "span", "relationship", "type", "status", "after"].includes(k)) || Object.values(v).some(x => x !== undefined && typeof x !== "string")) throw new CalendarError("INVALID_CALENDAR");
  const q = { view: v.view ?? "month", date: v.date ?? today, span: v.span ?? "month", relationship: v.relationship ?? "assigned", type: v.type ?? "all", status: v.status ?? "all", ...(v.after === undefined ? {} : { after: v.after }) } as CalendarQuery;
  if (!["month", "week", "agenda"].includes(q.view) || !validCalendarDate(q.date) || !["month", "day"].includes(q.span) ||
    (q.span === "day" && q.view !== "agenda") || !Object.keys(relationshipLabels).includes(q.relationship) ||
    !["all", ...taskTypes].includes(q.type) || !["all", ...statuses].includes(q.status)) throw new CalendarError("INVALID_CALENDAR");
  if (q.after !== undefined) { if (q.view !== "agenda") throw new CalendarError("INVALID_CALENDAR"); parseCalendarCursor(q.after); }
  return q;
}
export function parseCalendarCursor(value: string) {
  if (value.length > 160 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z~[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new CalendarError("INVALID_CALENDAR");
  const [time, id] = value.split("~"), deadline = new Date(time);
  if (!Number.isFinite(deadline.getTime()) || deadline.toISOString() !== time) throw new CalendarError("INVALID_CALENDAR");
  return { deadline, id };
}
export function calendarRange(q: CalendarQuery) {
  let start: string, end: string;
  if (q.view === "week") { start = weekStart(q.date); end = addCalendarDays(start, 7); }
  else if (q.view === "agenda") { start = q.span === "day" ? q.date : monthStart(q.date); end = q.span === "day" ? addCalendarDays(start, 1) : moveMonth(start, 1); }
  else { start = weekStart(monthStart(q.date)); end = addCalendarDays(weekStart(addCalendarDays(moveMonth(q.date, 1), -1)), 7); }
  return { start, end, days: daysBetween(start, end) };
}
export function calendarHref(query: CalendarQuery, patch: Partial<CalendarQuery> = {}) {
  const q = { ...query, ...patch }, params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) if (value !== undefined) params.set(key, value);
  return `/calendar?${params}`;
}
export type CalendarTask = { id: string; title: string; type: typeof taskTypes[number]; status: typeof statuses[number]; deadline: string; date: string; href: string; relationships: string[]; isSister: boolean };
export type CalendarDay = { date: string; items: CalendarTask[]; hasMore: boolean };

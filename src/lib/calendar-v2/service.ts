import "server-only";
import type { Prisma } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { runtimeAuthorization } from "../authorization/runtime";
import { resolveAuthenticatedSession } from "../authorization/session";
import { dashboardTaskScope } from "../tasker/dashboard";
import { enabledTaskTypes, sistersEnabled, taskEnabled } from "../tasker/contracts";
import { calendarV2Enabled } from "./activation";
import { agendaLimit, calendarRange, CalendarError, monthDayLimit, parseCalendarCursor, parseCalendarQuery, weekDayLimit, type CalendarDay, type CalendarTask } from "./contracts";
import { addCalendarDays, calendarTimeZone, dubaiDate, dubaiDayStart, validCalendarDate } from "./dates";

export async function getTaskCalendar(raw: unknown = {}) {
  if (!calendarV2Enabled()) throw new CalendarError("CALENDAR_DISABLED", 404);
  const today = dubaiDate(new Date()), query = parseCalendarQuery(raw, today), range = calendarRange(query);
  const start = dubaiDayStart(range.start), end = dubaiDayStart(range.end), cursor = query.after ? parseCalendarCursor(query.after) : null;
  if (cursor && (cursor.deadline < start || cursor.deadline >= end)) throw new CalendarError("INVALID_CALENDAR");
  return runtimeAuthorization.runAuthorized({ capability: "workspace.calendar.tasks", targetId: "root" }, async (tx, grant) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
    const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
    if (!session?.principal.businessRole || session.principal.userId !== grant.actorUserId) throw new CalendarError("ACCESS_DENIED", 403);
    const actor = session.principal, types = taskEnabled() ? enabledTaskTypes() : [];
    if (query.type !== "all" && !types.includes(query.type)) throw new CalendarError("INVALID_CALENDAR");
    const relationship: Prisma.UniversalTaskWhereInput = query.relationship === "assigned" ? { executorId: actor.userId } : query.relationship === "owned" ? { ownerId: actor.userId } :
      query.relationship === "observed" ? { NOT: [{ ownerId: actor.userId }, { executorId: actor.userId }] } : {};
    const scope: Prisma.UniversalTaskWhereInput = { AND: [dashboardTaskScope(actor), relationship], ...(query.type === "all" ? {} : { type: query.type }), ...(query.status === "all" ? {} : { status: query.status }) };
    const read = async (from: Date, to: Date, limit: number, after = cursor) => {
      const rows = await tx.universalTask.findMany({ where: { AND: [scope, after ? { OR: [{ deadline: { gt: after.deadline } }, { deadline: after.deadline, id: { gt: after.id } }] } : {}], deadline: { gte: from, lt: to } },
        take: limit + 1, orderBy: [{ deadline: "asc" }, { id: "asc" }], select: { id: true, title: true, type: true, status: true, deadline: true, ownerId: true, executorId: true,
          spectators: { where: { userId: actor.userId }, take: 1, select: { userId: true } }, sisterLink: sistersEnabled() ? { select: { taskId: true } } : false } });
      const items: CalendarTask[] = rows.slice(0, limit).map(t => {
        const relationships = [t.ownerId === actor.userId ? "Task Owner" : null, t.executorId === actor.userId ? "Executor" : null, t.spectators.length ? "Spectator" : null].filter((r): r is string => !!r);
        return { id: t.id, title: t.title, type: t.type, status: t.status, deadline: t.deadline.toISOString(), date: dubaiDate(t.deadline), href: `/tasks/${encodeURIComponent(t.id)}`, isSister: !!t.sisterLink,
          relationships: relationships.length ? relationships : ["Director oversight"] };
      });
      return { items, hasMore: rows.length > limit };
    };
    const days: CalendarDay[] = range.days.map(date => ({ date, items: [], hasMore: false }));
    let agenda: { items: CalendarTask[]; hasMore: boolean } | null = query.view === "agenda" ? { items: [], hasMore: false } : null;
    if (taskEnabled()) await runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
      if (query.view === "agenda") agenda = await read(start, end, agendaLimit);
      else {
        // Each visible day has an independently authorized bounded page. A busy
        // first day cannot silently hide later dates behind a global row cap.
        for (const day of days) if (validCalendarDate(day.date)) Object.assign(day, await read(dubaiDayStart(day.date), dubaiDayStart(addCalendarDays(day.date, 1)), query.view === "month" ? monthDayLimit : weekDayLimit, null));
      }
    });
    if (Date.parse(actor.session.expiresAt) <= Date.now()) throw new CalendarError("ACCESS_DENIED", 403);
    const last = agenda?.items.at(-1);
    return { query, today, timeZone: calendarTimeZone, range: { start: range.start, end: range.end }, enabled: taskEnabled(), types, days: query.view === "agenda" ? [] : days, agenda,
      next: agenda?.hasMore && last ? `${last.deadline}~${last.id}` : null };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
export type TaskCalendar = Awaited<ReturnType<typeof getTaskCalendar>>;

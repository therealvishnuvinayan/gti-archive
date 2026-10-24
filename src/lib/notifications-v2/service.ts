import "server-only";
import type { Prisma } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { runtimeAuthorization } from "../authorization/runtime";
import { resolveAuthenticatedSession } from "../authorization/session";
import { dashboardAttention } from "../dashboard-v2/attention";
import { parseDashboardQuery, taskTypeLabels } from "../dashboard-v2/contracts";
import { dashboardTaskScope, executionWork } from "../tasker/dashboard";
import { enabledTaskTypes, sistersEnabled, taskEnabled } from "../tasker/contracts";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { addCalendarDays, calendarTimeZone, dubaiDate, dubaiDayStart } from "../calendar-v2/dates";
import { agendaLimit, calendarStatusLabels, parseCalendarCursor, type CalendarTask } from "../calendar-v2/contracts";
import { notificationsV2Enabled } from "./activation";
import { AttentionError, parseAttentionQuery, type LiveAttentionItem, type AttentionQuery } from "./contracts";

export async function getLiveAttention(raw: unknown = {}) {
  if (!notificationsV2Enabled()) throw new AttentionError("ATTENTION_DISABLED", 404);
  const now = new Date(), query = parseAttentionQuery(raw, now), start = dubaiDayStart(query.start), end = dubaiDayStart(addCalendarDays(query.end, 1));
  const cursor = query.after ? parseCalendarCursor(query.after) : null;
  if (cursor && (cursor.deadline < start || cursor.deadline >= end)) throw new AttentionError("INVALID_ATTENTION");
  return runtimeAuthorization.runAuthorized({ capability: "workspace.attention", targetId: "root" }, async (tx, grant) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
    const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
    if (!session?.principal.businessRole || session.principal.userId !== grant.actorUserId) throw new AttentionError("ACCESS_DENIED", 403);
    const actor = session.principal, director = actor.businessRole === "DIRECTOR", manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole!);
    const sources: AttentionQuery["source"][] = ["execution", "tasks", ...(manager ? ["stages" as const] : []), ...(director ? ["workflows", "creation", "completion", "policy"] as const : []), ...(actor.businessRole === "JUNIOR_PROJECT_MANAGER" ? ["requests" as const] : [])];
    if (query.view === "attention" && !sources.includes(query.source)) throw new AttentionError("ACCESS_DENIED", 403);
    const types = taskEnabled() ? enabledTaskTypes() : [];
    if (query.type !== "all" && !types.includes(query.type)) throw new AttentionError("INVALID_ATTENTION");
    let attention: LiveAttentionItem[] = [], hasMore = false, requiresWorkspace = false;
    let deadlines: Array<CalendarTask & { indicator: string }> = [], next: string | null = null;
    if (query.view === "attention") {
      if (query.source === "execution" && taskEnabled()) await runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
        const rows = await tx.universalTask.findMany({ where: executionWork(actor), take: 13, skip: query.page * 12, orderBy: [{ deadline: "asc" }, { id: "asc" }], select: { id: true, title: true, type: true, status: true, deadline: true, sisterLink: sistersEnabled() ? { select: { taskId: true } } : false } });
        hasMore = rows.length > 12;
        attention = rows.slice(0, 12).map(t => ({ id: t.id, title: t.title, detail: `${taskTypeLabels[t.type]} · Executor${t.sisterLink ? " · Sister Task" : ""}`, status: calendarStatusLabels[t.status], at: t.deadline.toISOString(), dateLabel: "Deadline", href: `/tasks/${encodeURIComponent(t.id)}`, actionable: true }));
      });
      else if (query.source === "requests" && runtimeIntegrationEnabled()) {
        const rows = await tx.runtimeCreationRequest.findMany({ where: { requesterId: actor.userId }, take: 13, skip: query.page * 12, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, snapshot: true, decision: { select: { outcome: true } } } });
        hasMore = rows.length > 12;
        attention = rows.slice(0, 12).map(r => ({ id: r.id, title: String((r.snapshot as { title: string }).title), detail: "Your project creation request", status: r.decision?.outcome === "APPROVE" ? "Approved" : r.decision?.outcome === "REJECT" ? "Rejected" : "Awaiting Director decision", at: r.createdAt.toISOString(), dateLabel: "Requested", href: "/projects/runtime/requests", actionable: false }));
      } else if (query.source !== "execution" && query.source !== "requests") {
        const result = await dashboardAttention(tx, actor, parseDashboardQuery({ attention: query.source, attentionPage: String(query.page) }));
        hasMore = result.hasMore; requiresWorkspace = result.requiresWorkspace;
        const status = { tasks: "Completion requested", workflows: "Submitted for publication", creation: "Creation requested", stages: "Pending configured step", completion: "Final completion requested", policy: "Policy not set" }[query.source];
        attention = result.items.map(i => ({ ...i, status, dateLabel: query.source === "policy" ? "Created" : query.source === "tasks" ? "Updated" : "Requested", actionable: true }));
      }
    } else if (taskEnabled()) await runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
      const relation: Prisma.UniversalTaskWhereInput = query.relationship === "assigned" ? { executorId: actor.userId } : query.relationship === "owned" ? { ownerId: actor.userId } : query.relationship === "observed" ? { NOT: [{ ownerId: actor.userId }, { executorId: actor.userId }] } : {};
      const clauses: Prisma.UniversalTaskWhereInput[] = [dashboardTaskScope(actor), relation, { deadline: { gte: start, lt: end } }];
      if (query.watch !== "all") clauses.push({ status: { in: ["OPEN", "IN_PROGRESS", "COMPLETION_REQUESTED"] } });
      if (query.watch === "past") clauses.push({ deadline: { lt: now } });
      if (query.watch === "upcoming") clauses.push({ deadline: { gte: now } });
      if (query.type !== "all") clauses.push({ type: query.type });
      if (query.status !== "all") clauses.push({ status: query.status });
      if (cursor) clauses.push({ OR: [{ deadline: { gt: cursor.deadline } }, { deadline: cursor.deadline, id: { gt: cursor.id } }] });
      const rows = await tx.universalTask.findMany({ where: { AND: clauses }, take: agendaLimit + 1, orderBy: [{ deadline: "asc" }, { id: "asc" }], select: { id: true, title: true, type: true, status: true, deadline: true, ownerId: true, executorId: true, spectators: { where: { userId: actor.userId }, take: 1, select: { userId: true } }, sisterLink: sistersEnabled() ? { select: { taskId: true } } : false } });
      deadlines = rows.slice(0, agendaLimit).map(t => {
        const relationships = [t.ownerId === actor.userId ? "Task Owner" : null, t.executorId === actor.userId ? "Executor" : null, t.spectators.length ? "Spectator" : null].filter((v): v is string => !!v);
        const active = t.status !== "COMPLETED" && t.status !== "CLOSED";
        return { id: t.id, title: t.title, type: t.type, status: t.status, deadline: t.deadline.toISOString(), date: dubaiDate(t.deadline), href: `/tasks/${encodeURIComponent(t.id)}`, relationships: relationships.length ? relationships : ["Director oversight"], isSister: !!t.sisterLink,
          indicator: !active ? "Historical deadline" : t.deadline < now ? "Past deadline" : dubaiDate(t.deadline) === dubaiDate(now) ? "Due today" : "Upcoming deadline" };
      });
      hasMore = rows.length > agendaLimit; const last = deadlines.at(-1); if (hasMore && last) next = `${last.deadline}~${last.id}`;
    });
    if (Date.parse(actor.session.expiresAt) <= Date.now()) throw new AttentionError("ACCESS_DENIED", 403);
    return { query, asOf: now.toISOString(), today: dubaiDate(now), timeZone: calendarTimeZone, sources, types, taskerEnabled: taskEnabled(), attention, deadlines, hasMore, requiresWorkspace, next };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
export type LiveAttention = Awaited<ReturnType<typeof getLiveAttention>>;

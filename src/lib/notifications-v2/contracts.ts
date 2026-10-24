import { calendarStatusLabels, parseCalendarCursor, parseCalendarQuery, relationshipLabels } from "../calendar-v2/contracts";
import { addCalendarDays, dubaiDate, validCalendarDate } from "../calendar-v2/dates";
export { calendarStatusLabels, relationshipLabels };
export const sourceLabels = { execution: "Assigned task actions", tasks: "Task completion reviews", workflows: "Workflow publication decisions", creation: "Project creation decisions", stages: "Configured stage approvals", completion: "Final completion decisions", policy: "Completion-document policy", requests: "My creation request status" } as const;
export const watchLabels = { today: "Due today", past: "Past deadline", upcoming: "Coming up", all: "All dated work" } as const;
export class AttentionError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export type AttentionQuery = { view: "attention" | "deadlines"; source: keyof typeof sourceLabels; page: number; watch: keyof typeof watchLabels; start: string; end: string; relationship: keyof typeof relationshipLabels; type: ReturnType<typeof parseCalendarQuery>["type"]; status: ReturnType<typeof parseCalendarQuery>["status"]; after?: string };
export function parseAttentionQuery(raw: unknown = {}, now = new Date()): AttentionQuery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AttentionError("INVALID_ATTENTION");
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(k => !["view", "source", "page", "watch", "start", "end", "relationship", "type", "status", "after"].includes(k)) || Object.values(v).some(x => x !== undefined && typeof x !== "string")) throw new AttentionError("INVALID_ATTENTION");
  const today = dubaiDate(now), watch = v.watch ?? "today";
  const q = { view: v.view ?? "attention", source: v.source ?? "execution", page: v.page === undefined ? 0 : Number(v.page), watch,
    start: v.start ?? (watch === "past" ? addCalendarDays(today, -30) : today), end: v.end ?? (watch === "upcoming" || watch === "all" ? addCalendarDays(today, 6) : today),
    relationship: v.relationship ?? "assigned", type: v.type ?? "all", status: v.status ?? "all", ...(v.after === undefined ? {} : { after: v.after }) } as AttentionQuery;
  if (!["attention", "deadlines"].includes(q.view) || !Object.keys(sourceLabels).includes(q.source) || !Object.keys(watchLabels).includes(q.watch) ||
    !Number.isSafeInteger(q.page) || q.page < 0 || q.page > 1000 || (v.page !== undefined && !/^\d{1,4}$/.test(String(v.page))) ||
    !validCalendarDate(q.start) || !validCalendarDate(q.end) || q.start > q.end || q.end > addCalendarDays(q.start, 91) ||
    (q.watch === "today" && (q.start !== today || q.end !== today)) || (q.after !== undefined && q.view !== "deadlines")) throw new AttentionError("INVALID_ATTENTION");
  try { parseCalendarQuery({ date: q.start, relationship: q.relationship, type: q.type, status: q.status }); if (q.after !== undefined) parseCalendarCursor(q.after); }
  catch { throw new AttentionError("INVALID_ATTENTION"); }
  return q;
}
export function attentionHref(query: AttentionQuery, patch: Partial<AttentionQuery> = {}) {
  const params = new URLSearchParams(), q = { ...query, ...patch };
  for (const [k, v] of Object.entries(q)) if (v !== undefined && !(q.watch === "today" && ["start", "end"].includes(k))) params.set(k, String(v));
  return `/notifications?${params}`;
}
export type LiveAttentionItem = { id: string; title: string; detail: string; status: string; at: string; dateLabel: string; href: string; actionable: boolean };

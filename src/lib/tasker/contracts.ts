// Browser-safe General Task contracts. The five future types are never executable.
export const taskTypes = ["GENERAL", "FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"] as const;
export const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const statuses = ["OPEN", "IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED", "CLOSED"] as const;
export const actions = ["EDIT", "MESSAGE", "SUBMIT", "REQUEST_COMPLETION", "APPROVE", "REJECT", "CLOSE", "DELETE", "PREPARE_UPLOAD", "FINALIZE_UPLOAD"] as const;
export type TaskAction = typeof actions[number];
export type Person = { id: string; name: string | null };
export type TaskSummary = {
  id: string; title: string; type: "GENERAL"; brief: string; context: string | null;
  priority: typeof priorities[number]; deadline: string; status: typeof statuses[number]; version: number;
  owner: Person; executor: Person; spectators: Person[];
  project: { id: string; name: string; kind: "structured" | "flexible" };
  createdAt: string; updatedAt: string; deletedAt: string | null;
};
export type TaskFile = { id: string; fileId: string; versionId: string; number: number; name: string; status: string;
  size: number; uploadedById: string; submittedEntryId: string | null };
export type TaskDetail = TaskSummary & {
  entries: { id: string; version: number; action: string; text: string; actor: Person; directorOverride: boolean;
    createdAt: string; snapshot: unknown }[];
  files: TaskFile[];
  permissions: { manage: boolean; message: boolean; submit: boolean; requestCompletion: boolean; review: boolean; close: boolean; delete: boolean };
};
export class TaskerError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); this.name = "TaskerError"; }
}
export function ensure(condition: unknown, code: string, status = 400): asserts condition {
  if (!condition) throw new TaskerError(code, status);
}
export function object(value: unknown, keys: readonly string[]) {
  ensure(value && typeof value === "object" && !Array.isArray(value), "INVALID_INPUT");
  const v = value as Record<string, unknown>;
  ensure(Object.keys(v).every(key => keys.includes(key)), "INVALID_INPUT");
  return v;
}
export function text(value: unknown, max = 2000, optional = false): string {
  if (optional && (value === undefined || value === null)) return "";
  ensure(typeof value === "string" && value.length <= max && !value.includes("\0") && (optional || value.trim()), "INVALID_TEXT");
  return value.trim();
}
export function id(value: unknown) { const v = text(value, 128); ensure(/^[a-zA-Z0-9_-]+$/.test(v), "INVALID_ID"); return v; }
export function ids(value: unknown): string[] {
  if (value === undefined) return [];
  ensure(Array.isArray(value) && value.length <= 30, "INVALID_PARTICIPANTS");
  const result = value.map(id); ensure(new Set(result).size === result.length, "DUPLICATE_IDS"); return result.sort();
}
export function deadline(value: unknown) {
  ensure(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value), "INVALID_DEADLINE");
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  ensure(Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10), "INVALID_DEADLINE");
  const d = new Date(value); ensure(Number.isFinite(d.getTime()), "INVALID_DEADLINE"); return d;
}
export function priority(value: unknown) { ensure(priorities.includes(value as typeof priorities[number]), "INVALID_PRIORITY"); return value as typeof priorities[number]; }
export function expectedVersion(value: unknown) { ensure(Number.isSafeInteger(value) && Number(value) > 0, "VERSION_REQUIRED"); return value as number; }
export function contextTarget(value: unknown) {
  const target = text(value, 160); const [kind, key, extra] = target.split(":");
  ensure(["structured", "flexible", "task"].includes(kind) && !extra, "INVALID_CONTEXT"); id(key);
  return { target, kind, key };
}
export function taskEnabled() { return process.env.FLUX_UNIVERSAL_TASKER === "1"; }

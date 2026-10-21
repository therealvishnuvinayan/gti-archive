// Browser-safe Tasker contracts. New adapters require a separately activated migration.
export const taskTypes = ["GENERAL", "FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"] as const;
export const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const statuses = ["OPEN", "IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED", "CLOSED"] as const;
export const actions = ["EDIT", "MESSAGE", "SUBMIT", "REQUEST_COMPLETION", "APPROVE", "REJECT", "CLOSE", "DELETE", "PREPARE_UPLOAD", "FINALIZE_UPLOAD", "REFRESH_TARGET", "SET_SOURCE"] as const;
export type TaskAction = typeof actions[number];
export type Person = { id: string; name: string | null };
export type TaskSummary = {
  family?: TaskFamily;
  id: string; title: string; type: typeof taskTypes[number]; brief: string; context: string | null;
  priority: typeof priorities[number]; deadline: string; status: typeof statuses[number]; version: number;
  owner: Person; executor: Person; spectators: Person[];
  project: { id: string; name: string; kind: "structured" | "flexible" };
  createdAt: string; updatedAt: string; deletedAt: string | null;
};
export type TaskFile = { id: string; fileId: string; versionId: string; number: number; name: string; status: string;
  size: number; uploadedById: string; submittedEntryId: string | null };
export type TaskReference = {
  id: string; kind: string; fileId: string; versionId: string; number: number; name: string; mimeType: string;
  sourceState: string; sourceTask: { id: string; title: string; owner: Person } | null;
  submission: { id: string; actor: Person; createdAt: string } | null;
  review: { id: string; actor: Person; createdAt: string; action: string } | null;
  uploader: Person | null;
};
export type ConceptSourceChoice = { versionId: string; name: string; number: number; contextTarget: string; kind: "INSPECTION" | "INSPIRATION"; sourceState: string; sourceTaskTitle?: string };
export type TaskDetail = TaskSummary & {
  entries: { id: string; version: number; action: string; text: string; actor: Person; directorOverride: boolean;
    createdAt: string; snapshot: unknown }[];
  files: TaskFile[];
  references?: TaskReference[];
  inheritedEvidence?: HistoricalEvidence[];
  sistersEnabled?: boolean;
  submissions?: { id: string; state: string; reviewer: Person | null }[];
  deliverable?: { label: string; inputMode: string; fieldType?: string; expectedState?: unknown; currentState?: unknown; conflict?: boolean;
    applicationState?: string; errorCode?: string | null; publishedAttachmentIds: string[] };

  permissions: { createSister?: boolean; uploadSource?: boolean; manage: boolean; message: boolean; submit: boolean; requestCompletion: boolean; review: boolean; close: boolean; delete: boolean };
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

export function deliverablesEnabled() { return taskEnabled() && process.env.FLUX_TASKER_DELIVERABLES === "1"; }
export function availableTaskType(type: string) { return enabledTaskTypes().includes(type as typeof taskTypes[number]); }

// Deliberate existing-field adapter allowlist; new native fields need review.
export const taskInputFields: readonly string[] = ["OUTPUT_NAME", "TAR", "NICOTINE", "BARCODE", "TECHNICAL_DRAWING", "RELATED_GRAPHICS", "THREEDS", "QR_CODE", "INVOICE", "TRACK_TRACE", "TAX_STAMP"];

export function conceptsEnabled() { return taskEnabled() && process.env.FLUX_TASKER_CONCEPTS === "1"; }
export function isDeliverable(type: string) { return ["FILE_UPLOAD", "DATA_INPUT"].includes(type); }
export function isConceptType(type: string) { return ["INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"].includes(type); }
export function enabledTaskTypes() { return taskTypes.filter(type => type === "GENERAL" || (deliverablesEnabled() && isDeliverable(type)) || (conceptsEnabled() && isConceptType(type))); }

export function sistersEnabled() { return taskEnabled() && process.env.FLUX_TASKER_SISTERS === "1"; }
export type TaskFamily = { anchorId: string; root: { id: string; title: string } | null; source: { id: string; title: string } | null; isSister: boolean; count: number; latestActivity: string };
export type HistoricalEvidence = { id: string; versionId: string; fileId: string; name: string; number: number; size: number; mimeType: string;
  uploader: Person | null; sourceState: string; submission: { id: string; actor: Person; createdAt: string };
  review: { id: string; actor: Person; createdAt: string; action: string } | null };

import { commandId, ensure, identifier, record, type Capability, type FieldDefinition, type StageDefinition } from "../stage-builder/contracts";
export const runtimeActions = ["CREATED", "FIELDS", "CHECKLIST", "UPLOAD_PREPARED", "FILE_SUBMITTED", "UPLOAD_FAILED", "FILE_DECIDED", "APPROVAL_SUBMITTED", "APPROVAL_DECIDED", "COMPLETED"] as const;
export type RuntimeAction = typeof runtimeActions[number];
export type FieldValue = { value: string | number | null; actorId: string | null; at: string | null };
export type ChecklistValue = { complete: boolean; text: string; versionId: string | null; actorId: string; at: string };
export type Values = Record<string, FieldValue>;
export type Checks = Record<string, ChecklistValue>;
export function text(value: unknown, max: number, required = false): asserts value is string { ensure(typeof value === "string" && value.length <= max && !value.includes("\0") && (!required || value.trim()), "INVALID_TEXT"); }
export function validateField(field: FieldDefinition, value: unknown) {
  ensure(field.type !== "READ_ONLY", "READ_ONLY_FIELD", 403);
  if (value === null || value === "") { ensure(!field.required, "REQUIRED_FIELD"); return null; }
  if (field.type === "NUMBER") ensure(typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12 && (field.min === null || value >= field.min) && (field.max === null || value <= field.max), "NUMBER_OUT_OF_RANGE");
  else {
    text(value, field.type === "SHORT_TEXT" ? 500 : 10000);
    if (field.required) ensure(value.trim(), "REQUIRED_FIELD");
    if (["SHORT_TEXT", "LONG_TEXT"].includes(field.type)) ensure((field.min === null || value.length >= field.min) && (field.max === null || value.length <= field.max), "TEXT_OUT_OF_RANGE");
    if (field.type === "SELECT") ensure(field.options.includes(value), "INVALID_SELECT_OPTION");
    if (field.type === "DATE") ensure(/^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "INVALID_DATE");
  }
  return value as string | number;
}
export function defaults(stage: StageDefinition): Values {
  return Object.fromEntries(stage.capabilities.flatMap(c => c.type === "INFORMATION" ? c.fields.map(f => [f.id, { value: f.defaultValue, actorId: null, at: null }]) : []));
}
export function parseCreate(raw: unknown) {
  const r = record(raw, ["commandId", "publishedVersionId", "definitionHash", "title", "description", "ownerId", "coOwnerIds", "executorIds"]);
  commandId(r.commandId); identifier(r.publishedVersionId); identifier(r.ownerId); text(r.title, 160, true); text(r.description, 4000);
  ensure(typeof r.definitionHash === "string" && /^[a-f0-9]{64}$/.test(r.definitionHash), "INVALID_HASH");
  for (const list of [r.coOwnerIds, r.executorIds]) { ensure(Array.isArray(list) && list.length <= 30, "INVALID_PARTICIPANTS"); list.forEach(identifier); }
  const coOwnerIds = r.coOwnerIds as string[], executorIds = r.executorIds as string[];
  ensure(new Set([r.ownerId, ...coOwnerIds, ...executorIds]).size === 1 + coOwnerIds.length + executorIds.length, "DUPLICATE_PARTICIPANT");
  return { commandId: r.commandId, publishedVersionId: r.publishedVersionId, definitionHash: r.definitionHash, title: r.title.trim(), description: r.description, ownerId: r.ownerId, coOwnerIds, executorIds };
}
export function parseCommand(raw: unknown) {
  ensure(raw && typeof raw === "object" && !Array.isArray(raw), "INVALID_COMMAND");
  const action = (raw as Record<string, unknown>).action;
  ensure(typeof action === "string" && runtimeActions.includes(action as RuntimeAction) && action !== "CREATED", "INVALID_ACTION");
  const extra: Record<string, string[]> = { FIELDS: ["values"], CHECKLIST: ["itemId", "complete", "text", "versionId"], UPLOAD_PREPARED: ["capabilityId", "fileName", "mimeType", "fileSize", "supersedesId"], FILE_SUBMITTED: ["submissionId"], UPLOAD_FAILED: ["submissionId"], FILE_DECIDED: ["submissionId", "outcome", "reason"], APPROVAL_SUBMITTED: ["capabilityId"], APPROVAL_DECIDED: ["expected", "outcome", "reason", "confirmed"], COMPLETED: ["reason"] };
  const r = record(raw, ["action", "commandId", "expectedRevision", ...extra[action]]);
  commandId(r.commandId); ensure(Number.isSafeInteger(r.expectedRevision) && Number(r.expectedRevision) >= 0, "INVALID_REVISION");
  return r as Record<string, unknown> & { action: Exclude<RuntimeAction, "CREATED">; commandId: string; expectedRevision: number };
}
export type FileGate = { id: string; capabilityId: string; state: string; versionId: string; replaced: boolean };
export type ApprovalGate = { capabilityId: string; evidenceRevision: number; state: string };
export function evaluateGates(stage: StageDefinition, values: Values, checks: Checks, files: FileGate[], approvals: ApprovalGate[], evidenceRevision: number, completed: string[], skipApprovals = false) {
  const missing: string[] = [];
  for (const gate of stage.gates) if (gate.type === "PRECEDING_STAGE" && !completed.includes(gate.stageId)) missing.push(`Complete preceding stage: ${gate.stageId}`);
  for (const block of stage.capabilities) {
    if (block.type === "INFORMATION") for (const f of block.fields.filter(f => f.required)) { try { validateField(f, values[f.id]?.value ?? null); } catch { missing.push(`Complete field: ${f.label}`); } }
    if (block.type === "CHECKLIST") for (const item of block.items.filter(i => i.required)) {
      const v = checks[item.id];
      if (!v?.complete || !v.actorId || (item.evidence === "TEXT" && !v.text.trim()) || (item.evidence === "SHARED_FILE_VERSION" && !files.some(f => f.versionId === v.versionId && !f.replaced && ["ACCEPTED", "SUBMITTED"].includes(f.state) && acceptedFile(stage, f)))) missing.push(`Complete checklist evidence: ${item.label}`);
    }
    if (block.type === "FILE_REQUIREMENT") {
      const present = files.filter(f => f.capabilityId === block.id && !f.replaced);
      if ((block.required || present.length) && (present.length < block.minFiles || present.length > block.maxFiles || present.some(f => !acceptedFile(stage, f)))) missing.push(`Submit${block.acceptance === "NONE" ? "" : " and accept"} ${block.minFiles}–${block.maxFiles} files: ${block.title}`);
    }
    if (!skipApprovals && block.type === "APPROVAL" && block.gatesProgression && !approvals.some(a => a.capabilityId === block.id && a.evidenceRevision === evidenceRevision && a.state === "APPROVED")) missing.push(`Complete ordered approval: ${block.title}`);
  }
  return { ready: missing.length === 0, missing };
}
export function acceptedFile(stage: StageDefinition, file: FileGate) {
  const b = stage.capabilities.find(c => c.id === file.capabilityId);
  return b?.type === "FILE_REQUIREMENT" && (b.acceptance === "NONE" ? ["SUBMITTED", "ACCEPTED"].includes(file.state) : file.state === "ACCEPTED");
}
export function capability<T extends Capability["type"]>(stage: StageDefinition, id: unknown, type: T): Extract<Capability, { type: T }> {
  identifier(id); const c = stage.capabilities.find(c => c.id === id && c.type === type); ensure(c, "CAPABILITY_NOT_FOUND", 404); return c as Extract<Capability, { type: T }>;
}

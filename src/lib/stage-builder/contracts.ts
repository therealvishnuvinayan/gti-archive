/** Definition v1. This is configuration, never an executable project workflow. */
export const DRAFT_NOTICE = "DRAFT — NOT APPROVED — NOT AVAILABLE FOR PROJECT CREATION";
export const MAX_DEFINITION_BYTES = 131072;
export const projectTypes = ["ARTWORK_PACKAGING", "POSM", "RETAIL_DISPLAY", "EXHIBITION_STAND", "DIGITAL", "CUSTOM"] as const;
export const fieldTypes = ["SHORT_TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT", "READ_ONLY"] as const;
export const evidenceTypes = ["NONE", "TEXT", "SHARED_FILE_VERSION"] as const;
export const approverTypes = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "PROJECT_OWNER", "PROJECT_CO_OWNER"] as const;
export const capabilityRegistry = {
  INFORMATION: { label: "Information", description: "Instructions and structured fields" },
  FILE_REQUIREMENT: { label: "File requirement", description: "Required submissions and exact accepted versions" },
  CHECKLIST: { label: "Checklist", description: "Required items and supporting evidence" },
  APPROVAL: { label: "Approval", description: "Draft requirements for a future reviewed adapter" },
} as const;
export const gateRegistry = {
  REQUIRED_FIELDS: "Required fields completed",
  REQUIRED_CHECKLIST: "Required checklist items satisfied",
  ACCEPTED_FILES: "Required files submitted and accepted",
  APPROVAL_COMPLETE: "Required approval steps completed",
  PRECEDING_STAGE: "Required preceding stage completed",
} as const;
export type FieldDefinition = {
  id: string; type: typeof fieldTypes[number]; label: string; help: string; required: boolean;
  options: string[]; defaultValue: string | number | null; min: number | null; max: number | null;
};
type Block = { id: string; title: string; instructions: string };
export type Capability =
  | (Block & { type: "INFORMATION"; fields: FieldDefinition[] })
  | (Block & { type: "FILE_REQUIREMENT"; acceptedTypes: string[]; minFiles: number; maxFiles: number; required: boolean; acceptance: "NONE" | "OWNER" | "REVIEWER"; acceptedVersionsGate: boolean })
  | (Block & { type: "CHECKLIST"; items: { id: string; label: string; description: string; required: boolean; evidence: typeof evidenceTypes[number] }[] })
  | (Block & { type: "APPROVAL"; steps: { id: string; label: string; approver: typeof approverTypes[number]; evidence: "CONFIGURED_INPUTS" | "SHARED_FILE_VERSION"; decision: "APPROVE_REQUIRED" }[]; rejection: "RETURN_FOR_CHANGES" | "BLOCK_STAGE"; gatesProgression: boolean });
export type Gate = { type: Exclude<keyof typeof gateRegistry, "PRECEDING_STAGE">; capabilityId: string } | { type: "PRECEDING_STAGE"; stageId: string };
export type StageDefinition = { id: string; title: string; description: string; position: number; capabilities: Capability[]; gates: Gate[] };
export type WorkflowDefinition = { schemaVersion: 1; name: string; description: string; intendedProjectType: typeof projectTypes[number] | null; stages: StageDefinition[] };
export type ValidationIssue = { path: string; message: string };
export class DraftError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly issues: ValidationIssue[] = []) { super(code); }
}
export function ensure(value: unknown, code: string, status = 400): asserts value { if (!value) throw new DraftError(code, status); }
export function record(value: unknown, keys: readonly string[], path = "request"): Record<string, unknown> {
  ensure(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, "INVALID_CONFIGURATION");
  const object = value as Record<string, unknown>;
  ensure(Object.keys(object).every(key => keys.includes(key)), "UNSUPPORTED_PROPERTY");
  ensure(keys.every(key => Object.hasOwn(object, key)), "MISSING_PROPERTY");
  if (Object.keys(object).length !== keys.length) throw new DraftError("INVALID_CONFIGURATION", 400, [{ path, message: "Use the supported configuration properties." }]);
  return object;
}
export function identifier(value: unknown): asserts value is string { ensure(typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value), "INVALID_IDENTIFIER"); }
export function commandId(value: unknown): asserts value is string { ensure(typeof value === "string" && /^[a-f0-9-]{36}$/.test(value), "INVALID_COMMAND_ID"); }
const string = (v: unknown, max = 2000) => ensure(typeof v === "string" && v.length <= max && !v.includes("\0"), "INVALID_TEXT");
const bool = (v: unknown) => ensure(typeof v === "boolean", "INVALID_BOOLEAN");
const choice = (v: unknown, choices: readonly string[]) => ensure(typeof v === "string" && choices.includes(v), "UNSUPPORTED_VALUE");
function array(v: unknown, max: number): asserts v is unknown[] { ensure(Array.isArray(v) && v.length <= max, "CONFIGURATION_LIMIT"); }
function integer(v: unknown, min: number, max: number) { ensure(Number.isInteger(v) && Number(v) >= min && Number(v) <= max, "INVALID_NUMBER"); }

/** Reject unknown keys, executable expressions, paths, authority and malformed schemas.
 * Incomplete content is separately saveable with INCOMPLETE validation status. */
export function parseDefinition(raw: unknown): WorkflowDefinition {
  ensure(new TextEncoder().encode(JSON.stringify(raw)).byteLength <= MAX_DEFINITION_BYTES, "CONFIGURATION_LIMIT");
  const v = record(raw, ["schemaVersion", "name", "description", "intendedProjectType", "stages"]);
  ensure(v.schemaVersion === 1, "UNSUPPORTED_SCHEMA_VERSION"); string(v.name, 160); string(v.description, 4000);
  if (v.intendedProjectType !== null) choice(v.intendedProjectType, projectTypes);
  array(v.stages, 30);
  const ids = new Set<string>();
  function id(value: unknown) { identifier(value); ensure(!ids.has(value), "DUPLICATE_IDENTIFIER"); ids.add(value); }
  v.stages.forEach((rawStage, position) => {
    const s = record(rawStage, ["id", "title", "description", "position", "capabilities", "gates"]); id(s.id); string(s.title, 160); string(s.description, 4000);
    ensure(s.position === position, "INVALID_STAGE_ORDER"); array(s.capabilities, 12); array(s.gates, 40);
    s.capabilities.forEach(rawBlock => {
      ensure(rawBlock && typeof rawBlock === "object" && !Array.isArray(rawBlock), "INVALID_CAPABILITY");
      const type = (rawBlock as Record<string, unknown>).type; choice(type, Object.keys(capabilityRegistry));
      const base = ["id", "type", "title", "instructions"];
      const extras = type === "INFORMATION" ? ["fields"] : type === "FILE_REQUIREMENT" ? ["acceptedTypes", "minFiles", "maxFiles", "required", "acceptance", "acceptedVersionsGate"] : type === "CHECKLIST" ? ["items"] : ["steps", "rejection", "gatesProgression"];
      const b = record(rawBlock, [...base, ...extras]); id(b.id); string(b.title, 160); string(b.instructions, 4000);
      if (type === "INFORMATION") {
        array(b.fields, 40);
        b.fields.forEach(rawField => {
          const f = record(rawField, ["id", "type", "label", "help", "required", "options", "defaultValue", "min", "max"]);
          id(f.id); choice(f.type, fieldTypes); string(f.label, 160); string(f.help); bool(f.required); array(f.options, 40);
          f.options.forEach(o => { string(o, 160); ensure(String(o).trim(), "EMPTY_OPTION"); });
          ensure(new Set(f.options).size === f.options.length, "DUPLICATE_OPTION");
          ensure(f.type === "SELECT" || f.options.length === 0, "INVALID_FIELD_OPTIONS");
          for (const bound of [f.min, f.max]) ensure(bound === null || (typeof bound === "number" && Number.isFinite(bound) && Math.abs(bound) <= 1e12), "INVALID_FIELD_BOUNDS");
          if (["SHORT_TEXT", "LONG_TEXT"].includes(String(f.type))) for (const bound of [f.min, f.max]) if (bound !== null) integer(bound, 0, f.type === "SHORT_TEXT" ? 500 : 10000);
          if (!["SHORT_TEXT", "LONG_TEXT", "NUMBER"].includes(String(f.type))) ensure(f.min === null && f.max === null, "INVALID_FIELD_BOUNDS");
          ensure(f.min === null || f.max === null || Number(f.min) <= Number(f.max), "INVALID_FIELD_BOUNDS");
          ensure(f.type !== "READ_ONLY" || f.required === false, "READ_ONLY_CANNOT_BE_REQUIRED");
          if (f.defaultValue !== null) {
            if (f.type === "NUMBER") ensure(typeof f.defaultValue === "number" && Number.isFinite(f.defaultValue) && Math.abs(f.defaultValue) <= 1e12, "INVALID_DEFAULT");
            else string(f.defaultValue, f.type === "SHORT_TEXT" ? 500 : 10000);
            if (f.type === "SELECT") ensure(f.options.includes(f.defaultValue), "INVALID_DEFAULT");
            if (f.type === "DATE") ensure(typeof f.defaultValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.defaultValue) && !isNaN(Date.parse(f.defaultValue)) && new Date(f.defaultValue).toISOString().slice(0, 10) === f.defaultValue, "INVALID_DEFAULT");
            if (["NUMBER", "SHORT_TEXT", "LONG_TEXT"].includes(String(f.type))) {
              const n = f.type === "NUMBER" ? Number(f.defaultValue) : String(f.defaultValue).length;
              ensure((f.min === null || n >= Number(f.min)) && (f.max === null || n <= Number(f.max)), "INVALID_DEFAULT");
            }
          }
        });
      } else if (type === "FILE_REQUIREMENT") {
        array(b.acceptedTypes, 20); b.acceptedTypes.forEach(t => ensure(typeof t === "string" && /^(\.[a-z0-9]{1,12}|[a-z0-9.+-]+\/[a-z0-9.+-]+)$/.test(t), "INVALID_FILE_TYPE"));
        ensure(new Set(b.acceptedTypes).size === b.acceptedTypes.length, "DUPLICATE_FILE_TYPE");
        integer(b.minFiles, 0, 100); integer(b.maxFiles, 1, 100); bool(b.required); bool(b.acceptedVersionsGate); choice(b.acceptance, ["NONE", "OWNER", "REVIEWER"]);
        ensure(Number(b.minFiles) <= Number(b.maxFiles) && (!b.required || Number(b.minFiles) >= 1), "INVALID_FILE_COUNT");
        ensure(!b.acceptedVersionsGate || (b.required && b.acceptance !== "NONE"), "IMPOSSIBLE_FILE_GATE");
      } else if (type === "CHECKLIST") {
        array(b.items, 60); b.items.forEach(rawItem => { const i = record(rawItem, ["id", "label", "description", "required", "evidence"]); id(i.id); string(i.label, 160); string(i.description); bool(i.required); choice(i.evidence, evidenceTypes); });
      } else {
        array(b.steps, 12); bool(b.gatesProgression); choice(b.rejection, ["RETURN_FOR_CHANGES", "BLOCK_STAGE"]);
        b.steps.forEach(rawStep => { const a = record(rawStep, ["id", "label", "approver", "evidence", "decision"]); id(a.id); string(a.label, 160); choice(a.approver, approverTypes); choice(a.evidence, ["CONFIGURED_INPUTS", "SHARED_FILE_VERSION"]); ensure(a.decision === "APPROVE_REQUIRED", "MANDATORY_DECISION_REQUIRED"); });
      }
    });
  });
  const definition = raw as WorkflowDefinition;
  definition.stages.forEach((stage, index) => {
    const seen = new Set<string>();
    stage.gates.forEach(rawGate => {
      ensure(rawGate && typeof rawGate === "object", "INVALID_GATE"); choice(rawGate.type, Object.keys(gateRegistry));
      const g = record(rawGate, rawGate.type === "PRECEDING_STAGE" ? ["type", "stageId"] : ["type", "capabilityId"]);
      const ref = g.stageId ?? g.capabilityId; identifier(ref);
      const key = `${g.type}:${ref}`; ensure(!seen.has(key), "DUPLICATE_GATE"); seen.add(key);
      if (g.type === "PRECEDING_STAGE") ensure(definition.stages.slice(0, index).some(s => s.id === ref), "INVALID_GATE_DEPENDENCY");
      else {
        const block = stage.capabilities.find(b => b.id === ref);
        ensure(block, "MISSING_GATE_REFERENCE");
        ensure((g.type === "REQUIRED_FIELDS" && block.type === "INFORMATION" && block.fields.some(f => f.required)) ||
          (g.type === "REQUIRED_CHECKLIST" && block.type === "CHECKLIST" && block.items.some(i => i.required)) ||
          (g.type === "ACCEPTED_FILES" && block.type === "FILE_REQUIREMENT" && block.acceptedVersionsGate) ||
          (g.type === "APPROVAL_COMPLETE" && block.type === "APPROVAL" && block.gatesProgression && block.steps.length > 0), "IMPOSSIBLE_GATE");
      }
    });
  });
  return structuredClone(definition);
}
export function validateDefinition(d: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const need = (value: unknown, path: string, message: string) => { if (!value) issues.push({ path, message }); };
  need(d.name.trim(), "name", "Give this workflow a name."); need(d.stages.length, "stages", "Add at least one stage.");
  d.stages.forEach((s, index) => {
    const p = `stages.${index}`; need(s.title.trim(), `${p}.title`, "Give this stage a title."); need(s.capabilities.length, `${p}.capabilities`, "Add at least one capability.");
    s.capabilities.forEach((b, n) => {
      const path = `${p}.capabilities.${n}`; need(b.title.trim(), `${path}.title`, "Give this capability a title.");
      if (b.type === "INFORMATION") { need(b.fields.length || b.instructions.trim(), path, "Add instructions or information fields."); b.fields.forEach((f, i) => { need(f.label.trim(), `${path}.fields.${i}`, "Label this field."); if (f.type === "SELECT") need(f.options.length, `${path}.fields.${i}`, "Add select options."); }); }
      if (b.type === "FILE_REQUIREMENT") need(b.acceptedTypes.length, path, "Specify accepted file types.");
      if (b.type === "CHECKLIST") { need(b.items.length, path, "Add checklist items."); b.items.forEach((item, i) => need(item.label.trim(), `${path}.items.${i}`, "Label this checklist item.")); }
      if (b.type === "APPROVAL") { need(b.steps.length, path, "Add ordered approval steps."); b.steps.forEach((step, i) => need(step.label.trim(), `${path}.steps.${i}`, "Label this approval step.")); }
    });
  }); return issues;
}
/** Explicit metadata only; no DB column/path and no executable Tasker adapter. */
export function fieldTargets(definition: WorkflowDefinition) {
  return definition.stages.flatMap(stage => stage.capabilities.flatMap(block => block.type === "INFORMATION" ? block.fields.filter(f => f.type !== "READ_ONLY").map(field => ({ schemaVersion: 1 as const, stageId: stage.id, capabilityId: block.id, fieldId: field.id, valueType: field.type, runtimeAdapter: null })) : []));
}
export function newId() { return `d_${crypto.randomUUID().replaceAll("-", "")}`; }
export function duplicateStage(stage: StageDefinition): StageDefinition {
  const copy = structuredClone(stage), map = new Map<string, string>();
  const replace = (old: string) => { const fresh = newId(); map.set(old, fresh); return fresh; };
  copy.id = replace(copy.id); copy.title = `${copy.title.slice(0, 150)} (copy)`;
  copy.capabilities.forEach(b => { b.id = replace(b.id); if (b.type === "INFORMATION") b.fields.forEach(f => { f.id = replace(f.id); }); if (b.type === "CHECKLIST") b.items.forEach(i => { i.id = replace(i.id); }); if (b.type === "APPROVAL") b.steps.forEach(s => { s.id = replace(s.id); }); });
  copy.gates = copy.gates.map(g => g.type === "PRECEDING_STAGE" ? g : { ...g, capabilityId: map.get(g.capabilityId)! }); return copy;
}

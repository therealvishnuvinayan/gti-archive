import type { Capability, FieldDefinition, StageDefinition } from "../stage-builder/contracts";
import type { CapabilityGap, SourceTrace, TemplateBlueprint } from "./contracts";

export const sourceIdentity = {
  title: "Flux – Project Process Templates & Content Specification", version: "2026-09-29",
  sha256: "4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944",
  pagination: "Supplied as 19 pages; page numbers unverified. Use exact OOXML section/paragraph locators.",
};
const candidate = "Internal candidate choice: requiredness, bounds, file counts, reviewer routing and fixed gates need business confirmation.";
export const internalScope = "UNAPPROVED CANDIDATE · INTERNAL EVIDENCE PILOT. Human evidence capture only; not an official GTI standard. No conditional rules, skip, external dispatch, procurement, automatic tasks or archive. After all stages, project closure still requires a separately Director-approved per-project document policy, actual Owner completion request and separate Director final decision.";

/** Authoring helpers emit only the existing v1 configuration; no runtime rules. */
export function blueprintAuthoring(prefix: string) {
  const trace: Record<string, SourceTrace> = {}, stages: StageDefinition[] = [];
  const mark = (key: string, paragraphs: number[], interpretation = candidate) => {
    const id = `${prefix}_${key}`;
    if (trace[id]) throw new Error(`Duplicate blueprint trace: ${id}`);
    trace[id] = { paragraphs, interpretation }; return id;
  };
  function field(key: string, label: string, paragraphs: number[], type: FieldDefinition["type"] = "LONG_TEXT", required = true, options: string[] = [], help = "", defaultValue: FieldDefinition["defaultValue"] = null): FieldDefinition {
    return { id: mark(key, paragraphs), label, type, required, options, help: `${help} ${candidate}`.trim(), defaultValue,
      min: required && ["SHORT_TEXT", "LONG_TEXT"].includes(type) ? 1 : null,
      max: type === "SHORT_TEXT" ? 500 : type === "LONG_TEXT" ? 10000 : null };
  }
  const info = (key: string, title: string, paragraphs: number[], fields: FieldDefinition[], instructions = "Project summary only. Attach the detailed register; individual rows and quantities are not validated."): Capability =>
    ({ id: mark(key, paragraphs), type: "INFORMATION", title, instructions: `${instructions} ${candidate}`, fields });
  const file = (key: string, title: string, paragraphs: number[], instructions: string, acceptedTypes = [".pdf"], required = true): Capability =>
    ({ id: mark(key, paragraphs), type: "FILE_REQUIREMENT", title, instructions: `${instructions} ${candidate} Review binds an exact sealed version, not physical or legal certification.`, acceptedTypes,
      minFiles: required ? 1 : 0, maxFiles: 20, required, acceptance: "REVIEWER", acceptedVersionsGate: required });
  const checks = (key: string, title: string, paragraphs: number[], items: [string, string, number[]][]): Capability =>
    ({ id: mark(key, paragraphs), type: "CHECKLIST", title, instructions: `Human attestations with written evidence and limitations. No automated compliance, quantity or physical validation. ${candidate}`,
      items: items.map(([id, label, refs]) => ({ id: mark(id, refs), label, description: "Describe the human review, applicable material/components and unresolved exceptions. This records an attestation only.", required: true, evidence: "TEXT" })) });
  const approval = (key: string, title: string, paragraphs: number[], approver: "DIRECTOR" | "PROJECT_OWNER", instructions: string): Capability =>
    ({ id: mark(key, paragraphs), type: "APPROVAL", title, instructions: `${instructions} Internal evidence decision only; never external approval, production dispatch or certification. Reviewer cannot be requester or evidence contributor. ${candidate}`,
      steps: [{ id: mark(`${key}_decision`, paragraphs), label: title, approver, evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" }], rejection: "RETURN_FOR_CHANGES", gatesProgression: true });
  function stage(key: string, title: string, paragraphs: number[], guidance: string, capabilities: Capability[]) {
    const id = mark(key, paragraphs), gates: StageDefinition["gates"] = stages.length ? [{ type: "PRECEDING_STAGE", stageId: stages.at(-1)!.id }] : [];
    for (const b of capabilities) {
      if (b.type === "INFORMATION" && b.fields.some(f => f.required)) gates.push({ type: "REQUIRED_FIELDS", capabilityId: b.id });
      if (b.type === "CHECKLIST") gates.push({ type: "REQUIRED_CHECKLIST", capabilityId: b.id });
      if (b.type === "FILE_REQUIREMENT" && b.required) gates.push({ type: "ACCEPTED_FILES", capabilityId: b.id });
      if (b.type === "APPROVAL") gates.push({ type: "APPROVAL_COMPLETE", capabilityId: b.id });
    }
    gates.forEach((_, i) => { trace[`${id}.gate.${i}`] = { paragraphs, interpretation: `${candidate} AND of supported gates; no branch, task-status gate or skip.` }; });
    stages.push({ id, title, position: stages.length, description: `${guidance} What now: record applicable information, attach evidence and obtain independent review. Move on: complete all configured fixed gates. ${candidate}`, capabilities, gates });
  }
  function finish(id: string, name: string, category: TemplateBlueprint["category"], paragraphs: number[], limitations: string, gaps: CapabilityGap[], tasker: TemplateBlueprint["tasker"]): TemplateBlueprint {
    trace.workflow = { paragraphs, interpretation: `Source sequence retained as configurable evidence stages. Creative work uses existing Universal Tasks; no legacy concept engine. ${candidate}` };
    return { blueprintSchemaVersion: 1, id, revision: 1, category, designation: "UNAPPROVED_CANDIDATE", source: { ...sourceIdentity }, definitionSchemaVersion: 1,
      definition: { schemaVersion: 1, name: `${name} · internal candidate v1`, intendedProjectType: category, description: `${internalScope} Blueprint ${id} revision 1; source ${sourceIdentity.version} SHA-256 ${sourceIdentity.sha256}. ${limitations} ${candidate}`, stages },
      scope: "INTERNAL_EVIDENCE_PILOT", trace, gaps, tasker,
      revisionPolicy: "Increment blueprint revision for content or policy changes. Keep semantic IDs for unchanged meanings; new meanings need new IDs and a compatibility map. Imported copies are editable and edits are not automatically source-certified. Published versions and runtime pins never change." };
  }
  return { field, info, file, checks, approval, stage, finish };
}

export function generalBriefFields(a: ReturnType<typeof blueprintAuthoring>) {
  return [
    a.field("cb_header", "Brief header: date, brand, project and client", [437]),
    a.field("cb_background", "Background and business problem", [438]),
    a.field("cb_objective", "Objective and success measures", [439]),
    a.field("cb_target", "Target group, market and channel", [440], "LONG_TEXT", true, [], "Source target group: adult smokers of legal age only."),
    a.field("cb_deliverables", "Deliverables, formats and quantities", [441]),
    a.field("cb_mandatory", "Brand rules, compulsory texts and local restrictions", [442]),
    a.field("cb_timeline", "Budget range, timeline and milestones", [443]),
    a.field("cb_presentation", "Presentation format and expected concepts", [444], "LONG_TEXT", true, [], "Record the agreed brief; no invented minimum or task-count gate."),
    a.field("cb_mode", "Collaboration context", [445], "SELECT", true, ["Direct", "Pitch"], "Context only; no vendor workflow or dispatch."),
    a.field("cb_contacts", "Contacts and proposed approval rules", [448]),
  ];
}

export function fileStandardChecks(a: ReturnType<typeof blueprintAuthoring>, variant: "POSM" | "DISPLAY") {
  return a.checks("artwork_checks", "Final Artwork File Standard · human review", [507, 508, 516], [
    ["fa_layers", "Layered editable files and embedded images reviewed", [509]],
    ["fa_resolution", "Base 300 dpi / A3 requirement and applicable variant resolution reviewed", [510, 516]],
    ["fa_psd", "PSD components and separate shadows reviewed", [511]],
    ["fa_fonts", "Editable typefaces and legal texts reviewed", [512]],
    ["fa_colours", "CMYK / Pantone, finishes and white / varnish layers reviewed", [513]],
    ["fa_bleed", "Bleed, safety margins and separate dieline reviewed", [514]],
    ["fa_naming", "PROJECT_SKU_MARKET_ELEMENT_vXX_DATE, folders and PDF preview reviewed", [515]],
    ["fa_variant", variant === "POSM" ? "Applicable print variant or merchandise vector logo / supplier print-area template reviewed" : "Large-format scale, material-specific resolution and component naming reviewed", [516]],
  ]);
}

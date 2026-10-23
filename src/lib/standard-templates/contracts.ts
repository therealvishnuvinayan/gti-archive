import { parseDefinition, validateDefinition, type WorkflowDefinition, type ValidationIssue } from "../stage-builder/contracts";

export const coverageClasses = ["SUPPORTED_NOW", "SUPPORTED_WITH_EXISTING_ADAPTER", "REQUIRES_NEW_CAPABILITY", "REQUIRES_EXTERNAL_INTEGRATION", "REQUIRES_BUSINESS_DECISION", "SUPERSEDED_BY_APPROVED_V2_RULE"] as const;
export type CoverageClass = typeof coverageClasses[number];
export type OfficialCategory = Exclude<NonNullable<WorkflowDefinition["intendedProjectType"]>, "CUSTOM">;
export type SourceTrace = { paragraphs: number[]; interpretation: string };
export type CapabilityGap = { id: string; paragraphs: number[]; classification: CoverageClass; missing: string; internalPilotTreatment: string };
export type TemplateBlueprint = {
  blueprintSchemaVersion: 1; id: string; revision: number; category: OfficialCategory;
  designation: "UNAPPROVED_CANDIDATE";
  source: { title: string; version: string; sha256: string; pagination: string };
  definitionSchemaVersion: 1; definition: WorkflowDefinition;
  scope: "INTERNAL_EVIDENCE_PILOT";
  trace: Record<string, SourceTrace>; gaps: CapabilityGap[];
  tasker: { type: "INITIAL_CONCEPT" | "FINAL_CONCEPT"; paragraphs: number[]; instructions: string }[];
  revisionPolicy: string;
};

/** Definition validation remains exclusively the existing Stage Builder contract.
 * The wrapper records provenance, scope and gaps; it is not another execution engine. */
export function validateBlueprint(blueprint: TemplateBlueprint, purpose: "INTERNAL_EVIDENCE_PILOT" | "OFFICIAL_STANDARD" = "INTERNAL_EVIDENCE_PILOT"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (blueprint.blueprintSchemaVersion !== 1 || blueprint.definitionSchemaVersion !== 1 || blueprint.revision < 1 || !Number.isInteger(blueprint.revision)) add("revision", "Unsupported blueprint revision/schema.");
  if (blueprint.designation !== "UNAPPROVED_CANDIDATE" || blueprint.scope !== "INTERNAL_EVIDENCE_PILOT") add("scope", "Only an unapproved internal evidence candidate may be imported.");
  if (!/^[a-z][a-z0-9-]+$/.test(blueprint.id) || !/^[a-f0-9]{64}$/.test(blueprint.source.sha256)) add("source", "Stable identity and exact source hash are required.");
  const definition = parseDefinition(blueprint.definition);
  issues.push(...validateDefinition(definition));
  if (definition.intendedProjectType !== blueprint.category) add("category", "Definition and blueprint classifications differ.");
  const targets = ["workflow"];
  for (const stage of definition.stages) {
    targets.push(stage.id, ...stage.gates.map((_, i) => `${stage.id}.gate.${i}`));
    for (const block of stage.capabilities) {
      targets.push(block.id);
      if (block.type === "INFORMATION") targets.push(...block.fields.map(f => f.id));
      if (block.type === "CHECKLIST") targets.push(...block.items.map(i => i.id));
      if (block.type === "APPROVAL") targets.push(...block.steps.map(s => s.id));
    }
  }
  for (const key of targets) if (!blueprint.trace[key]) add(`trace.${key}`, "Missing source trace.");
  for (const [key, trace] of Object.entries(blueprint.trace)) {
    if (!targets.includes(key)) add(`trace.${key}`, "Trace points to a missing definition element.");
    if (!trace.interpretation.trim() || !trace.paragraphs.length || trace.paragraphs.some(p => !Number.isInteger(p) || p < 2 || p > 524)) add(`trace.${key}`, "Invalid source paragraph or missing interpretation.");
  }
  if (new Set(blueprint.gaps.map(g => g.id)).size !== blueprint.gaps.length) add("gaps", "Duplicate capability gap.");
  for (const gap of blueprint.gaps) {
    if (!coverageClasses.includes(gap.classification) || !gap.missing || !gap.internalPilotTreatment || !gap.paragraphs.length) add(`gaps.${gap.id}`, "Describe the unsupported requirement and its explicit scope treatment.");
    if (purpose === "OFFICIAL_STANDARD") add(`gaps.${gap.id}`, gap.missing);
  }
  return issues;
}

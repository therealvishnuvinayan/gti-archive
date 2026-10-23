import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { packagingBlueprint } from "../src/lib/standard-templates/packaging";
import { posmBlueprint } from "../src/lib/standard-templates/posm";
import { retailDisplayBlueprint } from "../src/lib/standard-templates/retail-display";
import { exhibitionStandBlueprint } from "../src/lib/standard-templates/exhibition-stand";
import { digitalBlueprint, digitalSecretGuidance, digitalMaintenanceGuidance } from "../src/lib/standard-templates/digital";
import { validateBlueprint, coverageClasses } from "../src/lib/standard-templates/contracts";
import source from "../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json";
import mapping from "../docs/requirements/GTI_FLUX_Source_to_V2_Map.json";

// Node-only verification of the real server hash; preserve the production marker.
const requireLocal = createRequire(__filename);
const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load;
mod._load = function (name, ...args) { return name === "server-only" ? {} : original.call(this, name, ...args); };
const { configurationHash } = requireLocal("../src/lib/stage-builder/hash") as typeof import("../src/lib/stage-builder/hash");
mod._load = original;

const blueprint = packagingBlueprint(), paragraphs = new Set(source.paragraphs.map(p => Number(p.id.slice(1))));
assert.equal(createHash("sha256").update(readFileSync(resolve("docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx"))).digest("hex"), blueprint.source.sha256);
assert.equal(source.sha256, blueprint.source.sha256);
assert.deepEqual(validateBlueprint(blueprint), []);
assert.ok(validateBlueprint(blueprint, "OFFICIAL_STANDARD").length > 0);
assert.deepEqual(packagingBlueprint(), blueprint);
assert.equal(mapping.source.sha256, source.sha256);
assert.deepEqual(new Set(mapping.crossCuttingCoverage.map(r => r.classification)), new Set(coverageClasses));
for (const requirement of mapping.crossCuttingCoverage) for (const p of requirement.paragraphs) assert.ok(paragraphs.has(p));
for (const binding of Object.values(blueprint.trace)) for (const p of binding.paragraphs) assert.ok(paragraphs.has(p));
assert.deepEqual(mapping.processes.map(p => [p.processStageCount, p.maintenanceAdditional]), [[8, false], [6, false], [7, false], [8, false], [7, true]]);
const report = { blueprint, definitionHash: configurationHash(blueprint.definition), validation: { internalCandidate: validateBlueprint(blueprint), officialStandard: validateBlueprint(blueprint, "OFFICIAL_STANDARD") } };
const target = resolve("docs/requirements/GTI_Packaging_Blueprint_v1.json"), serialized = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--write")) writeFileSync(target, serialized);
else assert.equal(readFileSync(target, "utf8"), serialized, "Blueprint differs from its reviewable revision snapshot; review revision/ID compatibility before exporting.");
console.log(JSON.stringify({ status: "PASS", sourceParagraphs: source.paragraphs.length, stages: blueprint.definition.stages.length, traceBindings: Object.keys(blueprint.trace).length, definitionBytes: Buffer.byteLength(JSON.stringify(blueprint.definition)), definitionHash: report.definitionHash, officialBlockers: report.validation.officialStandard.length }));
assert.equal(report.definitionHash, "1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7", "Original Packaging content must remain unchanged");

for (const [factory, stem, category, stageCount] of [[posmBlueprint, "POSM", "POSM", 6], [retailDisplayBlueprint, "Retail_Display", "RETAIL_DISPLAY", 7], [exhibitionStandBlueprint, "Exhibition_Stand", "EXHIBITION_STAND", 8], [digitalBlueprint, "Digital", "DIGITAL", 7]] as const) {
  const b = factory();
  assert.deepEqual(validateBlueprint(b), []);
  assert.deepEqual(factory(), b);
  assert.equal(b.source.sha256, source.sha256);
  assert.equal(b.category, category);
  assert.equal(b.definition.stages.length, stageCount);
  const official = validateBlueprint(b, "OFFICIAL_STANDARD");
  assert.deepEqual(official.map(i => i.path), b.gaps.map(g => `gaps.${g.id}`));
  for (const binding of [...Object.values(b.trace), ...b.gaps, ...b.tasker]) for (const p of binding.paragraphs) assert.ok(paragraphs.has(p), `Missing source P${p}`);
  const missing = factory(); delete missing.trace.workflow;
  assert.ok(validateBlueprint(missing).some(i => i.path === "trace.workflow"));
  const duplicate = factory(); duplicate.definition.stages[1].id = duplicate.definition.stages[0].id;
  assert.throws(() => validateBlueprint(duplicate), /DUPLICATE_IDENTIFIER/);
  const fields = b.definition.stages.flatMap(s => s.capabilities.flatMap(c => c.type === "INFORMATION" ? c.fields : []));
  if (category === "POSM") {
    const material = fields.find(f => f.id === "posm_material_type")!;
    assert.deepEqual(material.options, ["Printed POSM", "Merchandise"]);
    assert.equal(material.type, "SELECT"); assert.equal(material.required, true);
    for (const f of fields.filter(f => /^posm_(printed|merch)_/.test(f.id))) assert.equal(f.required, false, `${f.id} must not force the irrelevant branch`);
    const quotes = b.definition.stages[1].capabilities.find(c => c.id === "posm_merch_quotes")!;
    assert.ok(quotes.type === "FILE_REQUIREMENT"); assert.equal(quotes.minFiles, 0); assert.equal(quotes.required, false);
    assert.ok(b.gaps.find(g => g.id === "material-applicability-skip"));
    assert.ok(b.gaps.find(g => g.id === "structured-offers"));
    assert.ok(b.gaps.find(g => g.id === "outlet-photo-count"));
  } else if (category === "RETAIL_DISPLAY") {
    for (const key of ["width", "height", "depth"]) { const f = fields.find(f => f.id === `retail_${key}`)!; assert.equal(f.type, "NUMBER"); assert.equal(f.min, null); assert.equal(f.defaultValue, null); }
    assert.equal(fields.find(f => f.id === "retail_dimension_unit")?.defaultValue, null);
    for (const id of ["survey-coverage-sample", "component-production-units", "outlet-installation-issue-gate", "physical-prototype"]) assert.ok(b.gaps.find(g => g.id === id));
  } else if (category === "EXHIBITION_STAND") {
    assert.deepEqual(b.definition.stages.map(s => s.id), ["brief", "planning", "contractors", "design", "graphics", "buildup", "event", "wrapup"].map(s => `exhibition_${s}`));
    for (const f of fields.filter(f => f.type === "DATE")) assert.equal(f.defaultValue, null, "No calculated or invented deadline");
    for (const key of ["design_deadline", "electricity_deadline", "rigging_deadline", "badges_deadline", "catering_deadline", "freight_deadline"]) assert.equal(fields.find(f => f.id === `exhibition_${key}`)?.type, "DATE");
    assert.equal(fields.find(f => f.id === "exhibition_related_refs")?.type, "LONG_TEXT");
    assert.match(String(fields.find(f => f.id === "exhibition_links_notice")?.defaultValue), /not typed links, foreign keys or budget aggregation/);
    assert.equal(b.definition.stages[2].capabilities.find(c => c.id === "exhibition_rfp_offers")?.type, "FILE_REQUIREMENT");
    for (const id of ["event-scheduling", "historical-report-reuse", "structured-contractor-offers", "linked-project-budgets", "vendor-ratings"]) assert.ok(b.gaps.find(g => g.id === id));
  } else {
    assert.deepEqual(b.definition.stages.map(s => s.id), ["brief", "discovery", "ux", "ui", "specification", "testing", "launch"].map(s => `digital_${s}`));
    assert.deepEqual(fields.find(f => f.id === "digital_platform")?.options, ["Web", "iOS", "Android"]);
    assert.equal(fields.find(f => f.id === "digital_maintenance_notice")?.defaultValue, digitalMaintenanceGuidance);
    assert.ok(b.definition.description.includes(digitalMaintenanceGuidance));
    for (const f of fields) {
      assert.ok(f.help.includes(digitalSecretGuidance));
      assert.doesNotMatch(f.id, /password|api_key|recovery_code|secret_value|credential_value/);
      if (f.type !== "READ_ONLY") assert.equal(f.defaultValue, null);
    }
    for (const c of b.definition.stages.flatMap(s => s.capabilities)) if (c.type === "FILE_REQUIREMENT") assert.ok(c.instructions.includes(digitalSecretGuidance));
    for (const id of ["credential-vault-access-transfer", "maintenance-closure-policy", "maintenance-cost-ledger", "repeatable-uat-rounds", "bug-task-blocking", "deployment-go-live"]) assert.ok(b.gaps.find(g => g.id === id));
  }
  if (category === "EXHIBITION_STAND" || category === "DIGITAL") {
    const covered = new Set(Object.values(b.trace).flatMap(t => t.paragraphs));
    const [start, end] = category === "EXHIBITION_STAND" ? [165, 183] : [184, 202];
    for (let p = start; p <= end; p++) assert.ok(covered.has(p), `Unmapped source paragraph P${p}`);
    const process = mapping.processes.find(p => p.category === category)!;
    for (const stage of process.stages) for (const requirement of stage.sourceRequirements) assert.equal(source.paragraphs.find(p => Number(p.id.slice(1)) === requirement.paragraph)?.text, requirement.text);
  }
  for (const [i, s] of b.definition.stages.entries()) {
    if (i) assert.ok(s.gates.some(g => g.type === "PRECEDING_STAGE" && g.stageId === b.definition.stages[i - 1].id));
    for (const c of s.capabilities) if (c.type === "FILE_REQUIREMENT") { assert.equal(c.acceptance, "REVIEWER"); assert.equal(c.acceptedVersionsGate, c.required); }
  }
  const snapshot = { blueprint: b, definitionHash: configurationHash(b.definition), validation: { internalCandidate: validateBlueprint(b), officialStandard: official } };
  if (category === "POSM") assert.equal(snapshot.definitionHash, "2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc");
  if (category === "RETAIL_DISPLAY") assert.equal(snapshot.definitionHash, "dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694");
  const file = resolve(`docs/requirements/GTI_${stem}_Blueprint_v1.json`), data = JSON.stringify(snapshot, null, 2) + "\n";
  if (process.argv.includes("--write")) writeFileSync(file, data); else assert.equal(readFileSync(file, "utf8"), data, "Reviewed blueprint snapshot changed; review revision and ID compatibility.");
  console.log(JSON.stringify({ status: "PASS", id: b.id, sourceParagraphs: source.paragraphs.length, traceBindings: Object.keys(b.trace).length, definitionBytes: Buffer.byteLength(JSON.stringify(b.definition)), definitionHash: snapshot.definitionHash, officialBlockers: official.length,
    stages: b.definition.stages.map(s => ({ id: s.id, title: s.title, fields: s.capabilities.flatMap(c => c.type === "INFORMATION" ? c.fields : []).length, files: s.capabilities.filter(c => c.type === "FILE_REQUIREMENT").length, checklistItems: s.capabilities.flatMap(c => c.type === "CHECKLIST" ? c.items : []).length, reviews: s.capabilities.flatMap(c => c.type === "APPROVAL" ? c.steps : []).length, gates: s.gates.length })) }));
}

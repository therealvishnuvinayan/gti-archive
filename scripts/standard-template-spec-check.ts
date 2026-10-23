import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { packagingBlueprint } from "../src/lib/standard-templates/packaging";
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

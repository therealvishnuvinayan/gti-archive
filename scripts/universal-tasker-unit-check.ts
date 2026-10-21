import assert from "node:assert/strict";
import { deadline, object, ids, contextTarget, expectedVersion, taskTypes, enabledTaskTypes } from "../src/lib/tasker/contracts";
import { approvalHash } from "../src/lib/approvals/contracts";
assert.equal(taskTypes.length, 6);
assert.equal(deadline("2028-02-29T12:00:00+04:00").toISOString(), "2028-02-29T08:00:00.000Z");
for (const invalid of ["2026-02-29T12:00:00Z", "2026-04-31T12:00:00Z", "2026-10-21", "2026-10-21T12:00", null]) assert.throws(() => deadline(invalid));
for (const invalid of [0, -1, 1.1, NaN, "2"]) assert.throws(() => expectedVersion(invalid));
assert.throws(() => object({ actorId: "forged" }, ["title"])); assert.throws(() => ids(["u", "u"]));
assert.throws(() => contextTarget("stage:secret")); assert.throws(() => contextTarget("task:t:forged"));
assert.deepEqual(contextTarget("task:real-id"), { target: "task:real-id", kind: "task", key: "real-id" });
assert.equal(approvalHash({ text: "reason", version: 2 }), approvalHash({ version: 2, text: "reason" }));
assert.notEqual(approvalHash({ text: "reason", version: 2 }), approvalHash({ text: "changed", version: 2 }));
console.log("PASS Tasker units: strict identity/context/input/date/version boundaries, six type vocabulary and canonical replay/evidence hashing.");

const oldFlags = [process.env.FLUX_UNIVERSAL_TASKER, process.env.FLUX_TASKER_DELIVERABLES, process.env.FLUX_TASKER_CONCEPTS];
process.env.FLUX_UNIVERSAL_TASKER = "1"; process.env.FLUX_TASKER_DELIVERABLES = "1"; process.env.FLUX_TASKER_CONCEPTS = "0";
assert.deepEqual(enabledTaskTypes(), ["GENERAL", "FILE_UPLOAD", "DATA_INPUT"]);
process.env.FLUX_TASKER_CONCEPTS = "1"; assert.deepEqual(enabledTaskTypes(), [...taskTypes]);
process.env.FLUX_TASKER_DELIVERABLES = "0"; assert.deepEqual(enabledTaskTypes(), ["GENERAL", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"]);
for (const [i, key] of ["FLUX_UNIVERSAL_TASKER", "FLUX_TASKER_DELIVERABLES", "FLUX_TASKER_CONCEPTS"].entries()) { if (oldFlags[i] === undefined) delete process.env[key]; else process.env[key] = oldFlags[i]; }
console.log("PASS dedicated concept/deliverable flag isolation.");

import assert from "node:assert/strict";
import { deadline, object, ids, contextTarget, expectedVersion, taskTypes, enabledTaskTypes } from "../src/lib/tasker/contracts";
import { confirmationHash, sisterCommand } from "../src/lib/tasker/sister-contracts";
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

// Confirmation binds every editable field and selected exact evidence to the
// actual creator, while excluding only the explicit confirmation response.
const oldSisters = process.env.FLUX_TASKER_SISTERS, oldTasker = process.env.FLUX_UNIVERSAL_TASKER;
process.env.FLUX_UNIVERSAL_TASKER = "1"; process.env.FLUX_TASKER_SISTERS = "1";
const proposal = { commandId: "command", title: "Fresh work", executorId: "executor", sister: { sourceTaskId: "source", sourceVersion: 4, mode: "MODIFY", evidenceVersionIds: ["v2", "v1"] } };
const confirmation = confirmationHash("creator", proposal);
assert.equal(confirmationHash("creator", { ...proposal, sister: { ...proposal.sister, confirmed: true, confirmation } }), confirmation);
for (const patch of [{ title: "changed" }, { executorId: "forged" }, { sister: { ...proposal.sister, sourceTaskId: "other" } }, { sister: { ...proposal.sister, evidenceVersionIds: ["v3"] } }]) assert.notEqual(confirmationHash("creator", { ...proposal, ...patch }), confirmation);
assert.notEqual(confirmationHash("other-creator", proposal), confirmation);
for (const patch of [{ rootTaskId: "forged" }, { ownerId: "forged" }, { sourceVersion: 0 }, { mode: "REOPEN" }, { evidenceVersionIds: ["v1", "v1"] }]) assert.throws(() => sisterCommand({ ...proposal.sister, ...patch }));
process.env.FLUX_TASKER_SISTERS = "0"; assert.throws(() => sisterCommand(proposal.sister), /SISTERS_DISABLED/);
if (oldSisters === undefined) delete process.env.FLUX_TASKER_SISTERS; else process.env.FLUX_TASKER_SISTERS = oldSisters;
if (oldTasker === undefined) delete process.env.FLUX_UNIVERSAL_TASKER; else process.env.FLUX_UNIVERSAL_TASKER = oldTasker;
console.log("PASS Sister units: confirmation binds actor, command, details and exact versions; forged lineage/owner, invalid modes/versions, duplicate evidence and disabled capability denied.");

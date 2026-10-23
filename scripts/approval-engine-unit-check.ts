import assert from "node:assert/strict";
import { approvalHash, nextApprovalState, parseApprovalExpectation, validateApprovalPlan } from "../src/lib/approvals/contracts";

assert.equal(approvalHash({ b: [1, null], a: "value" }), approvalHash({ a: "value", b: [1, null] }));
assert.notEqual(approvalHash({ version: "v1" }), approvalHash({ version: "v2" }));
assert.throws(() => approvalHash({ invalid: undefined }));
assert.throws(() => approvalHash(Number.NaN));
validateApprovalPlan({ key: "completion-document-review.v1", steps: ["DOCUMENT_REVIEWER", "DIRECTOR"] });
assert.throws(() => validateApprovalPlan({ key: "bad", steps: [] }));
assert.throws(() => validateApprovalPlan({ key: "not a policy", steps: ["DIRECTOR"] }));
assert.deepEqual(nextApprovalState(1, 2, "APPROVE"), { state: "PENDING", currentStep: 2 });
assert.deepEqual(nextApprovalState(2, 2, "APPROVE"), { state: "APPROVED", currentStep: 2 });
assert.deepEqual(nextApprovalState(1, 2, "REJECT"), { state: "REJECTED", currentStep: 1 });
assert.throws(() => nextApprovalState(3, 2, "APPROVE"));
const expected = { requestId: "request", stepId: "step", revision: 0, evidenceHash: "a".repeat(64), commandId: "fixture-command-123" };
assert.deepEqual(parseApprovalExpectation(expected), expected);
for (const value of [null, {}, { ...expected, actorId: "director" }, { ...expected, revision: -1 }, { ...expected, revision: 1.5 }, { ...expected, evidenceHash: "mutable-key" }, { ...expected, commandId: "" }]) assert.throws(() => parseApprovalExpectation(value));
console.log("PASS approval units: canonical evidence hashes, fixed policy validation, ordered decisions, rejection and strict stale-request contracts.");

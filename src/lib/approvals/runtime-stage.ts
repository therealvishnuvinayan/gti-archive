import "server-only";
import { isConfiguredRuntimeReviewer } from "./runtime-stage-eligibility";
import { randomUUID } from "node:crypto";
import { approvalCondition, approvalHash, type ApprovalOutcome } from "./contracts";
import { decideTypedApproval } from "./engine";
import { capability, type Values, type Checks } from "../stage-runtime/contracts";
import { evidenceSnapshot, json, runtimeActor, type StageData, type Tx } from "../stage-runtime/data";
import { ensure } from "../stage-builder/contracts";

export async function openRuntimeApproval(tx: Tx, data: StageData, capabilityId: unknown) {
  const c = capability(data.definition, capabilityId, "APPROVAL"), actor = await runtimeActor(tx);
  ensure(data.gates(true).ready, "APPROVAL_INPUTS_INCOMPLETE", 409);
  const previous = data.stage.approvals.find(a => a.capabilityId === c.id);
  ensure(!previous || previous.evidenceRevision < data.stage.evidenceRevision, "REVISE_BEFORE_RESUBMITTING", 409);
  const selected = data.files.filter(f => !f.replaced && ["ACCEPTED", "SUBMITTED"].includes(f.state));
  ensure(!c.steps.some(s => s.evidence === "SHARED_FILE_VERSION") || selected.length > 0, "FILE_APPROVAL_EVIDENCE_REQUIRED");
  const snapshot = evidenceSnapshot(data), policySnapshot = { key: "runtime-stage.ordered.v1", capabilityId: c.id, steps: c.steps, independentReview: true };
  const subjectSnapshot = { ...snapshot, capabilityId: c.id };
  const evidence = selected.map(f => ({ fileVersionId: f.versionId, snapshot: json({ id: f.version.id, fileId: f.version.fileId, number: f.version.number, objectETag: f.version.objectETag, objectVersionId: f.version.objectVersionId, checksumSha256: f.version.checksumSha256, checksumEvidence: f.version.checksumEvidence }) })).sort((a, b) => a.fileVersionId.localeCompare(b.fileVersionId));
  const id = `rs_${randomUUID().replaceAll("-", "")}`, rid = `ar_${randomUUID().replaceAll("-", "")}`, at = new Date();
  await tx.runtimeApprovalSubmission.create({ data: { id, stageId: data.stage.id, capabilityId: c.id, evidenceRevision: data.stage.evidenceRevision, snapshot: json(subjectSnapshot), snapshotHash: approvalHash(subjectSnapshot), requestedById: actor.userId, actorVersion: actor.authorizationVersion!, requestedAt: at, approvalRequestId: rid } });
  await tx.approvalRequest.create({ data: { id: rid, subjectType: "RUNTIME_STAGE", subjectId: data.stage.id, subjectVersion: id, requestedById: actor.userId, requestedAt: at, policyKey: policySnapshot.key, policySnapshot: json(policySnapshot), subjectSnapshot: json(subjectSnapshot), evidenceHash: approvalHash({ subjectSnapshot, policySnapshot, evidence }),
    steps: { create: c.steps.map((_, n) => ({ position: n + 1, eligibility: "RUNTIME_STAGE_REVIEWER" })) }, evidence: { create: evidence } } });
  await tx.approvalEvent.create({ data: { requestId: rid, action: "REQUESTED", actorId: actor.userId, createdAt: at, details: { stageId: data.stage.id } } });
  return { requestId: rid };
}
export async function decideRuntimeApproval(tx: Tx, data: StageData, input: { expected: unknown; outcome: ApprovalOutcome; reason: string }) {
  ensure(input.expected && typeof input.expected === "object" && "requestId" in input.expected && typeof input.expected.requestId === "string", "INVALID_APPROVAL_EXPECTATION");
  const requestId = input.expected.requestId;
  const sub = data.stage.approvals.find(s => s.approvalRequestId === requestId); ensure(sub, "APPROVAL_NOT_FOUND", 404);
  const c = capability(data.definition, sub.capabilityId, "APPROVAL");
  return decideTypedApproval(tx, requestId, input, { subjectType: "RUNTIME_STAGE", authorize: async request => {
    const actor = await runtimeActor(tx);
    approvalCondition(sub.evidenceRevision === data.stage.evidenceRevision && sub.snapshotHash === approvalHash({ ...evidenceSnapshot(data), capabilityId: c.id }), "APPROVAL_EVIDENCE_CHANGED");
    const expectedStep = input.expected as { stepId?: unknown }, step = request.steps.find(s => s.id === expectedStep.stepId);
    approvalCondition(step, "APPROVER_STEP_DENIED");
    const configured = c.steps[step.position - 1];
    const project = await tx.runtimeProject.findUniqueOrThrow({ where: { id: data.stage.projectId }, include: { participants: true } });
    const contributors = [sub.requestedById, ...Object.values(data.stage.values as Values).map(v => v.actorId), ...Object.values(data.stage.checklist as Checks).filter(v => v.complete).map(v => v.actorId), ...data.files.filter(f => !f.replaced).map(f => f.submittedById)];
    approvalCondition(isConfiguredRuntimeReviewer(actor, configured.approver, project, contributors), "APPROVER_STEP_DENIED");
    const requester = await tx.userAuthorization.findUnique({ where: { userId: sub.requestedById } });
    approvalCondition(requester?.accountStatus === "ACTIVE" && requester.authorizationVersion === sub.actorVersion && ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(requester.businessRole ?? ""), "APPROVER_RESOURCE_DENIED");
    await tx.$queryRaw`SELECT set_config('flux.approval_actor', ${actor.userId}, true), set_config('flux.approval_session', ${actor.session.id}, true)`;
    return actor;
  }, applyNative: async () => null });
}

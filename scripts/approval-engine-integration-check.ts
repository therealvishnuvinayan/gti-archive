import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ApprovalExpectation } from "../src/lib/approvals/contracts";

type User = NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>;
type Context = {
  db: PrismaClient;
  objects: Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string; ChecksumSHA256?: string; ChecksumType?: string }>;
  user: (id: string) => Promise<User>;
  renewSession: (id: string) => Promise<User>;
  fixture: (id: string) => Promise<{ kind: "ARTWORK"; projectId: string }>;
  load: (name: string) => unknown;
};
export async function verifyApprovalEngine({ db, objects, user, renewSession, fixture, load }: Context) {
  const docs = load("src/lib/project-completion.js") as typeof import("../src/lib/project-completion");
  const reviews = load("src/lib/completion-documents/service.js") as typeof import("../src/lib/completion-documents/service");
  const engine = load("src/lib/approvals/service.js") as typeof import("../src/lib/approvals/service");
  const api = load("src/app/api/project-completion-documents/reviews/route.js") as typeof import("../src/app/api/project-completion-documents/reviews/route");
  const { runProjectMutation } = load("src/lib/authorization/project-write.js") as typeof import("../src/lib/authorization/project-write");
  assert.equal(await db.approvalRequest.count(), 0, "No historical approval backfill");
  const originalAssignments = await db.userAuthorization.findMany({ orderBy: { userId: "asc" }, select: { userId: true, businessRole: true, technicalPrivileges: true, accountStatus: true } });
  const originalUsers = await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, passwordHash: true, role: true } });
  process.env.FLUX_SHARED_FILE_IDENTITY = "1";
  process.env.FLUX_APPROVAL_ENGINE = "1";
  async function expected(submissionId: string): Promise<ApprovalExpectation> {
    const r = await db.approvalRequest.findUniqueOrThrow({ where: { completionSubmissionId: submissionId }, include: { steps: true } });
    return { requestId: r.id, stepId: r.steps.find(s => s.position === r.currentStep)!.id, revision: r.revision, evidenceHash: r.evidenceHash, commandId: randomUUID() };
  }
  async function submitted(id: string, proof = false) {
    const target = await fixture(id), actor = await user("spm");
    await docs.configureProjectCompletionWorkflow(actor, { projectId: target.projectId, approvalRequired: proof, copyrightRequired: false, invoiceRequired: !proof });
    if (proof) await docs.prepareAuthorityApprovalRequest(actor, { projectId: target.projectId, contactUserId: "spm", selectedProjectFileIds: [`${id}-file`], note: "Initial request" });
    else await docs.requestProjectFinalInvoice(actor, { projectId: target.projectId, contactUserId: "spm" });
    const metadata = { projectId: id, documentType: proof ? "AUTHORITY_APPROVAL_PROOF" as const : "INVOICE" as const, originalFileName: "evidence.pdf", mimeType: "application/pdf", fileSize: 17 };
    const ticket = await docs.requestProjectCompletionDocumentUpload(actor, metadata);
    objects.set(ticket.storageKey, { ContentLength: 17, ContentType: "application/pdf", ETag: `opaque-${id}`, VersionId: `fixture-${id}` });
    await docs.finalizeProjectCompletionDocumentUpload(actor, { ...metadata, storageKey: ticket.storageKey });
    const s = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { uploadKey: ticket.storageKey } });
    return { ...target, actor, metadata, submission: s };
  }
  const target = await submitted("approval-main");
  const r = await db.approvalRequest.findUniqueOrThrow({ where: { completionSubmissionId: target.submission.id }, include: { evidence: { include: { fileVersion: true } }, events: true } });
  assert.equal(r.evidence.length, 1); assert.equal(r.subjectVersion, r.evidence[0].fileVersionId);
  assert.equal(r.evidence[0].fileVersion.checksumEvidence, "UNKNOWN"); assert.equal(r.evidence[0].fileVersion.checksumSha256, null);
  assert.equal(r.requestedById, "spm"); assert.equal(r.events[0].actorId, "spm"); assert.equal(r.state, "PENDING");
  const nativeEvent = await db.completionDocumentEvent.findUniqueOrThrow({ where: { id: r.submissionEventId } });
  await db.$transaction(tx => engine.openCompletionApproval(tx, nativeEvent.id));
  assert.equal(await db.approvalRequest.count({ where: { completionSubmissionId: target.submission.id } }), 1);
  await assert.rejects(db.$transaction(tx => engine.openCompletionApproval(tx, nativeEvent.id, { key: "conflicting-replay.v1", steps: ["DIRECTOR"] })));
  await assert.rejects(db.$transaction(tx => engine.openCompletionApproval(tx, nativeEvent.id, engine.completionReviewPlan, new Date(Date.now() + 60000))));
  for (const action of [
    () => db.approvalRequest.update({ where: { id: r.id }, data: { subjectVersion: "other-version" } }),
    () => db.approvalEvidence.update({ where: { id: r.evidence[0].id }, data: { snapshot: {} } }),
    () => db.approvalEvent.deleteMany({ where: { requestId: r.id } }),
    () => db.$executeRawUnsafe('TRUNCATE "ApprovalRequest" CASCADE'),
  ]) await assert.rejects(action());
  const command = { projectId: target.projectId, submissionId: target.submission.id, decision: "ACCEPT" as const, reason: "Reviewed exact evidence", approval: await expected(target.submission.id) };
  for (const id of ["designer", "digital", "tech", "outsider", "unassigned"]) await assert.rejects(reviews.reviewCompletionDocument(await user(id), command));
  const spm = await user("spm");
  await assert.rejects(reviews.reviewCompletionDocument({ ...spm, id: "director" }, command));
  await assert.rejects(engine.decideApproval(db, r.id, { expected: command.approval, outcome: "APPROVE", reason: "Unscoped caller" }, async () => "forged"));
  for (const approval of [{ ...command.approval, revision: 3 }, { ...command.approval, evidenceHash: "b".repeat(64) }, { ...command.approval, stepId: "forged-step" }, { ...command.approval, actorId: "director" }]) await assert.rejects(reviews.reviewCompletionDocument(spm, { ...command, approval }));
  await assert.rejects(reviews.reviewCompletionDocument(spm, { ...command, decision: "REJECT", reason: "  " }));
  const forged = await api.POST(new Request("http://localhost:3000/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "REVIEW", ...command, actorId: "director" }) }));
  assert.equal(forged.status, 400);
  const stored = objects.get(target.submission.storageKey)!;
  objects.set(target.submission.storageKey, { ...stored, VersionId: "different-version" });
  await assert.rejects(reviews.reviewCompletionDocument(spm, command)); objects.set(target.submission.storageKey, stored);
  // An unadapted native writer cannot commit a decision around the engine.
  await assert.rejects(db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.completion_actor','spm',true)`;
    await tx.completionDocumentSubmission.update({ where: { id: target.submission.id }, data: {
      status: "REJECTED", reviewedById: "spm", reviewedAt: new Date(), reviewReason: "Attempted native-only decision",
    } });
  }));
  let wroteNativeAndEngine = false;
  await assert.rejects(runProjectMutation(spm, "reviewCompletionDocument", { kind: "structured", id: target.projectId }, async () => {
    await reviews.reviewCompletionDocument(spm, command); wroteNativeAndEngine = true; throw new Error("Fixture forces rollback after native and engine decisions");
  }), /Fixture forces rollback after native and engine decisions/);
  assert.equal(wroteNativeAndEngine, true);
  assert.equal((await db.completionDocumentSubmission.findUniqueOrThrow({ where: { id: target.submission.id } })).status, "SUBMITTED");
  assert.equal(await db.projectCompletionDocument.count({ where: { submissionId: target.submission.id } }), 0);
  assert.equal(await db.approvalDecision.count({ where: { requestId: r.id } }), 0);
  assert.equal(await db.completionDocumentEvent.count({ where: { submissionId: target.submission.id, action: "DOCUMENT_ACCEPTED" } }), 0);
  const race = await Promise.allSettled([reviews.reviewCompletionDocument(spm, command), reviews.reviewCompletionDocument(spm, command)]);
  assert.ok(race.some(x => x.status === "fulfilled")); await reviews.reviewCompletionDocument(spm, command);
  assert.equal(await db.approvalDecision.count({ where: { requestId: r.id } }), 1);
  assert.equal(await db.approvalEvent.count({ where: { requestId: r.id, action: "DECIDED" } }), 1);
  await assert.rejects(reviews.reviewCompletionDocument(spm, { ...command, reason: "Replayed with changed reason" }));
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: target.projectId } })).completedAt, null);
  console.log("PASS approvals: exact version/evidence snapshots, unknown cryptographic integrity, genuine actor and scope, strict API inputs, duplicate request/decision replay, immutable history, changed version denial and atomic rollback.");

  const conflicting = await submitted("approval-conflict"), base = { projectId: conflicting.projectId, submissionId: conflicting.submission.id, reason: "Conflicting concurrent decision", approval: await expected(conflicting.submission.id) };
  const decisions = await Promise.allSettled([reviews.reviewCompletionDocument(spm, { ...base, decision: "ACCEPT" }), reviews.reviewCompletionDocument(spm, { ...base, decision: "REJECT", approval: { ...base.approval, commandId: randomUUID() } })]);
  assert.equal(decisions.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(await db.approvalDecision.count({ where: { requestId: base.approval.requestId } }), 1);
  const stale = await submitted("approval-stale", true), staleExpectation = await expected(stale.submission.id);
  await docs.prepareAuthorityApprovalRequest(spm, { projectId: stale.projectId, contactUserId: "spm", selectedProjectFileIds: [`${stale.projectId}-file`], note: "Changed document request" });
  assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: staleExpectation.requestId } })).state, "SUPERSEDED");
  await assert.rejects(reviews.reviewCompletionDocument(spm, { projectId: stale.projectId, submissionId: stale.submission.id, decision: "ACCEPT", reason: "Cannot reuse superseded request", approval: staleExpectation }));
  const staleReject = { projectId: stale.projectId, submissionId: stale.submission.id, decision: "REJECT" as const, reason: "Request changed; resubmit", approval: await expected(stale.submission.id) };
  await reviews.reviewCompletionDocument(spm, staleReject); await reviews.reviewCompletionDocument(spm, staleReject);
  assert.equal(await db.approvalDecision.count({ where: { requestId: staleExpectation.requestId } }), 0);
  assert.equal(await db.approvalEvent.count({ where: { requestId: staleExpectation.requestId, action: "STALE_REJECTED" } }), 1);

  await reviews.reopenCompletionDocument(spm, { projectId: target.projectId, type: "INVOICE", reason: "Correct invoice reference" });
  await assert.rejects(reviews.reviewCompletionDocument(spm, command));
  await docs.requestProjectFinalInvoice(spm, { projectId: target.projectId, contactUserId: "spm" });
  const revised = await docs.requestProjectCompletionDocumentUpload(spm, target.metadata);
  objects.set(revised.storageKey, { ContentLength: 17, ContentType: "application/pdf", ETag: "revised-invoice", VersionId: "revision-2" });
  await docs.finalizeProjectCompletionDocumentUpload(spm, { ...target.metadata, storageKey: revised.storageKey });
  const revisedSubmission = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { uploadKey: revised.storageKey } });
  const revisedRequest = await db.approvalRequest.findUniqueOrThrow({ where: { completionSubmissionId: revisedSubmission.id } });
  assert.notEqual(revisedRequest.subjectVersion, r.subjectVersion); assert.equal(revisedRequest.state, "PENDING");
  assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: r.id } })).state, "APPROVED");
  assert.equal(await db.projectCompletionDocument.count({ where: { submissionId: revisedSubmission.id } }), 0);
  console.log("PASS approvals: concurrent approve/reject produces one decision; superseded requests cannot approve; stale rejection remains audited; revised files receive independent requests and preserve prior approvals.");

  // Only this trusted fixture supplies a two-step plan. The real adapter has a
  // fixed one-step policy and accepts no plan/eligibility from HTTP input.
  delete process.env.FLUX_APPROVAL_ENGINE;
  const ordered = await submitted("approval-ordered");
  const orderedEvent = await db.completionDocumentEvent.findFirstOrThrow({ where: { submissionId: ordered.submission.id, action: "DOCUMENT_SUBMITTED" } });
  const orderedRequest = await db.$transaction(tx => engine.openCompletionApproval(tx, orderedEvent.id, { key: "ordered-fixture.v1", steps: ["DOCUMENT_REVIEWER", "DIRECTOR"] }));
  assert.ok(orderedRequest);
  process.env.FLUX_APPROVAL_ENGINE = "1";
  const orderedSteps = await db.approvalStep.findMany({ where: { requestId: orderedRequest.id }, orderBy: { position: "asc" } });
  const first = { projectId: ordered.projectId, submissionId: ordered.submission.id, decision: "ACCEPT" as const, reason: "First configured step", approval: await expected(ordered.submission.id) };
  await assert.rejects(reviews.reviewCompletionDocument(spm, { ...first, approval: { ...first.approval, stepId: orderedSteps[1].id } }));
  await reviews.reviewCompletionDocument(spm, first);
  assert.equal((await db.completionDocumentSubmission.findUniqueOrThrow({ where: { id: ordered.submission.id } })).status, "SUBMITTED");
  assert.equal(await db.projectCompletionDocument.count({ where: { submissionId: ordered.submission.id } }), 0);
  const last = { ...first, reason: "Final configured step", approval: await expected(ordered.submission.id) };
  await assert.rejects(reviews.reviewCompletionDocument(spm, last));
  await assert.rejects(reviews.reviewCompletionDocument(await user("jpm"), last));
  const director = await user("director"); await reviews.reviewCompletionDocument(director, last);
  const orderedDecisions = await db.approvalDecision.findMany({ where: { requestId: orderedRequest.id }, orderBy: { expectedRevision: "asc" } });
  assert.deepEqual(orderedDecisions.map(d => d.actorId), ["spm", "director"]);
  assert.equal(orderedDecisions[0].nativeEventId, null); assert.ok(orderedDecisions[1].nativeEventId);
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: ordered.projectId } })).completedAt, null);
  await assert.rejects(db.approvalDecision.update({ where: { id: orderedDecisions[0].id }, data: { reason: "Rewrite history" } }));
  await assert.rejects(db.approvalRequest.update({ where: { id: orderedRequest.id }, data: { state: "PENDING", revision: 3 } }));
  console.log("PASS approvals: ordered server-configured steps, out-of-order/conflicting-step denial, separate actual actors, and no document/project finalization from an intermediate decision.");

  delete process.env.FLUX_APPROVAL_ENGINE;
  const expired = await submitted("approval-expired");
  const expiryEvent = await db.completionDocumentEvent.findFirstOrThrow({ where: { submissionId: expired.submission.id, action: "DOCUMENT_SUBMITTED" } });
  await db.$transaction(tx => engine.openCompletionApproval(tx, expiryEvent.id, engine.completionReviewPlan, new Date(Date.now() + 50)));
  await new Promise(resolve => setTimeout(resolve, 70));
  const expiryCommand = { projectId: expired.projectId, submissionId: expired.submission.id, decision: "ACCEPT" as const, reason: "Expired request denial", approval: await expected(expired.submission.id) };
  await assert.rejects(reviews.reviewCompletionDocument(await user("spm"), expiryCommand));
  // Disabling new adoption never disables guards on an already adopted request.
  const continuation = { projectId: target.projectId, submissionId: revisedSubmission.id, decision: "ACCEPT" as const, reason: "Adopted request remains guarded", approval: await expected(revisedSubmission.id) };
  await assert.rejects(reviews.reviewCompletionDocument(spm, { ...continuation, approval: undefined }));
  await reviews.reviewCompletionDocument(spm, continuation);
  const legacy = await submitted("approval-unmapped-cutover");
  assert.equal(await db.approvalRequest.count({ where: { completionSubmissionId: legacy.submission.id } }), 0);
  await reviews.reviewCompletionDocument(spm, { projectId: legacy.projectId, submissionId: legacy.submission.id, decision: "REJECT", reason: "Native review remains available outside adoption" });
  process.env.FLUX_APPROVAL_ENGINE = "1";
  delete process.env.FLUX_SHARED_FILE_IDENTITY;
  const unmapped = await submitted("approval-unmapped-file");
  assert.equal(await db.sharedFileReference.count({ where: { completionSubmissionId: unmapped.submission.id } }), 0);
  assert.equal(await db.approvalRequest.count({ where: { completionSubmissionId: unmapped.submission.id } }), 0);
  await reviews.reviewCompletionDocument(spm, { projectId: unmapped.projectId, submissionId: unmapped.submission.id, decision: "ACCEPT", reason: "Native review without invented shared identity" });
  assert.equal(await db.approvalDecision.count({ where: { request: { completionSubmissionId: unmapped.submission.id } } }), 0);
  process.env.FLUX_SHARED_FILE_IDENTITY = "1";
  const revoked = await submitted("approval-revocation");
  await db.projectCoOwner.create({ data: { projectId: revoked.projectId, userId: "outsider", addedById: "director" } });
  let outsider = await user("outsider");
  const revokeCommand = { projectId: revoked.projectId, submissionId: revoked.submission.id, decision: "ACCEPT" as const, reason: "Current resource authority required", approval: await expected(revoked.submission.id) };
  await db.projectCoOwner.delete({ where: { projectId_userId: { projectId: revoked.projectId, userId: "outsider" } } });
  await assert.rejects(reviews.reviewCompletionDocument(outsider, revokeCommand));
  await db.projectCoOwner.create({ data: { projectId: revoked.projectId, userId: "outsider", addedById: "director" } });
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated approval revocation check',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    await tx.userAuthorization.update({ where: { userId: "outsider" }, data: { accountStatus: "SUSPENDED" } });
  });
  await assert.rejects(reviews.reviewCompletionDocument(outsider, revokeCommand));
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Restore isolated fixture assignment',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    await tx.userAuthorization.update({ where: { userId: "outsider" }, data: { accountStatus: "ACTIVE" } });
  });
  await assert.rejects(reviews.reviewCompletionDocument(outsider, revokeCommand), "Reactivation must not revive an old session");
  outsider = await renewSession("outsider");
  await db.session.deleteMany({ where: { userId: "outsider" } });
  await assert.rejects(reviews.reviewCompletionDocument(outsider, revokeCommand));
  outsider = await renewSession("outsider");
  // Hold the authorized operation while logout attempts to revoke its session.
  let release!: () => void, reached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const operation = runProjectMutation(outsider, "reviewCompletionDocument", { kind: "structured", id: revoked.projectId }, async () => {
    await reviews.reviewCompletionDocument(outsider, revokeCommand); reached(); await held;
  });
  await ready;
  let invalidated = false;
  const logout = db.session.deleteMany({ where: { userId: "outsider" } }).then(() => { invalidated = true; });
  await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(invalidated, false);
  release(); await operation; await logout;
  await assert.rejects(reviews.reviewCompletionDocument(outsider, revokeCommand));
  assert.equal(await db.approvalDecision.count({ where: { requestId: revokeCommand.approval.requestId } }), 1);
  assert.deepEqual(await db.userAuthorization.findMany({ orderBy: { userId: "asc" }, select: { userId: true, businessRole: true, technicalPrivileges: true, accountStatus: true } }), originalAssignments);
  assert.deepEqual(await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, email: true, passwordHash: true, role: true } }), originalUsers);
  assert.equal(await db.user.count(), 9);
  console.log("PASS approvals: optional expiry, adoption-off continuation, native cutover review, revoked membership/account/session denial, stale token after reactivation, concurrent logout serialization and nine fixture assignments preserved.");
}

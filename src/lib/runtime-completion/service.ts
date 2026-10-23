import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runtimeAuthorization } from "../authorization/runtime";
import { approvalHash, type ApprovalOutcome } from "../approvals/contracts";
import { decideTypedApproval } from "../approvals/engine";
import { requireRuntimeIntegration } from "../runtime-integration/activation";
import { ensure, identifier } from "../stage-builder/contracts";
import { text } from "../stage-runtime/contracts";
import { json, runtimeActor, stageData, type Tx } from "../stage-runtime/data";
import { verifyRuntimeFiles } from "../stage-runtime/files";
import { captureFileIntegrity } from "../files/contracts";
import { copyStoredObject, createPresignedUploadTarget, getMaxAssetUploadBytes, getObjectMetadata, getS3BucketName, isAllowedProjectCompletionDocument, readPinnedStoredObject, sanitizeFileName } from "../storage/s3";
import { completionCommand, documentCategories, settings } from "./contracts";

const id = () => `rc_${randomUUID().replaceAll("-", "")}`;
const scope = (projectId: string) => ({ capability: "project.runtimeCompletion" as const, targetId: `runtime-project:${projectId}` });
async function currentPolicy(tx: Tx, projectId: string) { return tx.runtimeDocumentPolicy.findFirst({ where: { projectId }, orderBy: { revision: "desc" } }); }
async function latestDocument(tx: Tx, projectId: string, category: string) {
  return tx.runtimeDocumentSubmission.findFirst({ where: { projectId, category: category as typeof documentCategories[number] }, orderBy: { version: { number: "desc" } }, include: { version: true, prepared: true } });
}
async function invalidate(tx: Tx, projectId: string, activityId: string) { await tx.runtimeCompletionRequest.updateMany({ where: { projectId, state: "PENDING" }, data: { state: "SUPERSEDED", supersededActivityId: activityId } }); }
async function verifyVersion(v: Prisma.SharedFileVersionGetPayload<object>) {
  ensure(v.status === "READY" && v.applicationSealed && v.objectETag, "DOCUMENT_NOT_SEALED", 409);
  const o = captureFileIntegrity(await getObjectMetadata(v.storageKey, v.bucket), v);
  ensure(o.objectETag === v.objectETag && (!v.objectVersionId || o.objectVersionId === v.objectVersionId) && (!v.checksumSha256 || o.checksumSha256 === v.checksumSha256), "DOCUMENT_INTEGRITY_CHANGED", 409);
}
async function evidence(tx: Tx, projectId: string, verify = true) {
  const [ready] = await tx.$queryRaw<Array<{ ready: boolean }>>`SELECT flux_runtime_completion_ready(${projectId}) AS ready`;
  ensure(ready.ready, "COMPLETION_REQUIREMENTS_UNMET", 409);
  if (verify) {
    for (const s of await tx.runtimeStage.findMany({ where: { projectId } })) {
      const data = await stageData(tx, projectId, s.id);
      ensure(data.stage.state === "COMPLETED" && data.gates().ready && !data.blocked, "STAGE_GATES_UNMET", 409);
      await verifyRuntimeFiles(data);
    }
    const policy = (await currentPolicy(tx, projectId))!;
    for (const c of documentCategories) if (settings(policy.settings)[c] === "REQUIRED") await verifyVersion((await latestDocument(tx, projectId, c))!.version);
  }
  const [row] = await tx.$queryRaw<Array<{ snapshot: Prisma.JsonValue }>>`SELECT flux_runtime_completion_evidence(${projectId}) AS snapshot`;
  return row.snapshot;
}
export async function getRuntimeCompletion(projectId: string) {
  requireRuntimeIntegration(); identifier(projectId);
  return runtimeAuthorization.runAuthorized(scope(projectId), async tx => {
    const actor = await runtimeActor(tx);
    const p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId }, include: { owner: { select: { id: true, name: true } }, participants: { where: { role: "CO_OWNER" }, select: { user: { select: { id: true, name: true } } } }, stages: { orderBy: { position: "asc" }, select: { id: true, state: true, configuration: true, completionSnapshot: true } } } });
    const policies = await tx.runtimeDocumentPolicy.findMany({ where: { projectId }, orderBy: { revision: "desc" }, include: { activity: { include: { actor: { select: { name: true } } } } } });
    const docs = await tx.runtimeDocumentSubmission.findMany({ where: { projectId }, orderBy: { version: { number: "desc" } }, include: { version: true, prepared: { include: { actor: { select: { id: true, name: true } } } }, submitted: true, reviewed: { include: { actor: { select: { id: true, name: true } } } }, approval: { include: { steps: true } } } });
    const requests = await tx.runtimeCompletionRequest.findMany({ where: { projectId }, orderBy: { revision: "desc" }, include: { supersededBy: { select: { id: true, action: true, sequence: true, createdAt: true } }, activity: { include: { actor: { select: { name: true } } } }, decision: { include: { activity: { include: { actor: { select: { name: true } } } } } } } });
    const activity = await tx.runtimeCompletionActivity.findMany({ where: { projectId }, orderBy: { sequence: "desc" }, select: { id: true, action: true, sequence: true, actor: { select: { id: true, name: true } }, createdAt: true } });
    const policy = policies[0];
    const [ready] = await tx.$queryRaw<Array<{ ready: boolean }>>`SELECT flux_runtime_completion_ready(${projectId}) AS ready`;
    return { projectId, title: p.title, state: p.state, projectRevision: p.revision, revision: activity[0]?.sequence ?? 0, policyRevision: policy?.revision ?? 0,
      publishedVersionId: p.publishedVersionId, workflowVersion: p.versionNumber, definitionHash: p.definitionHash, owner: p.owner, coOwners: p.participants.map(x => x.user),
      stages: p.stages.map(s => ({ id: s.id, state: s.state, title: (s.configuration as { title: string }).title, completion: s.completionSnapshot })),
      configured: !!policy, settings: policy ? settings(policy.settings) : null, ready: ready.ready && p.state === "ACTIVE", externalLinksAvailable: false as const,
      canConfigure: actor.businessRole === "DIRECTOR" && p.state === "ACTIVE", canRequest: actor.userId === p.ownerId && p.state === "ACTIVE", canDecide: actor.businessRole === "DIRECTOR" && p.state === "ACTIVE", canSubmit: p.state === "ACTIVE", actorId: actor.userId,
      policies: policies.map(x => ({ id: x.id, revision: x.revision, settings: settings(x.settings), hash: x.snapshotHash, reason: x.reason, actor: x.activity.actor.name, at: x.activity.createdAt.toISOString() })),
      documents: docs.map(x => ({ id: x.id, category: x.category, policyId: x.policyId, versionId: x.versionId, number: x.version.number, fileName: x.version.originalFileName, state: x.state, uploader: x.prepared.actor, submittedAt: x.submitted?.createdAt.toISOString() ?? null, reviewer: x.reviewed?.actor ?? null, review: x.reviewed?.snapshot ?? null, current: docs.find(d => d.category === x.category)?.id === x.id,
        expected: x.approval ? { requestId: x.approval.id, revision: x.approval.revision, stepId: x.approval.steps[0].id, evidenceHash: x.approval.evidenceHash } : null })),
      requests: requests.map(x => ({ supersededBy: x.supersededBy ? { ...x.supersededBy, createdAt: x.supersededBy.createdAt.toISOString() } : null, id: x.id, revision: x.revision, state: x.state, snapshot: x.snapshot, hash: x.snapshotHash, reason: x.reason, actor: x.activity.actor.name, at: x.activity.createdAt.toISOString(), decision: x.decision ? { outcome: x.decision.outcome, reason: x.decision.reason, actor: x.decision.activity.actor.name, at: x.decision.activity.createdAt.toISOString() } : null })),
      activity: activity.map(x => ({ ...x, createdAt: x.createdAt.toISOString() })) };
  });
}
export async function runtimeCompletionCommand(projectId: string, raw: unknown) {
  requireRuntimeIntegration(); identifier(projectId); const input = completionCommand(raw);
  return runtimeAuthorization.runAuthorized(scope(projectId), async tx => {
    const actor = await runtimeActor(tx);
    // The central resource policy locks the actual project before any evidence.
    const p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId } });
    // Replay still requires the action's current business authority.
    if (["POLICY_APPROVED", "COMPLETION_DECIDED"].includes(input.action)) ensure(actor.businessRole === "DIRECTOR", "DIRECTOR_REQUIRED", 403);
    if (input.action === "COMPLETION_REQUESTED") ensure(actor.userId === p.ownerId, "ACTUAL_OWNER_REQUIRED", 403);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-completion:${actor.userId}:${input.commandId}`},0))::text`;
    const previous = await tx.runtimeCompletionActivity.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: input.commandId } } });
    if (previous) { ensure(previous.projectId === projectId && previous.commandHash === approvalHash(input), "COMMAND_REUSED", 409); return previous.result as Record<string, string | number>; }
    const policy = await currentPolicy(tx, projectId);
    const sequence = await tx.runtimeCompletionActivity.count({ where: { projectId } }) + 1;
    ensure(p.state === "ACTIVE", "PROJECT_COMPLETED", 409);
    ensure(p.revision === input.expectedProjectRevision && (policy?.revision ?? 0) === input.expectedPolicyRevision && sequence === Number(input.expectedRevision) + 1, "STALE_COMPLETION_REVISION", 409);
    const activityId = id(), at = new Date(); let result: Record<string, string | number> = {};
    await tx.$queryRaw`SELECT set_config('flux.completion_activity',${activityId},true),set_config('flux.completion_action',${input.action},true)`;
    const confirm = () => { text(input.reason, 2000, true); ensure(input.confirmed === true, "EXPLICIT_CONFIRMATION_REQUIRED"); return input.reason.trim(); };
    if (input.action === "POLICY_APPROVED") {
      ensure(actor.businessRole === "DIRECTOR", "DIRECTOR_REQUIRED", 403); const reason = confirm(), approved = settings(input.settings);
      const policyId = id(), revision = (policy?.revision ?? 0) + 1;
      const snapshotHash = approvalHash({ projectId, revision, settings: approved });
      await tx.runtimeDocumentPolicy.create({ data: { id: policyId, projectId, revision, settings: json(approved), reason, snapshotHash, activityId } });
      await invalidate(tx, projectId, activityId); result = { policyId, revision };
    } else if (["UPLOAD_PREPARED", "DOCUMENT_SUBMITTED", "UPLOAD_CANCELLED", "DOCUMENT_REVIEWED"].includes(input.action)) {
      ensure(policy, "DOCUMENT_POLICY_UNCONFIGURED", 409);
      if (input.action === "UPLOAD_PREPARED") {
        ensure(documentCategories.includes(input.category as typeof documentCategories[number]), "INVALID_DOCUMENT_CATEGORY");
        const category = input.category as typeof documentCategories[number]; ensure(settings(policy.settings)[category] !== "NOT_APPLICABLE", "DOCUMENT_NOT_APPLICABLE", 409);
        text(input.fileName, 255, true); text(input.mimeType, 160, true);
        ensure(isAllowedProjectCompletionDocument(input.fileName, input.mimeType) && Number.isSafeInteger(input.fileSize) && Number(input.fileSize) > 0 && Number(input.fileSize) <= getMaxAssetUploadBytes(), "INVALID_DOCUMENT_FILE");
        let origin = await tx.runtimeDocumentFile.findUnique({ where: { projectId_category: { projectId, category } } });
        if (!origin) { const file = await tx.sharedFile.create({ data: {}, select: { id: true } }); origin = await tx.runtimeDocumentFile.create({ data: { fileId: file.id, projectId, category } }); }
        const submissionId = id(), name = sanitizeFileName(input.fileName), prefix = `runtime-completion/${projectId}/${submissionId}`;
        const version = await tx.sharedFileVersion.create({ data: { fileId: origin.fileId, number: await tx.sharedFileVersion.count({ where: { fileId: origin.fileId } }) + 1, uploadedById: actor.userId, originalFileName: name, mimeType: input.mimeType, fileSize: Number(input.fileSize), bucket: getS3BucketName(), storageKey: `${prefix}/sealed/${name}`, applicationSealed: true } });
        await tx.runtimeDocumentSubmission.create({ data: { id: submissionId, projectId, policyId: policy.id, category, versionId: version.id, stagingKey: `${prefix}/upload/${name}`, expiresAt: new Date(Date.now() + 10 * 60_000), preparedActivityId: activityId } });
        const ref = await tx.sharedFileReference.create({ data: { versionId: version.id, role: "SOURCE" }, select: { id: true } });
        await tx.runtimeDocumentReference.create({ data: { referenceId: ref.id, submissionId } });
        if (settings(policy.settings)[category] === "REQUIRED") await invalidate(tx, projectId, activityId);
        result = { submissionId, versionId: version.id };
      } else {
        identifier(input.submissionId);
        const s = await tx.runtimeDocumentSubmission.findFirst({ where: { id: input.submissionId, projectId }, include: { version: true, prepared: true } });
        ensure(s && (await latestDocument(tx, projectId, s.category))?.id === s.id, "DOCUMENT_SUPERSEDED", 409);
        ensure(settings(policy.settings)[s.category] !== "NOT_APPLICABLE", "DOCUMENT_NOT_APPLICABLE", 409);
        if (input.action === "DOCUMENT_REVIEWED") {
          const reason = confirm(); ensure(s.state === "SUBMITTED" && s.approvalRequestId, "DOCUMENT_NOT_PENDING", 409);
          ensure(input.outcome === "APPROVE" || input.outcome === "REJECT", "INVALID_DECISION");
          if (input.outcome === "APPROVE") await verifyVersion(s.version);
          await tx.$queryRaw`SELECT set_config('flux.approval_actor',${actor.userId},true),set_config('flux.approval_session',${actor.session.id},true)`;
          await decideTypedApproval(tx, s.approvalRequestId, { expected: input.expected, outcome: input.outcome as ApprovalOutcome, reason }, { subjectType: "RUNTIME_DOCUMENT", authorize: async request => { ensure(request.subjectId === s.id && request.subjectVersion === s.versionId, "DOCUMENT_EVIDENCE_MISMATCH"); return actor; }, applyNative: async () => { await tx.runtimeDocumentSubmission.update({ where: { id: s.id }, data: { state: input.outcome === "APPROVE" ? "ACCEPTED" : "REJECTED", reviewedActivityId: activityId } }); return null; } });
          result = { submissionId: s.id, state: input.outcome === "APPROVE" ? "ACCEPTED" : "REJECTED" };
        } else {
          ensure(s.state === "UPLOADING" && s.prepared.actorId === actor.userId, "UPLOAD_UNAVAILABLE", 403);
          let failed = input.action === "UPLOAD_CANCELLED" || s.expiresAt <= at;
          let integrity: ReturnType<typeof captureFileIntegrity> | null = null;
          if (!failed) {
            try { const observed = captureFileIntegrity(await getObjectMetadata(s.stagingKey, s.version.bucket), s.version);
              await copyStoredObject({ sourceBucket: s.version.bucket, sourceKey: s.stagingKey, bucket: s.version.bucket, storageKey: s.version.storageKey, sourceETag: observed.objectETag, sourceVersionId: observed.objectVersionId });
              integrity = captureFileIntegrity(await getObjectMetadata(s.version.storageKey, s.version.bucket), s.version);
              ensure(integrity.objectETag === observed.objectETag && (!observed.checksumSha256 || integrity.checksumSha256 === observed.checksumSha256), "DOCUMENT_INTEGRITY_CHANGED");
            } catch { failed = true; }
          }
          await tx.sharedFileVersion.update({ where: { id: s.versionId }, data: failed ? { status: "FAILED", finalizedAt: at } : { status: "READY", ...integrity!, finalizedAt: at, observedAt: at } });
          const approvalRequestId = failed ? null : id();
          await tx.runtimeDocumentSubmission.update({ where: { id: s.id }, data: { state: failed ? "FAILED" : "SUBMITTED", submittedActivityId: activityId, approvalRequestId } });
          if (approvalRequestId) {
            const subjectSnapshot = { projectId, submissionId: s.id, policyId: s.policyId, category: s.category, versionId: s.versionId }, policySnapshot = { key: "runtime-document.manager.v1", steps: ["DOCUMENT_REVIEWER"], selfReview: "NATIVE_MANAGER_RULE" };
            const version = await tx.sharedFileVersion.findUniqueOrThrow({ where: { id: s.versionId } });
            const evidence = [{ fileVersionId: s.versionId, snapshot: json({ id: version.id, fileId: version.fileId, number: version.number, objectETag: version.objectETag, objectVersionId: version.objectVersionId, checksumSha256: version.checksumSha256, checksumEvidence: version.checksumEvidence }) }];
            await tx.approvalRequest.create({ data: { id: approvalRequestId, subjectType: "RUNTIME_DOCUMENT", subjectId: s.id, subjectVersion: s.versionId, requestedById: actor.userId, requestedAt: at, policyKey: policySnapshot.key, policySnapshot: json(policySnapshot), subjectSnapshot: json(subjectSnapshot), evidenceHash: approvalHash({ subjectSnapshot, policySnapshot, evidence }), steps: { create: [{ position: 1, eligibility: "DOCUMENT_REVIEWER" }] }, evidence: { create: evidence } } });
            await tx.approvalEvent.create({ data: { requestId: approvalRequestId, action: "REQUESTED", actorId: actor.userId, createdAt: at, details: { submissionId: s.id } } });
          }
          result = { submissionId: s.id, state: failed ? "FAILED" : "SUBMITTED" };
        }
        const provenance = await tx.sharedFileProvenance.create({ data: { versionId: s.versionId }, select: { id: true } });
        await tx.runtimeDocumentProvenance.create({ data: { provenanceId: provenance.id, submissionId: s.id, activityId } });
        if (settings(policy.settings)[s.category] === "REQUIRED") await invalidate(tx, projectId, activityId);
      }
    } else if (input.action === "COMPLETION_REQUESTED") {
      ensure(actor.userId === p.ownerId, "ACTUAL_OWNER_REQUIRED", 403); const reason = confirm();
      ensure(policy, "DOCUMENT_POLICY_UNCONFIGURED", 409);
      ensure(!await tx.runtimeCompletionRequest.findFirst({ where: { projectId, state: "PENDING" } }), "COMPLETION_ALREADY_PENDING", 409);
      const snapshot = await evidence(tx, projectId), requestId = id();
      await tx.runtimeCompletionRequest.create({ data: { id: requestId, projectId, policyId: policy.id, revision: await tx.runtimeCompletionRequest.count({ where: { projectId } }) + 1, snapshot: json(snapshot), snapshotHash: approvalHash(snapshot), reason, activityId } }); result = { requestId };
    } else {
      ensure(actor.businessRole === "DIRECTOR", "DIRECTOR_REQUIRED", 403); const reason = confirm(); identifier(input.requestId);
      ensure(input.outcome === "APPROVE" || input.outcome === "REJECT", "INVALID_DECISION");
      const request = await tx.runtimeCompletionRequest.findFirst({ where: { id: input.requestId, projectId }, include: { activity: true } });
      ensure(request?.state === "PENDING" && request.snapshotHash === input.requestHash && request.policyId === policy?.id, "COMPLETION_REQUEST_STALE", 409);
      const owner = await tx.userAuthorization.findUnique({ where: { userId: p.ownerId } });
      if (input.outcome === "APPROVE") ensure(request.activity.actorId === p.ownerId && owner?.accountStatus === "ACTIVE" && owner.authorizationVersion === request.activity.actorVersion && ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(owner.businessRole ?? ""), "OWNER_AUTHORITY_CHANGED", 409);
      if (input.outcome === "APPROVE") ensure(approvalHash(await evidence(tx, projectId)) === request.snapshotHash, "COMPLETION_EVIDENCE_CHANGED", 409);
      const decisionId = id();
      await tx.runtimeCompletionDecision.create({ data: { id: decisionId, projectId, requestId: request.id, outcome: input.outcome, reason, snapshotHash: request.snapshotHash, activityId } });
      await tx.runtimeCompletionRequest.update({ where: { id: request.id }, data: { state: input.outcome === "APPROVE" ? "APPROVED" : "REJECTED" } });
      // Completion does not pretend to be a runtime-stage command/revision.
      if (input.outcome === "APPROVE") await tx.runtimeProject.update({ where: { id: projectId }, data: { state: "COMPLETED" } });
      result = { decisionId, state: input.outcome === "APPROVE" ? "COMPLETED" : "ACTIVE" };
    }
    await tx.runtimeCompletionActivity.create({ data: { id: activityId, projectId, sequence, action: input.action, actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, commandId: input.commandId, commandHash: approvalHash(input), snapshot: json(input), result: json(result), createdAt: at, eventId: `runtime-completion:${activityId}` } });
    ensure(Date.parse(actor.session.expiresAt) > Date.now(), "SESSION_EXPIRED", 403); return result;
  }, { timeout: 30_000 });
}
export async function runtimeDocumentUploadTarget(projectId: string, submissionId: string) {
  requireRuntimeIntegration(); identifier(projectId); identifier(submissionId);
  return runtimeAuthorization.runAuthorized(scope(projectId), async tx => {
    const actor = await runtimeActor(tx), p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId } }), policy = await currentPolicy(tx, projectId);
    const s = await tx.runtimeDocumentSubmission.findFirst({ where: { id: submissionId, projectId }, include: { version: true, prepared: true } });
    ensure(p.state === "ACTIVE" && s?.state === "UPLOADING" && s.expiresAt > new Date() && s.prepared.actorId === actor.userId && policy && settings(policy.settings)[s.category] !== "NOT_APPLICABLE" && (await latestDocument(tx, projectId, s.category))?.id === s.id, "UPLOAD_UNAVAILABLE", 403);
    return createPresignedUploadTarget({ bucket: s.version.bucket, storageKey: s.stagingKey, mimeType: s.version.mimeType, expiresInSeconds: Math.min(600, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)) });
  });
}
export async function openRuntimeDocument(projectId: string, versionId: string) {
  requireRuntimeIntegration(); identifier(projectId); identifier(versionId);
  return runtimeAuthorization.runAuthorized(scope(projectId), async tx => {
    const s = await tx.runtimeDocumentSubmission.findFirst({ where: { projectId, versionId, state: { in: ["SUBMITTED", "ACCEPTED", "REJECTED"] } }, include: { version: true } });
    ensure(s?.version.status === "READY" && s.version.applicationSealed && s.version.objectETag, "DOCUMENT_UNAVAILABLE", 404);
    const v = s.version, object = await readPinnedStoredObject({ bucket: v.bucket, storageKey: v.storageKey, objectETag: v.objectETag!, objectVersionId: v.objectVersionId, checksumSha256: v.checksumSha256 });
    try { const o = captureFileIntegrity(object, v); ensure(object.Body && o.objectETag === v.objectETag && (!v.objectVersionId || o.objectVersionId === v.objectVersionId) && (!v.checksumSha256 || o.checksumSha256 === v.checksumSha256), "DOCUMENT_INTEGRITY_CHANGED", 409); return { body: object.Body, fileName: v.originalFileName, mimeType: v.mimeType, size: v.fileSize }; }
    catch (error) { if (object.Body && "destroy" in object.Body) object.Body.destroy(); throw error; }
  }, { timeout: 30_000 });
}
export type RuntimeCompletionView = Awaited<ReturnType<typeof getRuntimeCompletion>>;
export async function listRuntimeCompletionRequests() {
  requireRuntimeIntegration();
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeGovernance", targetId: "runtime-projects" }, async tx => {
    const actor = await runtimeActor(tx); ensure(actor.businessRole === "DIRECTOR", "DIRECTOR_REQUIRED", 403);
    const requests = await tx.runtimeCompletionRequest.findMany({ where: { state: "PENDING", project: { state: "ACTIVE" } }, orderBy: { activity: { createdAt: "asc" } }, take: 100, select: { id: true, revision: true, reason: true, project: { select: { id: true, title: true, owner: { select: { name: true } }, versionNumber: true } }, activity: { select: { createdAt: true } } } });
    return { count: await tx.runtimeCompletionRequest.count({ where: { state: "PENDING", project: { state: "ACTIVE" } } }), requests: requests.map(r => ({ ...r, activity: { createdAt: r.activity.createdAt.toISOString() } })) };
  });
}

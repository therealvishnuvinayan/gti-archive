import "server-only";
import type { Prisma, WorkflowPublicationSubmission } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { runtimeAuthorization } from "../authorization/runtime";
import { resolveAuthenticatedSession } from "../authorization/session";
import { configurationHash } from "../stage-builder/hash";
import { ensure, parseDefinition } from "../stage-builder/contracts";
import { publicationIssues, WORKFLOW_PUBLICATION_POLICY } from "../stage-builder/publication-contracts";
import { requirePublication } from "../stage-builder/publication-activation";
import { approvalCondition, approvalHash, type ApprovalOutcome } from "./contracts";
import { decideTypedApproval } from "./engine";

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export async function workflowPublicationActor(tx: Tx) {
  const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
  ensure(session && session.principal.authorizationVersion && ["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(session.principal.businessRole ?? ""), "ACCESS_DENIED", 403);
  const actor = session.principal;
  await tx.$queryRaw`SELECT set_config('flux.publication_actor', ${actor.userId}, true), set_config('flux.publication_session', ${actor.session.id}, true)`;
  return actor;
}

/** Configuration-only evidence: the native submission has restrictive FKs to
 * the exact immutable draft revision and this shared ApprovalRequest. */
export async function openWorkflowApproval(tx: Tx, submission: WorkflowPublicationSubmission) {
  requirePublication();
  return runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "template.submitWorkflow", targetId: `workflow-draft:${submission.workflowId}` }, async () => {
    const actor = await workflowPublicationActor(tx);
    approvalCondition(actor.userId === submission.submittedById, "APPROVAL_SUBJECT_MISMATCH");
    const revision = await tx.workflowDraftRevision.findUniqueOrThrow({ where: { id: submission.draftRevisionId }, include: { workflow: true } });
    const definition = parseDefinition(revision.definition);
    approvalCondition(revision.validationStatus === "VALID" && publicationIssues(definition).length === 0 && revision.revision === revision.workflow.currentRevision &&
      configurationHash(definition) === revision.configurationHash && revision.configurationHash === submission.configurationHash, "APPROVAL_EVIDENCE_CHANGED");
    const subjectSnapshot = json({ schemaVersion: definition.schemaVersion, workflowId: submission.workflowId,
      draftRevisionId: revision.id, draftRevision: revision.revision, authorId: revision.workflow.createdById, revisionActorId: revision.actorId,
      submittedById: submission.submittedById, submittedAt: submission.submittedAt.toISOString(), changeSummary: submission.changeSummary,
      intendedProjectType: submission.intendedProjectType, previousPublishedVersionId: submission.previousPublishedVersionId,
      configurationHash: revision.configurationHash, definition });
    const policySnapshot = json(WORKFLOW_PUBLICATION_POLICY);
    const request = await tx.approvalRequest.create({ data: { id: submission.approvalRequestId, subjectType: "WORKFLOW_DRAFT_REVISION",
      subjectId: submission.workflowId, subjectVersion: revision.id, requestedById: actor.userId, requestedAt: submission.submittedAt,
      policyKey: WORKFLOW_PUBLICATION_POLICY.key, policySnapshot, subjectSnapshot,
      evidenceHash: approvalHash({ subjectSnapshot, policySnapshot, evidence: [] }),
      steps: { create: { position: 1, eligibility: "DIRECTOR" } } } });
    const event = await tx.approvalEvent.create({ data: { requestId: request.id, action: "REQUESTED", actorId: actor.userId,
      createdAt: submission.submittedAt, details: { configurationHash: submission.configurationHash, draftRevisionId: revision.id } } });
    await tx.workflowPublicationAudit.create({ data: { id: event.id, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!,
      sessionId: actor.session.id, eventId: `workflow-approval:${event.id}` } });
    return request;
  });
}

export async function decideWorkflowApproval(tx: Tx, requestId: string,
  input: { expected: unknown; outcome: ApprovalOutcome; reason: string; configurationHash: string }) {
  requirePublication();
  return decideTypedApproval(tx, requestId, input, {
    subjectType: "WORKFLOW_DRAFT_REVISION",
    authorize: async request => runtimeAuthorization.runAuthorizedInTransaction(tx,
      { capability: "template.approvePublish", targetId: `workflow-approval:${requestId}`, reason: input.reason }, async () => {
        const actor = await workflowPublicationActor(tx);
        approvalCondition(actor.businessRole === "DIRECTOR", "APPROVER_STEP_DENIED");
        const submission = await tx.workflowPublicationSubmission.findUniqueOrThrow({ where: { approvalRequestId: requestId }, include: { draftRevision: { include: { workflow: true } } } });
        const revision = submission.draftRevision, definition = parseDefinition(revision.definition);
        approvalCondition(input.configurationHash === submission.configurationHash && configurationHash(definition) === submission.configurationHash &&
          revision.validationStatus === "VALID" && publicationIssues(definition).length === 0, "APPROVAL_EVIDENCE_CHANGED");
        if (request.state === "PENDING") {
          approvalCondition(revision.workflow.currentRevision === revision.revision, "APPROVAL_REQUEST_STALE");
          if (input.outcome === "APPROVE") {
            await tx.$queryRaw`SELECT "userId" FROM "UserAuthorization" WHERE "userId" = ${submission.submittedById} FOR SHARE`;
            const requester = await tx.userAuthorization.findUnique({ where: { userId: submission.submittedById } });
            approvalCondition(requester?.accountStatus === "ACTIVE" && requester.authorizationVersion === submission.actorVersion &&
              requester.businessRole === submission.actorRole, "WORKFLOW_SUBMITTER_AUTHORITY_CHANGED");
          }
        }
        await tx.$queryRaw`SELECT set_config('flux.approval_actor', ${actor.userId}, true), set_config('flux.approval_session', ${actor.session.id}, true), set_config('flux.publication_request', ${requestId}, true)`;
        return actor;
      }),
    // No fictitious completion event or file evidence for definitions.
    applyNative: async () => null,
    afterDecision: async (decision, event) => {
      await tx.workflowPublicationAudit.create({ data: { id: event.id, actorRole: decision.actorRole, actorVersion: decision.actorVersion,
        sessionId: decision.sessionId, eventId: `workflow-approval:${event.id}` } });
      if (decision.outcome !== "APPROVE") return;
      const submission = await tx.workflowPublicationSubmission.findUniqueOrThrow({ where: { approvalRequestId: requestId }, include: { draftRevision: { include: { workflow: true } } } });
      const source = submission.draftRevision;
      if (!await tx.publishedWorkflow.findUnique({ where: { id: submission.workflowId } })) {
        await tx.publishedWorkflow.create({ data: { id: submission.workflowId, createdAt: decision.decidedAt } });
      }
      const number = await tx.publishedWorkflowVersion.count({ where: { workflowId: submission.workflowId } }) + 1;
      const id = `pv_${crypto.randomUUID().replaceAll("-", "")}`;
      await tx.publishedWorkflowVersion.create({ data: { id, workflowId: submission.workflowId, number, submissionId: submission.id,
        draftRevisionId: source.id, approvalRequestId: requestId, approvalDecisionId: decision.id,
        definition: source.definition as Prisma.InputJsonValue, configurationHash: source.configurationHash,
        intendedProjectType: submission.intendedProjectType, schemaVersion: submission.schemaVersion, validationStatus: "VALID",
        authorId: source.workflow.createdById, submittedById: submission.submittedById, approvedById: decision.actorId,
        approvalReason: decision.reason, approvedAt: decision.decidedAt, publishedAt: decision.decidedAt, eventId: `workflow-version:${id}` } });
    },
  });
}

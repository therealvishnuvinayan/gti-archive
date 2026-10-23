import "server-only";
import type { Prisma } from "@prisma/client";
import { runtimeAuthorization } from "../authorization/runtime";
import { decideWorkflowApproval, openWorkflowApproval, workflowPublicationActor } from "../approvals/workflow";
import { parseApprovalExpectation } from "../approvals/contracts";
import { ensure, identifier, parseDefinition, record } from "./contracts";
import { configurationHash } from "./hash";
import { publicationEnabled, requirePublication } from "./publication-activation";
import { parsePublicationSubmission, publicationIssues } from "./publication-contracts";

const identity = { id: true, name: true } as const;
const submissionInclude = {
  submittedBy: { select: identity },
  draftRevision: { include: { actor: { select: identity }, workflow: { include: { createdBy: { select: identity } } } } },
  approvalRequest: { include: { steps: { orderBy: { position: "asc" as const } },
    decisions: { include: { actor: { select: identity } }, orderBy: { decidedAt: "asc" as const } },
    events: { select: { id: true, action: true, actor: { select: identity }, createdAt: true }, orderBy: { createdAt: "asc" as const } } } },
  publishedVersion: { select: { id: true, number: true } },
} satisfies Prisma.WorkflowPublicationSubmissionInclude;
type Submission = Prisma.WorkflowPublicationSubmissionGetPayload<{ include: typeof submissionInclude }>;
function submissionView(s: Submission, director: boolean) {
  const request = s.approvalRequest, source = s.draftRevision, definition = parseDefinition(source.definition);
  return { id: request.id, submissionId: s.id, workflowId: s.workflowId, draftRevisionId: source.id, draftRevision: source.revision,
    currentDraftRevision: source.workflow.currentRevision, definition, configurationHash: s.configurationHash,
    validationStatus: source.validationStatus, validationIssues: publicationIssues(definition), schemaVersion: s.schemaVersion,
    intendedProjectType: s.intendedProjectType, author: source.workflow.createdBy, revisionActor: source.actor, submittedBy: s.submittedBy,
    submittedAt: s.submittedAt.toISOString(), changeSummary: s.changeSummary, previousPublishedVersionId: s.previousPublishedVersionId,
    status: request.state, supersessionReason: request.supersessionReason, publishedVersion: s.publishedVersion,
    canDecide: director && request.state === "PENDING" && source.revision === source.workflow.currentRevision,
    expected: { requestId: request.id, stepId: request.steps[0].id, revision: request.revision, evidenceHash: request.evidenceHash },
    decisions: request.decisions.map(d => ({ id: d.id, outcome: d.outcome, reason: d.reason, actor: d.actor, actorRole: d.actorRole, decidedAt: d.decidedAt.toISOString() })),
    audit: request.events.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })) };
}

const versionInclude = { author: { select: identity }, submittedBy: { select: identity }, approvedBy: { select: identity } } satisfies Prisma.PublishedWorkflowVersionInclude;
type Version = Prisma.PublishedWorkflowVersionGetPayload<{ include: typeof versionInclude }>;
function versionView(v: Version) {
  const definition = parseDefinition(v.definition);
  return { id: v.id, workflowId: v.workflowId, number: v.number, definition, name: definition.name, stageCount: definition.stages.length,
    draftRevisionId: v.draftRevisionId, configurationHash: v.configurationHash, intendedProjectType: v.intendedProjectType,
    schemaVersion: v.schemaVersion, validationStatus: v.validationStatus, author: v.author, submittedBy: v.submittedBy, approvedBy: v.approvedBy,
    approvalRequestId: v.approvalRequestId, approvalDecisionId: v.approvalDecisionId, approvalReason: v.approvalReason,
    approvedAt: v.approvedAt.toISOString(), publishedAt: v.publishedAt.toISOString(), eventId: v.eventId };
}
function offsetValue(offset: number) { ensure(Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000, "INVALID_OFFSET"); }
function requestTarget(id: string) { identifier(id); return { capability: "template.viewWorkflowApprovals", targetId: `workflow-approval:${id}` }; }

export async function submitWorkflowDraft(workflowId: string, raw: unknown) {
  requirePublication(); identifier(workflowId);
  const input = parsePublicationSubmission(raw), commandHash = configurationHash({ workflowId, ...input });
  return runtimeAuthorization.runAuthorized({ capability: "template.submitWorkflow", targetId: `workflow-draft:${workflowId}` }, async (tx, grant) => {
    const actor = await workflowPublicationActor(tx);
    ensure(grant.actorUserId === actor.userId, "ACCESS_DENIED", 403);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workflow-publication:${actor.userId}:${input.commandId}`}, 0))::text`;
    const prior = await tx.workflowPublicationSubmission.findUnique({ where: { submittedById_commandId: { submittedById: actor.userId, commandId: input.commandId } }, include: submissionInclude });
    if (prior) { ensure(prior.commandHash === commandHash, "COMMAND_REUSED", 409); return { ...submissionView(prior, actor.businessRole === "DIRECTOR"), replayed: true }; }
    const draft = await tx.workflowDraft.findUniqueOrThrow({ where: { id: workflowId } });
    ensure(draft.currentRevision === input.expectedRevision, "STALE_REVISION", 409);
    const revision = await tx.workflowDraftRevision.findUniqueOrThrow({ where: { workflowId_revision: { workflowId, revision: draft.currentRevision } } });
    const definition = parseDefinition(revision.definition), issues = publicationIssues(definition);
    ensure(revision.validationStatus === "VALID" && issues.length === 0, "WORKFLOW_NOT_VALID_FOR_PUBLICATION", 422);
    ensure(input.configurationHash === revision.configurationHash && configurationHash(definition) === revision.configurationHash, "CONFIGURATION_HASH_CHANGED", 409);
    ensure(!await tx.workflowPublicationSubmission.findUnique({ where: { draftRevisionId: revision.id } }), "REVISION_ALREADY_SUBMITTED", 409);
    const previous = await tx.publishedWorkflowVersion.findFirst({ where: { workflowId }, orderBy: { number: "desc" }, select: { id: true } });
    const approvalRequestId = `wa_${crypto.randomUUID().replaceAll("-", "")}`;
    const submission = await tx.workflowPublicationSubmission.create({ data: { workflowId, draftRevisionId: revision.id, approvalRequestId,
      submittedById: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id,
      commandId: input.commandId, commandHash, configurationHash: revision.configurationHash, changeSummary: input.changeSummary,
      intendedProjectType: definition.intendedProjectType!, schemaVersion: definition.schemaVersion, submittedAt: new Date(), previousPublishedVersionId: previous?.id ?? null } });
    await openWorkflowApproval(tx, submission);
    return { ...submissionView(await tx.workflowPublicationSubmission.findUniqueOrThrow({ where: { id: submission.id }, include: submissionInclude }), actor.businessRole === "DIRECTOR"), replayed: false };
  });
}

export async function listWorkflowApprovals(offset = 0, state: string = "ALL") {
  requirePublication(); offsetValue(offset); ensure(["ALL", "PENDING", "APPROVED", "REJECTED", "SUPERSEDED"].includes(state), "INVALID_APPROVAL_STATE");
  return runtimeAuthorization.runAuthorized({ capability: "template.viewWorkflowApprovals", targetId: "workflow-approvals" }, async tx => {
    const actor = await workflowPublicationActor(tx), director = actor.businessRole === "DIRECTOR";
    const scope: Prisma.WorkflowPublicationSubmissionWhereInput = director ? {} : { workflow: { createdById: actor.userId } };
    const rows = await tx.workflowPublicationSubmission.findMany({ where: { ...scope, ...(state === "ALL" ? {} : { approvalRequest: { state: state as "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED" } }) },
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }], skip: offset, take: 31, include: submissionInclude });
    const pendingCount = await tx.workflowPublicationSubmission.count({ where: { ...scope, approvalRequest: { state: "PENDING" } } });
    return { director, pendingCount, submissions: rows.slice(0, 30).map(r => submissionView(r, director)), hasMore: rows.length > 30 };
  });
}

export async function getWorkflowApproval(id: string) {
  requirePublication();
  return runtimeAuthorization.runAuthorized(requestTarget(id), async tx => {
    const actor = await workflowPublicationActor(tx);
    return submissionView(await tx.workflowPublicationSubmission.findUniqueOrThrow({ where: { approvalRequestId: id }, include: submissionInclude }), actor.businessRole === "DIRECTOR");
  });
}

export async function decideWorkflowPublication(id: string, raw: unknown) {
  requirePublication(); identifier(id);
  const input = record(raw, ["expected", "outcome", "reason", "configurationHash", "confirmed"]);
  const expected = parseApprovalExpectation(input.expected);
  ensure(input.confirmed === true, "EXPLICIT_PUBLICATION_DECISION_REQUIRED");
  ensure(input.outcome === "APPROVE" || input.outcome === "REJECT", "INVALID_DECISION");
  ensure(typeof input.reason === "string" && input.reason.trim().length > 0 && input.reason.length <= 2000, "DECISION_REASON_REQUIRED");
  ensure(typeof input.configurationHash === "string" && /^[a-f0-9]{64}$/.test(input.configurationHash), "INVALID_CONFIGURATION_HASH");
  return runtimeAuthorization.runAuthorized({ capability: "template.approvePublish", targetId: `workflow-approval:${id}`, reason: input.reason }, async tx => {
    const result = await decideWorkflowApproval(tx, id, { expected, outcome: input.outcome as "APPROVE" | "REJECT", reason: input.reason as string, configurationHash: input.configurationHash as string });
    const version = await tx.publishedWorkflowVersion.findUnique({ where: { approvalRequestId: id }, select: { id: true, number: true, workflowId: true } });
    return { ...result, publishedVersion: version };
  });
}

export async function getDraftPublication(workflowId: string) {
  requirePublication(); identifier(workflowId);
  return runtimeAuthorization.runAuthorized({ capability: "template.viewWorkflowApprovals", targetId: `workflow-draft:${workflowId}` }, async tx => {
    const actor = await workflowPublicationActor(tx);
    const submissions = await tx.workflowPublicationSubmission.findMany({ where: { workflowId }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 50, include: submissionInclude });
    const latest = await tx.publishedWorkflowVersion.findFirst({ where: { workflowId }, orderBy: { number: "desc" }, include: versionInclude });
    return { submissions: submissions.map(s => submissionView(s, actor.businessRole === "DIRECTOR")), latestPublished: latest ? versionView(latest) : null };
  });
}

export async function listPublishedWorkflows(offset = 0) {
  requirePublication(); offsetValue(offset);
  return runtimeAuthorization.runAuthorized({ capability: "template.viewPublications", targetId: "published-workflows" }, async tx => {
    const rows = await tx.publishedWorkflow.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: 31,
      include: { versions: { orderBy: { number: "desc" }, take: 1, include: versionInclude } } });
    // Catalog listing omits full definitions; detail is separately authorized.
    return { workflows: rows.slice(0, 30).map(row => {
      const v = versionView(row.versions[0]);
      return { id: row.id, versionId: v.id, number: v.number, name: v.name, stageCount: v.stageCount, intendedProjectType: v.intendedProjectType,
        schemaVersion: v.schemaVersion, validationStatus: v.validationStatus, approvedBy: v.approvedBy, publishedAt: v.publishedAt };
    }), hasMore: rows.length > 30 };
  });
}

export async function getPublishedWorkflow(workflowId: string, number?: number, historyOffset = 0) {
  requirePublication(); identifier(workflowId); offsetValue(historyOffset);
  ensure(number === undefined || (Number.isSafeInteger(number) && number > 0), "INVALID_VERSION");
  return runtimeAuthorization.runAuthorized({ capability: "template.viewPublications", targetId: "published-workflows" }, async tx => {
    const version = await tx.publishedWorkflowVersion.findFirst({ where: { workflowId, ...(number === undefined ? {} : { number }) }, orderBy: { number: "desc" }, include: versionInclude });
    ensure(version, "PUBLISHED_VERSION_UNAVAILABLE", 404);
    const history = await tx.publishedWorkflowVersion.findMany({ where: { workflowId }, orderBy: { number: "desc" }, skip: historyOffset, take: 31,
      select: { id: true, number: true, configurationHash: true, approvedBy: { select: identity }, publishedAt: true } });
    return { ...versionView(version), history: history.slice(0, 30).map(v => ({ ...v, publishedAt: v.publishedAt.toISOString() })), hasMoreHistory: history.length > 30 };
  });
}

// A disabled capability performs no new-schema query on the 113-migration DB.
export async function optionalDraftPublication(id: string) { return publicationEnabled() ? getDraftPublication(id) : null; }

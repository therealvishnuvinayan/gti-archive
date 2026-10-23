import "server-only";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { publicationDependenciesEnabled, publicationEnabled } from "../stage-builder/publication-activation";

type Loader = NonNullable<ResourcePolicies["template.approvePublish"]>;
const publicationPolicy: Loader = async ({ tx, actor, request }) => {
  if (!publicationEnabled() || !publicationDependenciesEnabled() || !["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) return null;
  const director = actor.businessRole === "DIRECTOR";
  const context: AuthorizationContext = { resource: { id: request.targetId, kind: "template" }, resourcePermission: true,
    publicationRequiresDirectorApproval: true, integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
  if (request.capability === "template.viewPublications") return request.targetId === "published-workflows" ? context : null;
  if (request.capability === "template.viewWorkflowApprovals" && request.targetId === "workflow-approvals") return context;
  if (request.capability === "template.approvePublish" && !director) return null;
  const match = /^(workflow-draft|workflow-approval):([a-zA-Z][a-zA-Z0-9_-]{0,79})$/.exec(request.targetId);
  if (!match) return null;
  let workflowId: string;
  if (match[1] === "workflow-draft") {
    if (!["template.submitWorkflow", "template.viewWorkflowApprovals"].includes(request.capability)) return null;
    workflowId = match[2];
  } else {
    if (!["template.viewWorkflowApprovals", "template.approvePublish"].includes(request.capability)) return null;
    const submission = await tx.workflowPublicationSubmission.findUnique({ where: { approvalRequestId: match[2] }, select: { workflowId: true } });
    if (!submission) return null;
    workflowId = submission.workflowId;
  }
  // One lock order for submit, edit, supersession and decision: workflow first.
  await tx.$queryRaw`SELECT id FROM "WorkflowDraft" WHERE id = ${workflowId} FOR UPDATE`;
  const draft = await tx.workflowDraft.findUnique({ where: { id: workflowId } });
  return draft && (director || draft.createdById === actor.userId) ? context : null;
};

export const workflowPublicationPolicies: ResourcePolicies = {
  "template.submitWorkflow": publicationPolicy,
  "template.viewWorkflowApprovals": publicationPolicy,
  "template.viewPublications": publicationPolicy,
  "template.approvePublish": publicationPolicy,
};

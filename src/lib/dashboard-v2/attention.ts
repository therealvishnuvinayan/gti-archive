import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { runtimeAuthorization } from "../authorization/runtime";
import { publicationEnabled } from "../stage-builder/publication-activation";
import { runtimeEnabled } from "../stage-runtime/activation";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { runtimeCreationScope } from "../tasker/runtime-context";
import { dashboardTaskScope, writableTaskContext } from "../tasker/dashboard";
import { taskEnabled } from "../tasker/contracts";
import { actionableRuntimeApproval } from "../stage-runtime/attention";
import { approvalHash } from "../approvals/contracts";
import { parseCreate } from "../stage-runtime/contracts";
import { validateRuntimeCreation } from "../runtime-integration/creation";
import { DraftError } from "../stage-builder/contracts";
import { pageSize, type AttentionItem, type DashboardQuery } from "./contracts";

export async function dashboardAttention(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, query: DashboardQuery) {
  const items: AttentionItem[] = [];
  let hasMore = false;
  let requiresWorkspace = false;
  const wanted = (kind: AttentionItem["kind"]) => query.attention === "all" || query.attention === kind;
  const limit = { take: pageSize + 1, skip: query.attentionPage * pageSize };
  const page = <T>(rows: T[]) => { hasMore ||= rows.length > pageSize; return rows.slice(0, pageSize); };
  const director = actor.businessRole === "DIRECTOR";
  const manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "");
  if (taskEnabled() && wanted("tasks")) await runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
    const rows = await tx.universalTask.findMany({ ...limit, where: { AND: [dashboardTaskScope(actor), writableTaskContext], status: "COMPLETION_REQUESTED",
      ...(director ? {} : { ownerId: actor.userId }), executorId: { not: actor.userId } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true, title: true, updatedAt: true, ownerId: true, entries: { where: { action: "REQUEST_COMPLETION" }, orderBy: { version: "desc" }, take: 1, select: { actorId: true } } } });
    for (const t of page(rows)) if (t.entries[0] && t.entries[0].actorId !== actor.userId) items.push({ id: t.id, kind: "tasks", title: t.title,
      detail: t.ownerId === actor.userId ? "Task Owner · Review completion request" : "Director intervention · Review task completion", href: `/tasks/${t.id}`, at: t.updatedAt.toISOString() });
  });
  if (director && publicationEnabled() && wanted("workflows")) await runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "template.viewWorkflowApprovals", targetId: "workflow-approvals" }, async () => {
    const rows = await tx.workflowPublicationSubmission.findMany({ ...limit, where: { approvalRequest: { state: "PENDING" } }, orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: { id: true, approvalRequestId: true, submittedAt: true, actorVersion: true, actorRole: true, submittedBy: { select: { authorization: { select: { accountStatus: true, businessRole: true, authorizationVersion: true } } } },
        draftRevision: { select: { revision: true, definition: true, workflow: { select: { currentRevision: true } } } } } });
    for (const r of page(rows)) {
      const auth = r.submittedBy.authorization;
      if (r.draftRevision.revision !== r.draftRevision.workflow.currentRevision || auth?.accountStatus !== "ACTIVE" || auth.authorizationVersion !== r.actorVersion || auth.businessRole !== r.actorRole) continue;
      items.push({ id: r.id, kind: "workflows", title: String((r.draftRevision.definition as { name: string }).name), detail: "Director decision · Submitted executable workflow", href: `/projects/workflow-approvals/${r.approvalRequestId}`, at: r.submittedAt.toISOString() });
    }
  });
  if (director && runtimeIntegrationEnabled() && wanted("creation")) {
    const rows = await tx.runtimeCreationRequest.findMany({ ...limit, where: { decision: { is: null }, requesterId: { not: actor.userId } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, snapshot: true, snapshotHash: true, requesterId: true, createdAt: true } });
    for (const r of page(rows)) {
      if (approvalHash(r.snapshot) !== r.snapshotHash) continue;
      const c = parseCreate(r.snapshot);
      try { await validateRuntimeCreation(tx, r.requesterId, c); }
      catch (error) { if (error instanceof DraftError) continue; throw error; }
      items.push({ id: r.id, kind: "creation", title: c.title, detail: "Director decision · JPM project creation request", href: "/projects/runtime/requests", at: r.createdAt.toISOString() });
    }
  }
  if (director && runtimeIntegrationEnabled() && wanted("completion")) {
    const rows = await tx.runtimeCompletionRequest.findMany({ ...limit, where: { state: "PENDING", project: { state: "ACTIVE" } }, orderBy: [{ activity: { createdAt: "asc" } }, { id: "asc" }],
      select: { id: true, projectId: true, snapshotHash: true, policyId: true, project: { select: { title: true, ownerId: true, owner: { select: { authorization: { select: { accountStatus: true, businessRole: true, authorizationVersion: true } } } }, completionPolicies: { take: 1, orderBy: { revision: "desc" }, select: { id: true } } } }, activity: { select: { actorId: true, actorVersion: true, createdAt: true } } } });
    for (const r of page(rows)) {
      const owner = r.project.owner.authorization;
      if (r.activity.actorId !== r.project.ownerId || owner?.accountStatus !== "ACTIVE" || owner.authorizationVersion !== r.activity.actorVersion || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(owner.businessRole ?? "") || r.project.completionPolicies[0]?.id !== r.policyId) continue;
      // Compare against the immutable native request in PostgreSQL. Dashboard
      // responses never load completion-document or whole-project snapshots.
      const [evidence] = await tx.$queryRaw<Array<{ ready: boolean; current: boolean }>>`SELECT flux_runtime_completion_ready(${r.projectId}) AS ready,
        flux_runtime_completion_evidence(${r.projectId}) = (SELECT snapshot FROM "RuntimeCompletionRequest" WHERE id = ${r.id}) AS current`;
      if (!evidence.ready || !evidence.current) continue;
      items.push({ id: r.id, kind: "completion", title: r.project.title, detail: "Director decision · Final project completion", href: `/projects/runtime/${r.projectId}/completion`, at: r.activity.createdAt.toISOString() });
    }
  }
  if (director && runtimeIntegrationEnabled() && wanted("policy")) {
    const rows = await tx.runtimeProject.findMany({ ...limit, where: { state: "ACTIVE", completionPolicies: { none: {} } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, title: true, createdAt: true } });
    for (const r of page(rows)) items.push({ id: `policy:${r.id}`, kind: "policy", title: r.title, detail: "Director decision · Set completion-document policy", href: `/projects/runtime/${r.id}/completion`, at: r.createdAt.toISOString() });
  }
  if (manager && runtimeEnabled() && wanted("stages")) {
    const rows = await tx.runtimeApprovalSubmission.findMany({ ...limit, where: { request: { state: "PENDING" }, stage: { state: { not: "COMPLETED" }, project: runtimeCreationScope(actor.userId, actor.businessRole) } }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      select: { id: true, stageId: true, requestedAt: true, stage: { select: { projectId: true, project: { select: { title: true } } } } } });
    for (const r of page(rows)) {
      const actionable = await actionableRuntimeApproval(tx, actor, r.id);
      if (actionable === "REQUIRES_WORKSPACE") requiresWorkspace = true;
      else if (actionable) items.push({ id: r.id, kind: "stages", title: r.stage.project.title, detail: "Configured runtime-stage approval · Your current step", href: `/projects/runtime/${r.stage.projectId}?stage=${r.stageId}`, at: r.requestedAt.toISOString() });
    }
  }
  items.sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  // Never extrapolate a global metric from a bounded, post-authorized queue.
  return { items, hasMore, requiresWorkspace, completeCount: query.attentionPage === 0 && !hasMore && !requiresWorkspace ? items.length : null };
}

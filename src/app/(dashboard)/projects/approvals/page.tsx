import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { GovernanceForm } from "@/components/projects/governance-form";
import { requireUser } from "@/lib/auth";
import { canCreateProjects } from "@/lib/permissions/resolver";
import { getGovernanceWorkspace } from "@/lib/project-governance/service";

const field = "block w-full rounded-lg border border-slate-300 p-2";
function object(value: Prisma.JsonValue | undefined): Prisma.JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value: Prisma.JsonValue | undefined): Prisma.JsonValue[] { return Array.isArray(value) ? value : []; }
function text(value: Prisma.JsonValue | undefined) { return typeof value === "string" ? value : "—"; }
function DecisionForm({ command, requestId, hash, expired = false }: { command: string; requestId: string; hash: string; expired?: boolean }) {
  return <GovernanceForm submitLabel="Record decision">
    <input type="hidden" name="command" value={command} /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="hash" value={hash} />
    {expired && <p>This request has expired. Retain a rejection reason and ask for a fresh submission.</p>}
    <label className="block">Decision<select name="decision" required defaultValue="" className={field}><option value="" disabled>Choose a decision</option><option value="APPROVE" disabled={expired}>Approve</option><option value="REJECT">Reject</option></select></label>
    <label className="block">Reason<textarea name="reason" required maxLength={2000} className={field} /></label>
  </GovernanceForm>;
}
export default async function ProjectApprovalsPage() {
  const user = await requireUser();
  if (!canCreateProjects(user)) redirect("/no-access");
  const data = await getGovernanceWorkspace(user), director = data.role === "DIRECTOR";
  const person = (id: Prisma.JsonValue | undefined) => data.users.find(u => u.id === id)?.name || data.users.find(u => u.id === id)?.email || text(id);
  return <DashboardLayout><main className="mx-auto max-w-4xl space-y-8 p-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{director ? "Director approval inbox" : "My project requests"}</h1><Link href="/projects/new" className="underline">Create or request a project</Link></div>
    <p>Review the submitted details before deciding. Requests expire after seven days. Changed participant authority or workflow evidence requires a fresh request.</p>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Project creation</h2>
      {!data.creations.length && <p>No project-creation requests.</p>}
      {data.creations.map(row => { const c = object(row.configuration); const expired = row.expiresAt <= new Date(); return <article key={row.id} className="space-y-4 rounded-xl border bg-white p-5">
        <h3 className="text-lg font-semibold">{text(c.name)} · {row.status}</h3>
        <p>Requested by {row.requester.name || row.requester.email} · {row.submittedAt.toISOString()} · expires {row.expiresAt.toISOString()}</p>
        <dl className="grid gap-2 sm:grid-cols-2"><div><dt>Workflow / scope</dt><dd>{row.kind} / {text(c.executionType)}</dd></div><div><dt>Owner</dt><dd>{person(c.ownerId)}</dd></div><div><dt>Co-owners</dt><dd>{list(c.coOwnerIds).map(person).join(", ") || "None"}</dd></div><div><dt>Executors</dt><dd>{list(c.executorIds).map(person).join(", ") || "None"}</dd></div><div><dt>Tags</dt><dd>{list(c.tags).map(text).join(", ") || "None"}</dd></div></dl>
        <p className="whitespace-pre-wrap">{text(c.description)}</p>
        {row.decidedBy && <p>Director decision: {row.decidedBy.name || row.decidedBy.email} · {row.decisionReason}</p>}
        {director && row.status === "SUBMITTED" && <DecisionForm command="decideCreation" requestId={row.id} hash={row.configurationHash} expired={expired} />}
        {row.status === "APPROVED" && (expired ? <p>Approval expired before activation. Submit a new project request.</p> : <GovernanceForm submitLabel="Activate approved project"><input type="hidden" name="command" value="activate" /><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="hash" value={row.configurationHash} /><p>The exact approved details will be used. Activation rechecks the Owner, SPM co-owner and request expiry.</p></GovernanceForm>)}
        {row.status === "ACTIVATED" && <Link className="underline" href={row.projectId ? `/projects/${row.projectId}` : `/projects/flexible/${row.flexibleProject?.slug}`}>Open project</Link>}
      </article>; })}
    </section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Final project completion</h2>
      {!data.completions.length && <p>No final-completion requests.</p>}
      {data.completions.map(row => { const snapshot = object(row.snapshot); const workflow = object(snapshot.completionWorkflow); return <article key={row.id} className="space-y-4 rounded-xl border bg-white p-5">
        <h3 className="text-lg font-semibold">{row.project?.name || row.flexibleProject?.name} · {row.status === "APPROVED" ? "COMPLETED — Director approved" : row.status}</h3>
        <p>Requested by {row.requester.name || row.requester.email} · {row.submittedAt.toISOString()} · expires {row.expiresAt.toISOString()}</p><p>Request reason: {row.reason}</p>
        <Link className="inline-block underline" href={row.projectId ? `/projects/${row.projectId}` : `/projects/flexible/${row.flexibleProject?.slug}`}>Review current project and file evidence</Link>
        <details><summary className="cursor-pointer font-medium">Workflow evidence when submitted</summary><div className="mt-3 space-y-2">
          <p>Owner: {person(snapshot.ownerId)}</p>
          {[...list(snapshot.workflowStages), ...list(snapshot.stages), ...list(snapshot.milestones), ...list(snapshot.productionUnits)].map((entry, index) => { const item = object(entry); return <p key={index}>{text(item.name ?? item.stageKey)}: {text(item.status)}{item.supervision ? ` · Supervision ${text(object(item.supervision).status)}` : ""}</p>; })}
          {snapshot.completionWorkflow ? <><p>Authority approval: {text(workflow.approvalStatus)} · Copyright: {text(workflow.copyrightStatus)} · Invoice: {text(workflow.invoiceStatus)}</p>{list(workflow.documents).map((entry, index) => { const item = object(entry); return <p key={index}>{text(item.type)}: {text(item.originalFileName ?? item.fileName)}</p>; })}</> : <p>No additional completion-document workflow was configured.</p>}
          <p>Project attachments recorded: {list(snapshot.attachments).length}. Changes are checked again before approval.</p>
        </div></details>
        {row.decidedBy && <p>Director decision: {row.decidedBy.name || row.decidedBy.email} · {row.decisionReason}</p>}
        {row.completedAt && <p>Completed: {row.completedAt.toISOString()}. Archiving remains a separate lifecycle action.</p>}
        {director && row.status === "SUBMITTED" && <DecisionForm command="decideCompletion" requestId={row.id} hash={row.snapshotHash} expired={row.expiresAt <= new Date()} />}
      </article>; })}
    </section>
    {director && <section className="space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">Legacy Artwork preset designation</h2>
      <p>This approval covers the existing seven-stage Artwork workflow and its supported project fields. It does not publish a V2 template. Review the definition before allowing SPM direct creation.</p>
      <ol className="list-inside list-decimal">{data.preset.stages.map(stage => <li key={stage.key}>{stage.name}</li>)}</ol>
      {data.presets.length ? data.presets.map(preset => <GovernanceForm key={preset.id} submitLabel="Revoke preset approval"><input type="hidden" name="command" value="revokePreset" /><input type="hidden" name="approvalId" value={preset.id} /><p>Approved by {preset.approvedBy.name || preset.approvedBy.email} on {preset.approvedAt.toISOString()}.</p><label className="block">Revocation reason<textarea name="reason" required maxLength={2000} className={field} /></label></GovernanceForm>) : <GovernanceForm submitLabel="Approve this legacy preset"><input type="hidden" name="command" value="approvePreset" /><input type="hidden" name="hash" value={data.presetHash} /><label className="block">Approval reason<textarea name="reason" required maxLength={2000} className={field} /></label></GovernanceForm>}
    </section>}
    {(director || data.role === "SENIOR_PROJECT_MANAGER") && <section className="space-y-4"><h2 className="text-xl font-semibold">Template proposals</h2>
      <p>Submit a proposed new template or change for Director review. Acceptance endorses the proposal only. Editing and publishing require the future template architecture; an accepted proposal cannot authorize project creation.</p>
      <GovernanceForm submitLabel="Submit template proposal"><input type="hidden" name="command" value="submitTemplateProposal" /><input type="hidden" name="clientRequestId" value={randomUUID()} />
        <label className="block">Title<input name="title" required maxLength={200} className={field} /></label>
        <label className="block">Proposed change<select name="changeKind" className={field}><option value="CREATE">Create a template</option><option value="MODIFY">Modify an existing template or preset</option></select></label>
        <label className="block">Existing template or preset reference (required for modifications)<input name="reference" maxLength={500} className={field} /></label>
        <label className="block">Proposed scope and reason<textarea name="reason" required maxLength={2000} className={field} /></label>
      </GovernanceForm>
      {data.proposals.map(row => { const proposal = object(row.proposal); return <article key={row.id} className="space-y-3 rounded-xl border p-5">
        <h3 className="font-semibold">{text(proposal.title)} · {row.status === "APPROVED" ? "ACCEPTED — awaiting template implementation" : row.status}</h3>
        <p>{text(proposal.changeKind)} · submitted by {row.requester.name || row.requester.email} · expires {row.expiresAt.toISOString()}</p>
        {proposal.reference && <p>Reference: {text(proposal.reference)}</p>}<p className="whitespace-pre-wrap">{text(proposal.brief)}</p>
        {row.decidedBy && <p>Director decision: {row.decidedBy.name || row.decidedBy.email} · {row.decisionReason}</p>}
        {director && row.status === "SUBMITTED" && <DecisionForm command="decideTemplateProposal" requestId={row.id} hash={row.proposalHash} expired={row.expiresAt <= new Date()} />}
      </article>; })}
    </section>}
    <p className="text-sm text-slate-600">Up to 100 requests of each kind are displayed; pending requests appear first. Decisions and reasons are retained.</p>
  </main></DashboardLayout>;
}

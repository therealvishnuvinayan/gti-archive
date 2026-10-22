"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { getDraftPublication, getWorkflowApproval, getPublishedWorkflow } from "@/lib/stage-builder/publication";
import type { getDraft } from "@/lib/stage-builder/service";
import { PUBLICATION_NOTICE, publicationIssues } from "@/lib/stage-builder/publication-contracts";
import { WorkflowPreview } from "./stage-builder";

type Publication = Awaited<ReturnType<typeof getDraftPublication>>;
type Review = Awaited<ReturnType<typeof getWorkflowApproval>>;
const button = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";
const panel = "space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6";
const link = "text-blue-700 underline";
async function send<T>(url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
  const result = await res.json(); if (!res.ok) throw new Error(result.error || "Request unavailable. Refresh and try again."); return result;
}
export function PublicationNotice({ approved = true }: { approved?: boolean }) { return <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{approved ? PUBLICATION_NOTICE : "Definition review only. Publication requires an explicit Director decision. This preview creates no project or runtime stage."}</p>; }
function Hash({ value }: { value: string }) { return <p className="break-all font-mono text-xs">Definition SHA-256: {value}</p>; }
export function DraftPublicationPanel({ initial, draft, dirty }: { initial: Publication; draft: Awaited<ReturnType<typeof getDraft>>; dirty: boolean }) {
  const [data, setData] = useState(initial), [summary, setSummary] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const retry = useRef<{ json: string; commandId: string } | null>(null);
  const issues = publicationIssues(draft.definition), submitted = data.submissions.some(s => s.draftRevision === draft.revision);
  async function submit() {
    setBusy(true); setError("");
    try {
      const json = JSON.stringify({ expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: summary });
      if (retry.current?.json !== json) retry.current = { json, commandId: crypto.randomUUID() };
      await send(`/api/workflow-drafts/${draft.workflowId}/submit`, { ...JSON.parse(json), commandId: retry.current.commandId });
      setData(await send(`/api/workflow-drafts/${draft.workflowId}/publication`)); retry.current = null;
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section aria-label="Workflow publication" className={panel}>
    <h2 className="text-lg font-semibold">Director review and publication</h2>
    <p className="text-sm">Each saved revision needs a separate Director decision. Saving a newer revision supersedes a pending review. Published versions remain unchanged.</p>
    <Hash value={draft.configurationHash} />
    {issues.length > 0 && <ul className="list-inside list-disc text-sm text-amber-900">{issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
    {dirty && <p className="text-sm text-amber-900">Save your changes before submitting for review.</p>}
    {submitted ? <p className="text-sm">This revision has been submitted. To request another review, save a new revision.</p> : <>
      <label className="block text-sm font-medium">Change summary<textarea className="mt-1 block w-full rounded border p-2" rows={3} maxLength={2000} value={summary} onChange={e => setSummary(e.target.value)} /></label>
      <button className={button} disabled={busy || dirty || issues.length > 0 || !summary.trim() || draft.revision !== draft.currentRevision} onClick={submit}>Submit Valid Draft for Approval</button>
    </>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <ul className="space-y-3">{data.submissions.map(s => <li key={s.id} className="rounded border p-3 text-sm">
      <Link className={link} href={`/projects/workflow-approvals/${s.id}`}>Revision {s.draftRevision} · {s.status}</Link><p>{s.changeSummary}</p>
      {s.decisions.map(d => <p key={d.id}>{d.actor.name} · {d.outcome}: {d.reason}</p>)}{s.supersessionReason && <p>{s.supersessionReason}</p>}
    </li>)}</ul>
    <Link className={link} href="/projects/workflow-approvals">All authorized submissions</Link>
    {data.latestPublished && <>
      <PublicationNotice /><Link className={link} href={`/projects/published-workflows/${draft.workflowId}`}>Published version history · Latest v{data.latestPublished.number}</Link>
      <details><summary className="cursor-pointer font-medium">Compare draft with latest approved version</summary>
        <p className="my-3 text-sm">{draft.configurationHash === data.latestPublished.configurationHash ? "Definitions match." : "Definitions differ. These changes require fresh Director approval."}</p>
        <div className="grid items-start gap-4 xl:grid-cols-2"><div><h3 className="mb-2 font-semibold">Saved draft revision {draft.revision}</h3><Hash value={draft.configurationHash} /><WorkflowPreview definition={draft.definition} /></div><div><h3 className="mb-2 font-semibold">Approved version {data.latestPublished.number}</h3><Hash value={data.latestPublished.configurationHash} /><WorkflowPreview definition={data.latestPublished.definition} /></div></div>
      </details>
    </>}
  </section>;
}
export function WorkflowReview({ initial }: { initial: Review }) {
  const router = useRouter(), [data, setData] = useState(initial), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const retry = useRef<{ json: string; commandId: string } | null>(null);
  async function decide(outcome: "APPROVE" | "REJECT") {
    setBusy(true); setError("");
    try {
      const json = JSON.stringify({ outcome, reason, confirmed, configurationHash: data.configurationHash, expected: data.expected });
      if (retry.current?.json !== json) retry.current = { json, commandId: crypto.randomUUID() };
      await send(`/api/workflow-approvals/${data.id}/decision`, { ...JSON.parse(json), expected: { ...data.expected, commandId: retry.current.commandId } });
      setData(await send(`/api/workflow-approvals/${data.id}`)); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
    <Link className={link} href="/projects/workflow-approvals">Workflow Approvals</Link>
    <header><h1 className="text-2xl font-semibold">Review workflow definition</h1><p className="mt-2">{data.status} · Submitted revision {data.draftRevision} · {data.definition.name}</p></header>
    <PublicationNotice approved={data.status === "APPROVED"} />
    <section className={panel} aria-label="Submitted evidence"><h2 className="font-semibold">Exact submitted evidence</h2>
      <p>Author: {data.author.name} · Revision by: {data.revisionActor.name} · Submitted by: {data.submittedBy.name}</p>
      <p>Submitted: {new Date(data.submittedAt).toLocaleString()} · {data.intendedProjectType} · {data.validationStatus} · Schema {data.schemaVersion}</p>
      <p className="whitespace-pre-wrap">Change summary: {data.changeSummary}</p><Hash value={data.configurationHash} /><p className="break-all text-xs">Immutable revision: {data.draftRevisionId}</p>
      {data.previousPublishedVersionId && <Link className={link} href={`/projects/published-workflows/${data.workflowId}`}>Earlier published versions</Link>}
    </section>
    <WorkflowPreview definition={data.definition} />
    {data.canDecide && <section className={panel} aria-label="Director decision">
      <h2 className="font-semibold">Explicit Director decision</h2><p className="text-sm">Approval publishes precisely the submitted revision and hash above. Director-authored definitions require this same explicit decision.</p>
      <label className="block font-medium">Decision reason<textarea className="mt-2 block w-full rounded border p-3" rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed this exact revision and hash and confirm my decision.</label>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || !confirmed || !reason.trim()} onClick={() => decide("APPROVE")}>Approve and publish definition</button><button className={button} disabled={busy || !confirmed || !reason.trim()} onClick={() => decide("REJECT")}>Reject with feedback</button></div>
    </section>}
    {error && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{error} <button className="underline" onClick={() => location.reload()}>Refresh review</button></p>}
    <section className={panel}><h2 className="font-semibold">Review history</h2>{data.supersessionReason && <p>{data.supersessionReason}</p>}
      {data.decisions.map(d => <div key={d.id}><p>{d.outcome} · {d.actor.name} · {d.actorRole} · {new Date(d.decidedAt).toLocaleString()}</p><p className="whitespace-pre-wrap">{d.reason}</p></div>)}
      <ol className="space-y-2 text-sm">{data.audit.map(e => <li key={e.id}>{e.action} · {e.actor?.name} · {new Date(e.createdAt).toLocaleString()}</li>)}</ol>
      {data.publishedVersion && <Link className={link} href={`/projects/published-workflows/${data.workflowId}?version=${data.publishedVersion.number}`}>Published version {data.publishedVersion.number}</Link>}
      <Link className={`${link} block`} href={`/projects/workflow-drafts/${data.workflowId}`}>Open current draft</Link>
    </section>
  </main>;
}
export function PublishedWorkflowDetail({ data, historyOffset }: { data: Awaited<ReturnType<typeof getPublishedWorkflow>>; historyOffset: number }) {
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8"><Link className={link} href="/projects/published-workflows">Published workflows</Link><h1 className="text-2xl font-semibold">{data.name} · Version {data.number}</h1><PublicationNotice />
    <section className={panel}><h2 className="font-semibold">Immutable approved version</h2><p>{data.intendedProjectType} · {data.stageCount} stages · {data.validationStatus} · Schema {data.schemaVersion}</p><p>Author: {data.author.name} · Submitted by: {data.submittedBy.name}</p><p>Director: {data.approvedBy.name} · Approved: {new Date(data.approvedAt).toLocaleString()} · Published: {new Date(data.publishedAt).toLocaleString()}</p><p className="whitespace-pre-wrap">Approval reason: {data.approvalReason}</p><Hash value={data.configurationHash} /><dl className="space-y-1 break-all text-xs"><dt>Version</dt><dd>{data.id}</dd><dt>Source revision</dt><dd>{data.draftRevisionId}</dd><dt>Approval request / decision</dt><dd>{data.approvalRequestId} / {data.approvalDecisionId}</dd><dt>Publication evidence</dt><dd>{data.eventId}</dd></dl></section>
    <section className={panel}><h2 className="font-semibold">Version history</h2><ul className="space-y-3">{data.history.map(v => <li key={v.id}><Link className={link} href={`?version=${v.number}&historyOffset=${historyOffset}`}>Version {v.number}</Link> · {v.approvedBy.name} · {new Date(v.publishedAt).toLocaleString()}<Hash value={v.configurationHash} /></li>)}</ul><div className="flex gap-4">{historyOffset > 0 && <Link className={link} href={`?version=${data.number}&historyOffset=${Math.max(0, historyOffset - 30)}`}>Newer history</Link>}{data.hasMoreHistory && <Link className={link} href={`?version=${data.number}&historyOffset=${historyOffset + 30}`}>Older history</Link>}</div></section>
    <WorkflowPreview definition={data.definition} />
  </main>;
}

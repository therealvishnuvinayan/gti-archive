import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listWorkflowApprovals } from "@/lib/stage-builder/publication";
import { publicationPage } from "@/lib/stage-builder/publication-page";
export const dynamic = "force-dynamic";
export default async function WorkflowApprovalsPage({ searchParams }: { searchParams: Promise<{ offset?: string; state?: string }> }) {
  const query = await searchParams, offset = Number(query.offset ?? 0), state = query.state ?? "ALL";
  const data = await publicationPage(() => listWorkflowApprovals(offset, state));
  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"><Link className="underline" href="/projects">Projects</Link><h1 className="text-2xl font-semibold">{data.director ? "Workflow Approvals" : "My workflow submissions"}</h1><p>{data.pendingCount} pending authorized submissions</p>
    <nav aria-label="Approval status" className="flex flex-wrap gap-4">{["ALL", "PENDING", "APPROVED", "REJECTED", "SUPERSEDED"].map(s => <Link key={s} className="text-blue-700 underline" aria-current={s === state ? "page" : undefined} href={`?state=${s}`}>{s}</Link>)}</nav>
    <ul className="space-y-4">{data.submissions.map(s => <li key={s.id} className="space-y-2 rounded-xl border bg-white p-5"><Link className="text-lg font-medium text-blue-700 underline" href={`/projects/workflow-approvals/${s.id}`}>{s.definition.name}</Link><p>{s.status} · Revision {s.draftRevision} · {s.intendedProjectType}</p><p>Author: {s.author.name} · Submitted by: {s.submittedBy.name} · {new Date(s.submittedAt).toLocaleString()}</p><p className="whitespace-pre-wrap">{s.changeSummary}</p></li>)}</ul>{data.submissions.length === 0 && <p>No submissions in this view.</p>}
    <div className="flex gap-4">{offset > 0 && <Link className="underline" href={`?state=${state}&offset=${Math.max(0, offset - 30)}`}>Previous submissions</Link>}{data.hasMore && <Link className="underline" href={`?state=${state}&offset=${offset + 30}`}>More submissions</Link>}</div>
  </main></DashboardLayout>;
}

import { StageRuntimeEntry } from "@/components/projects/stage-runtime-entry";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PublicationNotice } from "@/components/projects/workflow-publication";
import { listPublishedWorkflows } from "@/lib/stage-builder/publication";
import { publicationPage } from "@/lib/stage-builder/publication-page";
export const dynamic = "force-dynamic";
export default async function PublishedWorkflowsPage({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  const offset = Number((await searchParams).offset ?? 0), data = await publicationPage(() => listPublishedWorkflows(offset));
  return <DashboardLayout><main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8"><Link className="underline" href="/projects">Projects</Link><h1 className="text-2xl font-semibold">Published workflow definitions</h1><PublicationNotice /><StageRuntimeEntry /><ul className="grid gap-4 md:grid-cols-2">{data.workflows.map(w => <li key={w.id} className="space-y-3 rounded-xl border bg-white p-5"><Link className="text-lg font-semibold text-blue-700 underline" href={`/projects/published-workflows/${w.id}`}>{w.name}</Link><p>{w.intendedProjectType} · Version {w.number} · {w.stageCount} stages</p><p>{w.validationStatus} · Schema {w.schemaVersion}</p><p>Director: {w.approvedBy.name} · {new Date(w.publishedAt).toLocaleString()}</p></li>)}</ul>{data.workflows.length === 0 && <p>No approved definitions have been published.</p>}<div className="flex gap-4">{offset > 0 && <Link className="underline" href={`?offset=${Math.max(0, offset - 30)}`}>Previous definitions</Link>}{data.hasMore && <Link className="underline" href={`?offset=${offset + 30}`}>More definitions</Link>}</div></main></DashboardLayout>;
}

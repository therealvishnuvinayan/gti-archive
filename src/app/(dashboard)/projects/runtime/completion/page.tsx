import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listRuntimeCompletionRequests } from "@/lib/runtime-completion/service";
import { runtimePage } from "@/lib/stage-runtime/http";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await runtimePage(listRuntimeCompletionRequests);
  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8"><Link className="underline" href="/projects/runtime">Runtime projects</Link><h1 className="text-2xl font-semibold">Pending final completion requests</h1><p>{data.count} requests awaiting a Director decision. Showing the oldest 100.</p><ul className="space-y-4">{data.requests.map(r => <li key={r.id} className="rounded-xl border bg-white p-5"><Link className="font-semibold underline" href={`/projects/runtime/${r.project.id}/completion`}>{r.project.title}</Link><p>Owner: {r.project.owner.name} · Workflow version {r.project.versionNumber} · Request {r.revision}</p><p>{r.reason}</p></li>)}</ul></main></DashboardLayout>;
}

"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskSelect, TaskTextarea } from "./tasker-form-controls";
import { CreateTask, useTaskUpdates } from "./tasker-workspace";
import type { TaskDependencyDetail, TaskDependencyLink, TaskDependencyMutation } from "@/lib/tasker/types";

const panel = "rounded-[22px] border border-[#dfe6df] bg-white p-5 sm:p-6";
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to update dependencies.");
  return result;
}
const labels = { NONE: "Task continues normally", REQUESTED: "Pause awaiting project owner", APPROVED: "Approved blocking dependency", REJECTED: "Pause rejected · task continues" };
const outcomeLabels: Record<string, string> = { COMPLETED: "Completed", REJECTED: "Rejected or declined — requirement may still be unmet", CANCELLED: "Cancelled — requirement may still be unmet", DELETED: "Deleted — requirement may still be unmet", MAIN_ENDED: "Main task ended · request can continue independently" };

function DependencyCard({ link, busy, mutate }: { link: TaskDependencyLink; busy: boolean; mutate: (input: TaskDependencyMutation) => Promise<void> }) {
  const [note, setNote] = useState("");
  return <article className={panel}>
    <p className="text-xs font-semibold uppercase tracking-wide text-[#63816e]">{link.direction === "REQUIRES" ? "This task needs" : "Needed by"}</p>
    <h2 className="mt-2 break-words text-lg font-semibold">{link.relatedTask ? <Link className="text-[#26734d] underline" href={link.relatedTask.href}>{link.relatedTask.title}</Link> : "Restricted or unavailable task"}</h2>
    <p role="status" className="mt-3 text-sm text-[#586b5f]">{link.outcome ? outcomeLabels[link.outcome] ?? link.outcome : labels[link.pauseStatus]}</p>
    {link.reason && <p className="mt-3 whitespace-pre-wrap text-sm">{link.reason}</p>}
    {link.reviewNote && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">Project owner’s decision: {link.reviewNote}</p>}
    {(link.canRequestPause || link.canReviewPause) && <div className="mt-4 grid gap-3">
      <TaskTextarea aria-label="Pause reason or decision" value={note} onChange={(e) => setNote(e.target.value)} maxLength={20000} rows={3} placeholder={link.canReviewPause ? "Decision note (required to reject)" : "Explain why this task needs to pause"} disabled={busy} />
      <div className="flex flex-wrap gap-3">{link.canRequestPause && <Button disabled={busy || !note.trim()} onClick={() => void mutate({ action: "REQUEST_PAUSE", dependencyId: link.id, version: link.version, note })}>Request pause</Button>}
        {link.canReviewPause && <><Button disabled={busy} onClick={() => void mutate({ action: "APPROVE_PAUSE", dependencyId: link.id, version: link.version, note })}>Approve pause</Button><Button variant="secondary" disabled={busy || !note.trim()} onClick={() => void mutate({ action: "REJECT_PAUSE", dependencyId: link.id, version: link.version, note })}>Reject pause</Button></>}
      </div>
    </div>}
    {link.history.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Dependency history</summary><ol className="mt-3 grid gap-3">{link.history.map((e) => <li key={e.id} className="border-l-2 border-[#dceade] pl-3"><p className="text-xs text-slate-500">{e.actor} · {e.action.toLowerCase().replaceAll("_", " ")} · {new Date(e.createdAt).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-sm">{e.note}</p></li>)}</ol></details>}
  </article>;
}

export function TaskerDependencyWorkspace({ initialData }: { initialData: TaskDependencyDetail }) {
  const [data, setData] = useState(initialData), [creating, setCreating] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""), [reason, setReason] = useState(""), [requestPause, setRequestPause] = useState(false);
  const url = `/api/tasker/dependencies?${new URLSearchParams(initialData.source)}`;
  const reload = useCallback(async () => { setData((await api<{ dependencies: TaskDependencyDetail }>(url)).dependencies); }, [url]);
  useTaskUpdates(reload, !busy && creating === null);
  async function mutate(input: TaskDependencyMutation) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await api(url, input); await reload(); setNotice("Dependency updated."); }
    catch (e) { setError((e as Error).message); await reload().catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto grid w-full max-w-[1100px] gap-5 pb-10">
    <Link href={data.href} className="flex items-center gap-2 text-sm text-[#26734d]"><ArrowLeft className="h-4 w-4" />Back to task</Link>
    <header className={panel}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-[#63816e]">Dependencies</p><h1 className="mt-2 break-words text-2xl font-semibold">{data.title}</h1></div><Button variant="ghost" aria-label="Refresh dependencies" disabled={busy} onClick={() => void reload().catch((e) => setError(e.message))}><RefreshCw className="h-4 w-4" /></Button></div>
      <p className="mt-3 text-sm text-slate-600">Request what you need from another project participant. Only the project owner can approve a pause.</p>
      {data.paused ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Task paused. Discussion and reference files remain available. Submissions and completion resume when every approved blocking dependency resolves.</p> : data.pendingPauses > 0 ? <p role="status" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Pause awaiting project owner approval. This task continues normally.</p> : <p className="mt-4 text-sm">No active dependency pause.</p>}
      {data.canCreate && <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => setCreating(false)} disabled={busy}>Create request</Button><Button variant="secondary" onClick={() => setCreating(true)} disabled={busy}>Create request and ask to pause</Button></div>}
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    {data.canCreate && <details className={panel}><summary className="cursor-pointer font-semibold">Link an existing task</summary><div className="mt-4 grid gap-4">
      <TaskSelect label="Dependency task" value={selected} onChange={setSelected} options={data.availableTasks.map((t) => ({ id: `${t.source.type}:${t.source.id}`, label: t.title }))} placeholder="Choose a task you can access" disabled={busy} />
      <TaskTextarea aria-label="Dependency reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={20000} placeholder="What do you need from this task?" rows={3} disabled={busy} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="accent-[#26734d]" checked={requestPause} onChange={(e) => setRequestPause(e.target.checked)} disabled={busy} />Ask the project owner to pause this task until the dependency resolves.</label>
      <Button className="w-fit" disabled={busy || !selected || !reason.trim()} onClick={() => { const required = data.availableTasks.find((t) => `${t.source.type}:${t.source.id}` === selected)?.source; if (required) void mutate({ action: "LINK", required, requestPause, reason }); }}>Link dependency</Button>
    </div></details>}
    {!data.links.length && <p className="py-8 text-center text-sm text-slate-500">No dependency requests yet.</p>}
    {data.links.map((link) => <DependencyCard key={`${link.id}:${link.version}`} link={link} busy={busy} mutate={mutate} />)}
    {creating !== null && <CreateTask initialProject={data.project} dependencyOf={{ source: data.source, requestPause: creating }} sourceTitle={data.title} onClose={() => setCreating(null)} onCreated={() => { setCreating(null); setNotice("Dependency request created."); void reload().catch((e) => setError(e.message)); }} />}
  </section>;
}

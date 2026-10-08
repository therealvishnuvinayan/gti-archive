"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Check, Download, GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskSelect, TaskTextarea } from "./tasker-form-controls";
import { CreateTask, useTaskUpdates } from "./tasker-workspace";
import { TASK_STATUS_LABELS, type TaskFamilyDetail, type TaskFamilyMutation, type TaskListItem } from "@/lib/tasker/types";

const panel = "rounded-[22px] border border-[#dfe6df] bg-white p-5 sm:p-6";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load task revisions.");
  return result;
}

function Revision({ task, parent = false }: { task: TaskListItem; parent?: boolean }) {
  return <Link href={task.href} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe6df] p-4 hover:bg-[#f5f9f5]">
    <div className="min-w-0"><p className="text-xs font-medium text-[#26734d]">{parent ? "Parent task" : `Sister Task ${task.family?.sisterNumber}`}</p><p className="mt-1 break-words font-semibold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.owner.label} → {task.assignee.label}</p></div>
    <span className="rounded-full bg-[#eff6f0] px-3 py-1 text-xs text-[#26734d]">{TASK_STATUS_LABELS[task.status]}</span>
  </Link>;
}

export function TaskerFamilyWorkspace({ initialFamily }: { initialFamily: TaskFamilyDetail }) {
  const [family, setFamily] = useState(initialFamily);
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [fileKey, setFileKey] = useState(initialFamily.finalFile?.key ?? ""), [note, setNote] = useState("");
  const [decision, setDecision] = useState(""), [reason, setReason] = useState("");
  const endpoint = `/api/tasker/family?${new URLSearchParams(initialFamily.source)}`;
  const reload = useCallback(async () => { setFamily((await request<{ family: TaskFamilyDetail }>(endpoint)).family); }, [endpoint]);
  useTaskUpdates(reload, !busy && !creating);
  const currentTask = [family.original, ...family.children].find((t) => t?.id === family.source.id);

  async function mutate(input: Omit<TaskFamilyMutation, "version">) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(endpoint, { ...input, version: family.version });
      await reload(); setNote(""); setReason("");
      setNotice(input.action === "SELECT_FINAL" ? "Final file selected. Previous files and issued records are preserved." : "Your decision has been recorded. Use the project workflow to arrange any required approval or handover.");
    } catch (e) { setError((e as Error).message); await reload().catch(() => undefined); }
    finally { setBusy(false); }
  }
  async function download(key: string) {
    try { window.location.assign((await request<{ url: string }>(`${endpoint}&fileKey=${encodeURIComponent(key)}`)).url); }
    catch (e) { setError((e as Error).message); }
  }
  return <section className="mx-auto grid w-full max-w-[1100px] gap-5 pb-16" aria-label="Sister Tasks and files">
    <Link href={currentTask?.href ?? "/tasks"} className="flex items-center gap-2 text-sm text-[#26734d]"><ArrowLeft className="h-4 w-4" />Back to task</Link>
    <header className={panel}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#26734d]">{family.project.name}</p><h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold"><GitBranch className="h-5 w-5" />Sister Tasks</h1><p className="mt-2 text-sm text-slate-600">Keep later corrections and additional work with the original task.</p></div><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create Sister Task</Button></div></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <div className={panel}><h2 className="mb-4 text-lg font-semibold">Tasks and revisions</h2><div className="grid gap-3">{family.original ? <Revision task={family.original} parent /> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">The parent task is not available to you.</p>}{family.children.map((task) => <Revision key={task.id} task={task} />)}{!family.children.length && <p className="text-sm text-slate-500">No Sister Tasks are available in this view yet.</p>}</div></div>
    <div className={panel}><h2 className="mb-3 text-lg font-semibold">Final file</h2>
      {family.finalFile ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#eff6f0] p-4"><div className="min-w-0"><p className="flex items-center gap-2 break-all font-semibold text-[#26734d]"><Check className="h-4 w-4 shrink-0" />{family.finalFile.name}</p><p className="mt-1 text-xs text-slate-500">{family.finalFile.revisionLabel} · {family.finalFile.taskTitle}</p></div><Button variant="secondary" onClick={() => void download(family.finalFile!.key)}><Download className="h-4 w-4" />Download final file</Button></div> : <p className="mb-4 text-sm text-slate-500">No selected final file is available in your task view.</p>}
      {family.canSelectFinal && <div className="grid gap-4"><p className="text-sm text-slate-600">Choose an accepted or approved file from the parent or any Sister Task you can access. Production approvals and handover continue through their existing workflows.</p><div className="grid gap-2"><span className="text-sm font-medium">File to use</span><TaskSelect label="File to use" value={fileKey} onChange={setFileKey} placeholder="Choose an accepted version" disabled={busy} options={family.files.filter((f) => f.canSelect).map((f) => ({ id: f.key, label: `${f.revisionLabel} · ${f.name} · ${new Date(f.submittedAt).toLocaleString()}` }))} /></div><TaskTextarea aria-label="Final file selection note" placeholder="Selection note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={20000} rows={2} /><Button className="w-fit" disabled={busy || !fileKey || fileKey === family.finalFile?.key} onClick={() => void mutate({ action: "SELECT_FINAL", fileKey, note })}>Select final file</Button></div>}
    </div>
    {family.cycleDecision && <div className={panel}><h2 className="mb-2 text-lg font-semibold">Approval and handover decision</h2><p className="mb-4 text-sm text-slate-600">{family.cycleDecision === "PENDING" ? "This project already has production approval or handover records. The project owner needs to decide whether this revision requires another cycle." : family.cycleDecision === "REQUIRED" ? "The project owner has requested another approval or handover cycle." : "The project owner has decided that another cycle is not required."} Previous records remain intact.</p>{family.canDecideCycle && <div className="grid gap-3"><TaskSelect label="Another approval or handover cycle" value={decision} onChange={setDecision} placeholder="Record your decision" options={[{ id: "REQUIRED", label: "Another cycle is required" }, { id: "NOT_REQUIRED", label: "Another cycle is not required" }]} disabled={busy} /><TaskTextarea aria-label="Reason for cycle decision" placeholder="Explain your decision" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={20000} rows={3} /><Button className="w-fit" disabled={busy || !decision || !reason.trim()} onClick={() => void mutate({ action: "DECIDE_CYCLE", decision: decision as "REQUIRED" | "NOT_REQUIRED", note: reason })}>Record decision</Button></div>}</div>}
    <div className={panel}><h2 className="mb-4 text-lg font-semibold">All submitted files</h2><div className="grid gap-3">{family.files.map((file) => <div key={file.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe6df] p-4"><div className="min-w-0"><p className="break-all text-sm font-semibold">{file.name}{file.key === family.finalFile?.key && <span className="ml-2 text-xs font-normal text-[#26734d]">Selected final file</span>}</p><p className="mt-1 text-xs text-slate-500">{file.revisionLabel} · {file.taskTitle} · {new Date(file.submittedAt).toLocaleString()}{!file.canSelect && " · Not accepted or approved"}</p></div><Button variant="ghost" aria-label={`Download ${file.name}`} onClick={() => void download(file.key)}><Download className="h-4 w-4" />Download</Button></div>)}{!family.files.length && <p className="text-sm text-slate-500">Files will appear here after submission.</p>}</div></div>
    <details className={panel}><summary className="cursor-pointer font-semibold">Revision and selection history</summary><ol className="mt-5 grid gap-4">{family.history.map((entry) => <li key={entry.id} className="border-l-2 border-[#dceade] pl-4"><p className="text-xs text-slate-500">{entry.actor.label} · {entry.action.toLowerCase().replaceAll("_", " ")} · {new Date(entry.createdAt).toLocaleString()}</p>{entry.fileName && <p className="mt-1 break-all text-sm font-medium">{entry.fileName}</p>}{entry.note && <p className="mt-1 whitespace-pre-wrap text-sm">{entry.note}</p>}</li>)}</ol></details>
    {creating && <CreateTask initialProject={family.project} sisterOf={family.source} sourceTitle={currentTask?.title} onClose={() => setCreating(false)} onCreated={(id) => { window.location.assign(`/tasks/${encodeURIComponent(id)}`); }} />}
  </section>;
}

"use client";

import Link from "next/link";
import { EvidenceInfo, FamilyCards, RevisionComparison, SisterComposer } from "./task-families";
import { richTextToPlainText } from "@/lib/rich-text";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Plus, ArrowLeft, Paperclip, RefreshCw } from "lucide-react";
import { priorities, statuses, taskTypes, type TaskDetail, type TaskSummary, type ConceptSourceChoice, isDeliverable } from "@/lib/tasker/contracts";

const input = "w-full rounded-xl border border-[#d9e2da] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600";
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#d9e2da] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const primary = `${button} !border-emerald-800 !bg-emerald-800 text-white`;
const activityLabels: Record<string, string> = { TEXT_FILE: "Text and file", CREATED: "Task created", EDIT: "Task updated", MESSAGE: "Message", SUBMIT: "Response submitted", REQUEST_COMPLETION: "Completion requested", APPROVE: "Completion approved", REJECT: "Changes requested", CLOSE: "Task closed", DELETE: "Task deleted", PREPARE_UPLOAD: "Attachment upload started", FINALIZE_UPLOAD: "Attachment ready" };
const label = (s: string) => activityLabels[s] ?? s.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
function FieldValue({ value, rich }: { value: unknown; rich: boolean }) {
  const text = value && typeof value === "object" && "text" in value && typeof value.text === "string" ? value.text : "";
  return <p className="mt-2 whitespace-pre-wrap text-sm">{text ? (rich ? richTextToPlainText(text) : text) : "No text in this value."}</p>;
}
const personName = (p: { id: string; name: string | null }) => p.name || "Business user";
async function api<T>(path: string, data?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`/api/tasker${path}`, data === undefined ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load tasks."); return result as T;
}
type Options = { canCreateConcepts: boolean; conceptSources: ConceptSourceChoice[]; targets: { target: string; label: string; modes: string[]; projectId: string }[]; actorId: string; people: { id: string; name: string | null; role: string }[]; contexts: { target: string; name: string }[] };
function TaskForm({ context, task, onDone, onCancel, initialDestination }: { initialDestination?: string; context?: string; task?: TaskDetail; onDone: () => void; onCancel: () => void }) {
  const [options, setOptions] = useState<Options | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [type, setType] = useState<TaskSummary["type"]>(task?.type ?? (initialDestination?.startsWith("checklist:") ? "DATA_INPUT" : "GENERAL")), [selectedContext, setSelectedContext] = useState(context ?? ""), [destination, setDestination] = useState(initialDestination ?? "");
  const targets = options?.targets.filter(t => `structured:${t.projectId}` === selectedContext && (type === "DATA_INPUT" ? t.target.startsWith("checklist:") : !t.target.startsWith("checklist:"))) ?? [];
  const sourceChoices = options?.conceptSources.filter(s => s.contextTarget === selectedContext || selectedContext.startsWith("task:")) ?? [];
  const selectedTarget = targets.find(t => t.target === destination);
  const [executor, setExecutor] = useState(task?.executor.id ?? "");
  useEffect(() => { let active = true; api<Options>(`?options=1${context ? `&context=${encodeURIComponent(context)}` : ""}`).then(o => { if (active) setOptions(o); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [context]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const fields = { title: form.get("title"), brief: form.get("brief"), context: form.get("context"), deadline: new Date(String(form.get("deadline"))).toISOString(),
        priority: form.get("priority"), executorId: executor, spectatorIds: form.getAll("spectatorIds"), commandId: crypto.randomUUID() };
      if (task) await api(`/${task.id}`, { ...fields, action: "EDIT", expectedVersion: task.version }, "PATCH");
      else await api("", { ...fields, type, contextTarget: selectedContext, ...(isDeliverable(type) ? { destination, inputMode: form.get("inputMode") } : {}), ...(type === "INSPECT_FILE" && form.get("sourceVersionId") ? { sourceVersionId: form.get("sourceVersionId") } : {}), ...(type === "FINAL_CONCEPT" ? { inspirationVersionIds: form.getAll("inspirationVersionIds") } : {}) });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save task."); } finally { setBusy(false); }
  }
  const localDate = task ? new Date(new Date(task.deadline).getTime() - new Date(task.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return <form onSubmit={save} className="space-y-4 rounded-2xl border border-[#d9e2da] bg-[#f4f7f3] p-5">
    <h2 className="text-lg font-semibold">{task ? `Edit ${label(task.type)} Task` : `New ${label(type)} Task`}</h2>
    {!context && !task && <label className="block text-sm">Project or assigned task context<select name="contextTarget" value={selectedContext} onChange={e => { setSelectedContext(e.target.value); setType("GENERAL"); setDestination(""); }} className={input} required><option value="">Choose a context</option>{options?.contexts.map(c => <option key={c.target} value={c.target}>{c.name}</option>)}</select></label>}
    {!task && (!!options?.targets.length || options?.canCreateConcepts) && <label className="block text-sm">Task type<select aria-label="Task type" value={type} onChange={e => { setType(e.target.value as TaskSummary["type"]); setDestination(""); }} className={input}>
      <option value="GENERAL">General Task</option>
      {options.targets.some(t => `structured:${t.projectId}` === selectedContext && !t.target.startsWith("checklist:")) && <option value="FILE_UPLOAD">File Upload Task</option>}
      {options.targets.some(t => `structured:${t.projectId}` === selectedContext && t.target.startsWith("checklist:")) && <option value="DATA_INPUT">Data Input Task</option>}
      {options?.canCreateConcepts && <><option value="INSPECT_FILE">Inspect File Task</option><option value="INITIAL_CONCEPT">Initial Concept Task</option><option value="FINAL_CONCEPT">Final Concept Task</option></>}
    </select></label>}
    {!task && isDeliverable(type) && <><label className="block text-sm">{type === "DATA_INPUT" ? "Target stage field" : "Destination folder"}<select aria-label="Task destination" value={destination} onChange={e => setDestination(e.target.value)} className={input} required><option value="">Choose an authorized destination</option>{targets.map(t => <option key={t.target} value={t.target}>{t.label}</option>)}</select></label>
      <label className="block text-sm">Requested answer<select name="inputMode" aria-label="Requested answer" key={destination} className={input} required>{selectedTarget?.modes.map(m => <option key={m} value={m}>{label(m)}</option>)}</select></label>
      <p className="text-sm text-[#68766b]">Work is applied only after acceptance. The executor receives task access only.</p></>}
    {!task && type === "INSPECT_FILE" && <label className="block text-sm">Inspection source<select key={selectedContext} name="sourceVersionId" className={input}><option value="">Upload a source after creating this task</option>{sourceChoices.filter(s => s.kind === "INSPECTION").map(s => <option key={s.versionId} value={s.versionId}>{s.name} · v{s.number}</option>)}</select><span className="mt-2 block text-xs">Only sealed project files you can delegate appear here. Findings cannot be submitted until a source is pinned.</span></label>}
    {!task && type === "FINAL_CONCEPT" && <fieldset className="space-y-2"><legend>Initial Concept inspiration (optional)</legend>{sourceChoices.filter(s => s.kind === "INSPIRATION").map(s => <label key={s.versionId} className="flex gap-2 text-sm"><input type="checkbox" name="inspirationVersionIds" value={s.versionId} />{s.sourceTaskTitle} · {s.name} · v{s.number} · {label(s.sourceState)}</label>)}{!sourceChoices.some(s => s.kind === "INSPIRATION") && <p className="text-sm text-[#68766b]">No eligible Initial Concept files in this context. You can create a Final Concept Task without inspiration.</p>}<p className="text-xs">Selected versions stay pinned. Their original review does not approve the Final Concept.</p></fieldset>}
    <label className="block text-sm">Title<input name="title" defaultValue={task?.title} className={input} required maxLength={200} /></label>
    <label className="block text-sm">Brief<textarea name="brief" defaultValue={task?.brief} className={input} rows={4} required maxLength={20000} /></label>
    <label className="block text-sm">Supporting context (optional)<textarea name="context" defaultValue={task?.context ?? ""} className={input} rows={2} maxLength={5000} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Deadline (your local time)<input name="deadline" type="datetime-local" defaultValue={localDate} className={input} required /></label>
      <label className="text-sm">Priority<select name="priority" defaultValue={task?.priority ?? "NORMAL"} className={input}>{priorities.map(p => <option key={p} value={p}>{label(p)}</option>)}</select></label></div>
    <label className="block text-sm">Executor<select name="executorId" value={executor} onChange={e => setExecutor(e.target.value)} className={input} required><option value="">Choose an executor</option>{options?.people.filter(p => p.id !== (task?.owner.id ?? options.actorId)).map(p => <option key={p.id} value={p.id}>{personName(p)} · {label(p.role)}</option>)}</select></label>
    <fieldset><legend className="mb-2 text-sm">Spectators (view only)</legend><div className="flex flex-wrap gap-4">{options?.people.filter(p => p.id !== (task?.owner.id ?? options.actorId) && p.id !== executor).map(p => <label key={p.id} className="flex items-center gap-2 text-sm"><input name="spectatorIds" value={p.id} type="checkbox" defaultChecked={task?.spectators.some(s => s.id === p.id)} />{personName(p)}</label>)}</div></fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2"><button disabled={busy || !options} className={primary}>{busy ? "Saving…" : task ? "Save changes" : `Create ${label(type)} Task`}</button><button type="button" onClick={onCancel} className={button}>Cancel</button></div>
  </form>;
}
export function GeneralTasker({ initial, context, createContext, initialDestination, familyId, deliverables = false }: { familyId?: string; initialDestination?: string; deliverables?: boolean; initial: { tasks: TaskSummary[]; total: number }; context?: string; createContext?: string }) {
  const [data, setData] = useState(initial), [view, setView] = useState<"grid" | "list">("grid"), [creating, setCreating] = useState(!!createContext);
  const [status, setStatus] = useState(""), [ownerId, setOwnerId] = useState(""), [executorId, setExecutorId] = useState(""), [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [error, setError] = useState("");
  const [type, setType] = useState(""), [priority, setPriority] = useState(""), [scope, setScope] = useState(""), [sort, setSort] = useState("deadline"), [overdue, setOverdue] = useState(false);
  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ offset: String(offset) }); if (context) params.set("context", context); if (status) params.set("status", status);
    if (ownerId) params.set("ownerId", ownerId); if (executorId) params.set("executorId", executorId); if (search) params.set("search", search);
    if (familyId) params.set("familyId", familyId); if (type) params.set("type", type); if (priority) params.set("priority", priority); if (scope) params.set("scope", scope); if (overdue) params.set("overdue", "1"); params.set("sort", sort);
    try { setData(await api(`?${params}`)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load tasks."); }
  }, [context, status, ownerId, executorId, search, offset, type, priority, scope, sort, overdue, familyId]);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 250); return () => clearTimeout(timer); }, [refresh]);
  const people = [...new Map(initial.tasks.flatMap(t => [t.owner, t.executor]).map(p => [p.id, p])).values()];
  return <section className="mx-auto max-w-[1420px] space-y-5 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Universal Tasker</p><h1 className="mt-2 text-3xl font-semibold text-[#183525]">{deliverables ? (context ? "Project Tasks" : "My Tasks") : (context ? "Project General Tasks" : "My General Tasks")}</h1><p className="mt-2 text-sm text-[#68766b]">Your work as Task Owner, executor or spectator.</p></div>
      <button onClick={() => setCreating(true)} className={primary}><Plus size={16} />{deliverables ? "New Task" : "New General Task"}</button></div>
    {creating && <TaskForm initialDestination={initialDestination} context={createContext || context} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); void refresh(); }} />}
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dce5dd] bg-white p-3">
      <input aria-label="Search General Tasks" placeholder="Search tasks…" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} className={`${input} !w-auto grow`} />
      <select aria-label="Task status" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} className={`${input} !w-auto`}><option value="">All statuses</option>{statuses.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select aria-label="Task Owner filter" value={ownerId} onChange={e => { setOwnerId(e.target.value); setOffset(0); }} className={`${input} !w-auto`}><option value="">All owners</option>{people.map(p => <option key={p.id} value={p.id}>{personName(p)}</option>)}</select>
      <select aria-label="Executor filter" value={executorId} onChange={e => { setExecutorId(e.target.value); setOffset(0); }} className={`${input} !w-auto`}><option value="">All executors</option>{people.map(p => <option key={p.id} value={p.id}>{personName(p)}</option>)}</select>
      <select aria-label="Task type filter" className={`${input} !w-auto`} value={type} onChange={e => { setType(e.target.value); setOffset(0); }}><option value="">All types</option>{taskTypes.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
      <select aria-label="Priority filter" className={`${input} !w-auto`} value={priority} onChange={e => { setPriority(e.target.value); setOffset(0); }}><option value="">All priorities</option>{priorities.map(p => <option key={p}>{p}</option>)}</select>
      <select aria-label="Task scope" className={`${input} !w-auto`} value={scope} onChange={e => { setScope(e.target.value); setOffset(0); }}><option value="">My tasks and spectator work</option><option value="mine">My owned or assigned work</option><option value="accessible">All authorized tasks</option>{context && <option value="project">Authorized project tasks</option>}</select>
      <select aria-label="Sort tasks" className={`${input} !w-auto`} value={sort} onChange={e => { setSort(e.target.value); setOffset(0); }}><option value="deadline">Deadline</option><option value="priority">Priority</option><option value="created">Newest created</option><option value="recent">Recent activity</option></select>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={overdue} onChange={e => { setOverdue(e.target.checked); setOffset(0); }} />Overdue only</label>
      <button className={button} aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17} /></button><button className={button} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17} /></button><button className={button} aria-label="Refresh tasks" onClick={() => void refresh()}><RefreshCw size={17} /></button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <p className="text-sm text-[#68766b]">{data.total} {deliverables ? "" : "General "}{data.total === 1 ? "Task" : "Tasks"}</p>
    <FamilyCards tasks={data.tasks} view={view} />
    {!data.tasks.length && <div className="rounded-2xl border border-dashed border-[#cbd8cd] p-12 text-center text-[#68766b]">No tasks in this view.</div>}
    {data.total > 60 && <div className="flex gap-3"><button className={button} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 60))}>Previous</button><button className={button} disabled={offset + 60 >= data.total} onClick={() => setOffset(offset + 60)}>Next</button></div>}
  </section>;
}
export function GeneralTaskDetail({ initial }: { initial: TaskDetail }) {
  const [task, setTask] = useState(initial), [note, setNote] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [creatingSister, setCreatingSister] = useState(false);
  const [proposedText, setProposedText] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]), [replaceFileId, setReplaceFileId] = useState(""); const router = useRouter();
  async function refresh() { setTask(await api(`/${task.id}`)); }
  async function command(action: string) {
    setBusy(true); setError("");
    try { await api(`/${task.id}`, { action, text: note, ...(action === "SUBMIT" && task.type !== "GENERAL" ? { proposedText } : {}), fileIds: ["MESSAGE", "SUBMIT"].includes(action) ? fileIds : [], expectedVersion: task.version, commandId: crypto.randomUUID() }, "PATCH");
      if (action === "DELETE") { router.push("/tasks"); router.refresh(); return; }
      setNote(""); setFileIds([]); setProposedText(""); setConfirmed(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update task."); await refresh().catch(() => {}); } finally { setBusy(false); }
  }
  async function upload(file?: File, inspectionSource = false) {
    if (!file) return; setBusy(true); setError("");
    try {
      const prepared = await api<{ uploadId: string; version: number }>(`/${task.id}`, { action: "PREPARE_UPLOAD", commandId: crypto.randomUUID(), expectedVersion: task.version,
        fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size, ...(replaceFileId ? { replaceFileId } : {}) }, "PATCH");
      const ticket = await api<{ uploadUrl: string }>(`/${task.id}/files`, { uploadId: prepared.uploadId });
      const result = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!result.ok) throw new Error("Upload failed. Please retry with a new attachment.");
      const finalized = await api<{ version: number }>(`/${task.id}`, { action: "FINALIZE_UPLOAD", commandId: crypto.randomUUID(), expectedVersion: prepared.version, uploadId: prepared.uploadId }, "PATCH");
      if (inspectionSource) {
        const detail = await api<TaskDetail>(`/${task.id}`), source = detail.files.find(f => f.id === prepared.uploadId);
        if (!source) throw new Error("Source upload is unavailable.");
        await api(`/${task.id}`, { action: "SET_SOURCE", sourceVersionId: source.versionId, text: "Pinned owner-uploaded inspection source.", expectedVersion: finalized.version, commandId: crypto.randomUUID() }, "PATCH");
      } else setFileIds(current => [...current, prepared.uploadId]);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); await refresh().catch(() => {}); } finally { setBusy(false); }
  }
  const request = [...task.entries].reverse().find(e => e.action === "REQUEST_COMPLETION");
  const evidence = request?.snapshot as { proposedValue?: unknown; fileVersionIds?: string[] } | undefined;
  const p = task.permissions, mutable = p.message || p.submit || p.close || p.delete;
  const logicalFiles = [...new Map(task.files.filter(f => f.submittedEntryId).map(f => [f.fileId, f])).values()];
  return <section className="mx-auto max-w-5xl space-y-6 pb-12">
    <Link href="/tasks" className="inline-flex items-center gap-2 text-sm text-emerald-800"><ArrowLeft size={16} />My Tasks</Link>
    <div className="rounded-2xl border border-[#dce5dd] bg-white p-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-emerald-700">{label(task.type)} Task · {task.project.name}</p><h1 className="mt-2 text-3xl font-semibold">{task.title}</h1></div><span className="h-fit rounded-full bg-emerald-50 px-3 py-1 text-sm">{label(task.status)}</span></div>
      <p className="mt-4 text-sm text-[#68766b]">Owner: {personName(task.owner)} · Executor: {personName(task.executor)}</p><p className="mt-2 text-sm">{label(task.priority)} priority · Due {new Date(task.deadline).toLocaleString()}</p>
      <h2 className="mt-6 font-semibold">Brief</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{task.brief}</p>{task.context && <><h2 className="mt-4 font-semibold">Supporting context</h2><p className="mt-2 whitespace-pre-wrap text-sm">{task.context}</p></>}
      {!!task.spectators.length && <p className="mt-4 text-sm text-[#68766b]">Spectators: {task.spectators.map(personName).join(", ")}</p>}
      <div className="mt-5 flex flex-wrap gap-3">{p.createSister && <button className={button} onClick={() => setCreatingSister(true)}>Create Sister Task</button>}{p.manage && <button className={button} onClick={() => setEditing(!editing)}>Edit task</button>}{(p.manage || p.submit) && <Link className={button} href={`/tasks?createContext=task:${task.id}`}>Create task from this context</Link>}<button className={button} onClick={() => void refresh().catch(e => setError(e.message))}>Refresh</button></div>
    </div>
    {creatingSister && <SisterComposer taskId={task.id} onCancel={() => setCreatingSister(false)} />}
    {task.family && (task.family.isSister || task.family.count > 1) && <section className="rounded-2xl border p-5"><h2 className="font-semibold">Task family</h2><p>{task.family.isSister ? "Sister Task" : "Original task"} · {task.family.count} accessible tasks</p>{task.family.source ? <Link className="underline" href={`/tasks/${task.family.source.id}`}>Immediate source: {task.family.source.title}</Link> : task.family.isSister ? <p>Source details are restricted.</p> : null}<p>{task.family.root && <Link className="underline" href={`/tasks/${task.family.root.id}`}>Root: {task.family.root.title}</Link>}</p><Link className="underline" href={`/tasks?familyId=${task.family.anchorId}`}>Browse this family</Link></section>}
    {!!task.inheritedEvidence?.length && <section className="space-y-4 rounded-2xl border p-5"><h2 className="font-semibold">Read-only historical context</h2><p className="text-sm">These exact source versions are historical evidence. They are not submissions or accepted deliverables for this task.</p>{task.inheritedEvidence.map(e => <div key={e.id} className="rounded-xl border p-3"><h3 className="font-semibold">{e.name} · v{e.number}</h3><EvidenceInfo evidence={e} href={`/api/tasker/${task.id}/evidence/${e.id}?versionId=${e.versionId}`} /></div>)}</section>}
    {task.sistersEnabled && <RevisionComparison task={task} />}
    {task.deliverable && <section className="space-y-3 rounded-2xl border border-[#dce5dd] bg-white p-6">
      <h2 className="font-semibold">{task.type === "DATA_INPUT" ? "Target stage field" : "Destination folder"}</h2><p>{task.deliverable.label}</p><p className="text-sm">Requested answer: {label(task.deliverable.inputMode)}</p>
      {task.deliverable.conflict && <p role="alert" className="text-red-700">The field changed. Review the current and proposed values, refresh the target, and submit a new response.</p>}
      {task.deliverable.currentState !== undefined && <details open={task.deliverable.conflict}><summary>Current field value and attachments</summary><FieldValue value={(task.deliverable.currentState as { value?: unknown }).value} rich={task.deliverable.fieldType === "text-attachment"} />{(task.deliverable.currentState as { attachmentIds?: string[] }).attachmentIds?.map((id, index) => <a key={id} className="mt-2 block text-sm text-emerald-800 underline" href={`/api/project-assets/${id}/preview`} target="_blank" rel="noreferrer">Current attachment {index + 1}</a>)}</details>}
      {task.deliverable.errorCode && !task.deliverable.applicationState && <p role="alert" className="text-red-700">{label(task.deliverable.errorCode)}</p>}
      {task.deliverable.applicationState && <p>Application: {label(task.deliverable.applicationState)}{task.deliverable.errorCode ? ` · ${label(task.deliverable.errorCode)}` : ""}</p>}
      {!!task.deliverable.publishedAttachmentIds.length && <p>{task.deliverable.publishedAttachmentIds.length} accepted file(s) published to the destination.</p>}
      {task.status === "COMPLETED" && task.type === "DATA_INPUT" && <p>Accepted proposal applied to this field.</p>}
    </section>}
    {task.references !== undefined && task.type !== "INITIAL_CONCEPT" && <section className="space-y-3 rounded-2xl border border-[#dce5dd] bg-white p-6"><h2 className="font-semibold">{task.type === "INSPECT_FILE" ? "Pinned inspection source" : "Initial Concept inspiration"}</h2>
      {!task.references.length && <p className="text-sm">{task.type === "INSPECT_FILE" ? "Awaiting a sealed source from the Task Owner. Findings and completion requests are unavailable until then." : task.type === "FINAL_CONCEPT" ? "No Initial Concept inspiration was selected." : "Initial Concept submissions are recorded below."}</p>}
      {task.references.map(r => { const href = `/api/tasker/${task.id}/references/${r.id}?versionId=${r.versionId}`; return <div key={r.id} className="rounded-xl bg-[#f4f7f3] p-4 text-sm"><p className="font-semibold">{r.name} · v{r.number}</p><p>Source state when selected: {label(r.sourceState)} · Uploaded by {r.uploader ? personName(r.uploader) : "Unknown"}</p>{r.sourceTask && <p>Initial Concept: {r.sourceTask.title} · Owner: {personName(r.sourceTask.owner)}</p>}{r.submission && <p>Submitted by {personName(r.submission.actor)} · {new Date(r.submission.createdAt).toLocaleString()}</p>}{r.review && <p>Original review: {label(r.review.action)} · {personName(r.review.actor)} · {new Date(r.review.createdAt).toLocaleString()}</p>}<div className="mt-2 flex gap-4"><a className="text-emerald-800 underline" href={href}>Download exact version</a>{["application/pdf","image/png","image/jpeg","image/gif","image/webp"].includes(r.mimeType) && <a className="text-emerald-800 underline" href={href + "&disposition=inline"} target="_blank" rel="noreferrer">Preview exact version</a>}</div></div>; })}
      {p.uploadSource && <label className={`${button} cursor-pointer`}>Upload inspection source<input type="file" aria-label="Inspection source upload" className="sr-only" disabled={busy} onChange={e => { void upload(e.target.files?.[0], true); e.target.value = ""; }} /></label>}
      {p.manage && task.type === "INSPECT_FILE" && !task.references.length && task.files.filter(f => f.status === "READY" && f.uploadedById === task.owner.id).map(f => <button key={f.id} className={button} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await api(`/${task.id}`, { action: "SET_SOURCE", sourceVersionId: f.versionId, text: "Pinned selected owner-uploaded source.", expectedVersion: task.version, commandId: crypto.randomUUID() }, "PATCH"); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to pin source."); } finally { setBusy(false); } }}>Pin {f.name} · v{f.number} as source</button>)}
    </section>}
    {editing && <TaskForm task={task} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); void refresh(); }} />}
    <section className="rounded-2xl border border-[#dce5dd] bg-white p-6"><h2 className="text-lg font-semibold">Conversation and history</h2><ol className="mt-5 space-y-5">{task.entries.map(e => <li key={e.id} className="border-l-2 border-[#dce5dd] pl-4"><p className="text-xs text-[#68766b]">{personName(e.actor)} · {label(e.action)}{e.directorOverride ? " · Director intervention" : ""} · {new Date(e.createdAt).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap text-sm">{e.text}</p>{task.submissions?.filter(s => s.id === e.id).map(s => <p key={s.id} className="mt-2 text-sm font-semibold">Submission evidence: {label(s.state)}{s.reviewer ? ` · Reviewed by ${personName(s.reviewer)}` : ""}</p>)}{task.files.filter(f => f.submittedEntryId === e.id).map(f => <a key={f.id} className="mt-2 block text-sm text-emerald-800 underline" href={`/api/tasker/${task.id}/files/${f.id}?versionId=${f.versionId}`}>{f.name} · v{f.number}</a>)}{task.type === "DATA_INPUT" && e.action === "SUBMIT" && <FieldValue value={(e.snapshot as { proposedValue?: unknown }).proposedValue} rich={task.deliverable?.fieldType === "text-attachment"} />}{e.action === "EDIT" && <details className="mt-2 text-xs"><summary>Recorded changes</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(e.snapshot, null, 2)}</pre></details>}</li>)}</ol></section>
    {mutable && <section className="space-y-4 rounded-2xl border border-[#dce5dd] bg-white p-6"><h2 className="text-lg font-semibold">{p.review ? "Review completion request" : "Respond or update task"}</h2>
      {p.review && task.deliverable && <div className="space-y-3 rounded-xl bg-emerald-50 p-4"><h3 className="font-semibold">Accept this exact submission</h3><p>Destination: {task.deliverable.label}</p>
        {task.type === "DATA_INPUT" && <p className="text-sm">Acceptance replaces this field’s value and attachment links with this proposal. Earlier evidence is retained.</p>}{task.type === "DATA_INPUT" && <FieldValue value={evidence?.proposedValue} rich={task.deliverable.fieldType === "text-attachment"} />}
        {task.files.filter(f => evidence?.fileVersionIds?.includes(f.versionId)).map(f => <a className="block text-emerald-800 underline" key={f.id} href={`/api/tasker/${task.id}/files/${f.id}?versionId=${f.versionId}`}>{f.name} · v{f.number}</a>)}
        <label className="flex gap-2 text-sm"><input type="checkbox" aria-label="Confirm destination and submission" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed this submission and its destination.</label></div>}
      {p.submit && task.type === "DATA_INPUT" && task.deliverable?.inputMode !== "FILE" && <label className="block text-sm">Proposed field value<textarea aria-label="Proposed field value" className={input} value={proposedText} onChange={e => setProposedText(e.target.value)} maxLength={20000} rows={4} /></label>}
      <label className="block text-sm">Message or decision reason<textarea aria-label="Message or decision reason" value={note} onChange={e => setNote(e.target.value)} maxLength={20000} rows={4} className={input} /></label>
      {p.message && task.status !== "COMPLETION_REQUESTED" && <><div className="flex flex-wrap items-center gap-3"><select aria-label="Attachment version" value={replaceFileId} onChange={e => setReplaceFileId(e.target.value)} className={`${input} !w-auto`}><option value="">New attachment</option>{logicalFiles.map(f => <option key={f.fileId} value={f.fileId}>New version of {f.name}</option>)}</select><label className={`${button} cursor-pointer`}><Paperclip size={16} />Attach supporting file<input aria-label="Supporting file" type="file" disabled={busy} className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        {task.files.filter(f => !f.submittedEntryId && f.status === "READY").map(f => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fileIds.includes(f.id)} onChange={e => setFileIds(current => e.target.checked ? [...current, f.id] : current.filter(id => id !== f.id))} />{f.name} · v{f.number}</label>)}</>}
      <div className="flex flex-wrap gap-2">{p.message && <button className={button} disabled={busy || !note.trim()} onClick={() => void command("MESSAGE")}>Send message</button>}{p.submit && <button className={primary} disabled={busy || !note.trim()} onClick={() => void command("SUBMIT")}>Submit response</button>}{p.requestCompletion && <button className={button} disabled={busy || !note.trim()} onClick={() => void command("REQUEST_COMPLETION")}>Request completion</button>}{p.review && <><button className={primary} disabled={busy || !note.trim() || (!!task.deliverable && (!confirmed || !!task.deliverable.conflict))} onClick={() => void command("APPROVE")}>Approve completion</button><button className={button} disabled={busy || !note.trim()} onClick={() => void command("REJECT")}>Request changes</button></>}{task.type === "DATA_INPUT" && (p.manage || p.review) && <button className={button} disabled={busy || !note.trim()} onClick={() => void command("REFRESH_TARGET")}>Refresh target and require resubmission</button>}{p.close && <button className={button} disabled={busy || !note.trim()} onClick={() => void command("CLOSE")}>Close task</button>}{p.delete && <button className={`${button} text-red-700`} disabled={busy || !note.trim()} onClick={() => void command("DELETE")}>Delete task</button>}</div>
      <p className="text-xs text-[#68766b]">A reason is required for completion, review, closure and deletion. Requesting completion sends the task to its owner for review.</p>
    </section>}
    {!mutable && <p className="text-sm text-[#68766b]">This task is view only.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}

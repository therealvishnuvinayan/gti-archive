"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Plus, ListTodo, Search, LoaderCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { TaskFileTools, TaskFileComparison } from "./tasker-file-tools";
import { Button } from "@/components/ui/button";
import { FlexibleDialog } from "@/components/projects/flexible-dialog";
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import { TaskInput as Input, TaskTextarea as Textarea, TaskSelect, TaskMultiSelect, TaskDatePicker } from "./tasker-form-controls";
import { RichTextContent } from "@/components/ui/rich-text-editor";
import { useNotificationCenter } from "@/components/notifications/notification-center";
import { TASK_KIND_LABELS, TASK_STATUS_LABELS, type TaskCreateOptions, type TaskDetail, type TaskField, type TaskKind, type TaskListItem, type TaskMutation, type TaskProjectRef, type TaskValue, type TaskSource } from "@/lib/tasker/types";

const panelClass = "rounded-[22px] border border-[#dfe6df] bg-white p-5 sm:p-6";
const ended = (status: string) => ["COMPLETED", "CANCELLED", "REJECTED"].includes(status);

async function api<T>(url: string, input?: unknown): Promise<T> {
  const response = await fetch(url, input === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "Unable to complete the request."), { status: response.status });
  return body as T;
}
function query(ref: TaskProjectRef) { return new URLSearchParams(ref).toString(); }
function ErrorNote({ children }: { children: React.ReactNode }) { return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{children}</p>; }
function Label({ title, children }: { title: string; children: React.ReactNode }) { return <div className="grid min-w-0 gap-2 text-sm font-medium text-[#46584b]"><span>{title}</span>{children}</div>; }

export function useTaskUpdates(reload: () => Promise<void>, enabled = true) {
  const router = useRouter();
  const { refreshVersion } = useNotificationCenter();
  const lastRefresh = useRef(refreshVersion);
  useEffect(() => {
    if (!enabled || lastRefresh.current === refreshVersion) return;
    lastRefresh.current = refreshVersion;
    void reload().catch(() => undefined);
    router.refresh();
  }, [enabled, refreshVersion, reload, router]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (!document.hidden) void reload().catch(() => undefined); };
    const timer = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, reload]);
}
export function CreateTask({ initialProject, initialStageRef, sisterOf, sourceTitle, onClose, onCreated }: { initialProject?: TaskProjectRef; initialStageRef?: string; sisterOf?: TaskSource; sourceTitle?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const formId = useId();
  const [projects, setProjects] = useState<Array<TaskProjectRef & { name: string }>>([]);
  const [project, setProject] = useState<TaskProjectRef | undefined>(initialProject);
  const [options, setOptions] = useState<TaskCreateOptions | null>(null);
  const [kind, setKind] = useState<TaskKind>("GENERAL"), [title, setTitle] = useState(sourceTitle ? `Revision: ${sourceTitle}`.slice(0, 160) : ""), [brief, setBrief] = useState("");
  const [assigneeId, setAssigneeId] = useState(""), [coOwnerId, setCoOwnerId] = useState(""), [stageRef, setStageRef] = useState(initialStageRef ?? ""), [targetId, setTargetId] = useState(""), [destinationId, setDestinationId] = useState(""), [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (initialProject) return;
    let active = true;
    void api<{ projects: typeof projects }>("/api/tasker?view=projects").then((r) => { if (active) setProjects(r.projects); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [initialProject]);
  useEffect(() => {
    if (!project) return;
    let active = true;
    void api<{ options: TaskCreateOptions }>(`/api/tasker?view=options&${query(project)}`).then((r) => { if (active) setOptions(r.options); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project]);
  const fields = options?.fields.filter((f) => !stageRef || f.stageRef === stageRef) ?? [];
  return <FlexibleDialog open title={sisterOf ? "Create Sister Task" : "Create task"} onClose={() => { if (!busy) onClose(); }} footer={<>
    <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
    <Button type="submit" form={formId} disabled={busy || !options}>{busy ? "Creating…" : sisterOf ? "Create Sister Task" : "Create task"}</Button>
  </>}>
    <form id={formId} className="grid gap-5" onSubmit={async (e) => {
      e.preventDefault(); if (!project || !options || busy) return;
      setBusy(true); setError("");
      try { const created = await api<{ id: string }>("/api/tasker", { ...project, sisterOf, kind, title, brief, assigneeId, coOwnerId: coOwnerId || null, stageRef: stageRef || null, targetId: targetId || null, destinationId: destinationId || null, dueAt: dueAt || null }); onCreated(created.id); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      {!initialProject && <Label title="Project"><TaskSelect label="Project" required value={project ? `${project.projectType}:${project.projectId}` : ""} placeholder="Choose project" options={projects.map((p) => ({ id: `${p.projectType}:${p.projectId}`, label: `${p.name}${p.projectType === "FLEXIBLE" ? " · Flexible" : ""}` }))} onChange={(value) => {
        const p = projects.find((p) => `${p.projectType}:${p.projectId}` === value); setProject(p); setOptions(null); setAssigneeId(""); setCoOwnerId(""); setTargetId(""); setStageRef(""); setDestinationId("");
      }} /></Label>}
      {project && !options && !error && <p className="text-sm text-slate-500">Loading available fields and participants…</p>}
      {options && <>
        <div className="rounded-xl bg-[#eff6f0] p-3 text-sm text-[#33513c]">{options.name}{sisterOf && <p className="mt-1 text-xs">Linked revision of {sourceTitle || "this task"}. The original task and submissions are preserved.</p>}</div>
        <Label title="Task type"><TaskSelect label="Task type" value={kind} onChange={(value) => setKind(value as TaskKind)} options={(["GENERAL", "FIELD_INPUT", "FILE_REQUEST"] as const).map((id) => ({ id, label: TASK_KIND_LABELS[id] }))} /></Label>
        {options.showStages && <Label title="Stage or milestone (optional)"><TaskSelect label="Stage or milestone" value={stageRef} emptyLabel="Any stage" options={options.stages} onChange={(value) => { setStageRef(value); setTargetId(""); }} /></Label>}
        {kind === "FIELD_INPUT" && <Label title="Input to request"><TaskSelect label="Input to request" value={targetId} required onChange={setTargetId} placeholder="Choose an editable field" options={fields.map((f) => ({ id: f.id, label: `${f.stageRef && !stageRef && project?.projectType === "STRUCTURED" ? `Stage ${f.stageRef} · ` : ""}${f.label}` }))} />{!fields.length && <span className="text-xs text-slate-500">No editable data fields are available here yet. Existing concept creation and approvals use their usual workflows.</span>}</Label>}
        {kind === "FILE_REQUEST" && <Label title="Upload destination"><TaskSelect label="Upload destination" value={destinationId} required onChange={setDestinationId} placeholder="Choose shared folder" options={options.destinations} /><span className="text-xs text-slate-500">Only locations accessible to both participants are available.</span></Label>}
        <Label title="Task title"><Input aria-label="Task title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" /></Label>
        <Label title="Brief and deliverables"><Textarea aria-label="Brief and deliverables" required maxLength={20000} rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the information or work you need." /></Label>
        <div className="grid gap-5 sm:grid-cols-2"><Label title="Assign to"><TaskSelect label="Assign to" required value={assigneeId} onChange={setAssigneeId} placeholder="Choose participant" options={options.people} /></Label><Label title="Task co-owner (optional)"><TaskSelect label="Task co-owner" value={coOwnerId} onChange={setCoOwnerId} emptyLabel="No co-owner" options={options.people} /></Label></div>
        <Label title="Deadline (optional)"><TaskDatePicker label="Deadline" value={dueAt} onChange={setDueAt} placeholder="Select deadline" /></Label>
      </>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  </FlexibleDialog>;
}

function revisionHref(task: TaskListItem) { return task.kind === "CONCEPT" ? `/tasks/concepts/${task.id}/revisions` : `/tasks/${task.id}/revisions`; }
function TaskRow({ task, now }: { task: TaskListItem; now: number }) {
  return <article className="flex flex-wrap items-center justify-between gap-4 py-4">
    <Link href={task.href} className="min-w-0 flex-1 rounded-lg hover:bg-[#fafcf9] focus-visible:outline-2 focus-visible:outline-green-700"><p className="text-xs text-[#6a8272]">{task.project.name} · {TASK_KIND_LABELS[task.kind]}{task.stageLabel ? ` · ${task.stageLabel}` : ""}{task.family ? task.family.sisterNumber ? ` · Sister Task ${task.family.sisterNumber}` : " · Parent task" : ""}</p><p className="mt-1 break-words font-semibold text-[#26392b]">{task.title}</p><p className="mt-1 text-xs text-[#7a837c]">{task.owner.label} → {task.assignee.label}</p>{Boolean(task.unavailableParticipants?.length) && <p className="mt-2 text-xs font-medium text-amber-800">Needs attention: {task.unavailableParticipants!.join(", ")} no longer in this project.</p>}</Link>
    <div className="flex flex-wrap items-center gap-3 text-xs"><span className={`rounded-full px-3 py-1.5 ${task.status === "COMPLETED" ? "bg-green-50 text-green-800" : task.status === "IN_REVIEW" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{TASK_STATUS_LABELS[task.status]}</span>{task.dueAt && <span className={!ended(task.status) && Date.parse(task.dueAt) < now ? "text-red-700" : "text-slate-500"}>{new Date(task.dueAt).toLocaleDateString()}</span>}<Link href={revisionHref(task)} className="font-semibold text-[#26734d] underline">Sister Tasks &amp; files</Link></div>
  </article>;
}

export function TaskerWorkspace({ project, currentUserId, initialTasks, compact = false }: { project?: TaskProjectRef; currentUserId: string; initialTasks?: TaskListItem[]; compact?: boolean }) {
  const routeParams = useParams<{ milestoneId?: string }>();
  const pathname = usePathname();
  const contextStage = project?.projectType === "FLEXIBLE" ? routeParams.milestoneId ?? "project" : pathname.match(/\/stages\/([1-7])(?:\/|$)/)?.[1];
  const [tasks, setTasks] = useState(initialTasks ?? []), [loading, setLoading] = useState(!initialTasks), [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false), [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState("ALL"), [search, setSearch] = useState(""), [status, setStatus] = useState("OPEN"), [sort, setSort] = useState("UPDATED");
  const projectId = project?.projectId, projectType = project?.projectType;
  const reload = useCallback(async () => {
    try {
      const result = await api<{ tasks: TaskListItem[] }>(`/api/tasker${projectId && projectType ? `?${query({ projectId, projectType })}` : ""}`);
      setTasks(result.tasks); setError(""); setUnavailable(false); setNow(Date.now());
    } catch (e) {
      if (compact && [403, 404].includes((e as { status?: number }).status ?? 0)) setUnavailable(true);
      else setError((e as Error).message);
    } finally { setLoading(false); }
  }, [compact, projectId, projectType]);
  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);
  useTaskUpdates(reload);
  if (unavailable) return null;
  const filtered = tasks.filter((t) => (view === "ALL" || view === "RECEIVED" && t.assignee.id === currentUserId || view === "SENT" && t.owner.id === currentUserId || view === "CO_OWNED" && t.coOwner?.id === currentUserId || view === "VIEW_ONLY" && t.viewOnly) && (status === "ALL" || status === "OPEN" && !ended(t.status) || t.status === status) && `${t.title} ${t.project.name} ${t.assignee.label} ${t.owner.label}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "DUE" ? (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") : b.updatedAt.localeCompare(a.updatedAt));
  return <section className={`mx-auto w-full max-w-[1420px] ${compact ? "my-8" : "pb-16"}`} aria-label="Tasker">
    <div className={panelClass}>
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#33825b]"><ListTodo className="h-4 w-4" />Tasker</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{compact ? "Project tasks" : "Your tasks"}</h1><p className="mt-1 text-sm text-[#768079]">Request input, collect files, and review work across stages.</p></div><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create task</Button></header>
      <div className="my-5 flex flex-wrap gap-2" role="group" aria-label="Task views">{[["ALL", "All"], ["RECEIVED", "Received"], ["SENT", "Sent"], ["CO_OWNED", "Co-owned"], ["VIEW_ONLY", "View only"]].map(([id, label]) => <Button key={id} variant={view === id ? "default" : "secondary"} aria-pressed={view === id} onClick={() => setView(id)}>{label}</Button>)}</div>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_160px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" aria-label="Search tasks" placeholder="Search tasks, projects or people" value={search} onChange={(e) => setSearch(e.target.value)} /></label><TaskSelect label="Task status" value={status} onChange={setStatus} options={[{ id: "OPEN", label: "Open tasks" }, { id: "ALL", label: "All statuses" }, ...Object.entries(TASK_STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /><TaskSelect label="Sort tasks" value={sort} onChange={setSort} options={[{ id: "UPDATED", label: "Recently updated" }, { id: "DUE", label: "Deadline" }]} /></div>
      {error && <ErrorNote>{error} <button onClick={() => void reload()} className="underline">Retry</button></ErrorNote>}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading tasks…</p> : !filtered.length ? <p className="rounded-xl bg-[#f7f9f7] py-10 text-center text-sm text-[#7a867e]">No tasks match this view.</p> : <div className="divide-y divide-[#e7ece8]">{Array.from(new Set(filtered.map((task) => task.family?.id ?? `${task.kind}:${task.id}`))).map((groupId) => {
        const rows = filtered.filter((task) => (task.family?.id ?? `${task.kind}:${task.id}`) === groupId);
        if (!rows[0].family) return <TaskRow key={groupId} task={rows[0]} now={now} />;
        const parent = tasks.find((task) => task.family?.id === groupId && task.family.sisterNumber === 0);
        return <details key={groupId} className="py-4" open={Boolean(search)}><summary className="cursor-pointer rounded-xl bg-[#eff6f0] p-4 text-sm font-semibold text-[#26392b]">{parent?.title ?? "Linked task revisions"}<span className="ml-3 text-xs font-normal">{rows.length} matching task{rows.length === 1 ? "" : "s"}</span></summary><div className="ml-3 border-l-2 border-[#dceade] pl-4">{rows.sort((a, b) => a.family!.sisterNumber - b.family!.sisterNumber).map((task) => <TaskRow key={task.id} task={task} now={now} />)}</div></details>;
      })}</div>}
    </div>
    <Button className="fixed bottom-6 right-5 z-40 rounded-full shadow-lg sm:right-8" onClick={() => setCreating(true)} aria-label="Create Tasker task"><Plus className="h-5 w-5" /><span className="hidden sm:inline">Create task</span></Button>
    {creating && <CreateTask initialProject={project} initialStageRef={contextStage} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void reload(); }} />}
  </section>;
}

function FieldInput({ field, value, onChange }: { field: TaskField; value: TaskValue; onChange: (value: TaskValue) => void }) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (field.control === "files") return <p className="text-sm text-slate-600">Attach the requested files below.</p>;
  if (field.control === "checklist") {
    const control = field.checklistControl;
    return <div className="grid gap-3">{control === "health-warning" && <label className="flex gap-2 text-sm"><input type="checkbox" className="accent-[#26734d]" checked={Boolean(object.included)} onChange={(e) => onChange({ ...object, included: e.target.checked })} />Health warning included</label>}
      {["text", "textarea", "health-warning", "text-attachment"].includes(control ?? "") && <Textarea aria-label={field.label} value={String(object.text ?? "")} onChange={(e) => onChange({ ...object, text: e.target.value })} rows={4} />}
      {["multi-value", "finishes"].includes(control ?? "") && <Textarea aria-label={field.label} placeholder="One item per line" value={Array.isArray(object.values) ? object.values.join("\n") : ""} onChange={(e) => onChange({ ...object, values: e.target.value.split("\n") })} rows={4} />}
    </div>;
  }
  if (field.control === "boolean") return <TaskSelect label={field.label} value={value === true ? "yes" : "no"} onChange={(next) => onChange(next === "yes")} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }]} />;
  if (field.control === "select") return <TaskSelect label={field.label} value={typeof value === "string" ? value : ""} onChange={onChange} placeholder="Choose value" options={field.options ?? []} {...(!field.required && { emptyLabel: "No value" })} />;
  if (field.control === "multi-select") return <TaskMultiSelect label={field.label} values={Array.isArray(value) ? value.map(String) : []} onChange={onChange} options={field.options ?? []} />;
  if (field.control === "date") return <TaskDatePicker label={field.label} value={typeof value === "string" ? value : ""} onChange={onChange} required={field.required} placeholder="Select date" />;
  if (field.control === "list") return <Textarea aria-label={field.label} placeholder="One item per line" value={Array.isArray(value) ? value.join("\n") : ""} onChange={(e) => onChange(e.target.value.split("\n"))} rows={4} />;
  if (field.control === "textarea") return <Textarea aria-label={field.label} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} rows={5} />;
  return <Input aria-label={field.label} type={field.control === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
}

export function ValueDisplay({ value, field }: { value: TaskValue; field: TaskField | null }) {
  if (value == null || value === "") return <span className="text-slate-400">No value</span>;
  if (field?.control === "textarea" && typeof value === "string") return <RichTextContent value={value} />;
  if (typeof value === "object" && !Array.isArray(value) && "saved" in value) return <div className="grid gap-2"><div><p className="text-xs font-semibold">Saved field</p><ValueDisplay value={value.saved} field={field} /></div><div><p className="text-xs font-semibold">Open form drafts</p>{Array.isArray(value.unsaved) && value.unsaved.map((v, i) => <div key={i}><ValueDisplay value={v} field={field} /></div>)}</div></div>;
  if (Array.isArray(value)) return <span className="whitespace-pre-wrap">{value.map((v) => field?.options?.find((o) => o.id === v)?.label ?? String(v)).join("\n")}</span>;
  if (typeof value === "object") return <div className="grid gap-1">{typeof value.text === "string" && <span className="whitespace-pre-wrap">{value.text}</span>}{Array.isArray(value.values) && <span>{value.values.join(", ")}</span>}{typeof value.included === "boolean" && <span>Included: {value.included ? "Yes" : "No"}</span>}{Array.isArray(value.attachmentIds) && value.attachmentIds.length > 0 && <span>{value.attachmentIds.length} existing attachment(s)</span>}</div>;
  return <span className="whitespace-pre-wrap">{field?.options?.find((o) => o.id === String(value))?.label ?? (typeof value === "boolean" ? value ? "Yes" : "No" : String(value))}</span>;
}

export function TaskerDetailWorkspace({ initialTask }: { initialTask: TaskDetail }) {
  const [task, setTask] = useState(initialTask), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [note, setNote] = useState(""), [value, setValue] = useState<TaskValue>(null), [comment, setComment] = useState(""), [conflictReviewed, setConflictReviewed] = useState(false);
  const [assigneeId, setAssigneeId] = useState(initialTask.assignee.id), [coOwnerId, setCoOwnerId] = useState(initialTask.coOwner?.id ?? ""), [dueAt, setDueAt] = useState(initialTask.dueAt?.slice(0, 10) ?? ""), [observers, setObservers] = useState(initialTask.participantIds);
  const [recoveryOwnerId, setRecoveryOwnerId] = useState(initialTask.owner.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reload = useCallback(async () => {
    const result = await api<{ task: TaskDetail }>(`/api/tasker/${initialTask.id}`);
    setTask(result.task); setConflictReviewed(false);
  }, [initialTask.id]);
  useTaskUpdates(reload, !busy);
  async function mutate(action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/tasker/${task.id}`, { action, version: task.version, note, ...extra });
      if (action === "DELETE") { window.location.assign("/tasks"); return; }
      await reload(); setNote(""); if (action === "COMMENT") setComment(""); if (action === "SUBMIT") setValue(null);
      setNotice(action === "ACCEPT" ? "Submission accepted. The task is completed." : "Task updated.");
    } catch (e) { setError((e as Error).message); await reload().catch(() => undefined); }
    finally { setBusy(false); }
  }
  async function upload(files: File[]) {
    if (!files?.length || busy) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const target = await api<{ fileId: string; uploadUrl: string; expectedHeaders: Record<string, string> }>(`/api/tasker/${task.id}/files`, { action: "UPLOAD", name: file.name, size: file.size, mimeType: file.type || "application/octet-stream" });
        const response = await fetch(target.uploadUrl, { method: "PUT", headers: target.expectedHeaders, body: file });
        if (!response.ok) throw new Error(`Upload failed: ${file.name}`);
        await api(`/api/tasker/${task.id}/files`, { action: "FINALIZE", fileId: target.fileId });
      }
    } catch (e) { setError((e as Error).message); }
    finally { await reload().catch(() => undefined); setBusy(false); }
  }
  const viewFile = (file: TaskDetail["pendingFiles"][number], label = file.name) => ({ ...file, label, path: `/api/tasker/${task.id}/files?fileId=${encodeURIComponent(file.id)}` });
  return <section className="mx-auto grid w-full max-w-[1100px] gap-5 pb-10">
    <Link href="/tasks" className="flex items-center gap-2 text-sm text-[#458565]"><ArrowLeft className="h-4 w-4" />Tasks</Link>
    <header className={panelClass}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-[#63816e]">{task.project.name} · {TASK_KIND_LABELS[task.kind]}{task.stageLabel ? ` · ${task.stageLabel}` : ""}</p><h1 className="mt-2 text-2xl font-semibold">{task.title}</h1></div><span className="h-fit rounded-full bg-[#eef5ef] px-3 py-2 text-sm text-[#376045]">{TASK_STATUS_LABELS[task.status]}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{task.brief}</p><p className="mt-4 text-xs text-slate-500">Owner: {task.owner.label} · Assigned to: {task.assignee.label}{task.coOwner ? ` · Co-owner: ${task.coOwner.label}` : ""}{task.dueAt ? ` · Due ${new Date(task.dueAt).toLocaleDateString()}` : ""}</p>{task.field && <p className="mt-3 text-sm font-medium">Requested input: {task.field.label}</p>}{task.destination && <p className="mt-3 text-sm">Destination: {task.destination}</p>}<Link href={revisionHref(task)} className="mt-4 inline-block text-sm font-semibold text-[#26734d] underline">Create a Sister Task or choose the final file</Link></header>
    {(task.projectBrief || task.deliverables?.length || task.referenceFolders?.length) ? <details className={panelClass}><summary className="cursor-pointer font-semibold">Project brief, deliverables and files</summary><div className="mt-4 grid gap-4 text-sm">{task.projectBrief && <RichTextContent value={task.projectBrief} />}{Boolean(task.deliverables?.length) && <ul className="list-inside list-disc">{task.deliverables?.map((d) => <li key={d}>{d}</li>)}</ul>}<div className="flex flex-wrap gap-2">{task.referenceFolders?.map((f) => <Link key={f.id} href={f.href} className="rounded-lg bg-green-50 px-3 py-2 text-green-800">{f.label}</Link>)}</div></div></details> : null}
    {error && <ErrorNote>{error}</ErrorNote>}{notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {Boolean(task.unavailableParticipants?.length) && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{task.unavailableParticipants!.join(", ")} no longer in this project. A task manager can reassign an unavailable recipient; the project owner can recover an abandoned task or cancel it.</p>{task.canRecover && <div className="mt-4 grid gap-3"><TaskSelect label="Recovery task owner" value={recoveryOwnerId} onChange={setRecoveryOwnerId} options={task.people} /><TaskSelect label="Recovery recipient" value={assigneeId} onChange={setAssigneeId} options={task.people} /><Textarea aria-label="Task recovery reason" placeholder="Explain the reassignment" value={note} onChange={(e) => setNote(e.target.value)} /><Button className="w-fit" disabled={busy || !note.trim() || !task.people.some((p) => p.id === recoveryOwnerId) || !task.people.some((p) => p.id === assigneeId)} onClick={() => void mutate("RECOVER", { ownerId: recoveryOwnerId, assigneeId })}>Recover task</Button></div>}</div>}
    {task.canSubmit && <div className={panelClass}><h2 className="mb-4 text-lg font-semibold">Your response</h2><div className="grid gap-4">
      {task.field && <><p className="text-sm text-slate-500">{task.field.help}</p><FieldInput field={task.field} value={value} onChange={setValue} /></>}
      <Label title="Response / message"><Textarea aria-label="Response / message" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the task owner." /></Label>
      {(!task.field || task.field.acceptsFiles) && <FileUploadDropzone label="Task attachments" multiple={task.field?.maxFiles !== 1} disabled={busy} compact onFilesSelected={(files) => void upload(files)} />}
      {task.pendingFiles.filter((f) => f.status !== "DELETED").map((f) => <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{f.name} · {f.status === "READY" ? "Ready" : "Upload incomplete"}</span><Button variant="ghost" disabled={busy} onClick={async () => { try { await api(`/api/tasker/${task.id}/files`, { action: "DISCARD", fileId: f.id }); await reload(); } catch (e) { setError((e as Error).message); } }}>Remove</Button></div>)}
      <div className="flex flex-wrap gap-3">{task.status === "ASSIGNED" && <Button variant="secondary" disabled={busy} onClick={() => void mutate("START")}>Accept task</Button>}<Button disabled={busy} onClick={() => void mutate("SUBMIT", { value: value ?? (task.field?.control === "boolean" ? false : task.field?.control === "checklist" ? {} : ""), fileIds: task.pendingFiles.filter((f) => f.status === "READY").map((f) => f.id) })}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Submit for review</Button><Button variant="ghost" disabled={busy || !note.trim()} onClick={() => void mutate("DECLINE")}>Decline with reason</Button></div>
    </div></div>}
    {task.submissions.length > 0 && <div className={panelClass}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Submissions</h2><Link className="text-sm font-semibold text-[#26734d] underline" href={`/tasks/${task.id}/revisions`}>Sister Tasks and final file</Link></div><div className="grid gap-4">{task.submissions.map((s, index) => <article key={s.id} className="rounded-xl border p-4"><p className="mb-3 text-xs text-slate-500">{index === 0 ? "Latest · " : ""}{s.submittedBy.label} · {new Date(s.createdAt).toLocaleString()}</p>{task.field && <div className="mb-2 text-sm"><ValueDisplay value={s.value} field={task.field} /></div>}<p className="whitespace-pre-wrap text-sm">{s.note}</p><div className="mt-3 flex flex-wrap gap-2">{s.files.map((f) => <div key={f.id} className="flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-[#eff6f0] p-2 text-xs text-green-800"><span className="break-all">{f.name}</span><TaskFileTools file={viewFile(f)} /></div>)}</div></article>)}</div></div>}
    <TaskFileComparison files={task.submissions.flatMap((s) => s.files.map((f) => viewFile(f, `${new Date(s.createdAt).toLocaleString()} · ${f.name}`)))} />
    {task.canReview && <div className={panelClass}><h2 className="mb-4 text-lg font-semibold">Review submission</h2>
      {task.hasConflict && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="mb-2 font-medium">The field changed while this task was pending.</p><p className="mb-2 text-xs">Current value:</p><ValueDisplay value={task.currentValue} field={task.field} /><label className="mt-4 flex items-start gap-2"><input type="checkbox" className="accent-[#26734d]" checked={conflictReviewed} onChange={(e) => setConflictReviewed(e.target.checked)} />I reviewed the current value and want to replace it with this submission.</label></div>}
      <Label title="Review note (required for corrections or rejection)"><Textarea aria-label="Review note (required for corrections or rejection)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Label><div className="mt-4 flex flex-wrap gap-3"><Button disabled={busy || task.hasConflict && !conflictReviewed} onClick={() => void mutate("ACCEPT", { ...(task.hasConflict && conflictReviewed ? { conflictToken: task.conflictToken! } : {}) })}>Accept submission</Button><Button variant="secondary" disabled={busy || !note.trim()} onClick={() => void mutate("CORRECTIONS")}>Request corrections</Button><Button variant="ghost" disabled={busy || !note.trim()} onClick={() => void mutate("REJECT")}>Reject submission</Button></div>
    </div>}
    {task.canManage && <details className={panelClass}><summary className="cursor-pointer font-semibold">Manage task</summary><div className="mt-5 grid gap-4">
      <Label title="Assigned to"><TaskSelect label="Assigned to" value={assigneeId} onChange={setAssigneeId} options={task.people} disabled={busy} /></Label>
      <Button variant="secondary" disabled={busy || assigneeId === task.assignee.id || task.status === "IN_REVIEW"} onClick={() => void mutate("REASSIGN", { assigneeId })}>Reassign</Button>
      <Label title="Co-owner"><TaskSelect label="Co-owner" value={coOwnerId} onChange={setCoOwnerId} options={task.people} emptyLabel="None" disabled={busy} /></Label>
      <Label title="Deadline"><TaskDatePicker label="Deadline" value={dueAt} onChange={setDueAt} placeholder="Select deadline" disabled={busy} /></Label>
      <Label title="Also give task access to"><TaskMultiSelect label="Also give task access to" values={observers} onChange={setObservers} options={task.people} disabled={busy} /></Label>
      <Button disabled={busy} onClick={() => void mutate("MANAGE", { coOwnerId: coOwnerId || null, dueAt: dueAt || null, participantIds: observers })}>Save task settings</Button>
    </div></details>}
    <div className={panelClass}><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Conversation and history</h2><Button variant="ghost" aria-label="Refresh task" disabled={busy} onClick={() => void reload().catch((e) => setError(e.message))}><RefreshCw className="h-4 w-4" /></Button></div><ol className="my-5 grid gap-4">{task.history.map((h) => <li key={h.id} className="border-l-2 border-[#dceade] pl-4"><p className="text-xs text-slate-500">{h.actor.label} · {h.action.toLowerCase().replaceAll("_", " ")} · {new Date(h.createdAt).toLocaleString()}</p>{h.note && <p className="mt-1 whitespace-pre-wrap text-sm">{h.note}</p>}</li>)}</ol><Label title="Message"><Textarea aria-label="Message" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Write a message to the task participants." /></Label><Button className="mt-3" disabled={busy || !comment.trim()} onClick={() => void mutate("COMMENT", { note: comment })}>Send message</Button></div>
    {(task.canCancel || task.canDelete) && <details className={panelClass}><summary className="cursor-pointer text-sm text-slate-600">End or delete task</summary><div className="mt-4 grid gap-3">{task.canCancel && <><Label title="Cancellation reason"><Textarea aria-label="Cancellation reason" value={note} onChange={(e) => setNote(e.target.value)} /></Label><Button variant="secondary" disabled={busy || !note.trim()} onClick={() => void mutate("CANCEL")}>Cancel task</Button></>}{task.canDelete && <><label className="flex gap-2 text-sm"><input type="checkbox" className="accent-[#26734d]" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />Remove this task from everyone’s task views. Its history will be retained.</label><Button variant="destructive" disabled={busy || !confirmDelete} onClick={() => void mutate("DELETE")}>Delete task</Button></>}</div></details>}
  </section>;
}

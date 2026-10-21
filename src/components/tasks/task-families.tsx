"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { priorities, taskTypes, type HistoricalEvidence, type TaskDetail, type TaskSummary } from "@/lib/tasker/contracts";
import type { sisterDraft, taskOptions } from "@/lib/tasker/service";
import { richTextToPlainText } from "@/lib/rich-text";

const input = "w-full rounded-xl border border-[#d9e2da] bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-600";
const button = "rounded-xl border border-[#d9e2da] px-4 py-2 text-sm font-semibold disabled:opacity-50";
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(`/api/tasker${path}`, data === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error ?? "Task unavailable"); return result;
}
type Draft = Awaited<ReturnType<typeof sisterDraft>>;
type Options = Awaited<ReturnType<typeof taskOptions>>;
type Values = Draft["values"];
export function SisterComposer({ taskId, onCancel }: { taskId: string; onCancel: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(), [options, setOptions] = useState<Options>(), [values, setValues] = useState<Values>();
  const [mode, setMode] = useState<"KEEP" | "MODIFY">("KEEP"), [evidence, setEvidence] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Record<string, unknown>>(), [confirmation, setConfirmation] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; Promise.all([api<Draft>(`/${taskId}/sister`), api<Options>(`?options=1&context=task:${taskId}`)]).then(([d, o]) => { if (active) { setDraft(d); setValues(d.values); setOptions(o); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [taskId]);
  if (!draft || !values || !options) return <section aria-label="Create Sister Task"><p role={error ? "alert" : "status"}>{error || "Loading reusable details…"}</p><button className={button} onClick={onCancel}>Cancel</button></section>;
  const v = values, d = draft, o = options;
  const update = (patch: Partial<Values>) => setValues({ ...v, ...patch });
  const targets = o.targets.filter(t => `structured:${t.projectId}` === v.contextTarget && (v.type === "DATA_INPUT" ? t.target.startsWith("checklist:") : !t.target.startsWith("checklist:")));
  const inspirationChoices = [...o.conceptSources.filter(s => s.kind === "INSPIRATION"), ...d.references.filter(r => r.kind === "INSPIRATION" && !o.conceptSources.some(s => s.versionId === r.versionId)).map(r => ({ versionId: r.versionId, sourceTaskTitle: "Previously selected (current eligibility rechecked)", name: r.name, number: r.number, sourceState: r.sourceState }))];
  const types = taskTypes.filter(t => t === "GENERAL" || (t === "FILE_UPLOAD" && o.targets.some(t => !t.target.startsWith("checklist:"))) || (t === "DATA_INPUT" && o.targets.some(t => t.target.startsWith("checklist:"))) || (o.canCreateConcepts && ["INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"].includes(t)));
  async function review(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const { destination, inputMode, sourceVersionId, inspirationVersionIds, ...common } = v;
    const next = { ...common, contextTarget: ["FILE_UPLOAD", "DATA_INPUT"].includes(v.type) ? v.contextTarget : `task:${taskId}`,
      ...(["FILE_UPLOAD", "DATA_INPUT"].includes(v.type) ? { destination, inputMode } : {}),
      ...(v.type === "INSPECT_FILE" && sourceVersionId ? { sourceVersionId } : {}), ...(v.type === "FINAL_CONCEPT" ? { inspirationVersionIds: inspirationVersionIds ?? [] } : {}),
      commandId: crypto.randomUUID(), sister: { sourceTaskId: d.source.id, sourceVersion: d.source.version, mode, evidenceVersionIds: evidence } };
    try { const p = await api<{ confirmation: string }>("/sister-preview", next); setProposal(next); setConfirmation(p.confirmation); setConfirmed(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to review"); } finally { setBusy(false); }
  }
  async function create() {
    if (!proposal || !confirmed) return; setBusy(true); setError("");
    try { const result = await api<{ id: string }>("", { ...proposal, sister: { ...(proposal.sister as object), confirmed: true, confirmation } }); router.push(`/tasks/${result.id}`); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to create"); } finally { setBusy(false); }
  }
  const localDeadline = new Date(new Date(v.deadline).getTime() - new Date(v.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return <section className="space-y-4 rounded-2xl border border-emerald-700 bg-[#f4f7f3] p-5" aria-label="Create Sister Task">
    <h2 className="text-xl font-semibold">Create Sister Task</h2><p>Source: {d.source.title}. New Owner: {d.owner.name ?? "Business user"}.</p>
    {proposal ? <div className="space-y-4" aria-label="Confirm Sister Task">
      <h3 className="font-semibold">Review the new task</h3>
      <dl className="grid gap-3 sm:grid-cols-2">{[["Title", v.title], ["Type", label(v.type)], ["Owner", d.owner.name], ["Executor", o.people.find(p => p.id === v.executorId)?.name], ["Deadline", new Date(v.deadline).toLocaleString()], ["Priority", label(v.priority)], ["Project context", d.source.projectName], ["Target", targets.find(t => t.target === v.destination)?.label ?? v.sourceVersionId ?? (v.inspirationVersionIds?.join(", ") || "None")], ["Spectators", o.people.filter(p => v.spectatorIds.includes(p.id)).map(p => p.name).join(", ") || "None"]].map(([k, val]) => <div key={k}><dt className="text-xs uppercase text-[#68766b]">{k}</dt><dd className="break-words">{val}</dd></div>)}</dl>
      <p className="whitespace-pre-wrap">{v.brief}</p><p className="whitespace-pre-wrap">{v.context}</p>
      <p>Selected historical versions: {d.evidence.filter(e => evidence.includes(e.versionId)).map(e => `${e.name} v${e.number} (${label(e.sourceState)})`).join(", ") || "None"}.</p>
      <p>The original stays completed. Its assignments, files, reviews, publications and history remain unchanged. This task starts open; selected evidence is read-only context and requires a fresh submission for new acceptance.</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm these details and want to create this Sister Task.</label>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={!confirmed || busy} onClick={() => void create()}>Confirm and create Sister Task</button><button className={button} disabled={busy} onClick={() => setProposal(undefined)}>Back to details</button></div>
    </div> : <form className="space-y-4" onSubmit={review}>
      <fieldset className="flex gap-6"><legend className="mb-2 font-semibold">Reuse source details</legend>{(["KEEP", "MODIFY"] as const).map(m => <label key={m} className="flex gap-2"><input type="radio" name="sisterMode" value={m} checked={mode === m} onChange={() => { setMode(m); if (m === "KEEP") setValues(d.values); }} />{m === "KEEP" ? "Keep" : "Modify"}</label>)}</fieldset>
      <p className="text-sm">Retained participants, destinations and sources must still be eligible. Choose Modify if a retained value is no longer valid. The project remains the source project.</p>
      <fieldset disabled={mode === "KEEP" || busy} className="space-y-3">
        <label className="block">Task type<select aria-label="Sister task type" className={input} value={v.type} onChange={e => update({ type: e.target.value as Values["type"], destination: undefined, inputMode: undefined, sourceVersionId: undefined, inspirationVersionIds: [] })}>{[...new Set([v.type, ...types])].map(t => <option key={t} value={t} disabled={!types.includes(t as typeof taskTypes[number])}>{label(t)}</option>)}</select></label>
        <label className="block">Title<input name="title" className={input} required maxLength={200} value={v.title} onChange={e => update({ title: e.target.value })} /></label>
        <label className="block">Brief<textarea name="brief" className={input} rows={4} required maxLength={20000} value={v.brief} onChange={e => update({ brief: e.target.value })} /></label>
        <label className="block">Supporting context<textarea className={input} rows={2} value={v.context} maxLength={5000} onChange={e => update({ context: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label>Deadline<input className={input} type="datetime-local" required value={localDeadline} onChange={e => { if (e.target.value) update({ deadline: new Date(e.target.value).toISOString() }); }} /></label><label>Priority<select aria-label="Priority" className={input} value={v.priority} onChange={e => update({ priority: e.target.value as Values["priority"] })}>{priorities.map(p => <option key={p}>{p}</option>)}</select></label></div>
        <label className="block">Executor<select aria-label="Executor" className={input} value={v.executorId} onChange={e => update({ executorId: e.target.value })}>{o.people.map(p => <option key={p.id} value={p.id} disabled={p.id === d.owner.id}>{p.name} · {label(p.role!)}</option>)}</select></label>
        <fieldset><legend>Spectators (view only)</legend><div className="flex flex-wrap gap-3">{o.people.map(p => <label key={p.id} className="flex gap-2"><input type="checkbox" checked={v.spectatorIds.includes(p.id)} onChange={e => update({ spectatorIds: e.target.checked ? [...v.spectatorIds, p.id] : v.spectatorIds.filter(id => id !== p.id) })} />{p.name}</label>)}</div></fieldset>
        {["FILE_UPLOAD", "DATA_INPUT"].includes(v.type) && <><label className="block">Destination<select aria-label="Destination" className={input} required value={v.destination ?? ""} onChange={e => update({ destination: e.target.value, inputMode: targets.find(t => t.target === e.target.value)?.modes[0] })}><option value="">Choose an authorized target</option>{targets.map(t => <option key={t.target} value={t.target}>{t.label}</option>)}</select></label><label className="block">Requested answer<select aria-label="Requested answer" className={input} required value={v.inputMode} onChange={e => update({ inputMode: e.target.value })}>{targets.find(t => t.target === v.destination)?.modes.map(m => <option key={m}>{m}</option>)}</select></label></>}
        {v.type === "INSPECT_FILE" && <label className="block">Inspection source<select aria-label="Inspection source" className={input} value={v.sourceVersionId ?? ""} onChange={e => update({ sourceVersionId: e.target.value || undefined })}><option value="">Upload a new source after creation</option>{d.values.sourceVersionId && <option value={d.values.sourceVersionId}>Original pinned source (authority rechecked)</option>}{o.conceptSources.filter(s => s.kind === "INSPECTION").map(s => <option key={s.versionId} value={s.versionId}>{s.name} · v{s.number}</option>)}</select></label>}
        {v.type === "FINAL_CONCEPT" && <fieldset><legend>Eligible Initial Concept inspiration</legend>{inspirationChoices.map(s => <label key={s.versionId} className="flex gap-2"><input type="checkbox" checked={v.inspirationVersionIds?.includes(s.versionId) ?? false} onChange={e => update({ inspirationVersionIds: e.target.checked ? [...(v.inspirationVersionIds ?? []), s.versionId] : v.inspirationVersionIds?.filter(id => id !== s.versionId) })} />{s.sourceTaskTitle} · {s.name} · v{s.number} · {label(s.sourceState)}</label>)}</fieldset>}
      </fieldset>
      {mode === "KEEP" && <p className="text-sm">{label(v.type)} · {v.title} · {new Date(v.deadline).toLocaleString()} · {label(v.priority)}. Review the complete details below before confirming.</p>}
      <fieldset className="space-y-3"><legend className="font-semibold">Select historical evidence (optional)</legend>{d.evidence.map(e => <div key={e.id} className="rounded-xl border p-3"><label className="flex gap-2"><input type="checkbox" checked={evidence.includes(e.versionId)} onChange={event => setEvidence(event.target.checked ? [...evidence, e.versionId] : evidence.filter(id => id !== e.versionId))} />{e.name} · v{e.number} · {label(e.sourceState)}</label><EvidenceInfo evidence={e} href={`/api/tasker/${taskId}/files/${e.id}?versionId=${e.versionId}`} /></div>)}{!d.evidence.length && <p>No submitted files on this source.</p>}</fieldset>
      <button className={button} disabled={busy}>Review Sister Task</button>
    </form>}
    {error && <p role="alert" className="text-red-700">{error}</p>}<button className={button} disabled={busy} onClick={onCancel}>Cancel</button>
  </section>;
}
export function EvidenceInfo({ evidence: e, href }: { evidence: HistoricalEvidence; href: string }) {
  return <div className="space-y-1 break-words text-sm"><p>{e.mimeType} · {e.size} bytes · Version {e.versionId}</p><p>Uploaded by {e.uploader?.name ?? "Business user"}; submitted by {e.submission.actor.name} on {new Date(e.submission.createdAt).toLocaleString()}.</p><p>{label(e.sourceState)}{e.review ? ` · ${e.review.actor.name} · ${new Date(e.review.createdAt).toLocaleString()}` : " · No completion review for this evidence"}</p><a className="underline" href={href}>Download exact version</a>{["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(e.mimeType) && <> · <a className="underline" target="_blank" rel="noreferrer" href={`${href}&disposition=inline`}>Preview exact version</a></>}</div>;
}
export function RevisionComparison({ task }: { task: TaskDetail }) {
  const entries = task.entries.filter(e => e.action === "SUBMIT"), [left, setLeft] = useState(entries[0]?.id ?? ""), [right, setRight] = useState(entries.at(-1)?.id ?? "");
  if (entries.length < 2) return null;
  return <section className="space-y-3 rounded-2xl border p-5" aria-label="Compare revisions"><h2 className="font-semibold">Compare submitted revisions</h2><div className="grid gap-4 md:grid-cols-2">{([[left, setLeft, "Earlier submission"], [right, setRight, "Later submission"]] as const).map(([selected, set, title]) => {
    const entry = entries.find(e => e.id === selected) ?? entries[0], state = task.submissions?.find(s => s.id === entry.id);
    const snapshot = entry.snapshot as { proposedValue?: { text?: string } };
    return <article key={title} className="min-w-0 space-y-3 rounded-xl bg-[#f4f7f3] p-4"><label>{title}<select aria-label={title} className={input} value={entry.id} onChange={e => set(e.target.value)}>{entries.map(e => <option key={e.id} value={e.id}>Revision {e.version} · {e.actor.name} · {new Date(e.createdAt).toLocaleString()}</option>)}</select></label>
      <p className="text-sm">{state ? label(state.state) : "submitted"} · {state?.reviewer ? `Reviewer: ${state.reviewer.name}` : "No review"}</p><p className="whitespace-pre-wrap break-words">{entry.text}</p>{snapshot.proposedValue?.text && <p className="whitespace-pre-wrap">{richTextToPlainText(snapshot.proposedValue.text)}</p>}
      {task.files.filter(f => f.submittedEntryId === entry.id).map(f => <div key={f.id} className="break-words text-sm"><p>{f.name} · v{f.number} · {f.size} bytes · {f.status}</p><p>{f.versionId}</p><a className="underline" href={`/api/tasker/${task.id}/files/${f.id}?versionId=${f.versionId}`}>Download exact version</a> · <a className="underline" target="_blank" rel="noreferrer" href={`/api/tasker/${task.id}/files/${f.id}?versionId=${f.versionId}&disposition=inline`}>Preview exact version</a></div>)}
    </article>;
  })}</div><p className="text-xs">Compare recorded responses and exact file versions. File previews open separately; binary differences are not calculated.</p></section>;
}
function TaskCard({ task: t }: { task: TaskSummary }) {
  const [now] = useState(() => Date.now());
  const overdue = new Date(t.deadline).getTime() < now && !["COMPLETED", "CLOSED"].includes(t.status);
  return <Link className="block min-w-0 rounded-xl border bg-white p-4 hover:border-emerald-600" href={`/tasks/${t.id}`}><p className="text-xs">{t.project.name} · {label(t.type)}</p><h3 className="my-2 font-semibold">{t.title}</h3><p className="text-sm">Owner: {t.owner.name} · Executor: {t.executor.name}</p><p className="mt-2 text-sm">{label(t.status)} · {label(t.priority)}</p><p className={`mt-1 text-xs ${overdue ? "text-red-700" : ""}`}>{overdue ? "Overdue · " : "Due · "}{new Date(t.deadline).toLocaleString()}</p>{t.family && <p className="mt-2 text-xs">{t.family.isSister ? t.family.source ? `Sister of ${t.family.source.title}` : "Sister · Source restricted" : "Original task"}</p>}</Link>;
}
function visibleLineage(tasks: TaskSummary[]) {
  const visible = new Set(tasks.map(t => t.id)), result: { task: TaskSummary; depth: number }[] = [], visited = new Set<string>();
  function visit(task: TaskSummary, depth: number) {
    if (visited.has(task.id)) return; visited.add(task.id); result.push({ task, depth });
    for (const child of tasks.filter(t => t.family?.source?.id === task.id)) visit(child, depth + 1);
  }
  for (const task of tasks.filter(t => !t.family?.source || !visible.has(t.family.source.id))) visit(task, 0);
  return result;
}
function FamilyStack({ tasks, view }: { tasks: TaskSummary[]; view: string }) {
  const family = tasks[0].family!, [open, setOpen] = useState(false), [members, setMembers] = useState<TaskSummary[]>([]), [offset, setOffset] = useState(0), [total, setTotal] = useState(0), [error, setError] = useState("");
  useEffect(() => { if (!open) return; let active = true; api<{ tasks: TaskSummary[]; total: number }>(`?familyId=${family.anchorId}&offset=${offset}&sort=created`).then(r => { if (active) { setMembers(r.tasks); setTotal(r.total); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [open, offset, family.anchorId]);
  return <section className="min-w-0 space-y-3 rounded-2xl border border-emerald-200 bg-[#f4f7f3] p-3 shadow-[3px_3px_0_0_#dce5dd]">
    <button className={`${button} w-full text-left`} aria-expanded={open} aria-controls={`family-${family.anchorId}`} onClick={() => setOpen(!open)}>{open ? "Collapse" : "Expand"} family · {family.root?.title ?? "Related work"} · {family.count} accessible {family.count === 1 ? "task" : "tasks"}</button>
    <p className="text-xs">Latest accessible activity: {new Date(family.latestActivity).toLocaleString()}</p>
    <div id={`family-${family.anchorId}`} className={view === "list" ? "grid gap-3 md:grid-cols-2" : "space-y-3"}>{visibleLineage(open ? members : tasks).map(({ task, depth }) => <div key={task.id} style={{ marginLeft: `${Math.min(depth, 2) * 12}px` }}><TaskCard task={task} /></div>)}</div>
    {error && <p role="alert">{error}</p>}{open && total > 60 && <div className="flex gap-2"><button className={button} disabled={!offset} onClick={() => setOffset(offset - 60)}>Previous family page</button><button className={button} disabled={offset + 60 >= total} onClick={() => setOffset(offset + 60)}>Next family page</button></div>}
  </section>;
}
export function FamilyCards({ tasks, view }: { tasks: TaskSummary[]; view: string }) {
  const groups = new Map<string, TaskSummary[]>();
  for (const task of tasks) { const key = task.family?.anchorId ?? task.id; groups.set(key, [...(groups.get(key) ?? []), task]); }
  return <div className={view === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>{[...groups].map(([key, group]) => group[0].family && (group[0].family.count > 1 || group[0].family.isSister) ? <FamilyStack key={key} tasks={group} view={view} /> : <TaskCard key={key} task={group[0]} />)}</div>;
}

"use client";

import Link from "next/link";
import { DraftPublicationPanel } from "./workflow-publication";
import type { getDraftPublication } from "@/lib/stage-builder/publication";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Save, Trash2 } from "lucide-react";
import { DRAFT_NOTICE, approverTypes, capabilityRegistry, duplicateStage, evidenceTypes, fieldTypes, gateRegistry, newId, parseDefinition, projectTypes, validateDefinition,
  type Capability, type FieldDefinition, type Gate, type StageDefinition, type WorkflowDefinition } from "@/lib/stage-builder/contracts";
import type { getDraft, listDrafts } from "@/lib/stage-builder/service";

type Draft = Awaited<ReturnType<typeof getDraft>>;
type Listing = Awaited<ReturnType<typeof listDrafts>>;
const control = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-blue-600";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`;
const titleCase = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
function Text({ label, value, onChange, multiline = false, max = 160 }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; max?: number }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{multiline ? <textarea aria-label={label} className={control} rows={3} maxLength={max} value={value} onChange={e => onChange(e.target.value)} /> : <input aria-label={label} className={control} maxLength={max} value={value} onChange={e => onChange(e.target.value)} />}</label>;
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select aria-label={label} className={control} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{titleCase(o)}</option>)}</select></label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1 size-4 accent-blue-700" checked={value} onChange={e => onChange(e.target.checked)} />{label}</label>;
}
function NumberInput({ label, value, onChange, min, max }: { label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input type="number" className={control} min={min} max={max} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} /></label>;
}
function Panel({ children }: { children: ReactNode }) { return <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">{children}</div>; }
function Notice() { return <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold tracking-wide text-amber-900">{DRAFT_NOTICE}</p>; }
async function api<T>(path: string, data?: unknown, method = "POST"): Promise<T> {
  const r = await fetch(path, data ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
  const value = await r.json(); if (!r.ok) throw new Error(value.error ?? "Unable to load this draft."); return value;
}
export function WorkflowDraftList({ initial }: { initial: Listing }) {
  const router = useRouter(), [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const command = useRef<string | null>(null);
  async function create() {
    setBusy(true); setError(""); command.current ??= crypto.randomUUID();
    try { const result = await api<{ workflowId: string }>("/api/workflow-drafts", { commandId: command.current, definition: { schemaVersion: 1, name: "Untitled workflow", description: "", intendedProjectType: null, stages: [] } }); router.push(`/projects/workflow-drafts/${result.workflowId}`); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
    <Link href="/projects" className="text-sm text-blue-700 underline">Back to Projects</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Projects / Management</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">Workflow drafts</h1><p className="mt-2 text-sm text-slate-600">Build reusable stages, define required inputs, and review the sequence.</p></div><button type="button" className={primary} disabled={busy} onClick={create}><Plus size={16} />Create New Workflow Draft</button></header>
    <Notice />{error && <p role="alert" className="text-red-700">{error}</p>}
    {data.drafts.length === 0 ? <Panel><h2 className="font-semibold">Start with a stage</h2><p className="text-sm text-slate-600">Add information, file requirements, checklists, and draft approval requirements. Every workflow stays a draft.</p></Panel> : <div className="grid gap-4 sm:grid-cols-2">{data.drafts.map(d => <Link key={d.id} href={`/projects/workflow-drafts/${d.id}`} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-500"><h2 className="break-words font-semibold text-slate-900">{d.name || "Untitled workflow"}</h2><p className="mt-2 text-sm text-slate-600">Revision {d.revision} · {d.validationStatus === "VALID" ? "Configuration valid" : "Needs configuration"}</p><p className="mt-3 text-xs text-slate-500">Updated {new Date(d.updatedAt).toLocaleDateString()}</p></Link>)}</div>}
    {data.hasMore && <button className={button} disabled={busy} onClick={async () => { setBusy(true); try { const next = await api<Listing>(`/api/workflow-drafts?offset=${data.drafts.length}`); setData({ drafts: [...data.drafts, ...next.drafts], hasMore: next.hasMore }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Load more drafts</button>}
  </main>;
}
function newCapability(type: Capability["type"]): Capability {
  const base = { id: newId(), title: capabilityRegistry[type].label, instructions: "" };
  switch (type) {
    case "INFORMATION": return { ...base, type, fields: [] };
    case "FILE_REQUIREMENT": return { ...base, type, acceptedTypes: [".pdf"], minFiles: 1, maxFiles: 5, required: true, acceptance: "OWNER", acceptedVersionsGate: true };
    case "CHECKLIST": return { ...base, type, items: [] };
    case "APPROVAL": return { ...base, type, steps: [], rejection: "RETURN_FOR_CHANGES", gatesProgression: true };
  }
}
function newField(): FieldDefinition { return { id: newId(), type: "SHORT_TEXT", label: "", help: "", required: true, options: [], defaultValue: null, min: null, max: null }; }
function FieldEditor({ field: f, update }: { field: FieldDefinition; update: (f: FieldDefinition) => void }) {
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2"><Text label="Field label" value={f.label} onChange={label => update({ ...f, label })} /><Select label="Field type" value={f.type} options={fieldTypes} onChange={type => update({ ...f, type: type as FieldDefinition["type"], options: [], min: null, max: null, defaultValue: null, required: type === "READ_ONLY" ? false : f.required })} /></div>
    <Text label="Help text" value={f.help} max={2000} onChange={help => update({ ...f, help })} />
    {f.type !== "READ_ONLY" && <Toggle label="Required field" value={f.required} onChange={required => update({ ...f, required })} />}
    {f.type === "SELECT" && <Text label="Options (one per line)" value={f.options.join("\n")} multiline max={6400} onChange={v => update({ ...f, options: v.split("\n") })} />}
    <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium">Default value and validation</summary><div className="mt-3 space-y-3">
      {f.type === "NUMBER" ? <NumberInput label="Default number" value={typeof f.defaultValue === "number" ? f.defaultValue : null} onChange={defaultValue => update({ ...f, defaultValue })} /> : f.type === "DATE" ? <label className="block text-sm">Default date<input type="date" className={control} value={String(f.defaultValue ?? "")} onChange={e => update({ ...f, defaultValue: e.target.value || null })} /></label> : <Text label={f.type === "READ_ONLY" ? "Read-only information" : "Default value"} value={String(f.defaultValue ?? "")} multiline={f.type === "READ_ONLY" || f.type === "LONG_TEXT"} max={f.type === "SHORT_TEXT" ? 500 : 10000} onChange={v => update({ ...f, defaultValue: v || null })} />}
      {["NUMBER", "SHORT_TEXT", "LONG_TEXT"].includes(f.type) && <div className="grid gap-3 sm:grid-cols-2"><NumberInput label={f.type === "NUMBER" ? "Minimum value" : "Minimum characters"} value={f.min} onChange={min => update({ ...f, min })} /><NumberInput label={f.type === "NUMBER" ? "Maximum value" : "Maximum characters"} value={f.max} onChange={max => update({ ...f, max })} /></div>}
    </div></details>
  </div>;
}
function CapabilityEditor({ block: b, update }: { block: Capability; update: (b: Capability) => void }) {
  return <div className="space-y-4">
    <Text label="Capability title" value={b.title} onChange={title => update({ ...b, title })} /><Text label="Instructions" value={b.instructions} multiline max={4000} onChange={instructions => update({ ...b, instructions })} />
    {b.type === "INFORMATION" && <>
      {b.fields.map((f, i) => <fieldset key={f.id} className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Field {i + 1}</legend><FieldEditor field={f} update={field => update({ ...b, fields: b.fields.map(old => old.id === f.id ? field : old) })} /><button className={button} onClick={() => update({ ...b, fields: b.fields.filter(old => old.id !== f.id) })}>Remove field {i + 1}</button></fieldset>)}
      <button className={button} disabled={b.fields.length >= 40} onClick={() => update({ ...b, fields: [...b.fields, newField()] })}><Plus size={14} />Add field</button>
    </>}
    {b.type === "FILE_REQUIREMENT" && <>
      <Text label="Accepted file types (comma separated)" value={b.acceptedTypes.join(",")} onChange={v => update({ ...b, acceptedTypes: v.split(",").map(s => s.trim()) })} max={500} />
      <p className="text-xs text-slate-500">Use extensions such as .pdf, .png or exact MIME types such as application/pdf.</p>
      <div className="grid gap-3 sm:grid-cols-2"><NumberInput label="Minimum files" value={b.minFiles} min={0} max={100} onChange={n => update({ ...b, minFiles: n ?? 0 })} /><NumberInput label="Maximum files" value={b.maxFiles} min={1} max={100} onChange={n => update({ ...b, maxFiles: n ?? 1 })} /></div>
      <Toggle label="Submission required" value={b.required} onChange={required => update({ ...b, required, minFiles: required ? Math.max(1, b.minFiles) : b.minFiles, acceptedVersionsGate: required && b.acceptedVersionsGate })} />
      <Select label="Acceptance required from" value={b.acceptance} options={["NONE", "OWNER", "REVIEWER"]} onChange={acceptance => update({ ...b, acceptance: acceptance as typeof b.acceptance, acceptedVersionsGate: acceptance !== "NONE" && b.acceptedVersionsGate })} />
      <Toggle label="Accepted versions gate stage completion" value={b.acceptedVersionsGate} onChange={acceptedVersionsGate => update({ ...b, acceptedVersionsGate })} />
      <p className="text-xs text-slate-500">Future submissions will refer to exact shared file versions. Uploads are unavailable in drafts.</p>
    </>}
    {b.type === "CHECKLIST" && <>
      <p className="text-sm text-slate-600">Every required item and its configured evidence must be satisfied before the stage is ready.</p>
      {b.items.map((item, i) => <fieldset key={item.id} className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Checklist item {i + 1}</legend>
        <Text label="Item label" value={item.label} onChange={label => update({ ...b, items: b.items.map(old => old.id === item.id ? { ...item, label } : old) })} />
        <Text label="Item description" value={item.description} multiline max={2000} onChange={description => update({ ...b, items: b.items.map(old => old.id === item.id ? { ...item, description } : old) })} />
        <Toggle label="Required item" value={item.required} onChange={required => update({ ...b, items: b.items.map(old => old.id === item.id ? { ...item, required } : old) })} />
        <Select label="Item evidence" value={item.evidence} options={evidenceTypes} onChange={evidence => update({ ...b, items: b.items.map(old => old.id === item.id ? { ...item, evidence: evidence as typeof item.evidence } : old) })} />
        <button className={button} onClick={() => update({ ...b, items: b.items.filter(old => old.id !== item.id) })}>Remove item {i + 1}</button>
      </fieldset>)}
      <button className={button} disabled={b.items.length >= 60} onClick={() => update({ ...b, items: [...b.items, { id: newId(), label: "", description: "", required: true, evidence: "NONE" }] })}><Plus size={14} />Add checklist item</button>
    </>}
    {b.type === "APPROVAL" && <>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Draft configuration only. These steps grant no approval authority and cannot be executed here.</p>
      {b.steps.map((step, i) => <fieldset key={step.id} className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Approval step {i + 1}</legend>
        <Text label="Step label" value={step.label} onChange={label => update({ ...b, steps: b.steps.map(old => old.id === step.id ? { ...step, label } : old) })} />
        <Select label="Eligible approver" value={step.approver} options={approverTypes} onChange={approver => update({ ...b, steps: b.steps.map(old => old.id === step.id ? { ...step, approver: approver as typeof step.approver } : old) })} />
        <Select label="Approval evidence" value={step.evidence} options={["CONFIGURED_INPUTS", "SHARED_FILE_VERSION"]} onChange={evidence => update({ ...b, steps: b.steps.map(old => old.id === step.id ? { ...step, evidence: evidence as typeof step.evidence } : old) })} />
        <p className="text-xs text-slate-500">An explicit approve decision is mandatory at each ordered step.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={i === 0} aria-label={`Move approval step ${i + 1} up`} onClick={() => { const steps = [...b.steps]; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; update({ ...b, steps }); }}><ArrowUp size={14} />Move up</button><button className={button} disabled={i === b.steps.length - 1} aria-label={`Move approval step ${i + 1} down`} onClick={() => { const steps = [...b.steps]; [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; update({ ...b, steps }); }}><ArrowDown size={14} />Move down</button><button className={button} onClick={() => update({ ...b, steps: b.steps.filter(old => old.id !== step.id) })}>Remove step {i + 1}</button></div>
      </fieldset>)}
      <button className={button} disabled={b.steps.length >= 12} onClick={() => update({ ...b, steps: [...b.steps, { id: newId(), label: "", approver: "DIRECTOR", evidence: "CONFIGURED_INPUTS", decision: "APPROVE_REQUIRED" }] })}><Plus size={14} />Add approval step</button>
      <Select label="On rejection" value={b.rejection} options={["RETURN_FOR_CHANGES", "BLOCK_STAGE"]} onChange={rejection => update({ ...b, rejection: rejection as typeof b.rejection })} /><Toggle label="Approval gates stage progression" value={b.gatesProgression} onChange={gatesProgression => update({ ...b, gatesProgression })} />
    </>}
  </div>;
}
function GateEditor({ stage, stages, update }: { stage: StageDefinition; stages: StageDefinition[]; update: (gates: Gate[]) => void }) {
  const candidates: { gate: Gate; label: string }[] = [
    ...stages.slice(0, stage.position).map(s => ({ gate: { type: "PRECEDING_STAGE" as const, stageId: s.id }, label: `${gateRegistry.PRECEDING_STAGE}: ${s.title || "Untitled stage"}` })),
    ...stage.capabilities.flatMap<{ gate: Gate; label: string }>(b => {
      const type = b.type === "INFORMATION" && b.fields.some(f => f.required) ? "REQUIRED_FIELDS" : b.type === "CHECKLIST" && b.items.some(i => i.required) ? "REQUIRED_CHECKLIST" : b.type === "FILE_REQUIREMENT" && b.acceptedVersionsGate ? "ACCEPTED_FILES" : b.type === "APPROVAL" && b.steps.length && b.gatesProgression ? "APPROVAL_COMPLETE" : null;
      return type ? [{ gate: { type, capabilityId: b.id }, label: `${gateRegistry[type]}: ${b.title}` }] : [];
    }),
  ];
  return <details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer font-medium">Completion gates ({stage.gates.length})</summary><div className="mt-4 space-y-3">
    <p className="text-sm text-slate-600">Required fields, required checklist evidence, required file submissions and selected acceptance/approval gates apply to readiness. Add explicit dependencies below. Global Director completion rules always apply.</p>
    {stage.gates.map((g, i) => <div key={JSON.stringify(g)} className="flex items-center justify-between gap-3 text-sm"><span>{candidates.find(c => JSON.stringify(c.gate) === JSON.stringify(g))?.label ?? `${gateRegistry[g.type]} — reference needs repair`}</span><button className={button} onClick={() => update(stage.gates.filter((_, n) => n !== i))} aria-label={`Remove gate ${i + 1}`}>Remove</button></div>)}
    <label className="block text-sm font-medium">Add completion gate<select aria-label="Add completion gate" className={control} value="" onChange={e => { if (e.target.value) update([...stage.gates, JSON.parse(e.target.value) as Gate]); }}><option value="">Choose a supported condition…</option>{candidates.filter(c => !stage.gates.some(g => JSON.stringify(g) === JSON.stringify(c.gate))).map(c => <option key={JSON.stringify(c.gate)} value={JSON.stringify(c.gate)}>{c.label}</option>)}</select></label>
  </div></details>;
}
export function WorkflowPreview({ definition: d }: { definition: WorkflowDefinition }) {
  return <section aria-label="Workflow preview" className="space-y-5"><Panel><h2 className="text-xl font-semibold">{d.name || "Untitled workflow"}</h2><p className="whitespace-pre-wrap text-sm text-slate-600">{d.description}</p><p className="text-sm">{d.intendedProjectType ? titleCase(d.intendedProjectType) : "Any project type"} · {d.stages.length} stages</p><p className="text-sm font-medium text-amber-800">Structure preview only. Upload, approval and stage progression are unavailable.</p></Panel>
    {d.stages.map((s, i) => <Panel key={s.id}><h3 className="text-lg font-semibold">{i + 1}. {s.title || "Untitled stage"}</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{s.description}</p>
      {s.capabilities.map(b => <section key={b.id} className="space-y-2 rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{capabilityRegistry[b.type].label}</p><h4 className="font-medium">{b.title}</h4><p className="whitespace-pre-wrap text-sm">{b.instructions}</p>
        {b.type === "INFORMATION" && b.fields.map(f => <div key={f.id} className="rounded border bg-white p-3 text-sm"><p className="font-medium">{f.label || "Unlabelled field"} · {f.required ? "Required" : "Optional"} · {titleCase(f.type)}</p><p>{f.help}</p>{f.type === "SELECT" && <p>Options: {f.options.join(", ") || "Not configured"}</p>}{f.defaultValue !== null && <p className="whitespace-pre-wrap">{f.type === "READ_ONLY" ? "Information" : "Default"}: {String(f.defaultValue)}</p>}{(f.min !== null || f.max !== null) && <p>{f.type === "NUMBER" ? "Value" : "Length"}: {f.min ?? "No minimum"} – {f.max ?? "No maximum"}</p>}</div>)}
        {b.type === "FILE_REQUIREMENT" && <p className="text-sm">{b.required ? "Required" : "Optional"} · {b.minFiles}–{b.maxFiles} files · {b.acceptedTypes.join(", ")} · Acceptance: {titleCase(b.acceptance)} · {b.acceptedVersionsGate ? "Accepted versions required for completion" : "No acceptance gate"}</p>}
        {b.type === "CHECKLIST" && <ul className="space-y-2 text-sm">{b.items.map(item => <li key={item.id}><p>□ {item.label} · {item.required ? "Required" : "Optional"} · Evidence: {titleCase(item.evidence)}</p><p className="whitespace-pre-wrap text-slate-600">{item.description}</p></li>)}</ul>}
        {b.type === "APPROVAL" && <><ol className="list-inside list-decimal space-y-2 text-sm">{b.steps.map(step => <li key={step.id}>{step.label} · {titleCase(step.approver)} · Evidence: {titleCase(step.evidence)} · Approve decision required</li>)}</ol><p className="text-sm">On rejection: {titleCase(b.rejection)} · {b.gatesProgression ? "Gates progression" : "Does not gate progression"} · Draft only</p></>}
      </section>)}
      <p className="text-sm font-medium">Readiness requires all required inputs and configured acceptance/approval requirements.</p>
      {s.gates.length > 0 && <ul className="list-inside list-disc text-sm">{s.gates.map((g, n) => <li key={n}>{gateRegistry[g.type]}: {g.type === "PRECEDING_STAGE" ? d.stages.find(stage => stage.id === g.stageId)?.title || "Missing stage" : s.capabilities.find(b => b.id === g.capabilityId)?.title || "Missing capability"}</li>)}</ul>}
    </Panel>)}<p className="text-sm text-slate-600">Project creation and final completion remain subject to existing Director governance.</p>
  </section>;
}
export function StageBuilder({ initial, publication }: { initial: Draft; publication?: Awaited<ReturnType<typeof getDraftPublication>> | null }) {
  const [publicationData, setPublicationData] = useState(publication);
  const router = useRouter(), [saved, setSaved] = useState(initial), [definition, setDefinition] = useState(initial.definition), [selected, setSelected] = useState(initial.definition.stages[0]?.id ?? ""), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [showErrors, setShowErrors] = useState(false);
  const retry = useRef<{ json: string; commandId: string } | null>(null), cloneCommand = useRef<string | null>(null);
  const dirty = JSON.stringify(definition) !== JSON.stringify(saved.definition), historical = saved.revision !== saved.currentRevision;
  useEffect(() => { if (!dirty) return; const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent); }, [dirty]);
  function change(next: WorkflowDefinition) { setDefinition(next); setStatus(""); }
  function stages(next: StageDefinition[]) { change({ ...definition, stages: next.map((s, position) => ({ ...s, position })) }); }
  function updateStage(next: StageDefinition) { stages(definition.stages.map(s => s.id === next.id ? next : s)); }
  const stage = definition.stages.find(s => s.id === selected);
  let issues = validateDefinition(definition);
  try { parseDefinition(definition); } catch (e) { issues = [{ path: "configuration", message: titleCase((e as Error).message) }, ...issues]; }
  async function save() {
    setBusy(true); setError(""); setStatus(""); setShowErrors(true);
    try {
      parseDefinition(definition);
      const json = JSON.stringify({ definition, expectedRevision: saved.currentRevision });
      if (retry.current?.json !== json) retry.current = { json, commandId: crypto.randomUUID() };
      await api(`/api/workflow-drafts/${saved.workflowId}`, { ...JSON.parse(json), commandId: retry.current.commandId }, "PATCH");
      if (publicationData) setPublicationData(await api(`/api/workflow-drafts/${saved.workflowId}/publication`));
      const latest = await api<Draft>(`/api/workflow-drafts/${saved.workflowId}`); setSaved(latest); setDefinition(latest.definition); retry.current = null;
      setStatus(`Saved revision ${latest.revision}${latest.issues.length ? " — configuration needs attention" : " — configuration valid"}.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function clone() { setBusy(true); setError(""); cloneCommand.current ??= crypto.randomUUID(); try { const result = await api<{ workflowId: string }>(`/api/workflow-drafts/${saved.workflowId}/clone`, { commandId: cloneCommand.current, expectedRevision: saved.currentRevision }); router.push(`/projects/workflow-drafts/${result.workflowId}`); } catch (e) { setError((e as Error).message); setBusy(false); } }
  function addStage() { const s: StageDefinition = { id: newId(), title: `Stage ${definition.stages.length + 1}`, description: "", position: definition.stages.length, capabilities: [], gates: [] }; stages([...definition.stages, s]); setSelected(s.id); }
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    <Link href="/projects/workflow-drafts" className="text-sm text-blue-700 underline" onClick={e => { if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault(); }}>All workflow drafts</Link>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">Custom Stage Builder</h1><p className="mt-1 text-sm text-slate-600">Revision {saved.revision} · {dirty ? "Unsaved changes" : "Saved draft"}</p></div><div className="flex flex-wrap gap-2"><button className={button} onClick={() => setPreview(!preview)}>{preview ? "Edit workflow" : "Preview Workflow"}</button><button className={button} disabled={busy || dirty || historical} onClick={clone}><Copy size={16} />Duplicate draft</button><button className={primary} disabled={busy || historical} onClick={save}><Save size={16} />{busy ? "Working…" : "Save Draft"}</button></div></header>
    {publicationData ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Draft workspace. Changes require Director review and publication. Project creation and stage execution are unavailable.</p> : <Notice />}
    {publicationData && <DraftPublicationPanel key={`${saved.revision}:${publicationData.submissions[0]?.status}`} initial={publicationData} draft={saved} dirty={dirty} />}
    <p role="status" aria-live="polite" className="text-sm text-green-800">{status}</p>
    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><a className="underline" href={`/projects/workflow-drafts/${saved.workflowId}`} target="_blank" rel="noreferrer">Open current saved revision in a new tab</a></div>}
    {historical && <p className="rounded-lg bg-blue-50 p-4 text-sm">Historical revision {saved.revision} is read-only. <Link href={`/projects/workflow-drafts/${saved.workflowId}`} className="underline">Open current revision {saved.currentRevision}</Link></p>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><button className="text-blue-700 underline" onClick={() => setShowErrors(!showErrors)}>Review Validation Errors ({issues.length})</button><details><summary className="cursor-pointer">Revision history</summary><ul className="mt-2 max-h-60 space-y-2 overflow-auto rounded border bg-white p-3">{saved.history.map(h => <li key={h.id}><a href={`/projects/workflow-drafts/${saved.workflowId}?revision=${h.revision}`} target="_blank" rel="noreferrer" className="text-blue-700 underline">Revision {h.revision} · {titleCase(h.action)}</a><p className="text-xs text-slate-500">{h.actorId} · {new Date(h.createdAt).toLocaleString()}</p></li>)}</ul><p className="mt-2 text-xs">Latest 50 revisions shown. Earlier revisions remain available by revision number.</p></details></div>
    {showErrors && <section aria-label="Validation results" className={`rounded-lg border p-4 text-sm ${issues.length ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}><h2 className="font-semibold">{issues.length ? "Configuration needs attention" : "Configuration valid — still a draft"}</h2>{issues.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1">{issues.map((i, n) => <li key={n}>{i.path.startsWith("stages.") ? `Stage ${Number(i.path.split(".")[1]) + 1}: ` : ""}{i.message}</li>)}</ul>}<p className="mt-2">Incomplete content can be saved. Invalid references, unsupported settings and contradictory rules must be fixed before saving.</p></section>}
    {preview || historical ? <WorkflowPreview definition={definition} /> : <fieldset disabled={busy} className="min-w-0 space-y-5">
      <Panel><h2 className="font-semibold">1. Workflow details</h2><div className="grid gap-4 sm:grid-cols-2"><Text label="Workflow name" value={definition.name} onChange={name => change({ ...definition, name })} /><label className="block text-sm font-medium text-slate-700">Intended project type<select aria-label="Intended project type" className={control} value={definition.intendedProjectType ?? ""} onChange={e => change({ ...definition, intendedProjectType: e.target.value as WorkflowDefinition["intendedProjectType"] || null })}><option value="">Any / not specified</option>{projectTypes.map(t => <option key={t} value={t}>{t === "ARTWORK_PACKAGING" ? "Artwork / Packaging" : titleCase(t)}</option>)}</select></label></div><Text label="Workflow description" value={definition.description} multiline max={4000} onChange={description => change({ ...definition, description })} /></Panel>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-6"><h2 className="font-semibold">2. Stage sequence</h2><ol className="space-y-2">{definition.stages.map((s, i) => <li key={s.id} className={`rounded-lg border bg-white p-3 ${s.id === selected ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200"}`}><button className="w-full break-words text-left text-sm font-medium" aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>{i + 1}. {s.title || "Untitled stage"}</button><p className="mt-1 text-xs text-slate-500">{s.capabilities.length} capabilities</p><div className="mt-2 flex gap-1"><button className={button} disabled={i === 0} aria-label={`Move stage ${i + 1} up`} onClick={() => { const next = [...definition.stages]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; stages(next); }}><ArrowUp size={14} /></button><button className={button} disabled={i === definition.stages.length - 1} aria-label={`Move stage ${i + 1} down`} onClick={() => { const next = [...definition.stages]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; stages(next); }}><ArrowDown size={14} /></button></div></li>)}</ol><button className={`${button} w-full`} disabled={definition.stages.length >= 30} onClick={addStage}><Plus size={16} />Add Stage</button><p className="text-xs text-slate-500">Stage order must respect preceding-stage gates.</p></aside>
        {stage ? <Panel><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">3. Configure stage {stage.position + 1}</h2><div className="flex gap-2"><button className={button} disabled={definition.stages.length >= 30} onClick={() => { const copy = duplicateStage(stage), next = [...definition.stages]; next.splice(stage.position + 1, 0, copy); stages(next); setSelected(copy.id); }}><Copy size={14} />Duplicate stage</button><button className={button} onClick={() => { if (definition.stages.some(s => s.gates.some(g => g.type === "PRECEDING_STAGE" && g.stageId === stage.id))) { setError("Remove dependencies on this stage before removing it."); return; } const next = definition.stages.filter(s => s.id !== stage.id); stages(next); setSelected(next[0]?.id ?? ""); }}><Trash2 size={14} />Remove stage</button></div></div>
          <Text label="Stage title" value={stage.title} onChange={title => updateStage({ ...stage, title })} /><Text label="Stage description" value={stage.description} multiline max={4000} onChange={description => updateStage({ ...stage, description })} />
          {stage.capabilities.map((b, i) => <details key={b.id} open className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-medium">{i + 1}. {b.title || capabilityRegistry[b.type].label} <span className="font-normal text-slate-500">· {capabilityRegistry[b.type].label}</span></summary><div className="mt-4 space-y-4"><CapabilityEditor block={b} update={next => updateStage({ ...stage, capabilities: stage.capabilities.map(old => old.id === b.id ? next : old) })} /><button className={button} onClick={() => { if (stage.gates.some(g => "capabilityId" in g && g.capabilityId === b.id)) { setError("Remove this capability's explicit completion gates first."); return; } updateStage({ ...stage, capabilities: stage.capabilities.filter(old => old.id !== b.id) }); }}>Remove capability {i + 1}</button></div></details>)}
          <div className="rounded-xl border border-dashed border-slate-300 p-4"><h3 className="mb-3 text-sm font-semibold">Add a capability</h3><div className="grid gap-2 sm:grid-cols-2">{Object.entries(capabilityRegistry).map(([type, info]) => <button key={type} className={`${button} !items-start !justify-start text-left`} disabled={stage.capabilities.length >= 12} onClick={() => updateStage({ ...stage, capabilities: [...stage.capabilities, newCapability(type as Capability["type"])] })}><Plus size={16} className="mt-0.5 shrink-0" /><span>{info.label}<span className="mt-1 block text-xs font-normal text-slate-500">{info.description}</span></span></button>)}</div></div>
          <GateEditor stage={stage} stages={definition.stages} update={gates => updateStage({ ...stage, gates })} />
        </Panel> : <Panel><h2 className="font-semibold">Define the first step</h2><p className="text-sm text-slate-600">Add a stage, then choose the capabilities it needs. There is no mandatory concept-stage sequence.</p><button className={primary} onClick={addStage}><Plus size={16} />Add Stage</button></Panel>}
      </div>
    </fieldset>}
  </main>;
}

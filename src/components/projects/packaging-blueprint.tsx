"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { packagingBlueprint } from "@/lib/standard-templates/packaging";

export function PackagingBlueprintCard() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const command = useRef<string | null>(null);
  const blueprint = packagingBlueprint();
  async function load() {
    setBusy(true); setError(""); command.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/workflow-blueprints/packaging/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: command.current, blueprintRevision: blueprint.revision, scopeAcknowledged: accepted }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load Packaging candidate.");
      router.push(`/projects/workflow-drafts/${result.workflowId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <section aria-label="Packaging blueprint" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
    <h2 className="text-xl font-semibold">Packaging / Artwork candidate</h2>
    <p className="text-sm">Source: GTI specification, 29 September 2026 · Candidate revision {blueprint.revision}. Six configurable stages; Initial Concept and Final Concept work uses Universal Tasks.</p>
    <p className="text-sm font-medium">Internal evidence pilot only. Official rollout is blocked by the requirements below. Loading creates an editable draft under your own account; submission and Director review are separate actions.</p>
    <details><summary className="cursor-pointer font-medium">Stage coverage and outstanding requirements</summary>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">{blueprint.definition.stages.map(stage => <li key={stage.id}>{stage.title}</li>)}</ol>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm">{blueprint.gaps.map(gap => <li key={gap.id}><p>{gap.missing}</p><p className="text-slate-600">{gap.internalPilotTreatment}</p></li>)}</ul>
      <p className="mt-3 text-xs">{blueprint.source.pagination}</p>
    </details>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1" />I understand this is an internal candidate with outstanding official requirements.</label>
    <button type="button" disabled={!accepted || busy} onClick={load} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Loading candidate…" : "Load Packaging draft"}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}

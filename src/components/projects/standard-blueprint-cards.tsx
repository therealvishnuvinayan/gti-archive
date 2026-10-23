"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateBlueprint } from "@/lib/standard-templates/contracts";
import { posmBlueprint } from "@/lib/standard-templates/posm";
import { retailDisplayBlueprint } from "@/lib/standard-templates/retail-display";
import { exhibitionStandBlueprint } from "@/lib/standard-templates/exhibition-stand";
import { digitalBlueprint } from "@/lib/standard-templates/digital";

const posm = posmBlueprint(), retail = retailDisplayBlueprint();
const exhibition = exhibitionStandBlueprint(), digital = digitalBlueprint();
function CandidateCard({ blueprint, label, description }: { blueprint: TemplateBlueprint; label: string; description: string }) {
  const router = useRouter(), command = useRef<string | null>(null);
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function load() {
    setBusy(true); setError(""); command.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/workflow-blueprints/${blueprint.id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: command.current, blueprintRevision: blueprint.revision, scopeAcknowledged: accepted }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Unable to load ${label} candidate.`);
      router.push(`/projects/workflow-drafts/${result.workflowId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <section aria-label={`${label} blueprint`} className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
    <h2 className="text-xl font-semibold">{label} candidate</h2>
    <p className="text-sm">Source: GTI specification, 29 September 2026 · Candidate revision {blueprint.revision} · {blueprint.definition.stages.length} stages.</p>
    <p className="text-sm">{description}</p>
    <p className="text-sm font-medium">Internal evidence pilot only. Official rollout has {blueprint.gaps.length} unresolved requirement groups. Requiredness, reviewer routing and file limits are proposed candidate choices. Loading creates an editable draft under your account; submission and Director review are separate.</p>
    <details><summary className="cursor-pointer font-medium">Stage coverage and outstanding requirements</summary>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">{blueprint.definition.stages.map(stage => <li key={stage.id}>{stage.title}</li>)}</ol>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm">{blueprint.gaps.map(gap => <li key={gap.id}><p>{gap.missing}</p><p className="text-slate-600">{gap.internalPilotTreatment}</p></li>)}</ul>
      <p className="mt-3 text-xs">{blueprint.source.pagination}</p>
    </details>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1" />I understand this is an internal candidate with outstanding official requirements.</label>
    <button type="button" disabled={!accepted || busy} onClick={load} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Loading candidate…" : `Load ${label} draft`}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
export function AdditionalBlueprintCards() {
  return <>
    <CandidateCard blueprint={posm} label="POSM" description="One POSM & Promotional Materials template with Printed POSM / Merchandise choices. Branch-specific fields remain optional. Conditional sourcing, research skipping, three-offer counts and outlet photo minima are not enforced." />
    <CandidateCard blueprint={retail} label="Retail Display" description="Display brief, surveys, concept evidence, technical design, component specifications, prototype evidence and installation. Component/outlet coverage, representative-sample decisions and issue-task completion gates need additional capabilities." />
    <CandidateCard blueprint={exhibition} label="Exhibition Stand" description="Eight source stages from event brief to wrap-up. Dates are entered manually; backward planning, vendor/organiser approvals, linked budgets, snag-task gates, inventory, ratings and annual report reuse remain unsupported." />
    <CandidateCard blueprint={digital} label="Digital" description="Seven execution stages from brief to launch. Maintenance remains an unresolved lifecycle and closure decision; launch does not auto-close the project. Never store passwords, API keys, recovery codes or other secrets in fields, comments or files. Use non-secret references only." />
  </>;
}

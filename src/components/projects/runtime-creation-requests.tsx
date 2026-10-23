"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { runtimeCreationRequests } from "@/lib/runtime-integration/creation";
export function RuntimeCreationRequests({ data }: { data: Awaited<ReturnType<typeof runtimeCreationRequests>> }) {
  const router = useRouter(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function decide(event: FormEvent<HTMLFormElement>, row: typeof data.requests[number]) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const r = await fetch("/api/runtime-projects/creation-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), requestId: row.id, snapshotHash: row.snapshotHash, outcome: form.get("outcome"), reason: form.get("reason"), confirmed: form.get("confirmed") === "on" }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error ?? "Decision failed"); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-6 p-6"><Link href="/projects/runtime" className="underline">Runtime projects</Link><h1 className="text-2xl font-semibold">Runtime creation requests</h1>{error && <p role="alert">{error}</p>}{!data.requests.length && <p>No creation requests.</p>}{data.requests.map(row => <article className="space-y-3 rounded border p-4" key={row.id}><h2 className="text-xl">{row.creation.title}</h2><p>Requested by {row.requester} · {row.decision?.outcome ?? "PENDING"}</p><p>{row.reason}</p><details><summary>Exact proposed project and participants</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(row.creation, null, 2)}</pre></details>{row.decision ? <><p>{row.decision.reviewer.name}: {row.decision.reason}</p>{row.decision.projectId && <Link className="underline" href={`/projects/runtime/${row.decision.projectId}`}>Open approved project</Link>}</> : data.canDecide && <form className="space-y-3" onSubmit={e => decide(e, row)}><label className="block">Decision<select name="outcome" className="ml-2 border p-2"><option value="REJECT">Reject</option><option value="APPROVE">Approve and create project</option></select></label><label className="block">Decision reason<textarea className="block w-full border p-2" name="reason" required maxLength={2000} /></label><label className="block"><input type="checkbox" name="confirmed" required /> I reviewed this exact project, approved version and participants.</label><button className="rounded border px-4 py-2" disabled={busy}>Record Director decision</button></form>}</article>)}</main>;
}

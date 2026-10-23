"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessView, AccessRecipient, AccessCommand } from "@/lib/archive-sharing/contracts";

type Proposal = { recipient: AccessRecipient; action: "GRANT" | "REVOKE"; grantId: string | null; commandId: string };
export function ArchiveManageAccess({ fileId }: { fileId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<AccessView | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""), [proposal, setProposal] = useState<Proposal | null>(null);
  const [expiry, setExpiry] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<AccessCommand | null>(null);
  async function load(before?: string) {
    const response = await fetch(`/api/archives/access?${new URLSearchParams({ fileId, search, ...(before ? { before } : {}) })}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setView(null); throw new Error(body.error ?? "Unable to load access."); }
    setView(current => before && current ? { ...body, history: [...current.history, ...body.history] } : body);
  }
  async function refresh(before?: string) {
    setBusy(true); setError("");
    try { await load(before); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function propose(recipient: AccessRecipient, action: Proposal["action"], grantId: string | null) {
    setProposal({ recipient, action, grantId, commandId: crypto.randomUUID() }); setConfirmed(false); setReason(""); setExpiry(""); setNotice(""); setError(""); setPending(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!proposal || !view || !confirmed || busy) return;
    setBusy(true); setError("");
    const command: AccessCommand = pending ?? { commandId: proposal.commandId, sourceKind: view.sourceKind, sourceId: view.sourceId, categoryId: view.categoryId, referenceId: view.referenceId, versionId: view.versionId,
      recipientId: proposal.recipient.id, expectedRevision: proposal.recipient.revision, expectedDecisionId: proposal.recipient.decisionId, expectedGrantId: proposal.grantId,
      action: proposal.action, expiresAt: proposal.action === "GRANT" && expiry ? new Date(Date.now() + Number(expiry) * 86400000).toISOString() : null, reason, confirmed: true };
    setPending(command);
    try {
      const response = await fetch("/api/archives/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const body = await response.json();
      if (!response.ok) { if (response.status < 500) { setPending(null); setProposal(null); await load(); } throw new Error(body.error ?? "Unable to update access."); }
      // Keep the exact command for uncertain-response retries; only confirmed
      // writes clear it. The rendered access state always comes from a fresh GET.
      setPending(null); setProposal(null); await load(); setNotice(command.action === "GRANT" ? "Access granted." : "Access revoked. New protected requests are denied.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const date = (value: string) => new Date(value).toLocaleString();
  return <>
    <Button type="button" variant="secondary" onClick={() => { dialog.current?.showModal(); setNotice(""); setProposal(null); void refresh(); }}>Manage access</Button>
    <dialog ref={dialog} aria-label="Manage archive access" className="m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-white p-6 shadow-xl backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Manage access</h2><Button type="button" variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Close</Button></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
      {busy && <p role="status" className="mt-3 text-sm">Loading access…</p>}
      {view && <div className="mt-4 space-y-5 text-sm">
        <p>{view.versionId ? `Selected immutable version: ${view.versionId}.` : "Historical native file. No immutable version identity; integrity is unknown."} New grants allow preview and download only. Category restrictions still apply. Verification is not delegated.</p>
        <section aria-label="Current recipients" className="space-y-3"><h3 className="font-semibold">Current access</h3>
          {!view.grants.length && <p>No individual grants.</p>}
          {view.grants.map(grant => <div key={grant.grantId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{grant.name || grant.email}</p><p>{grant.effective ? "Active" : "Not effective"} · {grant.scope === "NATIVE" ? "Existing native permissions" : "Preview and download"}</p><p>{grant.expiresAt ? `Expires ${date(grant.expiresAt)}` : "No expiry"} · Granted {date(grant.createdAt)}{grant.grantedBy ? ` by ${grant.grantedBy}` : ""}</p></div><Button type="button" variant="secondary" disabled={busy} onClick={() => propose(grant, "REVOKE", grant.grantId)}>Revoke access</Button></div>)}
        </section>
        {!proposal ? <section className="space-y-3" aria-label="Eligible recipients"><h3 className="font-semibold">Grant access</h3><form onSubmit={event => { event.preventDefault(); void refresh(); }} className="flex gap-2"><Input aria-label="Find recipient" placeholder="Search name or email" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /><Button disabled={busy}>Search</Button></form>
          {view.moreUsers && <p>Showing 50 matches. Narrow your search.</p>}
          {view.users.filter(user => !view.grants.some(g => g.id === user.id)).map(user => <div key={user.id} className="flex items-center justify-between gap-3"><span>{user.name || user.email}<span className="block text-xs text-slate-500">{user.email}</span></span><Button type="button" variant="secondary" disabled={busy} onClick={() => propose(user, "GRANT", null)}>Select recipient</Button></div>)}
        </section> : <form onSubmit={submit} className="space-y-3 rounded-xl border border-green-800/20 bg-green-50/40 p-4">
          <h3 className="font-semibold">{proposal.action === "GRANT" ? "Confirm grant" : "Confirm revocation"}: {proposal.recipient.name || proposal.recipient.email}</h3>
          <p>{proposal.action === "GRANT" ? "Preview and download this selected file only. No sibling files, future versions or project access." : "Remove this individual grant. The file and verification history remain. Previously issued direct storage URLs remain usable until their expiry (up to five minutes)."}</p>
          {proposal.action === "GRANT" && <label className="block">Access expires<select aria-label="Access expires" className="ml-2 rounded border p-2" disabled={busy || !!pending} value={expiry} onChange={e => setExpiry(e.target.value)}><option value="">No expiry</option>{[1,7,30,90].map(days => <option key={days} value={days}>{days} days</option>)}</select></label>}
          <label className="block">{proposal.action === "REVOKE" ? "Revocation reason" : "Note (optional)"}<textarea aria-label={proposal.action === "REVOKE" ? "Revocation reason" : "Grant note"} required={proposal.action === "REVOKE"} maxLength={2000} disabled={busy || !!pending} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I confirm this recipient and access change.</label>
          <div className="flex gap-2"><Button disabled={busy || !confirmed || proposal.action === "REVOKE" && !reason.trim()}>{proposal.action === "GRANT" ? "Confirm grant" : "Confirm revocation"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { setProposal(null); setPending(null); }}>Cancel</Button></div>
        </form>}
        <details><summary className="cursor-pointer font-semibold">Access history</summary><ol className="mt-3 space-y-3">{view.history.map(row => <li key={row.id}><p>{row.action === "GRANT" ? "Granted" : "Revoked"} · {row.recipient || "GTI recipient"} · {row.actor || "GTI manager"} · {date(row.createdAt)}</p><p className="whitespace-pre-wrap break-words text-slate-600">{row.reason}</p></li>)}</ol>{view.nextHistoryBefore && <Button type="button" variant="secondary" disabled={busy} onClick={() => void refresh(view.nextHistoryBefore!)}>Older access history</Button>}</details>
      </div>}
    </dialog>
  </>;
}

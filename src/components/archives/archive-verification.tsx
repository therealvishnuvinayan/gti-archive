"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { VerificationView } from "@/lib/archive-verification/contracts";

export function ArchiveVerification({ sourceId, sourceKind, categoryId }: { sourceId: string; sourceKind: "manual" | "project"; categoryId: string }) {
  const [view, setView] = useState<VerificationView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"VERIFY" | "REVOKE">("VERIFY");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [commandId, setCommandId] = useState("");
  const panel = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const query = new URLSearchParams({ sourceId, sourceKind, categoryId }).toString();
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/archives/verification?${query}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to read verification.");
    if (!signal?.aborted) setView(body);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
      }
    }, { rootMargin: "200px" });
    if (panel.current) observer.observe(panel.current);
    return () => { controller.abort(); observer.disconnect(); };
  }, [load]);
  async function olderHistory() {
    if (!view?.nextHistoryBefore || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/archives/verification?${query}&before=${view.nextHistoryBefore}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to read older reviews.");
      if (body.decisionId !== view.decisionId || body.versionId !== view.versionId) await load();
      else setView({ ...view, history: [...view.history, ...body.history], nextHistoryBefore: body.nextHistoryBefore });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read older reviews."); }
    finally { setBusy(false); }
  }
  function open(next: "VERIFY" | "REVOKE") {
    setAction(next); setReason(""); setConfirmed(false); setError(""); setCommandId(crypto.randomUUID()); dialog.current?.showModal();
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!view?.versionId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/archives/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commandId, sourceId, sourceKind, categoryId, versionId: view.versionId, expectedRevision: view.revision, expectedDecisionId: view.decisionId, action, reason, confirmed }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save review.");
      await load(); dialog.current?.close();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save review. Refresh and try again."); }
    finally { setBusy(false); }
  }
  const status = view?.status === "VERIFIED" ? "Verified" : view?.status === "REVOKED" ? "Verification revoked" : view?.status === "UNAVAILABLE" ? "Verification unavailable for this file/version" : view ? "Not verified" : "Loading verification…";
  const latest = view?.history[0];
  return <div ref={panel} data-verification-for={sourceId} className="mt-3 min-w-0 rounded-xl border border-line bg-[#f7faf7] p-3 text-xs text-[#526057]" onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
    <p role="status" className="font-semibold">{status}</p>
    {view?.status === "VERIFIED" && latest && <p>Verified by {latest.reviewer}, {new Date(latest.createdAt).toLocaleString()}</p>}
    {view?.explanation && <p className="mt-1">{view.explanation}</p>}
    {view?.versionId && <details className="mt-2"><summary className="cursor-pointer">Exact version & review history</summary>
      <p className="mt-2 break-all">Version {view.versionNumber}: {view.versionId}</p>
      <p>{view.integrity?.objectVersionPinned ? "Storage object version pinned." : "Application-sealed object with an opaque ETag."} {view.integrity?.checksumEvidence === "S3_FULL_OBJECT_SHA256" ? "S3 full-object SHA-256 observed." : "No cryptographic checksum established."}</p>
      <p className="mt-2">An authorized GTI file-review attestation; it does not establish legal compliance, copyright ownership, or artwork quality.</p>
      {view.history.length > 0 && <ol className="mt-2 space-y-2">{view.history.map(row => <li key={row.id} className="break-words border-t border-line pt-2"><strong>{row.action === "VERIFY" ? "Verified" : "Revoked"}</strong> by {row.reviewer}, {new Date(row.createdAt).toLocaleString()}<p className="whitespace-pre-wrap">{row.reason}</p><p className="break-all">Exact version: {row.versionId}</p></li>)}</ol>}
      {view.nextHistoryBefore && <Button variant="secondary" disabled={busy} onClick={() => void olderHistory()}>Older reviews</Button>}
    </details>}
    <div className="mt-2 flex flex-wrap gap-2">{view?.canVerify && <Button variant="secondary" onClick={() => open("VERIFY")}>Verify</Button>}{view?.canRevoke && <Button variant="secondary" onClick={() => open("REVOKE")}>Revoke verification</Button>}</div>
    {error && <p role="alert" className="mt-2 text-red-700">{error} <button className="underline" onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Refresh status</button></p>}
    <dialog ref={dialog} aria-label={action === "VERIFY" ? "Verify exact file version" : "Revoke exact file verification"} onCancel={e => { if (busy) e.preventDefault(); }} className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl p-6 backdrop:bg-black/40">
      <form onSubmit={submit} className="space-y-4 text-sm">
        <h3 className="text-lg font-semibold">{action === "VERIFY" ? "Verify exact file version" : "Revoke exact file verification"}</h3>
        <p className="break-all">Version {view?.versionNumber}: {view?.versionId}</p>
        <p>This records your GTI review of this exact version. {action === "REVOKE" ? "The original review remains in history." : "It does not certify legal rights, quality, or authenticity beyond the observed storage evidence."}</p>
        <label className="block">{action === "VERIFY" ? "Verification note" : "Revocation reason"}<textarea autoFocus required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} className="mt-1 min-h-24 w-full rounded-lg border border-line p-2" /></label>
        <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />I confirm this {action === "VERIFY" ? "verification" : "revocation"} for the exact version shown.</label>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !confirmed || !reason.trim()}>{busy ? "Saving…" : action === "VERIFY" ? "Confirm verification" : "Confirm revocation"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</Button></div>
      </form>
    </dialog>
  </div>;
}

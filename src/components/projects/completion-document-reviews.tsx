"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Reviews = {
  submissions: { id: string; type: string; originalFileName: string; status: string; createdAt: string; uploadedAt: string | null; reviewedAt: string | null; reviewReason: string | null; externalSubmitterEmail: string | null; submittedBy: { name: string | null; email: string } | null; reviewedBy: { name: string | null; email: string } | null }[];
  accesses: { id: string; type: string; recipientEmail: string; expiresAt: string; revokedAt: string | null }[];
};
export function CompletionDocumentReviews({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Reviews | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [link, setLink] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/project-completion-documents/reviews?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }, [projectId]);
  useEffect(() => { const load = () => { void refresh().catch(e => setError(e.message)); }; load(); window.addEventListener("completion-documents-changed", load); return () => window.removeEventListener("completion-documents-changed", load); }, [refresh]);
  async function command(values: Record<string, string>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/project-completion-documents/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, projectId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (body.path) setLink(`${location.origin}${body.path}`);
      await refresh(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update documents."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-5" aria-label="Completion document review">
    <h2 className="text-lg font-semibold">Completion document review</h2>
    <p className="text-sm text-slate-600">Uploads require acceptance before they satisfy the checklist. Final project completion still requires the Director.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data?.submissions.length === 0 && <p>No document submissions yet.</p>}
    {data?.submissions.map(s => <article key={s.id} className="space-y-2 rounded border p-3">
      <p className="font-medium">{s.originalFileName} · {s.status}</p>
      <p className="text-sm">{s.type.replaceAll("_", " ")} · Submitted by {s.submittedBy?.name ?? s.submittedBy?.email ?? `external recipient ${s.externalSubmitterEmail}`} · {s.uploadedAt ?? s.createdAt}</p>
      {s.uploadedAt && <a className="text-emerald-800 underline" href={`/api/project-completion-documents/submissions/${s.id}`} target="_blank" rel="noreferrer">Review document</a>}
      {s.reviewedAt && <p className="text-sm">{s.reviewedBy?.name ?? s.reviewedBy?.email} · {s.reviewedAt} · {s.reviewReason}</p>}
      {canManage && s.status === "SUBMITTED" && <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void command({ command: "REVIEW", submissionId: s.id, decision: button?.value ?? "REJECT", reason: String(f.get("reason")) }); }}>
        <input className="rounded border p-2" name="reason" aria-label={`Review reason for ${s.originalFileName}`} placeholder="Review reason" required maxLength={2000} />
        <Button disabled={busy} type="submit" value="ACCEPT">Accept document</Button><Button disabled={busy} type="submit" value="REJECT" variant="outline">Reject / request revision</Button>
      </form>}
    </article>)}
    {canManage && <details className="space-y-3"><summary className="cursor-pointer font-medium">Request a revision of accepted evidence</summary>
      <p className="text-sm">Reopening retains accepted files and review history. This step and subsequent required document steps must be prepared and reviewed again. Pending final-completion requests become stale.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void command({ command: "REOPEN", type: String(f.get("type")), reason: String(f.get("reason")) }); }}>
        <select aria-label="Revision document type" name="type" className="rounded border p-2"><option value="AUTHORITY_APPROVAL_PROOF">Approval evidence</option><option value="COPYRIGHT_TRANSFER">Copyright transfer</option><option value="INVOICE">Final invoice</option></select>
        <input name="reason" aria-label="Revision reason" placeholder="Reason for revision" required maxLength={2000} className="rounded border p-2" /><Button disabled={busy} type="submit">Reopen for revision</Button>
      </form>
    </details>}
    {canManage && <details className="space-y-3"><summary className="cursor-pointer font-medium">External submission links</summary>
      <p className="text-sm">Prepare the required document request above, then issue a link for its recipient. Links expire after seven days. A replacement revokes earlier links for that document type. Share the link securely; no email is sent here.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void command({ command: "ISSUE", type: String(f.get("type")), recipientEmail: String(f.get("email")) }); }}>
        <select aria-label="External document type" name="type" className="rounded border p-2"><option value="AUTHORITY_APPROVAL_PROOF">Approval evidence</option><option value="COPYRIGHT_TRANSFER">Copyright transfer</option><option value="INVOICE">Final invoice</option></select>
        <input type="email" name="email" aria-label="External recipient email" placeholder="Recipient email" required className="rounded border p-2" />
        <Button disabled={busy} type="submit">Issue submission link</Button>
      </form>
      {link && <label className="block text-sm">New submission link (shown only now)<input readOnly value={link} className="mt-2 w-full rounded border p-2" onFocus={e => e.currentTarget.select()} /></label>}
      {data?.accesses.map(a => <div className="flex flex-wrap items-center gap-3 text-sm" key={a.id}><span>{a.type} · {a.recipientEmail} · {a.revokedAt ? `Revoked ${a.revokedAt}` : `Expires ${a.expiresAt}`}</span>{!a.revokedAt && <Button variant="outline" disabled={busy} onClick={() => { setLink(""); void command({ command: "REVOKE", accessId: a.id }); }}>Revoke link</Button>}</div>)}
    </details>}
  </section>;
}

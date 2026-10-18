"use client";
import { useEffect, useState } from "react";
import { COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS } from "@/lib/upload-validation";

export default function ExternalCompletionDocumentPage() {
  const [token, setToken] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ type: string; recipientEmail: string; submissions: { id: string; originalFileName: string; status: string; reviewReason: string | null }[] } | null>(null);
  async function request(bearer: string, data: Record<string, unknown>) {
    const response = await fetch("/api/project-completion-documents/external", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` }, body: JSON.stringify(data), credentials: "omit", referrerPolicy: "no-referrer" });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
  }
  useEffect(() => { const bearer = location.hash.slice(1); void request(bearer, { command: "INFO" }).then(value => { setToken(bearer); setInfo(value); }).catch(e => setError(e.message)); }, []);
  async function upload(file: File) {
    setBusy(true); setError("");
    try {
      const metadata = { originalFileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size };
      const target = await request(token, { ...metadata, command: "PREPARE" });
      const result = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": metadata.mimeType }, body: file, credentials: "omit", referrerPolicy: "no-referrer" });
      if (!result.ok) throw new Error("Upload failed. Please try again.");
      await request(token, { ...metadata, command: "FINISH", storageKey: target.storageKey });
      setInfo(await request(token, { command: "INFO" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit document."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-semibold">Submit completion document</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {info && <><p>{info.type.replaceAll("_", " ")} · Link issued to {info.recipientEmail}</p><p>Your submission will be reviewed by the project manager. This link grants access only to this document request.</p>
      <label className="block">Document file<input aria-label="Document file" className="mt-2 block" type="file" disabled={busy || info.submissions.some(s => s.status === "SUBMITTED" || s.status === "ACCEPTED")} accept={COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS.map(x => `.${x}`).join(",")} onChange={e => { const file = e.currentTarget.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }} /></label>
      {busy && <p role="status">Uploading document…</p>}
      {info.submissions.map(s => <article key={s.id} className="rounded border p-3"><p>{s.originalFileName} · {s.status}</p>{s.reviewReason && <p>{s.reviewReason}</p>}</article>)}
    </>}
  </main>;
}

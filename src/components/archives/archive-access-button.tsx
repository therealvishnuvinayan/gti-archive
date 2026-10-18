"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Access = { users: Array<{ id: string; name: string | null; email: string }>; grantedUserIds: string[] };
export function ArchiveAccessButton({ fileId }: { fileId: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/archives/access?fileId=${encodeURIComponent(fileId)}`);
      if (!response.ok) throw new Error("Unable to load file access.");
      setAccess(await response.json());
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load file access."); }
    finally { setBusy(false); }
  }
  async function change(userId: string, granted: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/archives/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId, userId, granted }) });
      if (!response.ok) throw new Error("Unable to update file access.");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update file access."); }
    finally { setBusy(false); }
  }
  return <div className="relative">
    <Button type="button" variant="secondary" disabled={busy} onClick={() => access ? setAccess(null) : void load()}>File access</Button>
    {access && <div className="absolute right-0 z-20 w-72 space-y-3 rounded-xl border bg-white p-4 shadow-lg">
      <p className="text-sm">Allow these users to download this file. Category restrictions still apply.</p>
      {access.users.map(user => <label key={user.id} className="flex gap-2 text-sm">
        <input type="checkbox" disabled={busy} checked={access.grantedUserIds.includes(user.id)} onChange={event => void change(user.id, event.target.checked)} />{user.name || user.email}
      </label>)}
      <Button type="button" variant="secondary" onClick={() => setAccess(null)}>Close</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { changeBusinessRoleAction, changeBusinessStatusAction, changeTechnicalPrivilegesAction,
  loadAdministrationHistoryAction, transferDirectorAction } from "@/app/(dashboard)/users/v2-actions";
import { administrationLabel, businessRoleOptions, type AdministrationAccount, type AdministrationDirectory,
  type AdministrationDomain, type AdministrationHistory } from "@/lib/authorization/administration-types";

const fieldClass = "mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
type Edit = { account: AdministrationAccount; kind: "role" | "status" | "technical" | "transfer" };
const confirmations = { role: "CHANGE BUSINESS ROLE", status: "CHANGE ACCOUNT STATUS", technical: "CHANGE TECHNICAL PRIVILEGES", transfer: "TRANSFER DIRECTOR" };

export function AdministrationWorkspace({ domain, directory }: { domain: AdministrationDomain; directory: AdministrationDirectory }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [history, setHistory] = useState<{ account: AdministrationAccount; data: AdministrationHistory } | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const historyRequest = useRef(0);
  const business = domain === "business";

  function open(account: AdministrationAccount, kind: Edit["kind"]) {
    setEdit({ account, kind }); setReason(""); setConfirmation(""); setError(""); setNotice("");
    setValue(kind === "status" ? account.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"
      : kind === "technical" ? account.value ? "" : "TECHNICAL_ADMIN"
      : kind === "transfer" ? "SENIOR_PROJECT_MANAGER" : account.value ?? "");
  }

  async function showHistory(account: AdministrationAccount, older = false) {
    const request = ++historyRequest.current;
    setHistoryPending(true); setError("");
    try {
      const result = await loadAdministrationHistoryAction(domain, {
        userId: account.id, beforeVersion: older ? history?.data.nextBeforeVersion ?? null : null,
      });
      if (request !== historyRequest.current) return;
      if (!result.ok) { setError(result.message); return; }
      setHistory(previous => ({ account, data: { ...result.data,
        entries: older && previous?.account.id === account.id ? [...previous.data.entries, ...result.data.entries] : result.data.entries } }));
    } catch { setError("History could not be loaded. Refresh and try again."); }
    finally { if (request === historyRequest.current) setHistoryPending(false); }
  }

  async function submit() {
    if (!edit) return;
    setPending(true); setError("");
    try {
      const common = { userId: edit.account.id, expectedVersion: edit.account.version, reason, confirmation };
      const result = edit.kind === "role" ? await changeBusinessRoleAction({ ...common, businessRole: value || null })
        : edit.kind === "status" ? await changeBusinessStatusAction({ ...common, accountStatus: value })
        : edit.kind === "technical" ? await changeTechnicalPrivilegesAction({ ...common, technicalPrivileges: value ? [value] : [] })
        : await transferDirectorAction({ toUserId: edit.account.id, fromExpectedVersion: directory.actorVersion,
          toExpectedVersion: edit.account.version, outgoingBusinessRole: value || null, reason, confirmation });
      if (!result.ok) { setError(result.message); return; }
      setEdit(null); setHistory(null);
      historyRequest.current += 1; setHistoryPending(false);
      setSignInRequired(result.data.signInRequired);
      setNotice(result.data.status === "NO_CHANGE" ? "No change was needed. No audit entry was created."
        : `Change saved and audited. ${result.data.signInRequired ? "Your access changed. Sign in again to continue." : "The affected account must sign in again."}`);
      if (!result.data.signInRequired) router.refresh();
    } catch { setError("The response was interrupted. Refresh the directory and history before retrying to check whether the change was saved."); }
    finally { setPending(false); }
  }

  const impact = !edit ? "" : edit.kind === "role"
    ? businessRoleOptions.find(role => role.value === value)?.impact ?? "Removes business access. Existing project ownership, assignments and audit history remain unchanged."
    : edit.kind === "technical" ? value
      ? "Grants technical privilege administration. Business roles, project approvals and business data access are not granted."
      : "Removes technical administration access. Independently assigned business authority remains unchanged."
    : edit.kind === "status" ? value === "SUSPENDED"
      ? "Blocks sign-in and invalidates existing sessions. Ownership, work and audit history remain unchanged."
      : "Allows fresh sign-in with the account's current assignments. Previous sessions remain invalid."
    : "Transfers global business authority to this recipient atomically. You relinquish Director authority and receive the outgoing role selected below. Both accounts must sign in again. Technical privileges and existing work ownership remain unchanged.";
  const noChange = edit?.kind === "role" && (edit.account.value ?? "") === value;

  return <section className="space-y-6 p-6">
    <div className="space-y-2"><h1 className="text-2xl font-semibold">{business ? "Business Users" : "Technical Administration"}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{business
        ? "Manage business roles and permitted account status changes. Every change requires a reason, invalidates affected sessions and preserves ownership and history."
        : "Manage technical privileges for existing accounts. Technical authority does not grant business roles, project approvals or access to business data."}</p>
      <p className="text-sm text-muted-foreground">New-account invitations are not available yet.</p>
    </div>
    {notice && <div role="status" className="rounded-xl border border-line bg-white p-4">{notice}
      {signInRequired && <Link href="/sign-in" className="ml-2 underline">Sign in again</Link>}</div>}
    {error && !edit && <p role="alert" className="text-red-700">{error}</p>}
    {!signInRequired && <>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white"><table className="w-full text-left text-sm">
        <thead><tr><th scope="col" className="p-4">Account</th><th scope="col" className="p-4">{business ? "Business role" : "Technical privilege"}</th><th scope="col" className="p-4">Status</th><th scope="col" className="p-4">Actions</th></tr></thead>
        <tbody>{directory.accounts.map(account => <tr key={account.id} className="border-t border-line">
          <td className="p-4"><div className="font-medium">{account.name || account.email}</div><div className="text-muted-foreground">{account.email}</div></td>
          <td className="p-4">{administrationLabel(account.value)}</td><td className="p-4">{account.status === "UNASSIGNED" ? "Unassigned" : account.status === "ACTIVE" ? "Active" : "Suspended"}</td>
          <td className="p-4"><div className="flex flex-wrap items-center gap-2">
            {business ? account.value === "DIRECTOR" ? <span className="text-muted-foreground">Protected Director</span> : <>
              <Button variant="secondary" onClick={() => open(account, "role")}>Edit role</Button>
              {account.canChangeStatus ? <Button variant="secondary" onClick={() => open(account, "status")}>{account.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</Button>
                : <span className="text-xs text-muted-foreground">Status requires additional authority</span>}
            </> : <Button variant="secondary" onClick={() => open(account, "technical")}>{account.value ? "Revoke technical access" : "Grant technical access"}</Button>}
            <Button variant="secondary" disabled={historyPending} onClick={() => void showHistory(account)}>History</Button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <Button variant="secondary" disabled={pending || historyPending} onClick={() => { setEdit(null); setError(""); setHistory(null); router.refresh(); }}>Refresh directory</Button>
      {business && <div className="space-y-3 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Transfer Director authority</h2>
        <p className="text-sm text-muted-foreground">Only one active Director can exist. Use this separate workflow to hand over business authority.</p>
        <label className="block max-w-xl text-sm">New Director
          <select aria-label="New Director" className={fieldClass} value={recipient} onChange={event => setRecipient(event.target.value)}>
            <option value="">Select a recipient</option>{directory.accounts.filter(account => account.id !== directory.actorId && account.status !== "SUSPENDED").map(account =>
              <option key={account.id} value={account.id}>{account.name || account.email} · {account.email}</option>)}
          </select>
        </label>
        <Button disabled={!recipient} onClick={() => { const account = directory.accounts.find(row => row.id === recipient); if (account) open(account, "transfer"); }}>Review Director transfer</Button>
      </div>}
      {history && <section aria-label="Authorization history" className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">{business ? "Business" : "Technical"} history · {history.account.email}</h2>
        {!history.data.entries.length && <p>No relevant changes in this history page.</p>}
        {history.data.entries.map(entry => <article key={entry.version} className="space-y-1 border-t border-line pt-3 text-sm">
          <p className="font-medium">{entry.before} → {entry.after}</p><p>{entry.reason}</p>
          <p>By {entry.actor.name || entry.actor.email} ({entry.actor.email}) · <time dateTime={entry.timestamp}>{entry.timestamp}</time></p>
          <p className="break-all text-xs text-muted-foreground">Version {entry.version} · Change {entry.changeId}</p>
        </article>)}
        {history.data.nextBeforeVersion !== null && <Button variant="secondary" disabled={historyPending} onClick={() => void showHistory(history.account, true)}>Load older history</Button>}
      </section>}
    </>}
    <ConfirmationDialog isOpen={edit !== null} title={edit?.kind === "transfer" ? "Confirm Director transfer" : "Review account change"}
      description={edit ? `${edit.account.name || edit.account.email} · ${edit.account.email}` : ""}
      confirmLabel={edit?.kind === "transfer" ? "Transfer Director" : "Confirm change"} pendingLabel="Saving…" pending={pending}
      confirmDisabled={!edit || confirmation !== confirmations[edit.kind] || !reason.trim() || reason.length > 2000 || noChange}
      error={error} tone={edit?.kind === "transfer" || value === "SUSPENDED" ? "destructive" : "default"}
      onClose={() => { if (!pending) { setEdit(null); setError(""); } }} onConfirm={() => void submit()}>
      {edit && <div className="mb-5 max-h-[55vh] space-y-4 overflow-y-auto text-sm">
        <p>Current: {administrationLabel(edit.account.value)} · {edit.account.status} · Version {edit.account.version ?? "unassigned"}</p>
        {(edit.kind === "role" || edit.kind === "transfer") && <label className="block">{edit.kind === "transfer" ? "Your role after transfer" : "New business role"}
          <select aria-label={edit.kind === "transfer" ? "Your role after transfer" : "New business role"} className={fieldClass} disabled={pending} value={value} onChange={event => { setValue(event.target.value); setConfirmation(""); }}>
            <option value="">No business role</option>{businessRoleOptions.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>}
        {edit.kind === "status" && <p>New status: {value === "ACTIVE" ? "Active" : "Suspended"}</p>}
        {edit.kind === "technical" && <p>New privilege: {administrationLabel(value || null)}</p>}
        <div className="rounded-xl bg-slate-50 p-3"><p className="font-medium">Permission impact</p><p className="mt-1">{impact}</p>
          <p className="mt-2">Affected sessions will require a fresh sign-in. Existing work is not reassigned.</p></div>
        <label className="block">Reason (required)
          <textarea className={fieldClass} rows={3} maxLength={2000} disabled={pending} value={reason} onChange={event => setReason(event.target.value)} />
        </label>
        {edit.kind === "transfer" ? <label className="block">Type TRANSFER DIRECTOR to confirm
          <input className={fieldClass} autoComplete="off" disabled={pending} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        </label> : <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={pending}
          checked={confirmation === confirmations[edit.kind]} onChange={event => setConfirmation(event.target.checked ? confirmations[edit.kind] : "")} />
          I confirm this change for {edit.account.email} and have reviewed its consequences.</label>}
        <Button variant="secondary" disabled={pending} onClick={() => { setEdit(null); setError(""); router.refresh(); }}>Discard and refresh</Button>
      </div>}
    </ConfirmationDialog>
  </section>;
}

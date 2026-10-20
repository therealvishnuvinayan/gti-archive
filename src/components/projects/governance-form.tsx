"use client";

import { useActionState, type ReactNode } from "react";
import { projectGovernanceAction } from "@/app/(dashboard)/projects/governance-actions";

export function GovernanceForm({ children, submitLabel }: { children: ReactNode; submitLabel: string }) {
  const [state, action, pending] = useActionState(projectGovernanceAction, {});
  return <form action={action} className="space-y-4">
    <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">{children}
      <button type="submit" className="rounded-lg bg-emerald-800 px-4 py-2 text-white">{pending ? "Saving…" : submitLabel}</button>
    </fieldset>
    {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    {state.message && <p role="status" className="text-emerald-800">{state.message}</p>}
  </form>;
}

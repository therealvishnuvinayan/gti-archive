"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlexibleDialog } from "./flexible-dialog";
import { TaskSelect, TaskTextarea } from "@/components/tasks/tasker-form-controls";
import type { ProjectReopeningView } from "@/lib/project-reopening";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "@/lib/project-workflow";

function WorkflowSnapshot({ value }: { value: ProjectReopeningView["history"][number]["snapshot"] }) {
  const snapshot = value as { completedAt?: string; stages?: Array<{ stageKey: string; status: string; completedAt?: string }>; milestones?: Array<{ name: string; status: string; completedAt?: string }>; productionUnits?: Array<{ id: string; sourceAttachmentId: string; sourceAttachment: { originalFileName: string }; approvalSteps: Array<{ id: string; sequence: number; recipientName?: string; status: string }>; handover?: { recipientName: string; sentAt?: string } | null }> };
  const label = (status: string) => status.toLowerCase().replaceAll("_", " ");
  return <details className="mt-3"><summary className="cursor-pointer font-medium text-[#176d42]">View completed workflow</summary><div className="mt-3 grid gap-4">
    {snapshot.completedAt && <p>Completed {new Date(snapshot.completedAt).toLocaleString()}</p>}
    <ul className="space-y-1">{snapshot.stages?.map((stage) => <li key={stage.stageKey}>{PROJECT_WORKFLOW_STAGE_DEFINITIONS.find((s) => s.key === stage.stageKey)?.name ?? stage.stageKey} · {label(stage.status)}</li>)}{snapshot.milestones?.map((milestone, index) => <li key={index}>{milestone.name} · {label(milestone.status)}</li>)}</ul>
    {snapshot.productionUnits?.map((unit) => <div key={unit.id} className="rounded-lg bg-[#f5f8f5] p-3"><a className="font-medium text-[#176d42] underline" href={`/api/project-assets/${unit.sourceAttachmentId}/download`}>{unit.sourceAttachment.originalFileName}</a><ul className="mt-2 space-y-1">{unit.approvalSteps.map((step) => <li key={step.id}>Approval {step.sequence}{step.recipientName ? ` · ${step.recipientName}` : ""} · {label(step.status)}</li>)}</ul>{unit.handover && <p className="mt-2">Handover to {unit.handover.recipientName}{unit.handover.sentAt ? ` · ${new Date(unit.handover.sentAt).toLocaleDateString()}` : ""}</p>}</div>)}
  </div></details>;
}

export function ProjectReopeningWorkspace({ view }: { view: ProjectReopeningView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetRef, setTargetRef] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const structured = view.projectType === "STRUCTURED";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/projects/reopening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectType: view.projectType, projectId: view.projectId, targetRef, reason, expectedUpdatedAt: view.expectedUpdatedAt }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to reopen the project.");
      setOpen(false); router.push(body.href); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to reopen the project."); }
    finally { setBusy(false); }
  }
  return <section id="project-reopening" className="mx-auto my-6 w-full max-w-[1420px] rounded-[22px] border border-[#dfe6df] bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Project reopening</h2><p className="mt-1 text-sm text-[#647067]">The project owner can resume completed work. Previous files, decisions and completion history remain available.</p></div>{view.canReopen && <Button onClick={() => { setOpen(true); setError(""); }}><RotateCcw className="mr-2 size-4" />Reopen project</Button>}</div>
    {view.history.length > 0 && <ol className="mt-5 space-y-3">{view.history.map((item) => <li key={item.id} className="rounded-xl border border-[#e1e7e1] p-4 text-sm"><p className="font-semibold">Resumed {item.targetLabel}</p><p className="mt-1 text-[#647067]">{item.actor} · {new Date(item.createdAt).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words">{item.reason}</p><WorkflowSnapshot value={item.snapshot} /><a className="mt-3 inline-block text-xs text-[#647067] underline" href={`/api/projects/reopening?${new URLSearchParams({ projectType: view.projectType, projectId: view.projectId, historyId: item.id })}`}>Export complete history record</a></li>)}</ol>}
    <FlexibleDialog open={open} title="Reopen project" description={view.name} onClose={() => { if (!busy) setOpen(false); }}>
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-2"><span className="text-sm font-medium">{structured ? "Resume from stage" : "Resume milestone"}</span><TaskSelect label={structured ? "Resume from stage" : "Resume milestone"} value={targetRef} onChange={setTargetRef} options={view.targets} required disabled={busy} /></div>
        <p className="rounded-xl bg-[#eef6ef] p-4 text-sm text-[#365740]">{structured ? targetRef === "7" ? "Stage 7 will reopen for a new sample review. Existing production approvals and handovers remain in effect." : "The selected stage will reopen, earlier stages will stay completed, and later stages will lock until reached again. Production files will require a fresh approval and handover cycle. Previous approvals and issued snapshots remain in history." : "Only the selected milestone will reopen. Other milestones and their completion history will stay unchanged."}</p>
        <div className="grid gap-2"><label htmlFor="project-reopening-reason" className="text-sm font-medium">Reason for reopening</label><TaskTextarea id="project-reopening-reason" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={4000} rows={4} disabled={busy} placeholder="Describe the changes required." /></div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !targetRef || !reason.trim()}>{busy ? "Reopening…" : "Reopen project"}</Button></div>
      </form>
    </FlexibleDialog>
  </section>;
}

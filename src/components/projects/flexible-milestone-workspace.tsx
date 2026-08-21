"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Loader2, Pencil, RotateCcw, UserRound } from "lucide-react";

import {
  setFlexibleMilestoneCompletedAction,
  updateFlexibleMilestoneAction,
} from "@/app/(dashboard)/projects/flexible/actions";
import { MotionItem, MotionSection } from "@/components/motion/motion-primitives";
import { FlexibleMilestoneDialog, type FlexibleMilestoneFormValue } from "@/components/projects/flexible-milestone-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-editor";
import type { FlexibleMilestoneRecord, FlexibleProjectDetailRecord } from "@/lib/flexible-projects";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function FlexibleMilestoneWorkspace({
  project,
  milestone,
}: {
  project: FlexibleProjectDetailRecord;
  milestone: FlexibleMilestoneRecord;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  function toggleCompleted() {
    startTransition(async () => {
      const completed = milestone.status !== "COMPLETED";
      const result = await setFlexibleMilestoneCompletedAction(project.id, milestone.id, completed);
      if ("error" in result) {
        showErrorToast(result.error);
        return;
      }
      showSuccessToast(completed ? "Milestone completed." : "Milestone reopened.");
      router.refresh();
    });
  }

  async function save(value: FlexibleMilestoneFormValue) {
    const result = await updateFlexibleMilestoneAction(project.id, milestone.id, value);
    if ("error" in result) return result;
    setEditOpen(false);
    showSuccessToast("Milestone updated.");
    router.refresh();
    return {};
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] space-y-5 pb-4">
      <MotionSection>
        <Button asChild variant="ghost" className="h-10 rounded-[12px] px-2.5 text-[13px] text-[#3e4941]">
          <Link href={`/projects/flexible/${project.slug}`}><ArrowLeft className="size-4" /> Project Timeline</Link>
        </Button>
      </MotionSection>

      <MotionItem y={8}>
        <Card className="overflow-hidden rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.06)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-[800] uppercase tracking-[0.15em] text-[#2d7b52]">{String(milestone.order).padStart(2, "0")} · {milestone.category}</p>
                <h1 className="mt-2 text-[30px] font-[800] leading-[1.08] tracking-[-0.045em] text-[#0f1411] sm:text-[39px]">{milestone.name}</h1>
                {milestone.description ? <RichTextContent value={milestone.description} className="mt-3 max-w-3xl text-[13px] leading-6 text-[#68716a] sm:text-[14px]" /> : <p className="mt-3 text-[13px] text-[#8b948d]">No milestone notes added.</p>}
              </div>
              <Badge className={`self-start px-4 py-2 text-[11px] ${milestone.status === "COMPLETED" ? "border-[#cce5d3] bg-[#edf8f0] text-[#23744a]" : "border-[#dfe4df] bg-[#f7f8f7] text-[#606a62]"}`} variant="outline">
                <span className="mr-2 size-1.5 rounded-full bg-current" />{milestone.status === "COMPLETED" ? "Completed" : "Pending"}
              </Badge>
            </div>

            <div className="mt-7 grid gap-3 md:grid-cols-3">
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4"><p className="flex items-center gap-2 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]"><UserRound className="size-3.5 text-[#397b57]" /> Responsible</p><p className="mt-2 text-[14px] font-[750] text-[#28322b]">{milestone.responsibleUser?.name ?? "Not assigned"}</p></div>
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4"><p className="flex items-center gap-2 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]"><CalendarDays className="size-3.5 text-[#397b57]" /> Deadline</p><p className="mt-2 text-[14px] font-[750] text-[#28322b]">{formatDate(milestone.deadline)}</p></div>
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4"><p className="text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]">Project progress</p><p className="mt-2 text-[14px] font-[750] text-[#28322b]">{project.progress}% complete</p></div>
            </div>

            {project.canManageMilestones ? (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#e8ece8] pt-5">
                <Button type="button" onClick={toggleCompleted} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : milestone.status === "COMPLETED" ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
                  {milestone.status === "COMPLETED" ? "Reopen Milestone" : "Mark as Completed"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditOpen(true)} disabled={pending}><Pencil className="size-4" /> Edit Milestone</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </MotionItem>

      {editOpen ? <FlexibleMilestoneDialog mode="edit" users={project.participantOptions} initialMilestone={milestone} onClose={() => setEditOpen(false)} onSave={save} /> : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Ellipsis,
  Milestone as MilestoneIcon,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  createFlexibleMilestoneAction,
  deleteFlexibleMilestoneAction,
  duplicateFlexibleMilestoneAction,
  moveFlexibleMilestoneAction,
  setFlexibleMilestoneCompletedAction,
  updateFlexibleMilestoneAction,
} from "@/app/(dashboard)/projects/flexible/actions";
import { MotionItem, MotionSection } from "@/components/motion/motion-primitives";
import { FlexibleMilestoneDialog, type FlexibleMilestoneFormValue } from "@/components/projects/flexible-milestone-dialog";
import { FlexibleProjectDialog } from "@/components/projects/flexible-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichTextContent } from "@/components/ui/rich-text-editor";
import type {
  FlexibleMilestoneFieldErrors,
  FlexibleMilestoneMutationResult,
  FlexibleMilestoneRecord,
  FlexibleProjectDetailRecord,
  FlexibleProjectUserOption,
} from "@/lib/flexible-projects";
import { uploadFlexibleMilestoneAttachments } from "@/lib/flexible-milestone-upload-client";
import { formatProjectPriority } from "@/lib/project-priority";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast";

type MilestoneDialogState = { mode: "add" } | { mode: "edit"; milestoneId: string } | null;

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function visualState(milestone: FlexibleMilestoneRecord, index: number, milestones: FlexibleMilestoneRecord[]) {
  if (milestone.status === "COMPLETED") return "completed" as const;
  const firstPendingIndex = milestones.findIndex((item) => item.status !== "COMPLETED");
  if (milestone.deadline && new Date(milestone.deadline).getTime() < Date.now()) return "attention" as const;
  return index === firstPendingIndex ? "current" as const : "upcoming" as const;
}

function markerStyles(state: ReturnType<typeof visualState>) {
  if (state === "completed") return "border-[#278052] bg-[#edf8f0] text-[#176d42] shadow-[0_0_0_4px_#f7faf6]";
  if (state === "current") return "border-[#4f9670] bg-white text-[#27764d] shadow-[0_0_0_5px_#eaf3ed]";
  if (state === "attention") return "border-[#df7108] bg-[#fffaf4] text-[#d85f00] shadow-[0_0_0_4px_#fff8ef]";
  return "border-[#cbd2cc] bg-white text-[#626b64] shadow-[0_0_0_4px_#f6f8f5]";
}

function cardStyles(state: ReturnType<typeof visualState>) {
  if (state === "completed") return "border-[#d9e7dd] bg-[linear-gradient(90deg,#f4faf5,#fbfcfb)]";
  if (state === "current") return "border-[#2d8758] bg-white shadow-[0_12px_30px_rgba(34,104,67,0.08)] ring-1 ring-[#2d8758]/10";
  if (state === "attention") return "border-[#efd6bb] bg-[linear-gradient(90deg,#fffaf5,#fff)]";
  return "border-[#e0e5e0] bg-white";
}

export function FlexibleProjectDetailWorkspace({
  project,
  userOptions,
  currentUserId,
}: {
  project: FlexibleProjectDetailRecord;
  userOptions: FlexibleProjectUserOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogState, setDialogState] = useState<MilestoneDialogState>(null);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [deleteMilestone, setDeleteMilestone] = useState<FlexibleMilestoneRecord | null>(null);
  const editingMilestone = dialogState?.mode === "edit"
    ? project.milestones.find((milestone) => milestone.id === dialogState.milestoneId)
    : undefined;

  function runAction(label: string, action: () => Promise<FlexibleMilestoneMutationResult>) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        showErrorToast(result.error);
        return;
      }
      showSuccessToast(label);
      router.refresh();
    });
  }

  async function saveMilestone(value: FlexibleMilestoneFormValue) {
    const { files, ...input } = value;
    const result = dialogState?.mode === "edit"
      ? await updateFlexibleMilestoneAction(project.id, dialogState.milestoneId, input)
      : await createFlexibleMilestoneAction(project.id, input);
    if (!("error" in result)) {
      if (files.length) {
        try {
          await uploadFlexibleMilestoneAttachments(project.id, result.milestoneId, files);
        } catch (error) {
          showWarningToast(
            "Milestone saved, but an attachment could not be uploaded.",
            error instanceof Error ? error.message : "The milestone was saved without that file.",
          );
        }
      }
      setDialogState(null);
      showSuccessToast(dialogState?.mode === "edit" ? "Milestone updated." : "Milestone added.");
      router.refresh();
      return {};
    }
    return { error: result.error, fieldErrors: result.fieldErrors as FlexibleMilestoneFieldErrors | undefined };
  }

  return (
    <section className="mx-auto w-full max-w-[1220px] space-y-5 pb-4">
      <MotionSection>
        <Button asChild variant="ghost" className="h-10 rounded-[12px] px-2.5 text-[13px] text-[#3e4941]">
          <Link href="/projects?view=flexible"><ArrowLeft className="size-4" /> Flexible Projects</Link>
        </Button>
      </MotionSection>

      <MotionItem y={8}>
        <Card className="overflow-hidden rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.06)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="border-[#d5e8da] bg-[#eef8f1] text-[#26784e]">{project.scope === "INTERNAL" ? "Internal" : "External"}</Badge>
              <Badge variant="muted" className="border-[#dfe5df] bg-[#f7f8f7] text-[#414b44]"><span className={`mr-1.5 size-1.5 rounded-full ${project.status === "COMPLETED" ? "bg-[#718078]" : "bg-[#2f8d5d]"}`} />{project.status === "COMPLETED" ? "Completed" : "Active"}</Badge>
              <Badge variant="outline" className="text-[#5d675f]">{formatProjectPriority(project.priority)} priority</Badge>
              {project.canManageProject ? <Button type="button" variant="outline" size="sm" onClick={() => setEditProjectOpen(true)} className="ml-auto"><Pencil className="size-3.5" /> Edit Project</Button> : null}
            </div>

            <h1 className="mt-5 max-w-4xl text-[31px] font-[800] leading-[1.08] tracking-[-0.045em] text-[#0f1411] sm:text-[40px] lg:text-[46px]">{project.name}</h1>
            {project.description ? <RichTextContent value={project.description} className="mt-4 max-w-4xl text-[14px] leading-6 text-[#677069] sm:text-[16px] sm:leading-7" /> : <p className="mt-4 text-[14px] text-[#8b948d]">No description added.</p>}

            <div className="mt-7 rounded-[20px] border border-[#dce3dc] bg-[#fbfcfb] p-5 shadow-[0_8px_24px_rgba(23,39,28,0.03)] sm:p-6">
              <div className="flex items-center justify-between gap-5"><span className="text-[14px] font-[700] text-[#29332c]">Project progress</span><span className="text-[25px] font-[800] tracking-[-0.035em] text-[#176d42]">{project.progress}%</span></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e6ebe6]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#329462,#176b43)]" style={{ width: `${project.progress}%` }} /></div>
              <p className="mt-3 text-[12px] text-[#69726b] sm:text-[13px]">{project.completedMilestones} of {project.totalMilestones} milestones completed</p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-4 sm:divide-x sm:divide-[#e0e5e0]">
              <div className="flex items-center gap-3 sm:px-4 sm:first:pl-0"><UserRound className="size-4.5 shrink-0 text-[#286e49]" /><p className="text-[12px] text-[#626c64]">Owner: <span className="font-[700] text-[#253028]">{project.owner.name}</span></p></div>
              <div className="flex items-center gap-3 sm:px-4"><UsersRound className="size-4.5 shrink-0 text-[#286e49]" /><p className="text-[12px] font-[700] text-[#253028]">{project.collaborators.length} collaborators</p></div>
              <div className="flex items-center gap-3 sm:px-4"><CalendarDays className="size-4.5 shrink-0 text-[#286e49]" /><p className="text-[12px] text-[#626c64]">Deadline: <span className="font-[700] text-[#253028]">{formatDate(project.deadline)}</span></p></div>
              <div className="flex items-center gap-3 sm:px-4"><MilestoneIcon className="size-4.5 shrink-0 text-[#286e49]" /><p className="text-[12px] font-[700] text-[#253028]">{project.milestones.length} milestones</p></div>
            </div>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionItem y={8}>
        <Card className="rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.055)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-[23px] font-[780] tracking-[-0.035em] text-[#111712] sm:text-[27px]">Project Timeline</h2><p className="mt-1 text-[13px] text-[#6e7770]">Select a milestone to open it.</p></div>
              {project.canManageMilestones ? <Button type="button" size="icon" onClick={() => setDialogState({ mode: "add" })} className="size-12 shrink-0 rounded-[15px]" aria-label="Add milestone"><Plus className="size-5" /></Button> : null}
            </div>

            {project.milestones.length ? (
              <div className="relative mt-7">
                {project.milestones.length > 1 ? <span className="absolute bottom-8 left-[23px] top-8 w-px bg-[#d8ded8] sm:left-[25px]" aria-hidden="true" /> : null}
                <div className="space-y-3.5">
                  {project.milestones.map((milestone, index) => {
                    const state = visualState(milestone, index, project.milestones);
                    return (
                      <div key={milestone.id} className="relative pl-[62px] sm:pl-[76px]">
                        <span className={`absolute left-0 top-1/2 z-[1] grid size-12 -translate-y-1/2 place-items-center rounded-full border-2 text-[13px] font-[780] sm:size-[52px] ${markerStyles(state)}`}>
                          {state === "completed" ? <Check className="size-5" strokeWidth={2.4} /> : state === "attention" ? <TriangleAlert className="size-5" /> : String(milestone.order).padStart(2, "0")}
                        </span>
                        <div className={`flex min-w-0 items-stretch overflow-hidden rounded-[17px] border transition hover:shadow-[0_10px_26px_rgba(23,39,28,0.055)] ${cardStyles(state)}`}>
                          <Link href={`/projects/flexible/${project.slug}/milestones/${milestone.id}`} className="min-w-0 flex-1 px-4 py-4 text-left sm:px-5">
                            <p className={`text-[10px] font-[800] uppercase tracking-[0.14em] ${state === "attention" ? "text-[#d66208]" : state === "upcoming" ? "text-[#747d76]" : "text-[#29754e]"}`}>{String(milestone.order).padStart(2, "0")} · {milestone.category}</p>
                            <h3 className="mt-1.5 text-[15px] font-[750] leading-5 text-[#202721] sm:text-[16px]">{milestone.name}</h3>
                            <p className="mt-1 text-[12px] text-[#687069]">{milestone.status === "COMPLETED" ? "Completed" : "Pending"} · {formatDate(milestone.deadline)}</p>
                          </Link>
                          {project.canManageMilestones ? (
                            <div className="flex shrink-0 items-start px-2 py-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-9 rounded-[11px] text-[#667068]" aria-label={`Actions for ${milestone.name}`} disabled={pending}><Ellipsis className="size-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[205px] rounded-[16px]">
                                  <DropdownMenuItem onSelect={() => setDialogState({ mode: "edit", milestoneId: milestone.id })}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => runAction(milestone.status === "COMPLETED" ? "Milestone reopened." : "Milestone completed.", () => setFlexibleMilestoneCompletedAction(project.id, milestone.id, milestone.status !== "COMPLETED"))}><CheckCircle2 className="size-4" /> {milestone.status === "COMPLETED" ? "Reopen Milestone" : "Mark as Completed"}</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => runAction("Milestone duplicated.", () => duplicateFlexibleMilestoneAction(project.id, milestone.id))}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
                                  <DropdownMenuItem disabled={index === 0} onSelect={() => runAction("Milestone moved up.", () => moveFlexibleMilestoneAction(project.id, milestone.id, "up"))}><ArrowUp className="size-4" /> Move Up</DropdownMenuItem>
                                  <DropdownMenuItem disabled={index === project.milestones.length - 1} onSelect={() => runAction("Milestone moved down.", () => moveFlexibleMilestoneAction(project.id, milestone.id, "down"))}><ArrowDown className="size-4" /> Move Down</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteMilestone(milestone)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-[18px] border border-dashed border-[#cbd5cc] bg-[#fafcf9] px-6 py-12 text-center">
                <CheckCircle2 className="mx-auto size-8 text-[#80a18c]" />
                <p className="mt-3 text-[14px] font-[700] text-[#3c4740]">No milestones yet</p>
                <p className="mt-1 text-[12px] text-[#788179]">Add the first milestone to start tracking progress.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </MotionItem>

      {dialogState ? <FlexibleMilestoneDialog mode={dialogState.mode} users={project.participantOptions} canUploadAttachments={project.canUploadAttachments} initialMilestone={editingMilestone} onClose={() => setDialogState(null)} onSave={saveMilestone} /> : null}
      {editProjectOpen ? (
        <FlexibleProjectDialog
          mode="edit"
          users={userOptions}
          currentUserId={currentUserId}
          initialProject={{
            id: project.id,
            name: project.name,
            description: project.description,
            ownerId: project.owner.id,
            collaboratorIds: project.collaboratorIds,
            deadline: project.deadline,
            priority: project.priority === "URGENT" ? "HIGH" : project.priority,
            scope: project.scope,
          }}
          onClose={() => setEditProjectOpen(false)}
        />
      ) : null}
      <ConfirmationDialog isOpen={Boolean(deleteMilestone)} title="Delete milestone?" description={deleteMilestone ? `Delete “${deleteMilestone.name}”? The remaining milestone order will be updated automatically.` : ""} confirmLabel="Delete Milestone" pending={pending} tone="destructive" onClose={() => setDeleteMilestone(null)} onConfirm={() => { if (!deleteMilestone) return; const milestone = deleteMilestone; setDeleteMilestone(null); runAction("Milestone deleted.", () => deleteFlexibleMilestoneAction(project.id, milestone.id)); }} />
    </section>
  );
}

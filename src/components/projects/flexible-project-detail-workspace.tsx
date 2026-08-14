"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
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
  ArrowDown,
  ArrowUp,
} from "lucide-react";

import { MotionItem, MotionSection } from "@/components/motion/motion-primitives";
import {
  FlexibleMilestoneDialog,
  type FlexibleMilestoneFormValue,
} from "@/components/projects/flexible-milestone-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  FlexibleMilestoneFixture,
  FlexibleProjectFixture,
} from "@/lib/flexible-project-ui-fixtures";
import { showInfoToast, showSuccessToast } from "@/lib/toast";

type PrototypeMilestone = FlexibleMilestoneFixture & {
  prototypeOnly?: boolean;
};

type MilestoneDialogState =
  | { mode: "add" }
  | { mode: "edit"; milestoneId: string }
  | null;

function formatDateValue(value: string, fallback: string) {
  if (!value) return fallback;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function reindexMilestones(milestones: PrototypeMilestone[]) {
  return milestones.map((milestone, index) => ({ ...milestone, order: index + 1 }));
}

function markerStyles(state: FlexibleMilestoneFixture["visualState"]) {
  if (state === "completed") {
    return "border-[#278052] bg-[#edf8f0] text-[#176d42] shadow-[0_0_0_4px_#f7faf6]";
  }
  if (state === "current") {
    return "border-[#4f9670] bg-white text-[#27764d] shadow-[0_0_0_5px_#eaf3ed]";
  }
  if (state === "attention") {
    return "border-[#df7108] bg-[#fffaf4] text-[#d85f00] shadow-[0_0_0_4px_#fff8ef]";
  }
  return "border-[#cbd2cc] bg-white text-[#626b64] shadow-[0_0_0_4px_#f6f8f5]";
}

function cardStyles(state: FlexibleMilestoneFixture["visualState"]) {
  if (state === "completed") {
    return "border-[#d9e7dd] bg-[linear-gradient(90deg,#f4faf5,#fbfcfb)]";
  }
  if (state === "current") {
    return "border-[#2d8758] bg-white shadow-[0_12px_30px_rgba(34,104,67,0.08)] ring-1 ring-[#2d8758]/10";
  }
  if (state === "attention") {
    return "border-[#efd6bb] bg-[linear-gradient(90deg,#fffaf5,#fff)]";
  }
  return "border-[#e0e5e0] bg-white";
}

export function FlexibleProjectDetailWorkspace({
  project,
}: {
  project: FlexibleProjectFixture;
}) {
  const router = useRouter();
  const [milestones, setMilestones] = useState<PrototypeMilestone[]>(() =>
    project.milestones.map((milestone) => ({ ...milestone })),
  );
  const [dialogState, setDialogState] = useState<MilestoneDialogState>(null);
  const editingMilestone =
    dialogState?.mode === "edit"
      ? milestones.find((milestone) => milestone.id === dialogState.milestoneId)
      : undefined;

  function openMilestone(milestone: PrototypeMilestone) {
    if (milestone.prototypeOnly) {
      showInfoToast(
        "Temporary milestone",
        "This local milestone has no saved workspace route in the UI prototype.",
      );
      return;
    }

    router.push(`/projects/flexible/${project.slug}/milestones/${milestone.id}`);
  }

  function saveMilestone(value: FlexibleMilestoneFormValue) {
    if (dialogState?.mode === "edit") {
      setMilestones((current) =>
        current.map((milestone) =>
          milestone.id === dialogState.milestoneId
            ? {
                ...milestone,
                name: value.name,
                category: value.category,
                responsible: value.responsible,
                approvalRequired: value.approvalRequired,
                description: value.description,
                dateLabel: formatDateValue(value.deadline, milestone.dateLabel),
              }
            : milestone,
        ),
      );
      showSuccessToast("Milestone updated locally");
    } else {
      setMilestones((current) => [
        ...current,
        {
          id: `local-milestone-${Date.now()}`,
          order: current.length + 1,
          category: value.category,
          name: value.name,
          statusLabel: "Upcoming",
          dateLabel: formatDateValue(value.deadline, "Date not set"),
          visualState: "upcoming",
          responsible: value.responsible,
          approvalRequired: value.approvalRequired,
          description: value.description,
          prototypeOnly: true,
        },
      ]);
      showSuccessToast("Milestone added locally", "It will disappear when this page is refreshed.");
    }

    setDialogState(null);
  }

  function duplicateMilestone(id: string) {
    setMilestones((current) => {
      const index = current.findIndex((milestone) => milestone.id === id);
      if (index < 0) return current;

      const copy: PrototypeMilestone = {
        ...current[index],
        id: `local-copy-${Date.now()}`,
        name: `${current[index].name} Copy`,
        statusLabel: "Upcoming",
        visualState: "upcoming",
        prototypeOnly: true,
      };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return reindexMilestones(next);
    });
    showSuccessToast("Milestone duplicated locally");
  }

  function moveMilestone(id: string, direction: -1 | 1) {
    setMilestones((current) => {
      const index = current.findIndex((milestone) => milestone.id === id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;

      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return reindexMilestones(next);
    });
  }

  function deleteMilestone(id: string) {
    setMilestones((current) =>
      reindexMilestones(current.filter((milestone) => milestone.id !== id)),
    );
    showInfoToast("Milestone removed locally", "Refresh the page to restore the fixture timeline.");
  }

  return (
    <section className="mx-auto w-full max-w-[1220px] space-y-5 pb-4">
      <MotionSection>
        <Button
          asChild
          variant="ghost"
          className="h-10 rounded-[12px] px-2.5 text-[13px] text-[#3e4941]"
        >
          <Link href="/projects?view=flexible">
            <ArrowLeft className="size-4" /> Flexible Projects
          </Link>
        </Button>
      </MotionSection>

      <MotionItem y={8}>
        <Card className="overflow-hidden rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.06)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="border-[#d5e8da] bg-[#eef8f1] text-[#26784e]">
                {project.type}
              </Badge>
              <Badge variant="muted" className="border-[#dfe5df] bg-[#f7f8f7] text-[#414b44]">
                <span className="mr-1.5 size-1.5 rounded-full bg-[#2f8d5d]" />
                {project.status}
              </Badge>
              <span className="ml-auto rounded-full bg-[#f4f6f3] px-3 py-1 text-[10px] font-[750] uppercase tracking-[0.12em] text-[#6c766e]">
                UI prototype
              </span>
            </div>

            <h1 className="mt-5 max-w-4xl text-[31px] font-[800] leading-[1.08] tracking-[-0.045em] text-[#0f1411] sm:text-[40px] lg:text-[46px]">
              {project.name}
            </h1>
            <RichTextContent value={project.description} className="mt-4 max-w-4xl text-[14px] leading-6 text-[#677069] sm:text-[16px] sm:leading-7" />

            <div className="mt-7 rounded-[20px] border border-[#dce3dc] bg-[#fbfcfb] p-5 shadow-[0_8px_24px_rgba(23,39,28,0.03)] sm:p-6">
              <div className="flex items-center justify-between gap-5">
                <span className="text-[14px] font-[700] text-[#29332c]">Project progress</span>
                <span className="text-[25px] font-[800] tracking-[-0.035em] text-[#176d42]">
                  {project.progress}%
                </span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e6ebe6]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#329462,#176b43)]"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
              <p className="mt-3 text-[12px] text-[#69726b] sm:text-[13px]">
                {project.completedMilestones} of {project.totalMilestones} milestones completed or skipped
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:divide-x sm:divide-[#e0e5e0]">
              <div className="flex items-center gap-3 sm:px-4 sm:first:pl-0">
                <UserRound className="size-4.5 shrink-0 text-[#286e49]" />
                <p className="text-[12px] text-[#626c64]">
                  Owner: <span className="font-[700] text-[#253028]">{project.owner.name}</span>
                </p>
              </div>
              <div className="flex items-center gap-3 sm:px-4">
                <CalendarDays className="size-4.5 shrink-0 text-[#286e49]" />
                <p className="text-[12px] text-[#626c64]">
                  Deadline: <span className="font-[700] text-[#253028]">{project.deadline}</span>
                </p>
              </div>
              <div className="flex items-center gap-3 sm:px-4">
                <MilestoneIcon className="size-4.5 shrink-0 text-[#286e49]" />
                <p className="text-[12px] font-[700] text-[#253028]">
                  {milestones.length} milestones
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionItem y={8}>
        <Card className="rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.055)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[23px] font-[780] tracking-[-0.035em] text-[#111712] sm:text-[27px]">
                  Project Timeline
                </h2>
                <p className="mt-1 text-[13px] text-[#6e7770]">Select a milestone to open it.</p>
              </div>
              <Button
                type="button"
                size="icon"
                onClick={() => setDialogState({ mode: "add" })}
                className="size-12 shrink-0 rounded-[15px]"
                aria-label="Add milestone"
              >
                <Plus className="size-5" />
              </Button>
            </div>

            <div className="relative mt-7">
              {milestones.length > 1 ? (
                <span className="absolute bottom-8 left-[23px] top-8 w-px bg-[#d8ded8] sm:left-[25px]" aria-hidden="true" />
              ) : null}

              <div className="space-y-3.5">
                {milestones.map((milestone, index) => (
                  <div key={milestone.id} className="relative pl-[62px] sm:pl-[76px]">
                    <span
                      className={`absolute left-0 top-1/2 z-[1] grid size-12 -translate-y-1/2 place-items-center rounded-full border-2 text-[13px] font-[780] sm:size-[52px] ${markerStyles(milestone.visualState)}`}
                    >
                      {milestone.visualState === "completed" ? (
                        <Check className="size-5" strokeWidth={2.4} />
                      ) : milestone.visualState === "attention" ? (
                        <TriangleAlert className="size-5" />
                      ) : (
                        String(milestone.order).padStart(2, "0")
                      )}
                    </span>

                    <div className={`flex min-w-0 items-stretch overflow-hidden rounded-[17px] border transition hover:shadow-[0_10px_26px_rgba(23,39,28,0.055)] ${cardStyles(milestone.visualState)}`}>
                      <button
                        type="button"
                        onClick={() => openMilestone(milestone)}
                        className="min-w-0 flex-1 px-4 py-4 text-left sm:px-5"
                      >
                        <p className={`text-[10px] font-[800] uppercase tracking-[0.14em] ${milestone.visualState === "attention" ? "text-[#d66208]" : milestone.visualState === "upcoming" ? "text-[#747d76]" : "text-[#29754e]"}`}>
                          {String(milestone.order).padStart(2, "0")} · {milestone.category}
                        </p>
                        <h3 className="mt-1.5 text-[15px] font-[750] leading-5 text-[#202721] sm:text-[16px]">
                          {milestone.name}
                        </h3>
                        <p className="mt-1 text-[12px] text-[#687069]">
                          {milestone.statusLabel} · {milestone.dateLabel}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-start px-2 py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 rounded-[11px] text-[#667068]"
                              aria-label={`Actions for ${milestone.name}`}
                            >
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[180px] rounded-[16px]">
                            <DropdownMenuItem
                              onSelect={() => setDialogState({ mode: "edit", milestoneId: milestone.id })}
                            >
                              <Pencil className="size-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => duplicateMilestone(milestone.id)}>
                              <Copy className="size-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === 0}
                              onSelect={() => moveMilestone(milestone.id, -1)}
                            >
                              <ArrowUp className="size-4" /> Move Up
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === milestones.length - 1}
                              onSelect={() => moveMilestone(milestone.id, 1)}
                            >
                              <ArrowDown className="size-4" /> Move Down
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => deleteMilestone(milestone.id)}>
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {milestones.length === 0 ? (
              <div className="mt-7 rounded-[18px] border border-dashed border-[#cbd5cc] bg-[#fafcf9] px-6 py-12 text-center">
                <CheckCircle2 className="mx-auto size-8 text-[#80a18c]" />
                <p className="mt-3 text-[14px] font-[700] text-[#3c4740]">No milestones in this local view</p>
                <p className="mt-1 text-[12px] text-[#788179]">Refresh to restore the fixtures or add a new milestone.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </MotionItem>

      {dialogState ? (
        <FlexibleMilestoneDialog
          mode={dialogState.mode}
          initialMilestone={editingMilestone}
          onClose={() => setDialogState(null)}
          onSave={saveMilestone}
        />
      ) : null}
    </section>
  );
}

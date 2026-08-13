"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  MessageSquareText,
  NotebookPen,
  Plus,
  Send,
  ShieldCheck,
  UserRound,
  CalendarDays,
  XCircle,
  RotateCcw,
} from "lucide-react";

import { MotionItem, MotionSection } from "@/components/motion/motion-primitives";
import { FlexibleBlockPickerDialog } from "@/components/projects/flexible-block-picker-dialog";
import { FlexiblePrototypeDialog } from "@/components/projects/flexible-prototype-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  FLEXIBLE_MILESTONE_ACTIVITY_FIXTURES,
  type FlexibleBlockDefinition,
  type FlexibleMilestoneFixture,
  type FlexibleProjectFixture,
} from "@/lib/flexible-project-ui-fixtures";
import { showInfoToast, showSuccessToast } from "@/lib/toast";

type WorkspaceStatus =
  | "Not Started"
  | "In Progress"
  | "Awaiting Approval"
  | "Approved"
  | "Revision Requested"
  | "Rejected"
  | "Completed";

type WorkspaceBlock = {
  id: string;
  kind: string;
  title: string;
  value: string;
  detail?: string;
};

type ActivityItem = {
  id: string;
  time: string;
  text: string;
};

const initialBlocks: WorkspaceBlock[] = [
  {
    id: "theme-1",
    kind: "URL",
    title: "Theme 1",
    value: "https://example.com/theme-1",
  },
  {
    id: "theme-2",
    kind: "URL",
    title: "Theme 2",
    value: "https://example.com/theme-2",
  },
  {
    id: "theme-preview",
    kind: "FILE",
    title: "Theme preview",
    value: "theme-preview.jpg",
    detail: "2.4 MB · Visual fixture only",
  },
  {
    id: "shortlist-notes",
    kind: "NOTES",
    title: "Shortlist rationale",
    value: "Why these themes were shortlisted.",
  },
  {
    id: "client-approval",
    kind: "APPROVAL",
    title: "Client approval required",
    value: "Awaiting Approval",
  },
];

function getInitialStatus(milestone: FlexibleMilestoneFixture): WorkspaceStatus {
  if (milestone.statusLabel === "Completed") return "Completed";
  if (milestone.statusLabel === "Awaiting Approval") return "Awaiting Approval";
  if (milestone.statusLabel === "In Progress") return "In Progress";
  return "Not Started";
}

function BlockIcon({ kind }: { kind: string }) {
  const className = "size-4.5";
  if (kind === "URL") return <Link2 className={className} />;
  if (kind === "FILE") return <FileText className={className} />;
  if (kind === "NOTES") return <NotebookPen className={className} />;
  if (kind === "APPROVAL") return <ShieldCheck className={className} />;
  return <CheckCircle2 className={className} />;
}

function statusStyle(status: WorkspaceStatus) {
  if (status === "Completed" || status === "Approved") {
    return "border-[#cce5d3] bg-[#edf8f0] text-[#23744a]";
  }
  if (status === "Awaiting Approval" || status === "In Progress") {
    return "border-[#d7e6db] bg-[#f1f7f2] text-[#30734f]";
  }
  if (status === "Rejected") {
    return "border-[#edcbc8] bg-[#fff3f2] text-[#ae4942]";
  }
  if (status === "Revision Requested") {
    return "border-[#eddcb9] bg-[#fff9ec] text-[#8d691f]";
  }
  return "border-[#dfe4df] bg-[#f7f8f7] text-[#606a62]";
}

export function FlexibleMilestoneWorkspace({
  project,
  milestone,
}: {
  project: FlexibleProjectFixture;
  milestone: FlexibleMilestoneFixture;
}) {
  const [status, setStatus] = useState<WorkspaceStatus>(() => getInitialStatus(milestone));
  const [blocks, setBlocks] = useState<WorkspaceBlock[]>(initialBlocks);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>(
    FLEXIBLE_MILESTONE_ACTIVITY_FIXTURES,
  );
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [progressText, setProgressText] = useState("");

  function addActivity(text: string) {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    setActivityItems((current) => [
      ...current,
      { id: `activity-${Date.now()}`, time, text },
    ]);
  }

  function handleAddBlock(block: FlexibleBlockDefinition) {
    setBlocks((current) => [
      ...current,
      {
        id: `local-block-${Date.now()}`,
        kind: block.name.toUpperCase(),
        title: block.name,
        value: `New ${block.name} block — configure in a future version.`,
        detail: `${block.category} · Added locally`,
      },
    ]);
    setBlockPickerOpen(false);
    addActivity(`Vishnu added a ${block.name} block`);
    showSuccessToast(`${block.name} added locally`);
  }

  function updateStatus(nextStatus: WorkspaceStatus, activityText: string) {
    setStatus(nextStatus);
    setBlocks((current) =>
      current.map((block) =>
        block.kind === "APPROVAL" ? { ...block, value: nextStatus } : block,
      ),
    );
    addActivity(activityText);
    showSuccessToast(`Milestone status: ${nextStatus}`);
  }

  function handleProgressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUpdate = progressText.trim();
    if (!nextUpdate) return;

    addActivity(`Vishnu: ${nextUpdate}`);
    setProgressText("");
    setProgressDialogOpen(false);
    showSuccessToast("Progress update added locally");
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] space-y-5 pb-4">
      <MotionSection>
        <Button
          asChild
          variant="ghost"
          className="h-10 rounded-[12px] px-2.5 text-[13px] text-[#3e4941]"
        >
          <Link href={`/projects/flexible/${project.slug}`}>
            <ArrowLeft className="size-4" /> Project Timeline
          </Link>
        </Button>
      </MotionSection>

      <MotionItem y={8}>
        <Card className="overflow-hidden rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.06)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-[800] uppercase tracking-[0.15em] text-[#2d7b52]">
                  {String(milestone.order).padStart(2, "0")} · {milestone.category}
                </p>
                <h1 className="mt-2 text-[30px] font-[800] leading-[1.08] tracking-[-0.045em] text-[#0f1411] sm:text-[39px]">
                  {milestone.name}
                </h1>
                <p className="mt-3 max-w-3xl text-[13px] leading-6 text-[#68716a] sm:text-[14px]">
                  {milestone.description}
                </p>
              </div>
              <Badge className={`self-start px-4 py-2 text-[11px] ${statusStyle(status)}`} variant="outline">
                <span className="mr-2 size-1.5 rounded-full bg-current" />
                {status}
              </Badge>
            </div>

            <div className="mt-7 grid gap-3 md:grid-cols-3">
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4">
                <p className="flex items-center gap-2 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]">
                  <UserRound className="size-3.5 text-[#397b57]" /> Responsible
                </p>
                <p className="mt-2 text-[14px] font-[750] text-[#28322b]">{milestone.responsible}</p>
              </div>
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4">
                <p className="flex items-center gap-2 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]">
                  <CalendarDays className="size-3.5 text-[#397b57]" /> Deadline
                </p>
                <p className="mt-2 text-[14px] font-[750] text-[#28322b]">{milestone.dateLabel}</p>
              </div>
              <div className="rounded-[17px] border border-[#e0e6e0] bg-[#fafcf9] p-4">
                <p className="flex items-center gap-2 text-[10px] font-[750] uppercase tracking-[0.1em] text-[#7b847d]">
                  <ShieldCheck className="size-3.5 text-[#397b57]" /> Approval Required
                </p>
                <p className="mt-2 text-[14px] font-[750] text-[#28322b]">
                  {milestone.approvalRequired ? "Yes" : "No"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#e8ece8] pt-5">
              {milestone.approvalRequired && status === "Awaiting Approval" ? (
                <>
                  <Button type="button" onClick={() => updateStatus("Approved", "Sarah approved the milestone")}>
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateStatus("Revision Requested", "Sarah requested a revision")}
                  >
                    <RotateCcw className="size-4" /> Request Revision
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateStatus("Rejected", "Sarah rejected the milestone")}
                    className="border-[#ebcfcc] text-[#a84942] hover:bg-[#fff5f4]"
                  >
                    <XCircle className="size-4" /> Reject
                  </Button>
                </>
              ) : milestone.approvalRequired && status !== "Approved" && status !== "Completed" ? (
                <Button
                  type="button"
                  onClick={() => updateStatus("Awaiting Approval", "Vishnu sent the milestone for approval")}
                >
                  <Send className="size-4" /> Send for Approval
                </Button>
              ) : !milestone.approvalRequired && status !== "Completed" ? (
                <Button
                  type="button"
                  onClick={() => updateStatus("Completed", "Vishnu completed the milestone")}
                >
                  <CheckCircle2 className="size-4" /> Complete Milestone
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-[12px] font-[700] text-[#2a7750]">
                  <CheckCircle2 className="size-4" /> No action required in this mock state
                </p>
              )}
              <span className="ml-auto text-[10px] font-[650] uppercase tracking-[0.1em] text-[#949b95]">
                Local state only
              </span>
            </div>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionItem y={8}>
        <Card className="rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.055)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[23px] font-[780] tracking-[-0.035em] text-[#111712] sm:text-[27px]">
                  Template Options
                </h2>
                <p className="mt-1 text-[12px] text-[#717a73]">Fixture blocks for validating the workspace layout.</p>
              </div>
              <Button type="button" onClick={() => setBlockPickerOpen(true)} className="h-11 self-start px-5 sm:self-auto">
                <Plus className="size-4" /> Add Item
              </Button>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={`rounded-[18px] border p-4 sm:p-5 ${
                    block.kind === "APPROVAL"
                      ? "border-[#cfe2d4] bg-[#f3f9f4]"
                      : "border-[#e0e6e0] bg-[#fbfcfb]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white text-[#2e7a52] shadow-[0_6px_16px_rgba(23,39,28,0.05)]">
                      <BlockIcon kind={block.kind} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-[800] uppercase tracking-[0.14em] text-[#758078]">{block.kind}</p>
                      <h3 className="mt-1 text-[14px] font-[750] text-[#263029]">{block.title}</h3>
                      {block.kind === "URL" ? (
                        <button
                          type="button"
                          onClick={() => showInfoToast("Fixture link", "External navigation is disabled in this prototype.")}
                          className="mt-2 flex max-w-full items-center gap-2 text-left text-[12px] font-[600] text-[#2c7751] hover:underline"
                        >
                          <span className="truncate">{block.value}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </button>
                      ) : (
                        <p className="mt-2 text-[12px] leading-5 text-[#5f6961]">{block.value}</p>
                      )}
                      {block.detail ? (
                        <p className="mt-1.5 text-[10px] text-[#8a928c]">{block.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionItem y={8}>
        <Card className="rounded-[26px] border border-[#dce4dc] bg-white shadow-[0_18px_50px_rgba(23,39,28,0.055)]">
          <CardContent className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2.5 text-[23px] font-[780] tracking-[-0.035em] text-[#111712]">
                  <Activity className="size-5 text-[#2d7b52]" /> Activity
                </h2>
                <p className="mt-1 text-[12px] text-[#717a73]">Local fixture history and progress updates.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setProgressDialogOpen(true)}
                className="h-11 self-start px-5 text-[12px] sm:self-auto"
              >
                <MessageSquareText className="size-4" /> Add Progress Update
              </Button>
            </div>

            <div className="relative mt-6 space-y-1">
              <span className="absolute bottom-4 left-[11px] top-4 w-px bg-[#dce3dc]" aria-hidden="true" />
              {activityItems.map((item) => (
                <div key={item.id} className="relative flex gap-4 rounded-[14px] px-0 py-3 sm:px-1">
                  <span className="relative z-[1] mt-1.5 size-[22px] shrink-0 rounded-full border-[6px] border-white bg-[#5a9672] shadow-[0_0_0_1px_#bcd3c3]" />
                  <div className="min-w-0 flex-1 border-b border-[#edf0ed] pb-3">
                    <p className="text-[13px] font-[600] leading-5 text-[#374139]">{item.text}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#858e87]">
                      <Clock3 className="size-3" /> {item.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </MotionItem>

      {blockPickerOpen ? (
        <FlexibleBlockPickerDialog
          onClose={() => setBlockPickerOpen(false)}
          onAdd={handleAddBlock}
        />
      ) : null}

      {progressDialogOpen ? (
        <FlexiblePrototypeDialog
          open
          title="Add Progress Update"
          description="This update stays in local state until the page is refreshed."
          onClose={() => setProgressDialogOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setProgressDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="flexible-progress-form">Add Update</Button>
            </>
          }
        >
          <form id="flexible-progress-form" onSubmit={handleProgressSubmit}>
            <label>
              <span className="mb-2 block text-[12px] font-[700] text-[#3c4740]">Progress update</span>
              <Textarea
                required
                autoFocus
                value={progressText}
                onChange={(event) => setProgressText(event.target.value)}
                placeholder="Waiting for the vendor invoice."
                className="min-h-36 rounded-[16px] border border-[#d9e1d9] bg-white shadow-none"
              />
            </label>
          </form>
        </FlexiblePrototypeDialog>
      ) : null}
    </section>
  );
}

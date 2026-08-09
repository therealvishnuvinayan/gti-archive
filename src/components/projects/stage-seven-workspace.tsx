"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Box,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileStack,
  Image as ImageIcon,
  Info,
  Mail,
  PackageCheck,
  Plus,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { showInfoToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type UnitStatus = "NOT STARTED" | "IN REVIEW" | "REVISIONS NEEDED" | "SIGNED OFF";
type RoundStatus = "NOT STARTED" | "PENDING" | "UNDER REVIEW" | "REVISIONS NEEDED" | "COMPLETED";
type Decision = "PASS" | "FAIL" | "CONDITIONAL" | "PENDING";
type CriterionDecision = Exclude<Decision, "PENDING">;

type RoundDeadline = {
  label: "Submission" | "Review" | "Revision / Sign-off" | "Delivery";
  date: string;
  timing?: string;
  overdue?: boolean;
};

type EvaluationCriterion = {
  name: string;
  decision: CriterionDecision;
  comment: string;
};

type RoundEvidenceItem = {
  id: string;
  type: "photo" | "video";
  label: string;
};

type SampleRound = {
  id: string;
  number: number;
  type: string;
  status: RoundStatus;
  decision: Decision;
  deadlines: RoundDeadline[];
  participants: Array<{ id: string; initials: string; name: string; tone: string }>;
  criteria: EvaluationCriterion[];
  evidence: RoundEvidenceItem[];
  notes: string;
};

type ProductionUnit = {
  id: string;
  name: string;
  status: UnitStatus;
  icon: LucideIcon;
  rounds: SampleRound[];
};

const CRITERIA_NAMES = [
  "Material Quality",
  "Graphic Reproduction",
  "Size",
  "Construction",
  "Graphic Elements",
  "Functionality",
  "Finishes",
] as const;

const PARTICIPANTS = [
  { id: "pm", initials: "PM", name: "Project Manager", tone: "bg-[#dff0e4] text-[#2d704b]" },
  { id: "marketing", initials: "MK", name: "Marketing", tone: "bg-[#f1eadf] text-[#7b5d32]" },
  { id: "qa", initials: "QA", name: "Quality Assurance", tone: "bg-[#e6ecf7] text-[#45618e]" },
];

function createCriteria(
  overrides: Partial<Record<(typeof CRITERIA_NAMES)[number], Pick<EvaluationCriterion, "decision" | "comment">>> = {},
) {
  return CRITERIA_NAMES.map((name) => ({
    name,
    decision: overrides[name]?.decision ?? "PASS",
    comment: overrides[name]?.comment ?? "",
  }));
}

// UI-only fixture. Replace this object with Stage 7 persistence when that product round begins.
const STAGE_SEVEN_UI_FIXTURE: { pageStatus: "IN PROGRESS"; productionUnits: ProductionUnit[] } = {
  pageStatus: "IN PROGRESS",
  productionUnits: [
    {
      id: "primary-pack",
      name: "Primary Pack",
      status: "IN REVIEW",
      icon: PackageCheck,
      rounds: [
        {
          id: "primary-pre-production",
          number: 1,
          type: "Pre-Production Sample",
          status: "UNDER REVIEW",
          decision: "CONDITIONAL",
          deadlines: [
            { label: "Submission", date: "07 Aug 2026", timing: "Overdue 2 days", overdue: true },
            { label: "Review", date: "08 Aug 2026", timing: "Overdue 1 day", overdue: true },
            { label: "Revision / Sign-off", date: "12 Aug 2026", timing: "In 3 days" },
            { label: "Delivery", date: "15 Aug 2026", timing: "In 6 days" },
          ],
          participants: PARTICIPANTS,
          criteria: createCriteria({
            Construction: {
              decision: "CONDITIONAL",
              comment: "Minor alignment issue on side panel.",
            },
            "Graphic Elements": {
              decision: "FAIL",
              comment: "Logo placement needs correction.",
            },
          }),
          evidence: [
            { id: "primary-photo-front", type: "photo", label: "Front panel" },
            { id: "primary-photo-side", type: "photo", label: "Side panel" },
            { id: "primary-video-fold", type: "video", label: "Fold test" },
            { id: "primary-photo-print", type: "photo", label: "Print detail" },
          ],
          notes: "Check the corrected logo placement before approving the production sample.",
        },
        {
          id: "primary-production",
          number: 2,
          type: "Production Sample",
          status: "PENDING",
          decision: "PENDING",
          deadlines: [
            { label: "Submission", date: "18 Aug 2026", timing: "In 9 days" },
            { label: "Review", date: "20 Aug 2026", timing: "In 11 days" },
            { label: "Revision / Sign-off", date: "23 Aug 2026", timing: "In 14 days" },
            { label: "Delivery", date: "26 Aug 2026", timing: "In 17 days" },
          ],
          participants: PARTICIPANTS.slice(0, 2),
          criteria: createCriteria(),
          evidence: [],
          notes: "",
        },
        {
          id: "primary-final-sign-off",
          number: 3,
          type: "Final Mass-Production Sign-off",
          status: "PENDING",
          decision: "PENDING",
          deadlines: [
            { label: "Submission", date: "02 Sep 2026" },
            { label: "Review", date: "04 Sep 2026" },
            { label: "Revision / Sign-off", date: "07 Sep 2026" },
            { label: "Delivery", date: "10 Sep 2026" },
          ],
          participants: PARTICIPANTS,
          criteria: createCriteria(),
          evidence: [],
          notes: "",
        },
      ],
    },
    {
      id: "outer-pack",
      name: "Outer Pack",
      status: "REVISIONS NEEDED",
      icon: Boxes,
      rounds: [
        {
          id: "outer-pre-production",
          number: 1,
          type: "Pre-Production Sample",
          status: "REVISIONS NEEDED",
          decision: "FAIL",
          deadlines: [
            { label: "Submission", date: "05 Aug 2026" },
            { label: "Review", date: "06 Aug 2026" },
            { label: "Revision / Sign-off", date: "13 Aug 2026", timing: "In 4 days" },
            { label: "Delivery", date: "17 Aug 2026", timing: "In 8 days" },
          ],
          participants: PARTICIPANTS,
          criteria: createCriteria({
            "Graphic Reproduction": { decision: "FAIL", comment: "Colour density is below target." },
          }),
          evidence: [{ id: "outer-photo-colour", type: "photo", label: "Colour comparison" }],
          notes: "Supplier is preparing a corrected proof.",
        },
        {
          id: "outer-follow-up",
          number: 2,
          type: "Production Sample",
          status: "PENDING",
          decision: "PENDING",
          deadlines: [
            { label: "Submission", date: "22 Aug 2026" },
            { label: "Review", date: "24 Aug 2026" },
            { label: "Revision / Sign-off", date: "27 Aug 2026" },
            { label: "Delivery", date: "30 Aug 2026" },
          ],
          participants: PARTICIPANTS.slice(0, 2),
          criteria: createCriteria(),
          evidence: [],
          notes: "",
        },
      ],
    },
    {
      id: "master-carton",
      name: "Master Carton",
      status: "SIGNED OFF",
      icon: Box,
      rounds: [
        {
          id: "carton-final-sign-off",
          number: 1,
          type: "Final Mass-Production Sign-off",
          status: "COMPLETED",
          decision: "PASS",
          deadlines: [
            { label: "Submission", date: "24 Jul 2026" },
            { label: "Review", date: "26 Jul 2026" },
            { label: "Revision / Sign-off", date: "29 Jul 2026" },
            { label: "Delivery", date: "01 Aug 2026" },
          ],
          participants: PARTICIPANTS,
          criteria: createCriteria(),
          evidence: [
            { id: "carton-photo", type: "photo", label: "Signed sample" },
            { id: "carton-video", type: "video", label: "Load test" },
          ],
          notes: "Approved for mass production.",
        },
      ],
    },
    {
      id: "tipping-paper",
      name: "Tipping Paper",
      status: "NOT STARTED",
      icon: FileStack,
      rounds: [],
    },
  ],
};

const STATUS_STYLES: Record<UnitStatus | RoundStatus, string> = {
  "NOT STARTED": "border-[#dfe5df] bg-[#f5f7f5] text-[#68736b]",
  PENDING: "border-[#d9e6f7] bg-[#edf5ff] text-[#3c6da8]",
  "UNDER REVIEW": "border-[#cfe2d4] bg-[#eaf5ed] text-[#2f7751]",
  "IN REVIEW": "border-[#cfe2d4] bg-[#eaf5ed] text-[#2f7751]",
  "REVISIONS NEEDED": "border-[#f1dcb7] bg-[#fff5e5] text-[#a46818]",
  COMPLETED: "border-[#d8e2f4] bg-[#edf3ff] text-[#476da9]",
  "SIGNED OFF": "border-[#cfe2d4] bg-[#e8f5ec] text-[#256b46]",
};

const DECISION_STYLES: Record<Decision, string> = {
  PASS: "border-[#cde3d3] bg-[#e9f6ed] text-[#257049]",
  FAIL: "border-[#f2cbc6] bg-[#fff0ee] text-[#b44338]",
  CONDITIONAL: "border-[#f1dbb2] bg-[#fff4df] text-[#a66613]",
  PENDING: "border-[#dce4ec] bg-[#f3f6f9] text-[#66727d]",
};

function StatusBadge({ status }: { status: UnitStatus | RoundStatus }) {
  return (
    <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-[780] tracking-[0.03em]", STATUS_STYLES[status])}>
      {status}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: Decision }) {
  return (
    <span className={cn("inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-[780]", DECISION_STYLES[decision])}>
      {decision === "PENDING" ? "Pending" : decision.charAt(0) + decision.slice(1).toLowerCase()}
    </span>
  );
}

function showUiPreview(title: string, description: string) {
  showInfoToast(title, `${description} This UI preview does not change project data.`);
}

function ProductionUnitSwitcher({
  units,
  selectedUnitId,
  onSelect,
}: {
  units: ProductionUnit[];
  selectedUnitId: string;
  onSelect: (unitId: string) => void;
}) {
  return (
    <section aria-labelledby="stage-seven-units-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="stage-seven-units-heading" className="text-[11px] font-[780] uppercase tracking-[0.11em] text-[#657168]">
          Production Units
        </h2>
        <Info className="h-3.5 w-3.5 text-[#96a098]" aria-label="Each Production Unit is supervised independently." />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {units.map((unit) => {
          const Icon = unit.icon;
          const selected = unit.id === selectedUnitId;
          return (
            <button
              key={unit.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "flex min-w-[220px] items-center gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_8px_22px_rgba(23,39,28,0.035)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9068]/40 lg:min-w-0",
                selected
                  ? "border-[#70a383] bg-[#f3faf5] shadow-[0_12px_26px_rgba(42,112,73,0.09)]"
                  : "border-[#dfe6df] hover:border-[#b7cbbd] hover:bg-[#fbfdfb]",
              )}
              onClick={() => onSelect(unit.id)}
            >
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-[12px]", selected ? "bg-[#dff0e4] text-[#2d7650]" : "bg-[#f0f3f0] text-[#657168]") }>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-[740] text-[#253028]" title={unit.name}>{unit.name}</span>
                <span className="mt-1.5 block"><StatusBadge status={unit.status} /></span>
              </span>
              {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2f8057]" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StageSevenSummary({ units }: { units: ProductionUnit[] }) {
  const activeRounds = units.flatMap((unit) => unit.rounds).filter((round) => round.status !== "COMPLETED").length;
  const overdueDeadlines = units.flatMap((unit) => unit.rounds).flatMap((round) => round.deadlines).filter((deadline) => deadline.overdue).length;
  const signedOff = units.filter((unit) => unit.status === "SIGNED OFF").length;
  const metrics = [
    { label: "Production Units", value: units.length, icon: Boxes, tone: "bg-[#edf5ef] text-[#347153]" },
    { label: "Active Sample Rounds", value: activeRounds, icon: Clock3, tone: "bg-[#edf5ef] text-[#347153]" },
    { label: "Overdue Deadlines", value: overdueDeadlines, icon: CalendarClock, tone: "bg-[#fff0ee] text-[#b9473d]" },
    { label: "Signed Off", value: signedOff, icon: CheckCircle2, tone: "bg-[#edf3ff] text-[#486fa7]" },
  ];

  return (
    <section aria-label="Stage 7 status summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <article key={label} className="flex items-center gap-3 rounded-[15px] border border-[#e0e7e0] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(23,39,28,0.03)]">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-[11px]", tone)}><Icon className="h-4 w-4" /></span>
          <span>
            <strong className="block text-[19px] font-[780] leading-none text-[#1d2821]">{value}</strong>
            <span className="mt-1 block text-[10px] font-[650] text-[#748078]">{label}</span>
          </span>
        </article>
      ))}
    </section>
  );
}

function DeadlineTimeline({ deadlines }: { deadlines: RoundDeadline[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {deadlines.map((deadline) => (
        <div key={deadline.label} className="min-w-0">
          <p className="truncate text-[8px] font-[760] uppercase tracking-[0.06em] text-[#879188]">{deadline.label}</p>
          <p className="mt-0.5 truncate text-[10px] font-[680] text-[#39443c]">{deadline.date}</p>
          {deadline.timing ? (
            <p className={cn("mt-0.5 text-[9px] font-[620]", deadline.overdue ? "text-[#c04b40]" : "text-[#78857b]")}>{deadline.timing}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SampleRoundsList({
  unit,
  selectedRoundId,
  onSelectRound,
}: {
  unit: ProductionUnit;
  selectedRoundId: string | null;
  onSelectRound: (roundId: string) => void;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[#dfe6df] bg-white shadow-[0_10px_28px_rgba(23,39,28,0.035)]" aria-labelledby="sample-rounds-heading">
      <div className="flex flex-col gap-3 border-b border-[#e6ebe6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="sample-rounds-heading" className="text-[15px] font-[760] text-[#1f2a22]">Sample Rounds — {unit.name}</h2>
          <p className="mt-1 text-[10px] text-[#7c867f]">Rounds may repeat until the Production Unit is ready for final sign-off.</p>
        </div>
        <Button type="button" size="sm" className="self-start rounded-[11px]" onClick={() => showUiPreview("New Sample Round", "Round creation will be connected in the Stage 7 functionality phase.") }>
          <Plus className="h-3.5 w-3.5" /> New Sample Round
        </Button>
      </div>

      {unit.rounds.length ? (
        <div>
          <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(150px,1.3fr)_72px_100px_48px] gap-3 border-b border-[#edf0ed] bg-[#fafbfa] px-4 py-2.5 text-[8px] font-[760] uppercase tracking-[0.065em] text-[#7d8780] lg:grid lg:px-5">
            <span>Round / Type</span><span>Timeline</span><span>Decision</span><span>Status</span><span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[#e9ede9]">
            {unit.rounds.map((round) => {
              const selected = round.id === selectedRoundId;
              return (
                <article key={round.id} className={cn("grid gap-4 px-4 py-4 transition lg:grid-cols-[minmax(120px,1fr)_minmax(150px,1.3fr)_72px_100px_48px] lg:items-center lg:gap-3 lg:px-5", selected ? "bg-[#f4faf5]" : "hover:bg-[#fbfcfb]") }>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-[780]", selected ? "border-[#86b395] bg-[#e7f4ea] text-[#2d744d]" : "border-[#dce4dd] bg-[#f7f9f7] text-[#68746b]")}>{round.number}</span>
                    <div className="min-w-0">
                      <p className="text-[9px] font-[760] uppercase tracking-[0.06em] text-[#849087]">Round {round.number}</p>
                      <h3 className="mt-1 text-[11px] font-[700] leading-4 text-[#29342c]">{round.type}</h3>
                    </div>
                  </div>
                  <DeadlineTimeline deadlines={round.deadlines} />
                  <div><span className="mb-1 block text-[8px] font-[760] uppercase text-[#8a948d] lg:hidden">Decision</span><DecisionBadge decision={round.decision} /></div>
                  <div><span className="mb-1 block text-[8px] font-[760] uppercase text-[#8a948d] lg:hidden">Status</span><StatusBadge status={round.status} /></div>
                  <Button type="button" size="sm" variant={selected ? "secondary" : "ghost"} className="min-h-8 justify-self-start rounded-[10px] px-3 text-[10px] lg:justify-self-end" onClick={() => onSelectRound(round.id)}>
                    {selected ? "Selected" : "View"}
                  </Button>
                </article>
              );
            })}
          </div>
          <p className="border-t border-[#edf0ed] px-5 py-3 text-center text-[9px] text-[#8a948d]">Showing {unit.rounds.length} sample {unit.rounds.length === 1 ? "round" : "rounds"}</p>
        </div>
      ) : (
        <div className="grid min-h-[250px] place-items-center px-6 py-12 text-center">
          <div>
            <CircleDot className="mx-auto h-8 w-8 text-[#aab3ac]" />
            <h3 className="mt-3 text-[13px] font-[720] text-[#344038]">No sample rounds yet</h3>
            <p className="mt-1 text-[10px] text-[#849087]">Create the first round when supervision begins for {unit.name}.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ParticipantsList({ participants }: { participants: SampleRound["participants"] }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Participants in Review</h3>
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#d8e2d9] bg-white px-2.5 py-1 text-[9px] font-[720] text-[#397454] hover:bg-[#f4faf5]" onClick={() => showUiPreview("Add Participants", "Participant selection is visual only for now.") }>
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {participants.map((participant) => (
          <span key={participant.id} title={participant.name} className="inline-flex items-center gap-1.5 rounded-full border border-[#e0e6e0] bg-[#fafbfa] py-1 pl-1 pr-2.5 text-[9px] font-[680] text-[#465149]">
            <span className={cn("grid size-6 place-items-center rounded-full text-[8px] font-[780]", participant.tone)}>{participant.initials}</span>
            {participant.name}
          </span>
        ))}
        <span className="grid size-8 place-items-center rounded-full border border-dashed border-[#cfd9d0] text-[9px] font-[720] text-[#718078]">+2</span>
      </div>
    </section>
  );
}

function EvaluationMatrix({
  round,
  criterionDecisions,
  criterionComments,
  onDecisionChange,
  onCommentChange,
}: {
  round: SampleRound;
  criterionDecisions: Record<string, CriterionDecision>;
  criterionComments: Record<string, string>;
  onDecisionChange: (key: string, decision: CriterionDecision) => void;
  onCommentChange: (key: string, comment: string) => void;
}) {
  return (
    <section aria-labelledby="evaluation-criteria-heading">
      <h3 id="evaluation-criteria-heading" className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Evaluation Criteria</h3>
      <div className="mt-2 overflow-hidden rounded-[13px] border border-[#e1e7e1]">
        <div className="hidden grid-cols-[minmax(100px,0.9fr)_auto_minmax(95px,0.85fr)] gap-2 bg-[#f7f9f7] px-3 py-2 text-[8px] font-[760] uppercase tracking-[0.06em] text-[#818b83] sm:grid">
          <span>Criterion</span><span>Assessment</span><span>Comment</span>
        </div>
        <div className="divide-y divide-[#e7ece7] bg-white">
          {round.criteria.map((criterion) => {
            const key = `${round.id}:${criterion.name}`;
            const decision = criterionDecisions[key] ?? criterion.decision;
            const comment = criterionComments[key] ?? criterion.comment;
            return (
              <div key={criterion.name} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(100px,0.9fr)_auto_minmax(95px,0.85fr)] sm:items-center">
                <span className="text-[10px] font-[680] text-[#354038]">{criterion.name}</span>
                <div className="inline-flex w-fit rounded-[9px] border border-[#dde5de] bg-[#f8faf8] p-0.5" aria-label={`${criterion.name} assessment`}>
                  {(["PASS", "FAIL", "CONDITIONAL"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={decision === option}
                      className={cn(
                        "rounded-[7px] px-2 py-1 text-[8px] font-[760] transition",
                        decision === option
                          ? option === "PASS"
                            ? "bg-[#dff1e4] text-[#256b46]"
                            : option === "FAIL"
                              ? "bg-[#fde5e2] text-[#af4037]"
                              : "bg-[#ffedcc] text-[#9d6315]"
                          : "text-[#7c867f] hover:bg-white",
                      )}
                      onClick={() => onDecisionChange(key, option)}
                    >
                      {option === "CONDITIONAL" ? "Conditional" : option === "PASS" ? "Pass" : "Fail"}
                    </button>
                  ))}
                </div>
                <Input
                  value={comment}
                  aria-label={`${criterion.name} comment`}
                  className="h-8 min-h-8 rounded-[9px] border-[#e0e6e0] px-2.5 text-[9px] shadow-none"
                  placeholder="Optional comment"
                  onChange={(event) => onCommentChange(key, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RoundEvidence({ evidence }: { evidence: RoundEvidenceItem[] }) {
  const visibleEvidence = evidence.slice(0, 3);
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Evidence</h3>
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#d8e2d9] bg-white px-2.5 py-1 text-[9px] font-[720] text-[#397454] hover:bg-[#f4faf5]" onClick={() => showUiPreview("Add Evidence", "Photo and video upload will be connected later.") }>
          <Plus className="h-3 w-3" /> Add Evidence
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {visibleEvidence.length ? visibleEvidence.map((item, index) => {
          const Icon = item.type === "video" ? Video : ImageIcon;
          return (
            <button key={item.id} type="button" title={item.label} className={cn("relative grid size-14 place-items-center overflow-hidden rounded-[10px] border border-[#dce4dc]", index % 2 === 0 ? "bg-[#e9efe9] text-[#52705c]" : "bg-[#f1ece3] text-[#806b49]")} onClick={() => showUiPreview(item.label, "Evidence preview is not connected yet.") }>
              <Icon className="h-4 w-4" />
              <span className="absolute inset-x-1 bottom-1 truncate rounded bg-white/85 px-1 py-0.5 text-[7px] font-[680] text-[#526057]">{item.type}</span>
            </button>
          );
        }) : (
          <span className="text-[10px] text-[#8a948d]">No evidence added for this round.</span>
        )}
        {evidence.length > visibleEvidence.length ? (
          <span className="grid size-14 place-items-center rounded-[10px] border border-dashed border-[#cfd9d0] bg-[#fafbfa] text-[10px] font-[760] text-[#637168]">+{evidence.length - visibleEvidence.length}</span>
        ) : null}
      </div>
    </section>
  );
}

function SampleRoundDetails({
  unit,
  round,
  decisions,
  criterionDecisions,
  criterionComments,
  notes,
  onDecisionChange,
  onCriterionDecisionChange,
  onCriterionCommentChange,
  onNotesChange,
}: {
  unit: ProductionUnit;
  round: SampleRound | null;
  decisions: Record<string, Decision>;
  criterionDecisions: Record<string, CriterionDecision>;
  criterionComments: Record<string, string>;
  notes: Record<string, string>;
  onDecisionChange: (roundId: string, decision: Decision) => void;
  onCriterionDecisionChange: (key: string, decision: CriterionDecision) => void;
  onCriterionCommentChange: (key: string, comment: string) => void;
  onNotesChange: (roundId: string, note: string) => void;
}) {
  if (!round) {
    return (
      <aside className="grid min-h-[350px] place-items-center rounded-[18px] border border-[#dfe6df] bg-white px-6 py-12 text-center shadow-[0_10px_28px_rgba(23,39,28,0.035)]">
        <div>
          <FileStack className="mx-auto h-9 w-9 text-[#a8b1aa]" />
          <h2 className="mt-3 text-[14px] font-[740] text-[#303b33]">No round selected</h2>
          <p className="mt-1 max-w-[300px] text-[10px] leading-4 text-[#849087]">Create a Sample Round for {unit.name} to see deadlines, evaluation criteria, participants, and evidence here.</p>
        </div>
      </aside>
    );
  }

  const overallDecision = decisions[round.id] ?? round.decision;
  const currentNotes = notes[round.id] ?? round.notes;

  return (
    <aside className="min-w-0 rounded-[18px] border border-[#dfe6df] bg-white shadow-[0_10px_28px_rgba(23,39,28,0.035)]" aria-labelledby="selected-round-heading">
      <div className="border-b border-[#e5ebe5] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-[760] uppercase tracking-[0.08em] text-[#7d8780]">Selected Round Details</p>
            <h2 id="selected-round-heading" className="mt-1.5 text-[15px] font-[760] leading-5 text-[#1f2a22]">{round.type} – Round {round.number}</h2>
          </div>
          <StatusBadge status={round.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div><p className="text-[8px] font-[760] uppercase tracking-[0.06em] text-[#8a948d]">Production Unit</p><p className="mt-1 text-[10px] font-[680] text-[#39443c]">{unit.name}</p></div>
          <div><p className="text-[8px] font-[760] uppercase tracking-[0.06em] text-[#8a948d]">Round Type</p><p className="mt-1 text-[10px] font-[680] text-[#39443c]">{round.type}</p></div>
          {round.deadlines.map((deadline) => (
            <div key={deadline.label}><p className="text-[8px] font-[760] uppercase tracking-[0.06em] text-[#8a948d]">{deadline.label} Deadline</p><p className={cn("mt-1 text-[10px] font-[680]", deadline.overdue ? "text-[#ba493f]" : "text-[#39443c]")}>{deadline.date}</p></div>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <section>
          <h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Overall Decision</h3>
          <div className="mt-2 grid grid-cols-3 rounded-[11px] border border-[#dce4dd] bg-[#f8faf8] p-1">
            {(["PASS", "FAIL", "CONDITIONAL"] as const).map((decision) => (
              <button key={decision} type="button" aria-pressed={overallDecision === decision} className={cn("rounded-[8px] px-2 py-2 text-[9px] font-[760] transition", overallDecision === decision ? decision === "PASS" ? "bg-[#dff1e4] text-[#256b46] shadow-sm" : decision === "FAIL" ? "bg-[#fde5e2] text-[#af4037] shadow-sm" : "bg-[#ffedcc] text-[#9d6315] shadow-sm" : "text-[#78837b] hover:bg-white") } onClick={() => onDecisionChange(round.id, decision)}>
                {decision === "CONDITIONAL" ? "Conditional" : decision === "PASS" ? "Pass" : "Fail"}
              </button>
            ))}
          </div>
        </section>

        <ParticipantsList participants={round.participants} />
        <EvaluationMatrix round={round} criterionDecisions={criterionDecisions} criterionComments={criterionComments} onDecisionChange={onCriterionDecisionChange} onCommentChange={onCriterionCommentChange} />
        <RoundEvidence evidence={round.evidence} />

        <section>
          <h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Review Notes</h3>
          <Textarea value={currentNotes} className="mt-2 min-h-[76px] rounded-[12px] border-[#e0e6e0] bg-[#fbfcfb] px-3 py-2.5 text-[10px] leading-4 shadow-none" placeholder="Add an overall note for this sample round" onChange={(event) => onNotesChange(round.id, event.target.value)} />
        </section>
      </div>

      <div className="grid gap-2 border-t border-[#e5ebe5] bg-[#fafbfa] px-4 py-4 sm:grid-cols-2 sm:px-5">
        <Button type="button" variant="outline" size="sm" className="rounded-[11px]" onClick={() => showUiPreview("Generate Feedback Email", "Feedback generation and delivery will be implemented later.") }><Mail className="h-3.5 w-3.5" /> Generate Feedback Email</Button>
        <Button type="button" size="sm" className="rounded-[11px]" onClick={() => showUiPreview("Mark Round Complete", "Round completion and persistence will be implemented later.") }><Check className="h-3.5 w-3.5" /> Mark Round Complete</Button>
      </div>
    </aside>
  );
}

export function StageSevenWorkspace({
  project,
  currentUserId,
}: {
  project: ProjectStageShellRecord;
  currentUserId: string;
}) {
  const units = STAGE_SEVEN_UI_FIXTURE.productionUnits;
  const [selectedUnitId, setSelectedUnitId] = useState(units[0].id);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(units[0].rounds[0]?.id ?? null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [criterionDecisions, setCriterionDecisions] = useState<Record<string, CriterionDecision>>({});
  const [criterionComments, setCriterionComments] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? units[0];
  const selectedRound = selectedUnit.rounds.find((round) => round.id === selectedRoundId) ?? selectedUnit.rounds[0] ?? null;
  const selectedCompleted = selectedUnit.rounds.filter((round) => round.status === "COMPLETED").length;
  const selectedInReview = selectedUnit.rounds.filter((round) => round.status === "UNDER REVIEW" || round.status === "REVISIONS NEEDED").length;
  const selectedPending = selectedUnit.rounds.filter((round) => round.status === "PENDING" || round.status === "NOT STARTED").length;

  function selectUnit(unitId: string) {
    const nextUnit = units.find((unit) => unit.id === unitId) ?? units[0];
    setSelectedUnitId(nextUnit.id);
    setSelectedRoundId(nextUnit.rounds[0]?.id ?? null);
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]"><ShieldCheck className="h-4 w-4" /> Implementation &amp; Supervision</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">Stage 7 – Implementation &amp; Supervision</h1>
              <Badge variant="secondary" className="w-fit border-[#cfe0d3] bg-[#eaf4ed] px-3 py-1.5 text-[10px] text-[#2f7751]">{STAGE_SEVEN_UI_FIXTURE.pageStatus}</Badge>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">Supervise production through sample rounds until final sign-off.</p>
            <ProjectStageSummary project={project} />
          </div>

          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <ProductionUnitSwitcher units={units} selectedUnitId={selectedUnit.id} onSelect={selectUnit} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-[#e0e7e0] bg-white px-4 py-2.5 text-[10px] text-[#667269]">
              <strong className="text-[#2e3a31]">{selectedUnit.name}</strong>
              <span>{selectedUnit.rounds.length} Sample {selectedUnit.rounds.length === 1 ? "Round" : "Rounds"}</span>
              <span>{selectedCompleted} Completed</span>
              <span>{selectedInReview} Under Review</span>
              <span>{selectedPending} Pending</span>
            </div>
            <StageSevenSummary units={units} />

            <div className="grid min-w-0 gap-5 min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)] min-[1360px]:items-start">
              <SampleRoundsList unit={selectedUnit} selectedRoundId={selectedRound?.id ?? null} onSelectRound={setSelectedRoundId} />
              <SampleRoundDetails
                unit={selectedUnit}
                round={selectedRound}
                decisions={decisions}
                criterionDecisions={criterionDecisions}
                criterionComments={criterionComments}
                notes={notes}
                onDecisionChange={(roundId, decision) => setDecisions((current) => ({ ...current, [roundId]: decision }))}
                onCriterionDecisionChange={(key, decision) => setCriterionDecisions((current) => ({ ...current, [key]: decision }))}
                onCriterionCommentChange={(key, comment) => setCriterionComments((current) => ({ ...current, [key]: comment }))}
                onNotesChange={(roundId, note) => setNotes((current) => ({ ...current, [roundId]: note }))}
              />
            </div>

            <div className="flex items-start gap-2 rounded-[13px] border border-[#ead6ae] bg-[#fff9ed] px-4 py-3 text-[10px] leading-4 text-[#795c2b]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b37a21]" />
              <span><strong>2 sample-round deadlines are overdue.</strong> Deadline alerts will be connected in the Stage 7 functionality phase.</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4f8062]" />
              <div>
                <p className="text-[11px] font-[720] text-[#354138]">Project closure is manual once production supervision is complete.</p>
                <p className="mt-0.5 text-[9px] text-[#849087]">This action is visual only in the current Stage 7 UI round.</p>
              </div>
            </div>
            <Button type="button" variant="outline" className="rounded-[12px] border-[#d96a60] text-[#b9433a] hover:bg-[#fff3f1]" onClick={() => showUiPreview("Close Project", "Manual project closure will be connected in a later phase.") }>
              <X className="h-4 w-4" /> Close Project
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function StageSevenLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="p-7 lg:p-9">
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-[680px] rounded-[12px]" />
            <Skeleton className="mt-6 h-[86px] rounded-[18px]" />
          </div>
          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] p-6 lg:p-9">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[76px] rounded-[16px]" />)}</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[66px] rounded-[15px]" />)}</div>
            <div className="grid gap-5 min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)]"><Skeleton className="h-[520px] rounded-[18px]" /><Skeleton className="h-[720px] rounded-[18px]" /></div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

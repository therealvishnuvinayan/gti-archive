import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  MoreVertical,
  Paperclip,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const promptChips = [
  "Show overdue stages",
  "View projects waiting for approval",
  "Find projects ready for archive",
];

const projectMatches = [
  {
    name: "Milano Ramadan Campaign 2026",
    status: "Active",
    statusClass: "bg-[#e4f6e9] text-[#1f7a4c]",
    stage: "Design Development",
    stageClass: "text-[#236c49]",
    stageDotClass: "bg-[#36a767]",
    owner: "Sara Malik",
    ownerInitials: "SM",
    ownerAvatarClass: "bg-[#f3d7c9] text-[#7c3f28]",
    executor: "QA Agency 01",
    deadline: "28 Jun 2026",
  },
  {
    name: "GTI Premium Blend Packaging",
    status: "On Hold",
    statusClass: "bg-[#fff1da] text-[#b66b14]",
    stage: "Artwork Review",
    stageClass: "text-[#5d4826]",
    stageDotClass: "bg-[#f0a23b]",
    owner: "Yasir Khan",
    ownerInitials: "YK",
    ownerAvatarClass: "bg-[#e6d7c9] text-[#5a3925]",
    executor: "QA Agency 01",
    deadline: "12 Jul 2026",
  },
  {
    name: "Heritage Series Rebrand",
    status: "Pending Approval",
    statusClass: "bg-[#e0f0fb] text-[#166cae]",
    stage: "Client Review",
    stageClass: "text-[#176dab]",
    stageDotClass: "bg-[#69b9ef]",
    owner: "Ayesha Noor",
    ownerInitials: "AN",
    ownerAvatarClass: "bg-[#f2dfb9] text-[#6f501a]",
    executor: "QA Agency 01",
    deadline: "03 Aug 2026",
  },
];

const extractedDetails = [
  { label: "Project Name", value: "Milano Ramadan Campaign", icon: FileText },
  { label: "Category", value: "Packaging", icon: Briefcase },
  { label: "Budget", value: "150,000", icon: CircleDollarSign },
  { label: "Currency", value: "AED", icon: CircleDollarSign },
  { label: "Main Executor", value: "QA Agency 01", icon: UserRound },
];

const suggestions = [
  {
    title: "View projects waiting for approval",
    meta: "4 projects need your review",
    icon: ClipboardCheck,
  },
  {
    title: "Find projects ready for archive",
    meta: "6 projects are ready",
    icon: Briefcase,
  },
  {
    title: "Show overdue stages",
    meta: "3 stages are overdue",
    icon: CalendarDays,
  },
];

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[26px] border border-white/75 bg-white shadow-[0_22px_55px_rgba(23,39,28,0.06)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-[#e5f3e8] text-brand shadow-[inset_0_0_0_1px_rgba(43,128,85,0.08)]">
      {children}
    </span>
  );
}

function ChatMessage({
  role,
  children,
  time,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  time: string;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex items-end gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? (
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-brand/25 bg-white text-brand shadow-[0_12px_28px_rgba(43,128,85,0.08)]">
          <Sparkles className="h-5 w-5" />
        </span>
      ) : null}

      <div
        className={cn(
          "min-w-0 max-w-[620px] rounded-[22px] border px-5 py-4 text-[14px] leading-6 shadow-[0_14px_34px_rgba(23,39,28,0.04)]",
          isUser
            ? "border-[#d9e7d9] bg-[#f4faf4] text-[#1f2a23]"
            : "border-[#e4e9e2] bg-white text-[#4d5850]",
        )}
      >
        <p>{children}</p>
        <div
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[11px]",
            isUser ? "justify-end text-[#6d7b70]" : "justify-end text-[#89928a]",
          )}
        >
          <span>{time}</span>
          {isUser ? <span className="font-semibold text-brand">Sent</span> : null}
        </div>
      </div>
    </div>
  );
}

function ProjectMatchCard({
  project,
}: {
  project: (typeof projectMatches)[number];
}) {
  return (
    <article className="flex min-h-[286px] min-w-0 flex-col rounded-[18px] border border-[#e1e7df] bg-white p-4 shadow-[0_12px_28px_rgba(23,39,28,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[14px] font-extrabold leading-5 text-[#111712]">
          {project.name}
        </h3>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-full text-[#707a72] transition-colors hover:bg-[#f2f5f0]"
          aria-label={`Project options for ${project.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <span
        className={cn(
          "mt-2 inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-extrabold",
          project.statusClass,
        )}
      >
        {project.status}
      </span>

      <dl className="mt-5 space-y-3 text-[12px]">
        <div>
          <dt className="text-[#899188]">Current Stage</dt>
          <dd className={cn("mt-1 flex items-center gap-1.5 font-extrabold", project.stageClass)}>
            {project.stage}
            <span className={cn("size-1.5 rounded-full", project.stageDotClass)} />
          </dd>
        </div>
        <div>
          <dt className="text-[#899188]">Owner</dt>
          <dd className="mt-1 flex items-center gap-2 font-semibold text-[#222b25]">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-[9px] font-extrabold",
                project.ownerAvatarClass,
              )}
            >
              {project.ownerInitials}
            </span>
            {project.owner}
          </dd>
        </div>
        <div>
          <dt className="text-[#899188]">Executor</dt>
          <dd className="mt-1 font-extrabold text-[#202922]">{project.executor}</dd>
        </div>
        <div>
          <dt className="text-[#899188]">Deadline</dt>
          <dd className="mt-1 flex items-center gap-2 font-bold text-[#222b25]">
            <CalendarDays className="h-3.5 w-3.5 text-[#758078]" />
            {project.deadline}
          </dd>
        </div>
      </dl>

      <Button asChild size="sm" className="mt-auto min-h-10 w-full text-[13px]">
        <Link href="#">View Project</Link>
      </Button>
    </article>
  );
}

export function FluxAiWorkspace() {
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(430px,1.05fr)]">
        <Panel className="flex min-h-[760px] flex-col p-5 sm:p-7 lg:p-8">
          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[42px] font-extrabold leading-none tracking-normal text-[#121714] sm:text-[54px]">
                Flux AI
              </h1>
              <Sparkles className="h-8 w-8 text-[#173f2d] sm:h-9 sm:w-9" />
            </div>
            <p className="mt-3 max-w-[620px] text-[15px] leading-6 text-[#4f5a52]">
              Ask, find, create, and manage projects with AI.
            </p>
          </header>

          <div className="flex flex-1 flex-col justify-end gap-5">
            <div className="space-y-5">
              <ChatMessage role="user" time="10:24 AM">
                Find projects assigned to QA Agency 01
              </ChatMessage>
              <ChatMessage role="assistant" time="10:24 AM">
                Here are the projects assigned to QA Agency 01.
              </ChatMessage>
              <ChatMessage role="user" time="10:26 AM">
                Create a packaging project for Milano Ramadan Campaign with 2 stages.
              </ChatMessage>
              <ChatMessage role="assistant" time="10:26 AM">
                I&apos;ve prepared a draft project based on your request. Review the
                details on the right and confirm to create it.
              </ChatMessage>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-5">
              {promptChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="min-h-10 rounded-full border border-brand/25 bg-white px-4 text-[12px] font-extrabold text-[#1f704a] shadow-[0_10px_24px_rgba(43,128,85,0.05)] transition-colors hover:bg-[#f2faf4]"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="rounded-[24px] border border-brand/25 bg-white p-4 shadow-[0_14px_34px_rgba(23,39,28,0.04)]">
              <div className="flex min-h-[92px] items-end gap-3">
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full text-[#5d6860] transition-colors hover:bg-[#f1f5f1] hover:text-brand"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <textarea
                  aria-label="Ask Flux AI"
                  placeholder="Ask Flux AI anything about projects, stages, approvals, invoices, or archives..."
                  className="min-h-[78px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[14px] leading-6 text-[#202922] outline-none placeholder:text-[#8c948d]"
                />
                <button
                  type="button"
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#2f8d5d,#123f2d)] text-white shadow-[0_16px_34px_rgba(34,102,70,0.22)] transition-transform hover:-translate-y-0.5"
                  aria-label="Send message"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-[#9aa199]">
              Flux AI can make mistakes. Always review important information.
            </p>
          </div>
        </Panel>

        <aside className="grid min-w-0 content-start gap-4">
          <Panel className="p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <PanelIcon>
                  <Briefcase className="h-5 w-5" />
                </PanelIcon>
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
                    Project Matches
                  </h2>
                  <p className="text-[13px] font-medium text-[#667168]">3 projects found</p>
                </div>
              </div>
              <Link
                href="#"
                className="inline-flex shrink-0 items-center gap-2 text-[13px] font-extrabold text-brand"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {projectMatches.map((project) => (
                <ProjectMatchCard key={project.name} project={project} />
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <PanelIcon>
                  <FileText className="h-5 w-5" />
                </PanelIcon>
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
                    Draft Project Preview
                  </h2>
                  <p className="text-[13px] font-medium text-[#667168]">
                    Review extracted details before creating.
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-[#fff0ef] px-3 py-1 text-[12px] font-extrabold text-[#bd4d45]">
                Missing 3 fields
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(230px,0.85fr)]">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.95fr)]">
                <dl className="space-y-3">
                  {extractedDetails.map((detail) => {
                    const Icon = detail.icon;

                    return (
                      <div
                        key={detail.label}
                        className="grid grid-cols-[18px_minmax(90px,0.68fr)_minmax(0,1fr)] items-center gap-2 text-[12px]"
                      >
                        <Icon className="h-4 w-4 text-[#848e86]" />
                        <dt className="text-[#7a847c]">{detail.label}</dt>
                        <dd className="min-w-0 truncate font-bold text-[#202922]">
                          {detail.value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                <div className="rounded-[16px] border border-[#e5ebe3] bg-[#fbfcfa] p-4">
                  <div>
                    <p className="text-[12px] font-semibold text-[#8a928b]">
                      Collaborators
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {["SM", "YK", "AN"].map((initials) => (
                        <span
                          key={initials}
                          className="grid size-8 place-items-center rounded-full border border-brand/15 bg-[#edf8ef] text-[10px] font-extrabold text-brand"
                        >
                          {initials}
                        </span>
                      ))}
                      <span className="grid size-8 place-items-center rounded-full border border-[#dce5dc] bg-white text-[10px] font-extrabold text-[#6e786f]">
                        +2
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8a928b]">
                      <UsersRound className="h-4 w-4" />
                      Stages (2)
                    </div>
                    <ol className="mt-2 space-y-2 text-[12px] font-bold text-[#263129]">
                      <li className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-full bg-[#e4f4e8] text-[11px] text-brand">
                          1
                        </span>
                        Concept &amp; Design
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-full bg-[#e4f4e8] text-[11px] text-brand">
                          2
                        </span>
                        Production &amp; Delivery
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="rounded-[18px] bg-[#fff4f4] p-4">
                <h3 className="text-[13px] font-extrabold text-[#bd4d45]">
                  Missing Fields
                </h3>
                <ul className="mt-3 space-y-3 text-[12px] font-semibold text-[#5b403d]">
                  {["Start Date", "Client Name", "Budget Category"].map((field) => (
                    <li key={field} className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-[#d45e55]" />
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Button type="button" size="sm" className="min-h-11">
                Create Project
              </Button>
              <Button type="button" size="sm" variant="outline" className="min-h-11">
                Edit Details
              </Button>
              <Button type="button" size="sm" variant="secondary" className="min-h-11">
                Cancel
              </Button>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <PanelIcon>
                  <Bot className="h-5 w-5" />
                </PanelIcon>
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-extrabold leading-tight text-[#111712]">
                    AI Suggestions
                  </h2>
                  <p className="text-[13px] font-medium text-[#667168]">
                    Smart recommendations based on your activity
                  </p>
                </div>
              </div>
              <Link
                href="#"
                className="inline-flex shrink-0 items-center gap-2 text-[13px] font-extrabold text-brand"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {suggestions.map((suggestion) => {
                const Icon = suggestion.icon;

                return (
                  <button
                    key={suggestion.title}
                    type="button"
                    className="flex min-h-[88px] min-w-0 items-center gap-3 rounded-[16px] border border-[#e3e9e1] bg-white p-4 text-left shadow-[0_12px_26px_rgba(23,39,28,0.035)] transition-colors hover:bg-[#f8fbf7]"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#eaf6ed] text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-extrabold leading-4 text-[#111712]">
                        {suggestion.title}
                      </span>
                      <span className="mt-1 block text-[12px] font-medium text-[#7a837b]">
                        {suggestion.meta}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

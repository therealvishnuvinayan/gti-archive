"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Search,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  helpCenterIntro,
  helpCoreWorkflow,
  helpKeyTerms,
  helpManagementHighlights,
  helpSearchKeywords,
  helpSections,
  helpTopics,
  quickStartItems,
  recommendedGuides,
  type HelpGuide,
  type HelpQuickStartItem,
  type HelpSection,
  type HelpTopic,
} from "@/lib/help-center";
import { cn } from "@/lib/utils";

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function flattenSearchValues(values: Array<string | string[] | undefined>) {
  return values
    .flatMap((value) => {
      if (!value) {
        return [];
      }

      return Array.isArray(value) ? value : [value];
    })
    .join(" ")
    .toLowerCase();
}

function matchesQuery(
  query: string,
  values: Array<string | string[] | undefined>,
) {
  if (!query) {
    return true;
  }

  return flattenSearchValues(values).includes(query);
}

function getSectionSearchValues(section: HelpSection) {
  return [
    section.eyebrow,
    section.title,
    section.summary,
    section.keywords,
    section.callout,
    section.blocks.map((block) => block.title),
    section.blocks.flatMap((block) => block.items),
    section.questions?.map((question) => question.question),
    section.questions?.map((question) => question.answer),
  ];
}

function SectionJumpButton({
  title,
  description,
  icon: Icon,
  isActive,
  onClick,
}: {
  title: string;
  description: string;
  icon: HelpQuickStartItem["icon"] | HelpTopic["icon"];
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full cursor-pointer text-left"
    >
      <Card
        className={cn(
          "rounded-[22px] border border-[#edf2eb] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-[0_20px_50px_rgba(23,39,28,0.08)]",
          isActive && "border-brand/40 bg-[#f5fbf6]",
        )}
      >
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[#edf7ef] text-brand">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-[700] tracking-[-0.02em] text-[#151d17]">
              {title}
            </h3>
            <p className="mt-1 text-[13px] leading-6 text-[#6d786f]">
              {description}
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#6d786f]" />
        </div>
      </Card>
    </button>
  );
}

function GuideRow({
  guide,
  isActive,
  onClick,
}: {
  guide: HelpGuide;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full cursor-pointer text-left"
    >
      <Card
        className={cn(
          "rounded-[18px] border border-[#edf2eb] px-4 py-3 transition-colors hover:border-brand/25 hover:bg-[#fbfcfa]",
          isActive && "border-brand/40 bg-[#f5fbf6]",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-[#f3f7f2] text-brand">
            <BookOpenText className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-[700] text-[#182119]">
              {guide.title}
            </h3>
            <p className="mt-1 text-[13px] leading-6 text-[#6f796f]">
              {guide.description}
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#748073]" />
        </div>
      </Card>
    </button>
  );
}

function HelpSectionCard({
  section,
  isActive,
}: {
  section: HelpSection;
  isActive: boolean;
}) {
  return (
    <Card
      id={`help-section-${section.id}`}
      className={cn(
        "rounded-[28px] border border-[#edf2eb] p-5 sm:p-6",
        isActive && "border-brand/40 bg-[#fcfefc] shadow-[0_22px_55px_rgba(34,102,70,0.09)]",
      )}
    >
      <div className="space-y-3">
        <p className="text-[11px] font-[700] uppercase tracking-[0.18em] text-brand/75">
          {section.eyebrow}
        </p>
        <div className="space-y-2">
          <h2 className="text-[30px] font-[600] tracking-[-0.04em] text-[#131a14]">
            {section.title}
          </h2>
          <p className="max-w-[980px] text-[15px] leading-7 text-[#68736a]">
            {section.summary}
          </p>
        </div>
      </div>

      {section.callout ? (
        <div className="mt-5 rounded-[22px] border border-[#d7eadb] bg-[#f3fbf5] px-4 py-4 text-[14px] leading-6 text-[#29563c]">
          {section.callout}
        </div>
      ) : null}

      <div
        className={cn(
          "mt-5 grid gap-4",
          section.blocks.length === 1
            ? "grid-cols-1"
            : section.blocks.length === 2
              ? "grid-cols-1 xl:grid-cols-2"
              : "grid-cols-1 xl:grid-cols-3",
        )}
      >
        {section.blocks.map((block) => (
          <div
            key={`${section.id}-${block.title}`}
            className="rounded-[22px] border border-[#edf2eb] bg-[#fbfcfa] p-4"
          >
            <h3 className="text-[16px] font-[700] text-[#182119]">
              {block.title}
            </h3>
            {block.ordered ? (
              <ol className="mt-3 space-y-3">
                {block.items.map((item, index) => (
                  <li key={`${block.title}-${index}`} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#edf7ef] text-[11px] font-[700] text-brand">
                      {index + 1}
                    </span>
                    <span className="text-[14px] leading-6 text-[#677268]">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="mt-3 space-y-3">
                {block.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
                    <span className="text-[14px] leading-6 text-[#677268]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {section.questions?.length ? (
        <div className="mt-5 rounded-[24px] border border-[#edf2eb] bg-white p-4 sm:p-5">
          <h3 className="text-[18px] font-[700] tracking-[-0.03em] text-[#182119]">
            Common questions
          </h3>
          <div className="mt-4 space-y-4">
            {section.questions.map((question) => (
              <div
                key={question.question}
                className="rounded-[18px] border border-[#eff3ee] bg-[#fbfcfa] px-4 py-4"
              >
                <p className="text-[14px] font-[700] text-[#1c241d]">
                  {question.question}
                </p>
                <p className="mt-2 text-[14px] leading-6 text-[#68736a]">
                  {question.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function HelpWorkspace() {
  const [query, setQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState(helpSections[0]?.id ?? "");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchValue(deferredQuery);

  const filteredQuickStart = useMemo(
    () =>
      quickStartItems.filter((item) =>
        matchesQuery(normalizedQuery, [item.title, item.description, item.keywords]),
      ),
    [normalizedQuery],
  );
  const filteredTopics = useMemo(
    () =>
      helpTopics.filter((topic) =>
        matchesQuery(normalizedQuery, [topic.title, topic.description, topic.keywords]),
      ),
    [normalizedQuery],
  );
  const filteredGuides = useMemo(
    () =>
      recommendedGuides.filter((guide) =>
        matchesQuery(normalizedQuery, [guide.title, guide.description, guide.keywords]),
      ),
    [normalizedQuery],
  );
  const filteredSections = useMemo(
    () =>
      helpSections.filter((section) =>
        matchesQuery(normalizedQuery, getSectionSearchValues(section)),
      ),
    [normalizedQuery],
  );

  const totalMatches =
    filteredQuickStart.length +
    filteredTopics.length +
    filteredGuides.length +
    filteredSections.length;

  function jumpToSection(sectionId: string) {
    setActiveSectionId(sectionId);

    const sectionElement = document.getElementById(`help-section-${sectionId}`);
    sectionElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
          {helpCenterIntro.title}
        </h1>
        <p className="max-w-[880px] text-[15px] text-[#6f776f]">
          {helpCenterIntro.subtitle}
        </p>
      </header>

      <Card className="rounded-[28px] border border-[#edf2eb] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#8d978e]" />
            <Input
              id="help-center-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={helpCenterIntro.searchPlaceholder}
              className="h-[56px] rounded-[20px] border border-[#dfe6de] pl-11 pr-14 text-[15px] text-[#1c241e] shadow-none focus-visible:ring-2 focus-visible:ring-brand/20 placeholder:text-[#9aa39a]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-2 text-[#7b867d] transition-colors hover:bg-[#f1f4f1] hover:text-[#172019]"
                aria-label="Clear help search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <Button
            type="button"
            size="icon"
            className="h-[56px] w-[56px] cursor-pointer rounded-[18px]"
            onClick={() => {
              const input = document.getElementById(
                "help-center-search",
              ) as HTMLInputElement | null;
              input?.focus();
            }}
            aria-label="Focus help search"
            title="Focus help search"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-[13px] text-[#738076] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Search across quick starts, topic cards, recommended guides, and detailed product instructions.
          </p>
          <p className="text-brand/80">
            Try: {helpSearchKeywords.slice(0, 5).join(", ")}
          </p>
        </div>
      </Card>

      {normalizedQuery ? (
        <Card className="rounded-[22px] border border-[#e8efe8] bg-[#fbfcfa] px-4 py-3 text-[14px] text-[#536057]">
          {totalMatches > 0
            ? `Showing ${totalMatches} matching help results for “${query.trim()}”.`
            : "No help topics found."}
        </Card>
      ) : null}

      {totalMatches === 0 && normalizedQuery ? (
        <Card className="rounded-[28px] border border-dashed border-[#dbe3da] bg-[#fbfcfa] px-5 py-10 text-center">
          <div className="mx-auto max-w-[520px] space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#edf7ef] text-brand">
              <Search className="h-6 w-6" />
            </div>
            <h2 className="text-[26px] font-[600] tracking-[-0.03em] text-[#172019]">
              No help topics found.
            </h2>
            <p className="text-[15px] leading-7 text-[#6d786f]">
              Try broader terms like project, accept brief, library, archive, notifications, or permissions.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {filteredQuickStart.length > 0 ? (
            <section className="space-y-3">
              <div>
                <div className="flex items-center gap-2 text-[#1d241e]">
                  <Sparkles className="h-4.5 w-4.5 text-brand" />
                  <h2 className="text-[28px] font-[600] tracking-[-0.03em]">
                    Quick Start
                  </h2>
                </div>
                <p className="mt-1 text-[14px] text-[#728071]">
                  Start with the most common GTI Archive workflows.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {filteredQuickStart.map((item) => (
                  <SectionJumpButton
                    key={item.id}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    isActive={activeSectionId === item.sectionId}
                    onClick={() => jumpToSection(item.sectionId)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {filteredTopics.length > 0 ? (
                <Card className="rounded-[28px] border border-[#edf2eb] p-5 sm:p-6">
                  <div className="space-y-1">
                    <h2 className="text-[30px] font-[600] tracking-[-0.04em] text-[#151c17]">
                      Browse Help Topics
                    </h2>
                    <p className="text-[14px] text-[#728071]">
                      Explore the major GTI Archive modules and workflows.
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {filteredTopics.map((topic) => (
                      <SectionJumpButton
                        key={topic.id}
                        title={topic.title}
                        description={topic.description}
                        icon={topic.icon}
                        isActive={activeSectionId === topic.sectionId}
                        onClick={() => jumpToSection(topic.sectionId)}
                      />
                    ))}
                  </div>
                </Card>
              ) : null}

              {filteredGuides.length > 0 ? (
                <Card className="rounded-[28px] border border-[#edf2eb] p-5 sm:p-6">
                  <div className="space-y-1">
                    <h2 className="text-[30px] font-[600] tracking-[-0.04em] text-[#151c17]">
                      Recommended Guides
                    </h2>
                    <p className="text-[14px] text-[#728071]">
                      Common workflows users revisit most often.
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {filteredGuides.map((guide) => (
                      <GuideRow
                        key={guide.id}
                        guide={guide}
                        isActive={activeSectionId === guide.sectionId}
                        onClick={() => jumpToSection(guide.sectionId)}
                      />
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>

            <div className="space-y-4">
              <Card className="rounded-[28px] border border-[#edf2eb] p-5 sm:p-6">
                <h2 className="text-[28px] font-[600] tracking-[-0.04em] text-[#151c17]">
                  What GTI Archive helps you manage
                </h2>
                <ul className="mt-5 space-y-3">
                  {helpManagementHighlights.map((item) => (
                    <li key={item} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
                      <span className="text-[14px] leading-6 text-[#68736a]">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="rounded-[28px] border border-[#edf2eb] p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Workflow className="h-5 w-5 text-brand" />
                  <h2 className="text-[28px] font-[600] tracking-[-0.04em] text-[#151c17]">
                    Core workflow
                  </h2>
                </div>
                <ol className="mt-5 space-y-3">
                  {helpCoreWorkflow.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#edf7ef] text-[12px] font-[700] text-brand">
                        {index + 1}
                      </span>
                      <span className="text-[14px] leading-6 text-[#68736a]">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card className="rounded-[28px] border border-[#edf2eb] p-5 sm:p-6">
                <h2 className="text-[28px] font-[600] tracking-[-0.04em] text-[#151c17]">
                  Key terms
                </h2>
                <div className="mt-5 space-y-4">
                  {helpKeyTerms.map((entry) => (
                    <div
                      key={entry.term}
                      className="rounded-[18px] border border-[#eff3ee] bg-[#fbfcfa] px-4 py-4"
                    >
                      <p className="text-[14px] font-[700] text-[#182119]">
                        {entry.term}
                      </p>
                      <p className="mt-1 text-[13px] leading-6 text-[#6d786f]">
                        {entry.description}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {filteredSections.length > 0 ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-[32px] font-[600] tracking-[-0.04em] text-[#151c17]">
                  Product Guide
                </h2>
                <p className="mt-1 text-[14px] text-[#728071]">
                  Use these sections to understand the platform end-to-end.
                </p>
              </div>

              <div className="space-y-4">
                {filteredSections.map((section) => (
                  <HelpSectionCard
                    key={section.id}
                    section={section}
                    isActive={activeSectionId === section.id}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

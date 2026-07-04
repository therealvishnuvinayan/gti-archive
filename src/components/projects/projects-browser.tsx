"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import {
  CalendarMonthGrid,
  formatCalendarDateValue,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
import { ProjectCard, type ProjectCardItem } from "@/components/projects/project-card";
import { ProjectSortDropdown } from "@/components/projects/project-sort-dropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ProjectFilterValue = string;
type ProjectSortValue = "newest" | "oldest" | "name";

type ProjectFilter = {
  label: string;
  value: ProjectFilterValue;
};

type ProjectUserFilterOption = {
  id: string;
  name: string;
  email: string;
};

type ProjectsBrowserProps = {
  projects: ProjectCardItem[];
  hasAnyProjects: boolean;
  canCreateProject: boolean;
  activeStatus: ProjectFilterValue;
  activeSort: ProjectSortValue;
  query: string;
  activeCategory: string;
  activeTag: string;
  activeOwnerId: string;
  activeExecutorId: string;
  activeCreatedFrom: string;
  activeCreatedTo: string;
  activeBudgetRequired: string;
  activeBudgetMin: string;
  activeBudgetMax: string;
  activeBudgetCurrency: string;
  categoryOptions: string[];
  statusOptions: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    groupId: string | null;
    groupName: string;
    groupSlug: string;
    groupColor: string;
    groupIsActive: boolean;
  }>;
  tagOptions: string[];
  ownerOptions: ProjectUserFilterOption[];
  executorOptions: ProjectUserFilterOption[];
  filters: ProjectFilter[];
};

function getEmptyStateCopy(
  hasAnyProjects: boolean,
  canCreateProject: boolean,
  activeStatus: ProjectFilterValue,
  query: string,
  category: string,
  tag: string,
  selectedStatusName?: string,
) {
  if (query || category || tag || selectedStatusName) {
    return {
      title: "No projects found",
      description: "Try changing your search or filters.",
    };
  }

  if (!hasAnyProjects) {
    return {
      title: "No projects found",
      description: canCreateProject
        ? "Create a project to populate the projects board."
        : "There are no projects to show right now.",
    };
  }

  const statusLabel =
    activeStatus === "ALL"
      ? "project"
      : activeStatus === "ACTIVE"
        ? "active"
        : activeStatus === "PENDING"
        ? "pending or paused"
        : activeStatus === "ON_HOLD"
          ? "on hold"
          : activeStatus === "COMPLETED"
            ? "completed"
            : "ongoing";

  return {
    title: activeStatus === "ALL" ? "No projects found" : `No ${statusLabel} projects`,
    description:
      activeStatus === "ALL"
        ? "There are no projects to show right now."
        : `There are no ${statusLabel} projects to show right now.`,
  };
}

function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-[22px] p-5 shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
          <CardContent className="p-0">
            <div className="space-y-4">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-4 w-32 rounded-full" />
              <div className="space-y-2 pt-2">
                <Skeleton className="h-7 w-full rounded-full" />
                <Skeleton className="h-7 w-10/12 rounded-full" />
                <Skeleton className="h-7 w-8/12 rounded-full" />
              </div>
              <div className="space-y-2 pt-1">
                <Skeleton className="h-4 w-36 rounded-full" />
                <Skeleton className="h-4 w-40 rounded-full" />
              </div>
              <Skeleton className="h-[52px] w-full rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const ALL_CATEGORIES = "__all_categories__";
const ALL_PROJECT_STATUSES = "__all_project_statuses__";
const ALL_TAGS = "__all_tags__";
const ALL_OWNERS = "__all_owners__";
const ALL_EXECUTORS = "__all_executors__";
const ALL_BUDGET_REQUIREMENTS = "__all_budget_requirements__";
const ALL_BUDGET_CURRENCIES = "__all_budget_currencies__";
const budgetCurrencyOptions = ["AED", "USD", "EUR"] as const;

function getUserFilterLabel(option: ProjectUserFilterOption) {
  return option.name === option.email ? option.name : `${option.name} (${option.email})`;
}

function getDateFilterDate(value: string) {
  if (!value) {
    return new Date();
  }

  const parsedDate = parseCalendarDateValue(value);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function getDateFilterDisplay(value: string) {
  if (!value) {
    return "Any date";
  }

  const date = getDateFilterDate(value);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function DateFilterField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = getDateFilterDate(value);
  const [month, setMonth] = useState(() => selectedDate);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-slot="select-content"]')) {
        return;
      }

      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        className="h-[46px] w-full justify-between rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium text-[#18211a]"
        onClick={() => {
          setMonth(selectedDate);
          setOpen((current) => !current);
        }}
      >
        <span className="min-w-0 truncate">{getDateFilterDisplay(value)}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
      </Button>

      {open ? (
        <Card className="absolute left-0 top-[calc(100%+10px)] z-30 w-[320px] rounded-[22px] border border-line p-4 shadow-[0_20px_50px_rgba(23,39,28,0.16)]">
          <CalendarMonthGrid
            month={month}
            selectedDate={selectedDate}
            onMonthChange={setMonth}
            onSelect={(date) => {
              onChange(formatCalendarDateValue(date));
              setMonth(date);
              setOpen(false);
            }}
            compact
          />
          <div className="mt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-[12px] text-brand"
              onClick={() => {
                const today = new Date();
                onChange(formatCalendarDateValue(today));
                setMonth(today);
                setOpen(false);
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-[12px] text-[#6a706b]"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function ProjectsBrowser({
  projects,
  hasAnyProjects,
  canCreateProject,
  activeStatus,
  activeSort,
  query,
  activeCategory,
  activeTag,
  activeOwnerId,
  activeExecutorId,
  activeCreatedFrom,
  activeCreatedTo,
  activeBudgetRequired,
  activeBudgetMin,
  activeBudgetMax,
  activeBudgetCurrency,
  categoryOptions,
  statusOptions,
  tagOptions,
  ownerOptions,
  executorOptions,
  filters,
}: ProjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const budgetMinRef = useRef<HTMLInputElement>(null);
  const budgetMaxRef = useRef<HTMLInputElement>(null);
  const activeStatusOption =
    statusOptions.find((status) => status.id === activeStatus) ?? null;
  const hasActiveAdvancedFilters = Boolean(
    activeOwnerId ||
      activeExecutorId ||
      activeCreatedFrom ||
      activeCreatedTo ||
      activeBudgetRequired ||
      activeBudgetMin ||
      activeBudgetMax ||
      activeBudgetCurrency,
  );
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(hasActiveAdvancedFilters);
  const activeAdvancedFilterCount = [
    activeOwnerId,
    activeExecutorId,
    activeCreatedFrom || activeCreatedTo,
    activeBudgetRequired,
    activeBudgetMin || activeBudgetMax,
    activeBudgetCurrency,
  ].filter(Boolean).length;
  const hasActiveFilters = Boolean(
    query || activeCategory || activeTag || activeStatusOption || hasActiveAdvancedFilters,
  );
  const currentSearch = searchParams.toString();
  const currentProjectsHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const emptyState = getEmptyStateCopy(
    hasAnyProjects,
    canCreateProject,
    activeStatus,
    query,
    activeCategory,
    activeTag,
    activeStatusOption?.name || (hasActiveAdvancedFilters ? "advanced filters" : undefined),
  );

  const navigate = ({
    status = activeStatus,
    sort = activeSort,
    category = activeCategory,
    tag = activeTag,
    ownerId = activeOwnerId,
    executorId = activeExecutorId,
    createdFrom = activeCreatedFrom,
    createdTo = activeCreatedTo,
    budgetRequired = activeBudgetRequired,
    budgetMin = budgetMinRef.current?.value ?? activeBudgetMin,
    budgetMax = budgetMaxRef.current?.value ?? activeBudgetMax,
    budgetCurrency = activeBudgetCurrency,
    nextQuery,
  }: {
    status?: ProjectFilterValue;
    sort?: ProjectSortValue;
    category?: string;
    tag?: string;
    ownerId?: string;
    executorId?: string;
    createdFrom?: string;
    createdTo?: string;
    budgetRequired?: string;
    budgetMin?: string;
    budgetMax?: string;
    budgetCurrency?: string;
    nextQuery?: string;
  }) => {
    const params = new URLSearchParams();
    const normalizedQuery = (
      nextQuery ?? searchInputRef.current?.value ?? query
    ).trim();

    if (normalizedQuery) {
      params.set("q", normalizedQuery);
    }
    if (category) {
      params.set("category", category);
    }
    if (tag) {
      params.set("tag", tag);
    }
    if (ownerId) {
      params.set("ownerId", ownerId);
    }
    if (executorId) {
      params.set("executorId", executorId);
    }
    if (createdFrom) {
      params.set("createdFrom", createdFrom);
    }
    if (createdTo) {
      params.set("createdTo", createdTo);
    }
    if (budgetRequired === "true" || budgetRequired === "false") {
      params.set("budgetRequired", budgetRequired);
    }
    if (budgetMin) {
      params.set("budgetMin", budgetMin);
    }
    if (budgetMax) {
      params.set("budgetMax", budgetMax);
    }
    if (budgetCurrency) {
      params.set("budgetCurrency", budgetCurrency);
    }
    params.set("status", status);
    params.set("sort", sort);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const categoryValues =
    activeCategory && !categoryOptions.includes(activeCategory)
      ? [activeCategory, ...categoryOptions]
      : categoryOptions;
  const tagValues =
    activeTag && !tagOptions.includes(activeTag)
      ? [activeTag, ...tagOptions]
      : tagOptions;

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      nextQuery: searchInputRef.current?.value ?? query,
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push(`${pathname}?status=ACTIVE&sort=${activeSort}`, {
        scroll: false,
      });
    });
  }

  return (
    <>
      <MotionSection>
        <header className="space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="text-[42px] font-semibold tracking-tight text-[#0f1411] sm:text-[52px]">
              Projects
            </h1>

            <form onSubmit={handleSearchSubmit} className="w-full lg:w-auto">
              <label className="relative block lg:w-[520px] xl:w-[560px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a091]" />
                <Input
                  key={query}
                  ref={searchInputRef}
                  type="search"
                  defaultValue={query}
                  placeholder="Search by project name, owner, category, tag, or executor..."
                  className="h-[52px] rounded-[18px] border border-[#dde6dd] bg-white pl-11 pr-4 text-[15px] shadow-[0_10px_28px_rgba(18,34,25,0.05)]"
                />
                <button type="submit" className="sr-only">
                  Search
                </button>
              </label>
            </form>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={activeCategory || ALL_CATEGORIES}
                  onValueChange={(value) =>
                    navigate({
                      category: value === ALL_CATEGORIES ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-[46px] w-full min-w-[160px] rounded-[16px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium shadow-[0_10px_24px_rgba(18,34,25,0.04)] sm:w-[172px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES}>All Categories</SelectItem>
                    {categoryValues.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={activeStatusOption?.id ?? ALL_PROJECT_STATUSES}
                  onValueChange={(value) =>
                    navigate({
                      status: value === ALL_PROJECT_STATUSES ? "ALL" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-[46px] w-full min-w-[160px] rounded-[16px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium shadow-[0_10px_24px_rgba(18,34,25,0.04)] sm:w-[184px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PROJECT_STATUSES}>All Statuses</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <span className="flex items-center gap-2">
                          {status.color ? (
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: status.color }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{status.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={activeTag || ALL_TAGS}
                  onValueChange={(value) =>
                    navigate({
                      tag: value === ALL_TAGS ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-[46px] w-full min-w-[140px] rounded-[16px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium shadow-[0_10px_24px_rgba(18,34,25,0.04)] sm:w-[160px]">
                    <SelectValue placeholder="All Tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TAGS}>All Tags</SelectItem>
                    {tagValues.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasAnyProjects ? (
                <div className="inline-flex w-full flex-wrap rounded-[16px] border border-[#cfe0d4] bg-white p-1 shadow-[0_10px_24px_rgba(18,34,25,0.04)] lg:w-auto">
                  {filters.map((filter) => (
                    <Button
                      key={filter.label}
                      type="button"
                      size="default"
                      variant={activeStatus === filter.value ? "default" : "ghost"}
                      className={`min-h-[40px] flex-1 rounded-[12px] px-5 text-[15px] lg:flex-none ${
                        activeStatus === filter.value
                          ? "shadow-[0_12px_28px_rgba(34,102,70,0.18)]"
                          : "text-[#435042]"
                      }`}
                      onClick={() => navigate({ status: filter.value })}
                      disabled={isPending && activeStatus === filter.value}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => setAdvancedFiltersOpen((open) => !open)}
                className="h-[42px] self-start rounded-full px-4 text-[14px] font-[700] text-[#435042]"
                aria-expanded={advancedFiltersOpen}
              >
                <SlidersHorizontal className="h-4 w-4" />
                More filters
                {activeAdvancedFilterCount > 0 ? (
                  <span className="ml-1 rounded-full bg-[#266646] px-2 py-0.5 text-[11px] font-[800] text-white">
                    {activeAdvancedFilterCount}
                  </span>
                ) : null}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    advancedFiltersOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearFilters}
                  disabled={isPending}
                  className="h-[42px] self-start rounded-full px-4 text-[14px] font-[700] text-[#5b675e]"
                >
                  <X className="h-4 w-4" />
                  Clear all filters
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
              {canCreateProject ? (
                <Button asChild size="lg" className="min-w-[170px] text-[16px]">
                  <Link href="/projects/new">+ New Project</Link>
                </Button>
              ) : null}
              {hasAnyProjects ? (
                <ProjectSortDropdown
                  activeSort={activeSort}
                  activeStatus={activeStatus}
                  query={query}
                  category={activeCategory}
                  tag={activeTag}
                  onSelectSort={(sort) => navigate({ sort })}
                  disabled={isPending}
                  pending={isPending}
                  className="min-h-[46px] min-w-[120px] rounded-[16px] px-5 text-[15px]"
                />
              ) : null}
            </div>
          </div>

          {advancedFiltersOpen ? (
            <div
              className="rounded-[20px] border border-[#dce6de] bg-white p-4 shadow-[0_12px_30px_rgba(18,34,25,0.05)]"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Project Owner
                  </span>
                  <Select
                    value={activeOwnerId || ALL_OWNERS}
                    onValueChange={(value) =>
                      navigate({
                        ownerId: value === ALL_OWNERS ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-[46px] w-full rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium">
                      <SelectValue placeholder="All owners" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_OWNERS}>All owners</SelectItem>
                      {ownerOptions.map((owner) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {getUserFilterLabel(owner)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Executor
                  </span>
                  <Select
                    value={activeExecutorId || ALL_EXECUTORS}
                    onValueChange={(value) =>
                      navigate({
                        executorId: value === ALL_EXECUTORS ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-[46px] w-full rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium">
                      <SelectValue placeholder="All executors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_EXECUTORS}>All executors</SelectItem>
                      {executorOptions.map((executor) => (
                        <SelectItem key={executor.id} value={executor.id}>
                          {getUserFilterLabel(executor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Date From
                  </span>
                  <DateFilterField
                    value={activeCreatedFrom}
                    onChange={(value) => navigate({ createdFrom: value })}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Date To
                  </span>
                  <DateFilterField
                    value={activeCreatedTo}
                    onChange={(value) => navigate({ createdTo: value })}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Budget Requirement
                  </span>
                  <Select
                    value={activeBudgetRequired || ALL_BUDGET_REQUIREMENTS}
                    onValueChange={(value) =>
                      navigate({
                        budgetRequired:
                          value === ALL_BUDGET_REQUIREMENTS ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-[46px] w-full rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium">
                      <SelectValue placeholder="All budgets" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_BUDGET_REQUIREMENTS}>All</SelectItem>
                      <SelectItem value="true">Budget required</SelectItem>
                      <SelectItem value="false">No budget required</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Min Budget
                  </span>
                  <Input
                    key={`budget-min-${activeBudgetMin}`}
                    ref={budgetMinRef}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={activeBudgetMin}
                    placeholder="Any"
                    onBlur={(event) => navigate({ budgetMin: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-[46px] rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Max Budget
                  </span>
                  <Input
                    key={`budget-max-${activeBudgetMax}`}
                    ref={budgetMaxRef}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={activeBudgetMax}
                    placeholder="Any"
                    onBlur={(event) => navigate({ budgetMax: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-[46px] rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#6d796f]">
                    Currency
                  </span>
                  <Select
                    value={activeBudgetCurrency || ALL_BUDGET_CURRENCIES}
                    onValueChange={(value) =>
                      navigate({
                        budgetCurrency:
                          value === ALL_BUDGET_CURRENCIES ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-[46px] w-full rounded-[14px] border border-[#dce6de] bg-white px-4 text-[14px] font-medium">
                      <SelectValue placeholder="All currencies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_BUDGET_CURRENCIES}>All</SelectItem>
                      {budgetCurrencyOptions.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

            </div>
          ) : null}
        </header>
      </MotionSection>

      {isPending ? (
        <ProjectsGridSkeleton />
      ) : projects.length > 0 ? (
        <MotionStaggerGroup
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          stagger={0.045}
        >
          {projects.map((project) => (
            <MotionItem key={project.id} y={10} layout>
              <ProjectCard project={project} returnHref={currentProjectsHref} />
            </MotionItem>
          ))}
        </MotionStaggerGroup>
      ) : (
        <MotionItem
          key={`${activeStatus}-${activeSort}-${query || "all"}-${activeCategory || "all-categories"}-${activeTag || "all-tags"}-${activeOwnerId || "all-owners"}-${activeExecutorId || "all-executors"}-${activeCreatedFrom || "from-any"}-${activeCreatedTo || "to-any"}-${activeBudgetRequired || "budget-any"}-${activeBudgetMin || "min-any"}-${activeBudgetMax || "max-any"}-${activeBudgetCurrency || "currency-any"}-empty`}
          y={8}
        >
          <Card className="min-h-[280px] rounded-[24px] text-center shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-8">
              <h2 className="text-[24px] font-[600] tracking-[-0.03em] text-[#111712]">
                {emptyState.title}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#6f776f]">
                {emptyState.description}
              </p>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="mt-6" onClick={clearFilters}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Reset filters
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </MotionItem>
      )}
    </>
  );
}

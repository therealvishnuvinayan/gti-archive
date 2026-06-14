"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useRef, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
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

type ProjectsBrowserProps = {
  projects: ProjectCardItem[];
  hasAnyProjects: boolean;
  canCreateProject: boolean;
  activeStatus: ProjectFilterValue;
  activeSort: ProjectSortValue;
  query: string;
  activeCategory: string;
  activeTag: string;
  categoryOptions: string[];
  statusOptions: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    group: string;
  }>;
  tagOptions: string[];
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

export function ProjectsBrowser({
  projects,
  hasAnyProjects,
  canCreateProject,
  activeStatus,
  activeSort,
  query,
  activeCategory,
  activeTag,
  categoryOptions,
  statusOptions,
  tagOptions,
  filters,
}: ProjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeStatusOption =
    statusOptions.find((status) => status.id === activeStatus) ?? null;
  const hasActiveFilters = Boolean(query || activeCategory || activeTag || activeStatusOption);
  const currentSearch = searchParams.toString();
  const currentProjectsHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const emptyState = getEmptyStateCopy(
    hasAnyProjects,
    canCreateProject,
    activeStatus,
    query,
    activeCategory,
    activeTag,
    activeStatusOption?.name,
  );

  const navigate = ({
    status = activeStatus,
    sort = activeSort,
    category = activeCategory,
    tag = activeTag,
    nextQuery,
  }: {
    status?: ProjectFilterValue;
    sort?: ProjectSortValue;
    category?: string;
    tag?: string;
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

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearFilters}
                  disabled={isPending}
                  className="h-[42px] self-start rounded-full px-4 text-[14px] font-[700] text-[#5b675e]"
                >
                  <X className="h-4 w-4" />
                  Clear filters
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
          key={`${activeStatus}-${activeSort}-${query || "all"}-${activeCategory || "all-categories"}-${activeTag || "all-tags"}-empty`}
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

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useRef, useTransition } from "react";
import { Search } from "lucide-react";

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

type ProjectFilterValue = "ONGOING" | "ON_HOLD" | "COMPLETED";
type ProjectSortValue = "newest" | "oldest" | "name";

type ProjectFilter = {
  label: string;
  value: ProjectFilterValue;
};

type ProjectsBrowserProps = {
  projects: ProjectCardItem[];
  hasAnyProjects: boolean;
  canManageProjects: boolean;
  activeStatus: ProjectFilterValue;
  activeSort: ProjectSortValue;
  query: string;
  activeCategory: string;
  activeTag: string;
  categoryOptions: string[];
  tagOptions: string[];
  filters: ProjectFilter[];
};

function getEmptyStateCopy(
  hasAnyProjects: boolean,
  activeStatus: ProjectFilterValue,
  query: string,
  category: string,
  tag: string,
) {
  if (query || category || tag) {
    return {
      title: "No projects found",
      description: "Try changing your search or filters.",
    };
  }

  if (!hasAnyProjects) {
    return {
      title: "No projects found",
      description: "Create a project to populate the projects board.",
    };
  }

  const statusLabel =
    activeStatus === "ON_HOLD"
      ? "on hold"
      : activeStatus === "COMPLETED"
        ? "completed"
        : "ongoing";

  return {
    title: `No ${statusLabel} projects`,
    description: `There are no ${statusLabel} projects to show right now.`,
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
const ALL_TAGS = "__all_tags__";

export function ProjectsBrowser({
  projects,
  hasAnyProjects,
  canManageProjects,
  activeStatus,
  activeSort,
  query,
  activeCategory,
  activeTag,
  categoryOptions,
  tagOptions,
  filters,
}: ProjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const emptyState = getEmptyStateCopy(
    hasAnyProjects,
    activeStatus,
    query,
    activeCategory,
    activeTag,
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

  return (
    <>
      <MotionSection>
        <header className="space-y-5">
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <h1 className="text-4xl font-extrabold tracking-tight text-[#0f1411] sm:text-5xl">
              Projects
            </h1>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:justify-end">
                <form
                  onSubmit={handleSearchSubmit}
                  className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto"
                >
                  <label className="relative block min-w-0 flex-1 sm:min-w-[320px] xl:min-w-[360px]">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a091]" />
                    <Input
                      key={query}
                      ref={searchInputRef}
                      type="search"
                      defaultValue={query}
                      placeholder="Search projects..."
                      className="h-12 border border-[#dce6de] bg-white pl-11 pr-4 text-[15px] shadow-[0_10px_28px_rgba(18,34,25,0.06)]"
                    />
                  </label>
                  <Button type="submit" variant="outline" size="lg" className="text-[16px]">
                    Search
                  </Button>
                </form>

                <Select
                  value={activeCategory || ALL_CATEGORIES}
                  onValueChange={(value) =>
                    navigate({
                      category: value === ALL_CATEGORIES ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-12 min-w-[210px] rounded-full border border-[#dce6de] bg-white px-5 text-[15px] font-medium shadow-[0_10px_28px_rgba(18,34,25,0.06)]">
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
                  value={activeTag || ALL_TAGS}
                  onValueChange={(value) =>
                    navigate({
                      tag: value === ALL_TAGS ? "" : value,
                    })
                  }
                >
                  <SelectTrigger className="h-12 min-w-[190px] rounded-full border border-[#dce6de] bg-white px-5 text-[15px] font-medium shadow-[0_10px_28px_rgba(18,34,25,0.06)]">
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

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
                {hasAnyProjects ? (
                  <div className="inline-flex w-full flex-wrap rounded-full border border-brand bg-white p-1 xl:w-auto">
                    {filters.map((filter) => (
                      <Button
                        key={filter.label}
                        type="button"
                        size="default"
                        variant={activeStatus === filter.value ? "default" : "ghost"}
                        className="min-h-[44px] flex-1 px-6 text-[17px] xl:flex-none"
                        onClick={() => navigate({ status: filter.value })}
                        disabled={isPending && activeStatus === filter.value}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="text-[18px]">
                    <Link href="/projects/new">+ New Project</Link>
                  </Button>
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
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>
      </MotionSection>

      {isPending ? (
        <ProjectsGridSkeleton />
      ) : projects.length > 0 ? (
        <MotionStaggerGroup
          className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4"
          stagger={0.045}
        >
          {projects.map((project) => (
            <MotionItem key={project.id} y={10} layout>
              <ProjectCard project={project} canManage={canManageProjects} />
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
            </CardContent>
          </Card>
        </MotionItem>
      )}
    </>
  );
}

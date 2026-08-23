"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useRef, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  PanelsTopLeft,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { ProjectCard, type ProjectCardItem } from "@/components/projects/project-card";
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
import type { ProjectListRole, ProjectListStatus } from "@/lib/project-list-workflow";

type ProjectSortValue =
  | "priority"
  | "updated"
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc";

type ProjectUserFilterOption = {
  id: string;
  name: string;
  email: string;
};

type ProjectsBrowserProps = {
  projects: ProjectCardItem[];
  projectCount: number;
  currentPage: number;
  hasAnyProjects: boolean;
  canCreateProject: boolean;
  activeStatus: ProjectListStatus;
  activeSort: ProjectSortValue;
  activeStage: number | null;
  activeOwnerId: string;
  activeExecutorId: string;
  activeMyRole: ProjectListRole;
  query: string;
  ownerOptions: ProjectUserFilterOption[];
  executorOptions: ProjectUserFilterOption[];
  stageOptions: Array<{ number: number; name: string }>;
  filters: Array<{ label: string; value: ProjectListStatus }>;
};

const ALL_STAGES = "all-stages";
const ALL_OWNERS = "all-owners";
const ALL_EXECUTORS = "all-executors";

const roleOptions: Array<{ value: ProjectListRole; label: string }> = [
  { value: "ALL", label: "All Roles" },
  { value: "OWNER", label: "Owner" },
  { value: "CO_OWNER", label: "Co-Owner" },
  { value: "EXECUTOR", label: "Executor" },
  { value: "COLLABORATOR", label: "Collaborator" },
];

const sortOptions: Array<{ value: ProjectSortValue; label: string }> = [
  { value: "priority", label: "Priority" },
  { value: "updated", label: "Recently Updated" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

function getUserFilterLabel(option: ProjectUserFilterOption) {
  return option.name === option.email
    ? option.name
    : `${option.name} (${option.email})`;
}

function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card
          key={index}
          className="rounded-[22px] border-[#e2e8e1] bg-white p-5 shadow-[0_14px_36px_rgba(23,39,28,0.045)]"
        >
          <CardContent className="space-y-4 p-0">
            <div className="flex justify-between">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="size-8 rounded-xl" />
            </div>
            <Skeleton className="h-7 w-2/3 rounded-full" />
            <Skeleton className="h-4 w-1/2 rounded-full" />
            <Skeleton className="h-9 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ProjectsBrowser({
  projects,
  projectCount,
  currentPage,
  hasAnyProjects,
  canCreateProject,
  activeStatus,
  activeSort,
  activeStage,
  activeOwnerId,
  activeExecutorId,
  activeMyRole,
  query,
  ownerOptions,
  executorOptions,
  stageOptions,
  filters,
}: ProjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const hasActiveFilters = Boolean(
    query ||
      activeStatus !== "ALL" ||
      activeStage ||
      activeOwnerId ||
      activeExecutorId ||
      activeMyRole !== "ALL",
  );
  const currentSearch = searchParams.toString();
  const currentProjectsHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const activeProjectView = searchParams.get("view") === "flexible" ? "flexible" : "artwork";

  function switchProjectView(view: "artwork" | "flexible") {
    const params = new URLSearchParams(searchParams.toString());

    if (view === "flexible") {
      params.set("view", "flexible");
    } else {
      params.delete("view");
    }

    const nextHref = params.size > 0 ? `${pathname}?${params}` : pathname;
    startTransition(() => router.replace(nextHref, { scroll: false }));
  }

  function navigate(next: {
    status?: ProjectListStatus;
    sort?: ProjectSortValue;
    stage?: number | null;
    ownerId?: string;
    executorId?: string;
    myRole?: ProjectListRole;
    query?: string;
    page?: number;
  }) {
    const status = next.status ?? activeStatus;
    const sort = next.sort ?? activeSort;
    const stage = next.stage === undefined ? activeStage : next.stage;
    const ownerId = next.ownerId ?? activeOwnerId;
    const executorId = next.executorId ?? activeExecutorId;
    const myRole = next.myRole ?? activeMyRole;
    const searchQuery = (
      next.query ?? searchInputRef.current?.value ?? query
    ).trim();
    const page = next.page ?? 1;
    const params = new URLSearchParams();

    if (searchQuery) params.set("q", searchQuery);
    if (status !== "ALL") params.set("status", status);
    if (sort !== "priority") params.set("sort", sort);
    if (stage) params.set("stage", String(stage));
    if (ownerId) params.set("ownerId", ownerId);
    if (executorId) params.set("executorId", executorId);
    if (myRole !== "ALL") params.set("myRole", myRole);
    if (page > 1) params.set("page", String(page));

    const nextHref = params.size > 0 ? `${pathname}?${params}` : pathname;
    startTransition(() => router.push(nextHref, { scroll: false }));
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ query: searchInputRef.current?.value ?? "" });
  }

  function clearFilters() {
    const params = new URLSearchParams();
    if (activeSort !== "priority") params.set("sort", activeSort);
    const nextHref = params.size > 0 ? `${pathname}?${params}` : pathname;
    startTransition(() => router.push(nextHref, { scroll: false }));
  }

  const emptyTitle = hasAnyProjects ? "No projects found" : "No projects yet";
  const emptyDescription = hasAnyProjects
    ? "Try changing your search or filters."
    : canCreateProject
      ? "Create your first project to begin the seven-stage workflow."
      : "There are no projects to show right now.";
  const totalPages = Math.max(1, Math.ceil(projectCount / 20));

  return (
    <div className="space-y-5">
      <MotionSection>
        <div
          role="tablist"
          aria-label="Project type"
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[15px] border border-[#d5ded6] bg-white p-1 shadow-[0_8px_22px_rgba(18,34,25,0.035)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeProjectView === "artwork"}
            onClick={() => switchProjectView("artwork")}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-[11px] px-4 text-[13px] font-[700] transition sm:px-5 ${
              activeProjectView === "artwork"
                ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_9px_20px_rgba(31,112,70,0.22)]"
                : "text-[#4a554d] hover:bg-[#f0f4f0]"
            }`}
          >
            <FolderKanban className="size-4" /> Artwork Projects
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeProjectView === "flexible"}
            onClick={() => switchProjectView("flexible")}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-[11px] px-4 text-[13px] font-[700] transition sm:px-5 ${
              activeProjectView === "flexible"
                ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_9px_20px_rgba(31,112,70,0.22)]"
                : "text-[#4a554d] hover:bg-[#f0f4f0]"
            }`}
          >
            <PanelsTopLeft className="size-4" /> Flexible Projects
          </button>
        </div>
      </MotionSection>

      {activeProjectView === "flexible" ? (
        <ProjectsGridSkeleton />
      ) : (
        <div className="space-y-5">
      <MotionSection>
        <header className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-[25px] font-[700] leading-none tracking-[-0.045em] text-[#0f1411] sm:text-[29px]">
                Projects
              </h1>
              <p className="mt-2 text-[14px] text-[#737b74]">
                {projectCount} {projectCount === 1 ? "project" : "projects"}
              </p>
            </div>

            <form onSubmit={handleSearchSubmit} className="w-full lg:w-[520px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8b958e]" />
                <Input
                  key={query}
                  ref={searchInputRef}
                  type="search"
                  defaultValue={query}
                  placeholder="Search projects, owners, co-owners, executors..."
                  className="h-[50px] rounded-[16px] border-[#dce3dc] bg-white pl-11 pr-4 text-[14px] shadow-[0_9px_24px_rgba(18,34,25,0.035)]"
                />
                <button type="submit" className="sr-only">Search</button>
              </label>
            </form>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-[15px] border border-[#d5ded6] bg-white p-1 shadow-[0_8px_22px_rgba(18,34,25,0.035)]">
              {filters.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  variant={activeStatus === filter.value ? "default" : "ghost"}
                  onClick={() => navigate({ status: filter.value })}
                  disabled={isPending && activeStatus === filter.value}
                  className={`h-10 shrink-0 rounded-[11px] px-5 text-[14px] ${
                    activeStatus === filter.value
                      ? "shadow-[0_9px_20px_rgba(31,112,70,0.22)]"
                      : "text-[#303a32]"
                  }`}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            {canCreateProject ? (
              <Button asChild size="lg" className="h-12 min-w-[168px] self-start px-6 text-[15px] xl:self-auto">
                <Link href="/projects/new">+ New Project</Link>
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={activeStage ? String(activeStage) : ALL_STAGES}
              onValueChange={(value) =>
                navigate({ stage: value === ALL_STAGES ? null : Number(value) })
              }
            >
              <SelectTrigger className="h-11 w-[190px] rounded-[14px] border border-[#d8e0d8] px-4 shadow-[0_7px_18px_rgba(18,34,25,0.025)]">
                <SelectValue placeholder="Current Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STAGES}>All Stages</SelectItem>
                {stageOptions.map((stage) => (
                  <SelectItem key={stage.number} value={String(stage.number)}>
                    Stage {stage.number} — {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeOwnerId || ALL_OWNERS}
              onValueChange={(value) =>
                navigate({ ownerId: value === ALL_OWNERS ? "" : value })
              }
            >
              <SelectTrigger className="h-11 w-[160px] rounded-[14px] border border-[#d8e0d8] px-4">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OWNERS}>All Owners</SelectItem>
                {ownerOptions.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {getUserFilterLabel(owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeExecutorId || ALL_EXECUTORS}
              onValueChange={(value) =>
                navigate({ executorId: value === ALL_EXECUTORS ? "" : value })
              }
            >
              <SelectTrigger className="h-11 w-[170px] rounded-[14px] border border-[#d8e0d8] px-4">
                <SelectValue placeholder="Executor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EXECUTORS}>All Executors</SelectItem>
                {executorOptions.map((executor) => (
                  <SelectItem key={executor.id} value={executor.id}>
                    {getUserFilterLabel(executor)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeMyRole}
              onValueChange={(value) => navigate({ myRole: value as ProjectListRole })}
            >
              <SelectTrigger className="h-11 w-[150px] rounded-[14px] border border-[#d8e0d8] px-4">
                <SelectValue placeholder="My Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeSort}
              onValueChange={(value) => navigate({ sort: value as ProjectSortValue })}
            >
              <SelectTrigger className="h-11 w-[215px] rounded-[14px] border border-[#d8e0d8] px-4">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((sort) => (
                  <SelectItem key={sort.value} value={sort.value}>
                    Sort: {sort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                disabled={isPending}
                className="h-11 rounded-[14px] px-3 text-[13px] font-[700] text-[#657067]"
              >
                <X className="size-4" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </header>
      </MotionSection>

      {isPending ? (
        <ProjectsGridSkeleton />
      ) : projects.length > 0 ? (
        <MotionStaggerGroup
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          stagger={0.04}
        >
          {projects.map((project) => (
            <MotionItem key={project.id} y={8} layout>
              <ProjectCard project={project} returnHref={currentProjectsHref} />
            </MotionItem>
          ))}
        </MotionStaggerGroup>
      ) : (
        <MotionItem y={8}>
          <Card className="min-h-[260px] rounded-[22px] border-[#e1e7e0] bg-white text-center shadow-[0_14px_36px_rgba(23,39,28,0.04)]">
            <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-8">
              <h2 className="text-[23px] font-[650] tracking-[-0.025em] text-[#111712]">
                {emptyTitle}
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-6 text-[#717a72]">
                {emptyDescription}
              </p>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="mt-5" onClick={clearFilters}>
                  <SlidersHorizontal className="size-4" /> Reset filters
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </MotionItem>
      )}

      {!isPending && projects.length > 0 && totalPages > 1 ? (
        <nav className="flex items-center justify-end gap-2" aria-label="Projects pagination">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-[11px]"
            disabled={currentPage <= 1}
            onClick={() => navigate({ page: currentPage - 1 })}
            aria-label="Previous projects page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-[12px] font-[600] text-[#687169]">
            Page {Math.min(currentPage, totalPages)} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-[11px]"
            disabled={currentPage >= totalPages}
            onClick={() => navigate({ page: currentPage + 1 })}
            aria-label="Next projects page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}
        </div>
      )}
    </div>
  );
}

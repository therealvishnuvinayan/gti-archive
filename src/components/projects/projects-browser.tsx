"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { ProjectCard, type ProjectCardItem } from "@/components/projects/project-card";
import { ProjectSortDropdown } from "@/components/projects/project-sort-dropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ProjectFilterValue = "ONGOING" | "ON_HOLD" | "COMPLETED";
type ProjectSortValue = "newest" | "oldest" | "name";

type ProjectFilter = {
  label: string;
  value: ProjectFilterValue;
};

type ProjectsBrowserProps = {
  projects: ProjectCardItem[];
  hasAnyProjects: boolean;
  activeStatus: ProjectFilterValue;
  activeSort: ProjectSortValue;
  query: string;
  filters: ProjectFilter[];
};

function ProjectsGridSkeleton() {
  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-[22px] p-5 shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
          <CardContent className="p-0">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-28 rounded-full bg-[#edf2ec]" />
              <div className="h-4 w-32 rounded-full bg-[#edf2ec]" />
              <div className="space-y-2 pt-2">
                <div className="h-7 w-full rounded-full bg-[#edf2ec]" />
                <div className="h-7 w-10/12 rounded-full bg-[#edf2ec]" />
                <div className="h-7 w-8/12 rounded-full bg-[#edf2ec]" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="h-4 w-36 rounded-full bg-[#edf2ec]" />
                <div className="h-4 w-40 rounded-full bg-[#edf2ec]" />
              </div>
              <div className="h-[52px] w-full rounded-full bg-[#edf2ec]" />
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function ProjectsBrowser({
  projects,
  hasAnyProjects,
  activeStatus,
  activeSort,
  query,
  filters,
}: ProjectsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navigate = (status: ProjectFilterValue, sort: ProjectSortValue) => {
    const params = new URLSearchParams();

    if (query) {
      params.set("q", query);
    }
    params.set("status", status);
    params.set("sort", sort);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <>
      <header className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <h1 className="text-4xl font-extrabold tracking-tight text-[#0f1411] sm:text-5xl">
          Projects
        </h1>

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
                  onClick={() => navigate(filter.value, activeSort)}
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
                onSelectSort={(sort) => navigate(activeStatus, sort)}
                disabled={isPending}
                pending={isPending}
              />
            ) : null}
          </div>
        </div>
      </header>

      {isPending ? (
        <ProjectsGridSkeleton />
      ) : projects.length > 0 ? (
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      ) : (
        <Card className="text-center">
          <CardContent className="p-8">
            <h2 className="text-[24px] font-[600] tracking-[-0.03em] text-[#111712]">
              No projects found
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[#6f776f]">
              {query
                ? "No saved projects match your current search."
                : "Create a project to populate the projects board."}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

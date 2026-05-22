import Link from "next/link";

import { ProjectCard } from "@/components/projects/project-card";
import { ProjectSortDropdown } from "@/components/projects/project-sort-dropdown";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getProjectsList } from "@/lib/projects";

type ProjectFilter = {
  label: string;
  value: "ONGOING" | "ON_HOLD" | "COMPLETED";
};

const projectFilters: ProjectFilter[] = [
  { label: "Ongoing", value: "ONGOING" },
  { label: "On Hold", value: "ON_HOLD" },
  { label: "Completed", value: "COMPLETED" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const activeStatus =
    resolvedSearchParams.status === "ON_HOLD" ||
    resolvedSearchParams.status === "COMPLETED"
      ? resolvedSearchParams.status
      : "ONGOING";
  const query = resolvedSearchParams.q?.trim() ?? "";
  const activeSort =
    resolvedSearchParams.sort === "oldest" ||
    resolvedSearchParams.sort === "name"
      ? resolvedSearchParams.sort
      : "newest";
  const projects = await getProjectsList({
    status: activeStatus,
    query,
    sort: activeSort,
  });

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton href="/" />,
        searchAction: "/projects",
        searchDefaultValue: query,
        searchHiddenFields: [
          {
            name: "status",
            value: activeStatus,
          },
          {
            name: "sort",
            value: activeSort,
          },
        ],
      }}
    >
      <section className="space-y-6">
        <header className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#0f1411] sm:text-5xl">
            Projects
          </h1>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
            {projects.length > 0 ? (
              <div className="inline-flex w-full flex-wrap rounded-full border border-brand bg-white p-1 xl:w-auto">
                {projectFilters.map((filter) => (
                  <Button
                    key={filter.label}
                    asChild
                    size="default"
                    variant={activeStatus === filter.value ? "default" : "ghost"}
                    className="min-h-[44px] flex-1 px-6 text-[17px] xl:flex-none"
                  >
                    <Link
                      href={{
                        pathname: "/projects",
                        query: {
                          ...(query ? { q: query } : {}),
                          status: filter.value,
                          sort: activeSort,
                        },
                      }}
                    >
                      {filter.label}
                    </Link>
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="text-[18px]">
                <Link href="/projects/new">+ New Project</Link>
              </Button>
              {projects.length > 0 ? (
                <ProjectSortDropdown
                  activeSort={activeSort}
                  activeStatus={activeStatus}
                  query={query}
                />
              ) : null}
            </div>
          </div>
        </header>

        {projects.length > 0 ? (
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
      </section>
    </DashboardLayout>
  );
}

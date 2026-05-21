import Link from "next/link";

import { ProjectCard } from "@/components/projects/project-card";
import { ProjectSortDropdown } from "@/components/projects/project-sort-dropdown";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
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

function BackPill() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-13 min-w-[176px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
    >
      Back
    </Link>
  );
}

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
        leadingContent: <BackPill />,
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
            <div className="inline-flex w-full flex-wrap rounded-full border border-brand bg-white p-1 xl:w-auto">
              {projectFilters.map((filter) => (
                <Link
                  key={filter.label}
                  href={{
                    pathname: "/projects",
                    query: {
                      ...(query ? { q: query } : {}),
                      status: filter.value,
                      sort: activeSort,
                    },
                  }}
                  className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full px-6 text-[17px] font-semibold transition-colors xl:flex-none ${
                    activeStatus === filter.value
                      ? "bg-brand text-white"
                      : "text-brand hover:bg-brand-soft"
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/projects/new"
                className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-7 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
              >
                + New Project
              </Link>
              <ProjectSortDropdown
                activeSort={activeSort}
                activeStatus={activeStatus}
                query={query}
              />
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
          <section className="rounded-[24px] bg-card p-8 text-center shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
            <h2 className="text-[24px] font-[600] tracking-[-0.03em] text-[#111712]">
              No projects found
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[#6f776f]">
              {query
                ? "No saved projects match your current search."
                : "Create a project to populate the projects board."}
            </p>
          </section>
        )}
      </section>
    </DashboardLayout>
  );
}

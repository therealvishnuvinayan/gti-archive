import Link from "next/link";

import { ProjectCard } from "@/components/projects/project-card";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { projectRecords } from "@/components/projects/project-data";

type ProjectFilter = {
  label: string;
  active?: boolean;
};

const projectFilters: ProjectFilter[] = [
  { label: "Ongoing", active: true },
  { label: "On Hold" },
  { label: "Completed" },
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

export default function ProjectsPage() {
  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <BackPill />,
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
                <button
                  key={filter.label}
                  type="button"
                  className={`min-h-[44px] flex-1 rounded-full px-6 text-[17px] font-semibold transition-colors xl:flex-none ${
                    filter.active
                      ? "bg-brand text-white"
                      : "text-brand hover:bg-brand-soft"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-7 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
              >
                + New Project
              </button>
              <button
                type="button"
                className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-brand bg-white px-8 text-[18px] font-semibold text-brand transition-colors hover:bg-brand-soft"
              >
                Sort
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {projectRecords.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </section>
      </section>
    </DashboardLayout>
  );
}

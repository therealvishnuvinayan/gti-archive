import Link from "next/link";

import { ProjectCard, type ProjectCardItem } from "@/components/projects/project-card";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

type ProjectFilter = {
  label: string;
  active?: boolean;
};

const projectFilters: ProjectFilter[] = [
  { label: "Ongoing", active: true },
  { label: "On Hold" },
  { label: "Completed" },
];

const projects: ProjectCardItem[] = [
  {
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Milano Project 1 Packaging Design",
    createdOn: "17/08/2025",
    createdBy: "Slavomir Kluziak",
    featured: true,
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Milano Project 2 Variance",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Packaging Design - Outer",
    title: "Milano Project 3 King Size",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Leaflet Design",
    title: "Milano Project 4 Flavours",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
    emphasized: true,
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Marketing Graphics Design",
    title: "Milano Project 4 Poster",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Packaging Design",
    title: "Mond Project 1 Fanpack",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Branding Design",
    title: "Gulbahar Branding",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "POS Header Design",
    title: "Milano Project 4 King Size",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
  {
    stage: "Stage 2 : In Progress",
    category: "Packaging Design - Outer",
    title: "Momento Project 1",
    createdOn: "16/03/2025",
    createdBy: "Slavomir Kluziak",
  },
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
          {projects.map((project) => (
            <ProjectCard key={`${project.title}-${project.category}`} project={project} />
          ))}
        </section>
      </section>
    </DashboardLayout>
  );
}

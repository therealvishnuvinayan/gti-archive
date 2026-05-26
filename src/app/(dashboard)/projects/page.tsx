import { UserRole } from "@prisma/client";

import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import {
  getDashboardProjectCounts,
  getProjectListFilterOptions,
  getProjectsList,
} from "@/lib/projects";

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
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    category?: string;
    tag?: string;
  }>;
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
  const activeCategory = resolvedSearchParams.category?.trim() ?? "";
  const activeTag = resolvedSearchParams.tag?.trim() ?? "";
  const [user, projects, projectCounts, filterOptions] = await Promise.all([
    requireUser(),
    getProjectsList({
      status: activeStatus,
      query,
      category: activeCategory,
      tag: activeTag,
      sort: activeSort,
    }),
    getDashboardProjectCounts(),
    getProjectListFilterOptions(),
  ]);
  const hasAnyProjects = projectCounts.total > 0;
  const canManageProjects = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <ProjectsBrowser
          projects={projects}
          hasAnyProjects={hasAnyProjects}
          canManageProjects={canManageProjects}
          activeStatus={activeStatus}
          activeSort={activeSort}
          query={query}
          activeCategory={activeCategory}
          activeTag={activeTag}
          categoryOptions={filterOptions.categories}
          tagOptions={filterOptions.tags}
          filters={projectFilters}
        />
      </section>
    </DashboardLayout>
  );
}

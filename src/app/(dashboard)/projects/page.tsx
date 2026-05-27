import { notFound } from "next/navigation";

import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
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
  const user = await requireUser();

  if (!hasPermission(user, "project.list") && !hasPermission(user, "project.view")) {
    notFound();
  }

  const [projects, projectCounts, filterOptions] = await Promise.all([
    getProjectsList({
      status: activeStatus,
      query,
      category: activeCategory,
      tag: activeTag,
      sort: activeSort,
    }, user),
    getDashboardProjectCounts(user),
    getProjectListFilterOptions(user),
  ]);
  const hasAnyProjects = projectCounts.total > 0;
  const canCreateProjects = hasPermission(user, "project.create");
  const canEditProjects = hasPermission(user, "project.update");
  const canDeleteProjects = hasPermission(user, "project.delete");

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <ProjectsBrowser
          projects={projects}
          hasAnyProjects={hasAnyProjects}
          canCreateProjects={canCreateProjects}
          canEditProjects={canEditProjects}
          canDeleteProjects={canDeleteProjects}
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

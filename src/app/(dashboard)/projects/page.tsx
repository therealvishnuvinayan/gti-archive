import { redirect } from "next/navigation";

import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import {
  getDashboardProjectCounts,
  getProjectListFilterOptions,
  getProjectsList,
} from "@/lib/projects";
import { hasPermission } from "@/lib/permissions/resolver";

type ProjectFilter = {
  label: string;
  value: "ALL" | "ACTIVE" | "PENDING" | "ON_HOLD" | "COMPLETED";
};

const projectFilters: ProjectFilter[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending", value: "PENDING" },
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
  const activeStatus = resolvedSearchParams.status?.trim() || "ACTIVE";
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
    redirect("/");
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
  const canCreateProject = hasPermission(user, "project.create");

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <ProjectsBrowser
          projects={projects}
          hasAnyProjects={hasAnyProjects}
          canCreateProject={canCreateProject}
          activeStatus={activeStatus}
          activeSort={activeSort}
          query={query}
          activeCategory={activeCategory}
          activeTag={activeTag}
          categoryOptions={filterOptions.categories}
          statusOptions={filterOptions.statuses}
          tagOptions={filterOptions.tags}
          filters={projectFilters}
        />
      </section>
    </DashboardLayout>
  );
}

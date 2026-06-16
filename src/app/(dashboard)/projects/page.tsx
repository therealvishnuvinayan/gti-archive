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

type ProjectSortValue = "newest" | "oldest" | "name";

const projectFilters: ProjectFilter[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending", value: "PENDING" },
  { label: "On Hold", value: "ON_HOLD" },
  { label: "Completed", value: "COMPLETED" },
];

function logProjectsPageTiming(label: string, startedAt: number) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[projects:list] ${label}`, {
    ms: Math.round(performance.now() - startedAt),
  });
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectSearchParams>;
}) {
  const data = await loadProjectsPageData(searchParams);

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <ProjectsBrowser
          projects={data.projects}
          hasAnyProjects={data.hasAnyProjects}
          canCreateProject={data.canCreateProject}
          activeStatus={data.activeStatus}
          activeSort={data.activeSort}
          query={data.query}
          activeCategory={data.activeCategory}
          activeTag={data.activeTag}
          categoryOptions={data.filterOptions.categories}
          statusOptions={data.filterOptions.statuses}
          tagOptions={data.filterOptions.tags}
          filters={projectFilters}
        />
      </section>
    </DashboardLayout>
  );
}

type ProjectSearchParams = {
  status?: string;
  q?: string;
  sort?: string;
  category?: string;
  tag?: string;
  page?: string;
};

async function loadProjectsPageData(
  searchParams: Promise<ProjectSearchParams>,
) {
  const pageStartedAt = performance.now();
  const resolvedSearchParams = await searchParams;
  const activeStatus = resolvedSearchParams.status?.trim() || "ACTIVE";
  const query = resolvedSearchParams.q?.trim() ?? "";
  const activeSort: ProjectSortValue =
    resolvedSearchParams.sort === "oldest" ||
    resolvedSearchParams.sort === "name"
      ? resolvedSearchParams.sort
      : "newest";
  const activeCategory = resolvedSearchParams.category?.trim() ?? "";
  const activeTag = resolvedSearchParams.tag?.trim() ?? "";
  const activePage = Math.max(
    1,
    Number.parseInt(resolvedSearchParams.page ?? "1", 10) || 1,
  );
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
      page: activePage,
    }, user),
    getDashboardProjectCounts(user),
    getProjectListFilterOptions(user),
  ]);
  const hasAnyProjects = projectCounts.total > 0;
  const canCreateProject = hasPermission(user, "project.create");
  logProjectsPageTiming("page total", pageStartedAt);

  return {
    projects,
    hasAnyProjects,
    canCreateProject,
    activeStatus,
    activeSort,
    query,
    activeCategory,
    activeTag,
    filterOptions,
  };
}

import { redirect } from "next/navigation";

import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { resolveProjectCurrency } from "@/lib/project-currencies";
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

function normalizeDateSearchParam(value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return "";
  }

  const [year, month, day] = normalizedValue.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);

  return parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
    ? normalizedValue
    : "";
}

function normalizeBudgetAmountSearchParam(value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return "";
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? String(Math.floor(parsedValue))
    : "";
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
          activeOwnerId={data.activeOwnerId}
          activeExecutorId={data.activeExecutorId}
          activeCreatedFrom={data.activeCreatedFrom}
          activeCreatedTo={data.activeCreatedTo}
          activeBudgetRequired={data.activeBudgetRequired}
          activeBudgetMin={data.activeBudgetMin}
          activeBudgetMax={data.activeBudgetMax}
          activeBudgetCurrency={data.activeBudgetCurrency}
          categoryOptions={data.filterOptions.categories}
          statusOptions={data.filterOptions.statuses}
          tagOptions={data.filterOptions.tags}
          ownerOptions={data.filterOptions.owners}
          executorOptions={data.filterOptions.executors}
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
  ownerId?: string;
  executorId?: string;
  createdFrom?: string;
  createdTo?: string;
  budgetRequired?: string;
  budgetMin?: string;
  budgetMax?: string;
  budgetCurrency?: string;
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
  const activeOwnerId = resolvedSearchParams.ownerId?.trim() ?? "";
  const activeExecutorId = resolvedSearchParams.executorId?.trim() ?? "";
  const activeCreatedFrom = normalizeDateSearchParam(resolvedSearchParams.createdFrom);
  const activeCreatedTo = normalizeDateSearchParam(resolvedSearchParams.createdTo);
  const activeBudgetRequired =
    resolvedSearchParams.budgetRequired === "true" ||
    resolvedSearchParams.budgetRequired === "false"
      ? resolvedSearchParams.budgetRequired
      : "";
  const activeBudgetMin = normalizeBudgetAmountSearchParam(resolvedSearchParams.budgetMin);
  const activeBudgetMax = normalizeBudgetAmountSearchParam(resolvedSearchParams.budgetMax);
  const activeBudgetCurrency =
    resolveProjectCurrency(resolvedSearchParams.budgetCurrency ?? "") ?? "";
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
      ownerId: activeOwnerId,
      executorId: activeExecutorId,
      createdFrom: activeCreatedFrom,
      createdTo: activeCreatedTo,
      budgetRequired: activeBudgetRequired || undefined,
      budgetMin: activeBudgetMin,
      budgetMax: activeBudgetMax,
      budgetCurrency: activeBudgetCurrency,
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
    activeOwnerId,
    activeExecutorId,
    activeCreatedFrom,
    activeCreatedTo,
    activeBudgetRequired,
    activeBudgetMin,
    activeBudgetMax,
    activeBudgetCurrency,
    filterOptions,
  };
}

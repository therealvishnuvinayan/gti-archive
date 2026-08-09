import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { requireUser } from "@/lib/auth";
import {
  PROJECT_LIST_ROLES,
  PROJECT_LIST_STATUSES,
  type ProjectListRole,
  type ProjectListStatus,
} from "@/lib/project-list-workflow";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "@/lib/project-workflow";
import {
  getDashboardProjectCounts,
  getProjectListFilterOptions,
  getProjectsList,
} from "@/lib/projects";
import { hasPermission } from "@/lib/permissions/resolver";

type ProjectSortValue =
  | "updated"
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc";

const projectFilters: Array<{ label: string; value: ProjectListStatus }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Setup Needed", value: "SETUP_NEEDED" },
];

function logProjectsPageTiming(label: string, startedAt: number) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[projects:list] ${label}`, {
      ms: Math.round(performance.now() - startedAt),
    });
  }
}

function normalizeStatus(value: string | undefined): ProjectListStatus {
  return PROJECT_LIST_STATUSES.includes(value as ProjectListStatus)
    ? (value as ProjectListStatus)
    : "ALL";
}

function normalizeRole(value: string | undefined): ProjectListRole {
  return PROJECT_LIST_ROLES.includes(value as ProjectListRole)
    ? (value as ProjectListRole)
    : "ALL";
}

function normalizeStage(value: string | undefined) {
  const stage = Number.parseInt(value ?? "", 10);
  return stage >= 1 && stage <= PROJECT_WORKFLOW_STAGE_DEFINITIONS.length
    ? stage
    : null;
}

function normalizeSort(value: string | undefined): ProjectSortValue {
  return value === "newest" ||
    value === "oldest" ||
    value === "name-asc" ||
    value === "name-desc"
    ? value
    : "updated";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectSearchParams>;
}) {
  const data = await loadProjectsPageData(searchParams);

  return (
    <DashboardLayout>
      <ProjectsBrowser
        projects={data.projects}
        projectCount={data.projectCount}
        currentPage={data.currentPage}
        hasAnyProjects={data.hasAnyProjects}
        canCreateProject={data.canCreateProject}
        activeStatus={data.activeStatus}
        activeSort={data.activeSort}
        activeStage={data.activeStage}
        activeOwnerId={data.activeOwnerId}
        activeExecutorId={data.activeExecutorId}
        activeMyRole={data.activeMyRole}
        query={data.query}
        ownerOptions={data.filterOptions.owners}
        executorOptions={data.filterOptions.executors}
        stageOptions={PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => ({
          number: stage.number,
          name: stage.name,
        }))}
        filters={projectFilters}
      />
    </DashboardLayout>
  );
}

type ProjectSearchParams = {
  status?: string;
  q?: string;
  sort?: string;
  stage?: string;
  ownerId?: string;
  executorId?: string;
  myRole?: string;
  page?: string;
};

async function loadProjectsPageData(
  searchParams: Promise<ProjectSearchParams>,
) {
  const pageStartedAt = performance.now();
  const resolvedSearchParams = await searchParams;
  const activeStatus = normalizeStatus(resolvedSearchParams.status);
  const activeSort = normalizeSort(resolvedSearchParams.sort);
  const activeStage = normalizeStage(resolvedSearchParams.stage);
  const activeMyRole = normalizeRole(resolvedSearchParams.myRole);
  const activeOwnerId = resolvedSearchParams.ownerId?.trim() ?? "";
  const activeExecutorId = resolvedSearchParams.executorId?.trim() ?? "";
  const query = resolvedSearchParams.q?.trim() ?? "";
  const activePage = Math.max(
    1,
    Number.parseInt(resolvedSearchParams.page ?? "1", 10) || 1,
  );
  const user = await requireUser();

  if (!hasPermission(user, "project.list")) {
    redirect("/no-access");
  }

  const [projectResult, projectCounts, filterOptions] = await Promise.all([
    getProjectsList(
      {
        status: activeStatus,
        query,
        sort: activeSort,
        stage: activeStage ?? undefined,
        ownerId: activeOwnerId,
        executorId: activeExecutorId,
        myRole: activeMyRole,
        page: activePage,
      },
      user,
    ),
    getDashboardProjectCounts(user),
    getProjectListFilterOptions(user),
  ]);

  logProjectsPageTiming("page total", pageStartedAt);

  return {
    projects: projectResult.projects,
    projectCount: projectResult.total,
    hasAnyProjects: projectCounts.total > 0,
    canCreateProject: hasPermission(user, "project.create"),
    activeStatus,
    activeSort,
    activeStage,
    activeOwnerId,
    activeExecutorId,
    activeMyRole,
    query,
    currentPage: activePage,
    filterOptions,
  };
}

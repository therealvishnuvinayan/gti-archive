import { FlexibleProjectsBrowser } from "@/components/projects/flexible-projects-browser";
import { ProjectTypeSwitcher } from "@/components/projects/project-type-switcher";
import type { FlexibleProjectListItem, FlexibleProjectUserOption } from "@/lib/flexible-projects";

export function FlexibleProjectsRouteWorkspace({
  projects,
  projectCount,
  currentPage,
  pageSize,
  users,
  currentUserId,
  canCreateProject,
  showProjectTypeSwitcher,
}: {
  projects: FlexibleProjectListItem[];
  projectCount: number;
  currentPage: number;
  pageSize: number;
  users: FlexibleProjectUserOption[];
  currentUserId: string;
  canCreateProject: boolean;
  showProjectTypeSwitcher: boolean;
}) {
  return (
    <div className="space-y-5">
      {showProjectTypeSwitcher ? (
        <ProjectTypeSwitcher activeView="private" />
      ) : null}
      <FlexibleProjectsBrowser canCreateProject={canCreateProject} projects={projects} projectCount={projectCount} currentPage={currentPage} pageSize={pageSize} users={users} currentUserId={currentUserId} />
    </div>
  );
}

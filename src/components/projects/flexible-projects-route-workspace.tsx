import { FlexibleProjectsBrowser } from "@/components/projects/flexible-projects-browser";
import { ProjectTypeSwitcher } from "@/components/projects/project-type-switcher";
import type { FlexibleProjectListItem, FlexibleProjectUserOption } from "@/lib/flexible-projects";

export function FlexibleProjectsRouteWorkspace({
  projects,
  users,
  currentUserId,
  canCreateProject,
  showProjectTypeSwitcher,
}: {
  projects: FlexibleProjectListItem[];
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
      <FlexibleProjectsBrowser canCreateProject={canCreateProject} projects={projects} users={users} currentUserId={currentUserId} />
    </div>
  );
}

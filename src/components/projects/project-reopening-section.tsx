import type { PermissionUser } from "@/lib/permissions/resolver";
import type { TaskProjectRef } from "@/lib/tasker/types";
import { getProjectReopening } from "@/lib/project-reopening";
import { TaskerError } from "@/lib/tasker/errors";
import { ProjectReopeningWorkspace } from "./project-reopening-workspace";

export async function ProjectReopeningSection({ user, project }: { user: PermissionUser; project: TaskProjectRef }) {
  let view;
  try {
    view = await getProjectReopening(user, project);
  } catch (error) {
    if (error instanceof TaskerError && [403, 404].includes(error.status)) return null;
    throw error;
  }
  if (!view.canReopen && !view.history.length) return null;
  return <ProjectReopeningWorkspace view={view} />;
}

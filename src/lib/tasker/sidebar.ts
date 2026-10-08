import { unstable_cache } from "next/cache";
import { canUseTasks, getAccessibleProjectsWhere, type PermissionUser } from "@/lib/permissions/resolver";
import { countTasks } from "./service";

export async function getTaskSidebarCount(user: PermissionUser) {
  if (!canUseTasks(user)) return 0;
  return unstable_cache(
    () => countTasks(user),
    ["tasker-sidebar-count", user.id, user.role, JSON.stringify(getAccessibleProjectsWhere(user))],
    { revalidate: 20, tags: ["projects", "flexible-projects"] },
  )();
}

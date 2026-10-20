import { RestrictedProjectContextView } from "@/components/projects/restricted-project-context";
import type { UserProjectWorkspaceData } from "@/lib/user-project-workspace";
export function UserProjectWorkspace({ data }: { data: UserProjectWorkspaceData; currentUserId: string }) {
  return <RestrictedProjectContextView data={data.context} />;
}

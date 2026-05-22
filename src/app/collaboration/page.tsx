import { CollaborationWorkspace } from "@/components/collaboration/collaboration-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCollaborators } from "@/lib/collaboration";

export default async function CollaborationPage() {
  const collaborators = await getCollaborators();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search collaborators...",
      }}
    >
      <CollaborationWorkspace initialCollaborators={collaborators} />
    </DashboardLayout>
  );
}

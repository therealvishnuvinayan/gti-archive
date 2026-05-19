import { CollaborationWorkspace } from "@/components/collaboration/collaboration-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function CollaborationPage() {
  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search collaborators...",
      }}
    >
      <CollaborationWorkspace />
    </DashboardLayout>
  );
}

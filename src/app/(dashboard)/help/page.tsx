import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { HelpWorkspace } from "@/components/help/help-workspace";

export default async function HelpPage() {
  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search projects, files, people...",
      }}
    >
      <HelpWorkspace />
    </DashboardLayout>
  );
}

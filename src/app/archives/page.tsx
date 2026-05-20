import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function ArchivesPage() {
  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archives...",
      }}
    >
      <ArchiveOverview />
    </DashboardLayout>
  );
}

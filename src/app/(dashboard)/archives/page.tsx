import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listArchiveCategorySummaries } from "@/lib/archives";
import { requireUser } from "@/lib/auth";

export default async function ArchivesPage() {
  const user = await requireUser();
  const summaries = await listArchiveCategorySummaries(user);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archives...",
      }}
    >
      <ArchiveOverview summaries={summaries} />
    </DashboardLayout>
  );
}

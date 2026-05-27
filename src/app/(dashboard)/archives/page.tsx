import { notFound } from "next/navigation";

import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listArchiveCategorySummaries } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function ArchivesPage() {
  const user = await requireUser();

  if (!hasPermission(user, "archive.view")) {
    notFound();
  }

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

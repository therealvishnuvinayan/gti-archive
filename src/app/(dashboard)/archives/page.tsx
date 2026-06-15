import { redirect } from "next/navigation";

import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listArchiveCategorySummaries } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function ArchivesPage() {
  const user = await requireUser();

  if (!hasPermission(user, "archive.view")) {
    redirect("/");
  }

  const summaries = await listArchiveCategorySummaries(user);
  const canUploadArchives = hasPermission(user, "archive.uploadFile");

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archives...",
      }}
    >
      <ArchiveOverview summaries={summaries} canUploadArchives={canUploadArchives} />
    </DashboardLayout>
  );
}

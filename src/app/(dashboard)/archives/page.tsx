import { redirect } from "next/navigation";

import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  canAccessArchivesArea,
  canUploadArchiveFiles,
  canManageArchiveCategoryAccess,
  listArchiveCategorySummaries,
} from "@/lib/archives";
import { getUserDisplayName, requireUser } from "@/lib/auth";


export default async function ArchivesPage() {
  const user = await requireUser();

  if (!(await canAccessArchivesArea(user))) {
    redirect("/");
  }

  const summaries = await listArchiveCategorySummaries(user);
  const canUploadArchives = canUploadArchiveFiles(user);
  const canManageArchiveCategories = canManageArchiveCategoryAccess(user);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archives...",
      }}
    >
      <ArchiveOverview
        summaries={summaries}
        canUploadArchives={canUploadArchives}
        canManageArchiveCategories={canManageArchiveCategories}
        currentUserDisplayName={getUserDisplayName(user)}
      />
    </DashboardLayout>
  );
}

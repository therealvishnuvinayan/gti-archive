import { redirect } from "next/navigation";

import { ArchiveOverview } from "@/components/archives/archive-overview";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  canAccessArchivesArea,
  canUploadArchiveFiles,
  canManageArchiveCategories as canManageCategories,
  listArchiveCategorySummaries,
} from "@/lib/archives";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { archiveFoldersEnabled } from "@/lib/archive-folders/activation";
import { getActiveArchiveCategoryOptions } from "@/lib/archive-categories";


export default async function ArchivesPage() {
  const user = await requireUser();

  if (!(await canAccessArchivesArea(user))) {
    redirect("/");
  }

  const summaries = await listArchiveCategorySummaries(user);
  const canUploadArchives = canUploadArchiveFiles(user);
  const canManageArchiveCategories = canManageCategories(user);
  // A permitted category manager can organize empty folders while file totals
  // still reflect only that actor's existing explicit file grants.
  if (archiveFoldersEnabled() && canManageArchiveCategories) {
    for (const category of await getActiveArchiveCategoryOptions(user)) {
      if (!summaries.some(row => row.id === category.id)) summaries.push({ ...category, title: category.name,
        childCount: 0, fileCount: 0, projectCount: 0, latestArchivedAt: "" });
    }
  }

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

import { canArchive } from "@/lib/authorization/archive-rules";
import { redirect } from "next/navigation";
import Link from "next/link";

import { ArchiveCategoryWorkspace } from "@/components/archives/archive-category-workspace";
import { ArchiveFolderWorkspace } from "@/components/archives/archive-folder-workspace";
import { archiveFoldersEnabled } from "@/lib/archive-folders/activation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  canAccessArchiveCategoryForUser,
  canAccessArchivesArea,
  canUploadArchiveFiles,
  listArchivedFilesByCategory,
} from "@/lib/archives";
import { getArchiveCategoryBySlug } from "@/lib/archive-categories";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export default async function ArchiveCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ search?: string | string[]; folder?: string; view?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const initialSearch = Array.isArray(resolvedSearchParams.search)
    ? resolvedSearchParams.search[0] ?? ""
    : resolvedSearchParams.search ?? "";
  const user = await requireUser();

  if (!(await canAccessArchivesArea(user))) {
    redirect("/");
  }

  const category = await getArchiveCategoryBySlug(slug);

  if (!category || !category.isActive) {
    return (
      <DashboardLayout
        topbarProps={{
          searchPlaceholder: "Search archive files...",
        }}
      >
        <Card className="rounded-[30px] border-0 bg-surface px-6 py-16 text-center shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <p className="text-[26px] font-[700] tracking-[-0.03em] text-[#162019]">
            Archive category not found.
          </p>
          <p className="mt-2 text-[14px] text-[#707a72]">
            This archive category may have been removed or deactivated.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  const folderManagement = archiveFoldersEnabled() && resolvedSearchParams.view !== "all" && !initialSearch && canArchive(user, "archive.category.update");
  if (!folderManagement && !(await canAccessArchiveCategoryForUser(user, category))) {
    return (
      <DashboardLayout
        topbarProps={{
          searchPlaceholder: "Search archive files...",
        }}
      >
        <Card className="rounded-[30px] border-0 bg-surface px-6 py-16 text-center shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <p className="text-[26px] font-[700] tracking-[-0.03em] text-[#162019]">
            Archive category unavailable.
          </p>
          <p className="mt-2 text-[14px] text-[#707a72]">
            You do not have permission to access this archive category.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  if (archiveFoldersEnabled() && resolvedSearchParams.view !== "all" && !initialSearch) {
    const folderId = typeof resolvedSearchParams.folder === "string" ? resolvedSearchParams.folder : null;
    return <DashboardLayout topbarProps={{ searchPlaceholder: "Search archives..." }}>
      <ArchiveFolderWorkspace key={`${category.id}:${folderId ?? "root"}`} categoryId={category.id} categoryName={category.name} slug={category.slug} folderId={folderId} />
    </DashboardLayout>;
  }

  const items = await listArchivedFilesByCategory(user, category);
  const canUploadArchives = canUploadArchiveFiles(user);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archive files...",
      }}
    >
      {archiveFoldersEnabled() && <Link href={`/archives/${category.slug}`} className="mb-4 inline-block text-sm text-brand">← Browse folders</Link>}
      <ArchiveCategoryWorkspace
        canEdit={canArchive(user, "archive.editMetadata")}
        canDelete={canArchive(user, "archive.delete")}
        canShare={canArchive(user, "archive.shareExternal")}
        categoryId={category.id}
        categoryTitle={category.name}
        categoryDescription={category.description}
        categoryIconUrl={category.iconUrl}
        categoryIconKey={category.iconKey}
        categoryColor={category.color}
        items={items}
        initialSearch={initialSearch.slice(0, 240)}
        canUploadArchives={canUploadArchives}
        currentUserDisplayName={getUserDisplayName(user)}
      />
    </DashboardLayout>
  );
}

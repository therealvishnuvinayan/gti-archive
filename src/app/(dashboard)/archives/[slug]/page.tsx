import { redirect } from "next/navigation";

import { ArchiveCategoryWorkspace } from "@/components/archives/archive-category-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  canAccessArchiveCategoryForUser,
  canAccessArchivesArea,
  listArchivedFilesByCategory,
} from "@/lib/archives";
import { getArchiveCategoryBySlug } from "@/lib/archive-categories";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { canUseArchives, hasPermission } from "@/lib/permissions/resolver";
import { Card } from "@/components/ui/card";

export default async function ArchiveCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ search?: string | string[] }>;
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

  if (!(await canAccessArchiveCategoryForUser(user, category))) {
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

  const items = await listArchivedFilesByCategory(user, category);
  const canUploadArchives = canUseArchives(user) && hasPermission(user, "archive.uploadFile");

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archive files...",
      }}
    >
      <ArchiveCategoryWorkspace
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

import Link from "next/link";
import { redirect } from "next/navigation";

import { ArchiveCategoryWorkspace } from "@/components/archives/archive-category-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listArchivedFilesByCategory } from "@/lib/archives";
import { getArchiveCategoryBySlug } from "@/lib/archive-categories";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { Card } from "@/components/ui/card";

function BackPill() {
  return (
    <Link
      href="/archives"
      className="inline-flex min-h-[52px] min-w-[126px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
    >
      Back
    </Link>
  );
}

export default async function ArchiveCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();

  if (!hasPermission(user, "archive.view")) {
    redirect("/");
  }

  const category = await getArchiveCategoryBySlug(slug);

  if (!category || !category.isActive) {
    return (
      <DashboardLayout
        topbarProps={{
          searchPlaceholder: "Search archive files...",
          leadingContent: <BackPill />,
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

  const items = await listArchivedFilesByCategory(user, category);
  const canUploadArchives = hasPermission(user, "archive.uploadFile");

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archive files...",
        leadingContent: <BackPill />,
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
        canUploadArchives={canUploadArchives}
      />
    </DashboardLayout>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { getArchiveCategory } from "@/components/archives/archive-data";
import { ArchiveCategoryWorkspace } from "@/components/archives/archive-category-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { listArchivedFilesByCategory } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

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
  const category = getArchiveCategory(slug);

  if (!category) {
    notFound();
  }

  const user = await requireUser();

  if (!hasPermission(user, "archive.view")) {
    notFound();
  }

  const items = await listArchivedFilesByCategory(user, category.slug);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search archive files...",
        leadingContent: <BackPill />,
      }}
    >
      <ArchiveCategoryWorkspace
        categoryTitle={category.title}
        items={items}
      />
    </DashboardLayout>
  );
}

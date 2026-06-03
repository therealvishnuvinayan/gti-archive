import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LibraryWorkspace } from "@/components/library/library-workspace";
import { requireUser } from "@/lib/auth";
import { getLibraryPageDataForUser } from "@/lib/library";
import {
  parseLibraryDateFilter,
  parseLibraryQuickMenu,
  parseLibraryTypeFilter,
} from "@/lib/library-shared";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    search?: string;
    projectId?: string;
    createdById?: string;
    date?: string;
    type?: string;
    quickMenu?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requireUser();

  if (!hasPermission(user, "library.view")) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialQuery = {
    search: resolvedSearchParams?.search?.trim() ?? "",
    projectId: resolvedSearchParams?.projectId?.trim() ?? "",
    createdById: resolvedSearchParams?.createdById?.trim() ?? "",
    date: parseLibraryDateFilter(resolvedSearchParams?.date),
    type: parseLibraryTypeFilter(resolvedSearchParams?.type),
    quickMenu: parseLibraryQuickMenu(resolvedSearchParams?.quickMenu),
    page: Number(resolvedSearchParams?.page ?? "1"),
    pageSize: Number(resolvedSearchParams?.pageSize ?? "10"),
  };
  const initialData = await getLibraryPageDataForUser(user, initialQuery);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search library...",
      }}
    >
      <LibraryWorkspace initialData={initialData} initialQuery={initialQuery} />
    </DashboardLayout>
  );
}

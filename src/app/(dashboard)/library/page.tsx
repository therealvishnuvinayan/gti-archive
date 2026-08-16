import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LibraryWorkspace } from "@/components/library/library-workspace";
import { getActiveAssetTagOptions } from "@/lib/asset-tags";
import { requireUser } from "@/lib/auth";
import { createDevTimer, logDevTiming, timeDevAsync } from "@/lib/dev-timing";
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
    assetTagId?: string;
    date?: string;
    type?: string;
    quickMenu?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const timer = createDevTimer("[library:init]");
  const user = await requireUser();
  timer.mark("auth/session");

  const canViewLibrary = hasPermission(user, "library.view");
  const canFilterAssets = hasPermission(user, "library.filter");
  const canUploadAssets = hasPermission(user, "library.uploadAsset");
  timer.mark("permission check", {
    canViewLibrary,
    canUploadAssets,
  });

  if (!canViewLibrary) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  timer.mark("search params");

  const initialQuery = {
    search: canFilterAssets ? resolvedSearchParams?.search?.trim() ?? "" : "",
    projectId: canFilterAssets
      ? resolvedSearchParams?.projectId?.trim() ?? ""
      : "",
    createdById: canFilterAssets
      ? resolvedSearchParams?.createdById?.trim() ?? ""
      : "",
    assetTagId: canFilterAssets
      ? resolvedSearchParams?.assetTagId?.trim() ?? ""
      : "",
    date: canFilterAssets
      ? parseLibraryDateFilter(resolvedSearchParams?.date)
      : parseLibraryDateFilter(undefined),
    type: canFilterAssets
      ? parseLibraryTypeFilter(resolvedSearchParams?.type)
      : parseLibraryTypeFilter(undefined),
    quickMenu: canFilterAssets
      ? parseLibraryQuickMenu(resolvedSearchParams?.quickMenu)
      : parseLibraryQuickMenu(undefined),
    page: Number(resolvedSearchParams?.page ?? "1"),
    pageSize: Number(resolvedSearchParams?.pageSize ?? "20"),
  };
  const [initialData, assetTagOptions] = await Promise.all([
    timeDevAsync("[library:list]", "library list query", () =>
      getLibraryPageDataForUser(user, initialQuery),
    ),
    canUploadAssets
      ? timeDevAsync("[library:asset-tags]", "asset tag query", () =>
          getActiveAssetTagOptions(),
        )
      : Promise.resolve([]),
  ]);
  logDevTiming("[library:init]", "recent files query skipped", {
    reason: "Library page does not load a separate recent-files dataset.",
  });
  timer.end("total", {
    returnedItems: initialData.items.length,
    totalItems: initialData.total,
    activeAssetTags: assetTagOptions.length,
  });

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search library...",
      }}
    >
      <LibraryWorkspace
        initialData={initialData}
        assetTagOptions={assetTagOptions}
        canFilterAssets={canFilterAssets}
        canUploadAssets={canUploadAssets}
        initialQuery={initialQuery}
      />
    </DashboardLayout>
  );
}

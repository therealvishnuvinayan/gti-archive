import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LibraryWorkspace } from "@/components/library/library-workspace";
import { requireUser } from "@/lib/auth";
import { getLibraryPageDataForUser } from "@/lib/library";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function LibraryPage() {
  const user = await requireUser();

  if (!hasPermission(user, "library.view")) {
    notFound();
  }

  const initialData = await getLibraryPageDataForUser(user);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search library...",
      }}
    >
      <LibraryWorkspace initialData={initialData} />
    </DashboardLayout>
  );
}

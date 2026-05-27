import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LibraryWorkspace } from "@/components/library/library-workspace";
import { requireUser } from "@/lib/auth";
import { getLibraryPageDataForUser } from "@/lib/library";

export default async function LibraryPage() {
  const user = await requireUser();
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

import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { HelpWorkspace } from "@/components/help/help-workspace";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function HelpPage() {
  const user = await requireUser();

  if (!hasPermission(user, "help.view")) {
    redirect("/");
  }

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search help topics, workflows, and guides...",
      }}
    >
      <HelpWorkspace />
    </DashboardLayout>
  );
}

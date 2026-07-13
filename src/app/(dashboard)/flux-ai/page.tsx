import { redirect } from "next/navigation";

import { FluxAiWorkspace } from "@/components/flux-ai/flux-ai-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getRestrictedAreaFallbackRoute } from "@/lib/permissions/fallback-route";
import { hasPermission } from "@/lib/permissions/resolver";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";

export default async function FluxAiPage() {
  const user = await requireUser();

  if (!hasPermission(user, "fluxAi.view")) {
    redirect(getRestrictedAreaFallbackRoute(user));
  }

  const [collaborators, masterDataOptions] = await Promise.all([
    getCollaborators(),
    getActiveProjectMasterDataOptions(),
  ]);

  return (
    <DashboardLayout>
      <FluxAiWorkspace
        draftOptions={{
          categories: masterDataOptions.categories,
          statuses: masterDataOptions.projectStatuses,
          tags: masterDataOptions.tags,
          collaborators,
          canManageProjectMasterData: hasPermission(user, "settings.manageMasterData"),
        }}
      />
    </DashboardLayout>
  );
}

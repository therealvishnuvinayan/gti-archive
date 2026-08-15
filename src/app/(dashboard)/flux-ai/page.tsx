import { redirect } from "next/navigation";

import { FluxAiWorkspace } from "@/components/flux-ai/flux-ai-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getRecentFluxAiSearches } from "@/lib/flux-ai-search-history";
import { getRestrictedAreaFallbackRoute } from "@/lib/permissions/fallback-route";
import { canUseArchives, hasPermission } from "@/lib/permissions/resolver";

export default async function FluxAiPage() {
  const user = await requireUser();

  if (!hasPermission(user, "fluxAi.view") || !canUseArchives(user)) {
    redirect(getRestrictedAreaFallbackRoute(user));
  }

  const initialRecentSearches = await getRecentFluxAiSearches(user.id);

  return (
    <DashboardLayout>
      <FluxAiWorkspace initialRecentSearches={initialRecentSearches} />
    </DashboardLayout>
  );
}

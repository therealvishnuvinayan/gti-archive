import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SearchWorkspace } from "@/components/search/search-workspace";
import { requireUser } from "@/lib/auth";
import { getSidebarVisibility } from "@/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { searchV2Enabled } from "@/lib/search-v2/activation";
import { SearchError } from "@/lib/search-v2/contracts";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { unifiedSearch } from "@/lib/search-v2/service";
export const dynamic = "force-dynamic";
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!searchV2Enabled()) notFound();
  const user = await requireUser();
  if (!getSidebarVisibility(user).search) redirect(getAuthenticatedDefaultRoute(user));
  let data;
  try { data = await unifiedSearch(await searchParams); }
  catch (error) {
    if (error instanceof AuthorizationDeniedError || (error instanceof SearchError && error.status === 403)) redirect("/sign-in");
    const invalid = error instanceof SearchError && error.status === 400;
    return <DashboardLayout><main className="space-y-4 p-4"><h1 className="text-2xl font-semibold">{invalid ? "Invalid search" : "Search unavailable"}</h1><p>{invalid ? "Use up to 120 characters and supported filters." : "Please try again."}</p><Link className="text-emerald-800 underline" href="/search">Return to Search</Link></main></DashboardLayout>;
  }
  return <DashboardLayout><SearchWorkspace data={data} /></DashboardLayout>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { NotificationsPageWorkspace } from "@/components/notifications/notifications-page-workspace";
import { LiveAttentionWorkspace } from "@/components/notifications/live-attention-workspace";
import { requireUser } from "@/lib/auth";
import { getSidebarVisibility } from "@/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { notificationsV2Enabled } from "@/lib/notifications-v2/activation";
import { AttentionError } from "@/lib/notifications-v2/contracts";
import { getLiveAttention } from "@/lib/notifications-v2/service";
export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!getSidebarVisibility(user).notifications) redirect(getAuthenticatedDefaultRoute(user));
  if (!notificationsV2Enabled()) return <DashboardLayout><NotificationsPageWorkspace /></DashboardLayout>;
  const params = await searchParams;
  if (params.view === "messages" && Object.keys(params).length === 1) return <DashboardLayout><div className="space-y-4"><Link href="/notifications" className="text-emerald-800 underline">Back to live attention</Link><p className="text-sm text-[#68716a]">Recorded in-app messages. Read controls apply only to these stored, user-targeted records.</p><NotificationsPageWorkspace /></div></DashboardLayout>;
  let data;
  try { data = await getLiveAttention(params); }
  catch(error) {
    if (error instanceof AuthorizationDeniedError || error instanceof AttentionError && error.status === 403) redirect("/sign-in");
    const invalid = error instanceof AttentionError && error.status === 400;
    return <DashboardLayout><main className="space-y-4 p-4"><h1 className="text-2xl font-semibold">{invalid ? "Invalid attention dates or filters" : "Attention center unavailable"}</h1><p>{invalid ? "Choose supported filters and a date window of up to 92 days." : "Please try again."}</p><Link href="/notifications" className="text-emerald-800 underline">Return to attention center</Link></main></DashboardLayout>;
  }
  return <DashboardLayout><LiveAttentionWorkspace data={data} /></DashboardLayout>;
}

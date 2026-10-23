import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RuntimeCreationRequests } from "@/components/projects/runtime-creation-requests";
import { runtimeCreationRequests } from "@/lib/runtime-integration/creation";
import { runtimePage } from "@/lib/stage-runtime/http";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await runtimePage(runtimeCreationRequests);
  return <DashboardLayout><RuntimeCreationRequests data={data} /></DashboardLayout>;
}

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RuntimeCreation } from "@/components/projects/stage-runtime";
import { runtimeCreationOptions } from "@/lib/stage-runtime/service";
import { runtimePage } from "@/lib/stage-runtime/http";
export const dynamic = "force-dynamic";
export default async function Page() { const data = await runtimePage(runtimeCreationOptions); return <DashboardLayout><RuntimeCreation data={data} /></DashboardLayout>; }

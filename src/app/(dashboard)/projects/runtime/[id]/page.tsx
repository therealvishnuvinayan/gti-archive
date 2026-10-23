import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RuntimeStageWorkspace } from "@/components/projects/stage-runtime";
import { getRuntimeProject } from "@/lib/stage-runtime/service";
import { runtimePage } from "@/lib/stage-runtime/http";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string }> }) { const p = await params, q = await searchParams, data = await runtimePage(() => getRuntimeProject(p.id, q.stage)); return <DashboardLayout><RuntimeStageWorkspace key={`${data.stage.id}:${data.stage.revision}`} data={data} /></DashboardLayout>; }

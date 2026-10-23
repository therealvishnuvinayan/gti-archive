import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getRuntimeCompletion } from "@/lib/runtime-completion/service";
import { runtimePage } from "@/lib/stage-runtime/http";
import { RuntimeCompletionWorkspace } from "@/components/projects/runtime-completion";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <DashboardLayout><RuntimeCompletionWorkspace data={await runtimePage(async () => getRuntimeCompletion((await params).id))} /></DashboardLayout>; }

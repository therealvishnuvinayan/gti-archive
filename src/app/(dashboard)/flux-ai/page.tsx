import { FluxAiWorkspace } from "@/components/flux-ai/flux-ai-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function FluxAiPage() {
  return (
    <DashboardLayout>
      <FluxAiWorkspace />
    </DashboardLayout>
  );
}

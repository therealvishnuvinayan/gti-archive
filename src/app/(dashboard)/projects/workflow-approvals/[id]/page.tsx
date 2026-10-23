import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { WorkflowReview } from "@/components/projects/workflow-publication";
import { getWorkflowApproval } from "@/lib/stage-builder/publication";
import { publicationPage } from "@/lib/stage-builder/publication-page";
export const dynamic = "force-dynamic";
export default async function WorkflowApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, data = await publicationPage(() => getWorkflowApproval(id));
  return <DashboardLayout><WorkflowReview key={`${id}:${data.status}`} initial={data} /></DashboardLayout>;
}

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PublishedWorkflowDetail } from "@/components/projects/workflow-publication";
import { getPublishedWorkflow } from "@/lib/stage-builder/publication";
import { publicationPage } from "@/lib/stage-builder/publication-page";
export const dynamic = "force-dynamic";
export default async function PublishedWorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; historyOffset?: string }> }) {
  const { id } = await params, query = await searchParams, historyOffset = Number(query.historyOffset ?? 0);
  const data = await publicationPage(() => getPublishedWorkflow(id, query.version === undefined ? undefined : Number(query.version), historyOffset));
  return <DashboardLayout><PublishedWorkflowDetail data={data} historyOffset={historyOffset} /></DashboardLayout>;
}

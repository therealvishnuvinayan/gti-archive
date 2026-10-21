import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StageBuilder } from "@/components/projects/stage-builder";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { DraftError } from "@/lib/stage-builder/contracts";
import { draftsEnabled, getDraft } from "@/lib/stage-builder/service";
export const dynamic = "force-dynamic";
export default async function WorkflowDraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }) {
  if (!draftsEnabled()) notFound();
  const { revision } = await searchParams;
  const data = await getDraft((await params).id, revision === undefined ? undefined : Number(revision)).catch(error => {
    if (error instanceof AuthorizationDeniedError) redirect("/no-access");
    if (error instanceof DraftError) notFound(); throw error;
  });
  return <DashboardLayout><StageBuilder key={`${data.workflowId}:${data.revision}`} initial={data} /></DashboardLayout>;
}

import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { WorkflowDraftList } from "@/components/projects/stage-builder";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { draftsEnabled, listDrafts } from "@/lib/stage-builder/service";
export const dynamic = "force-dynamic";
export default async function WorkflowDraftsPage() {
  if (!draftsEnabled()) notFound();
  const data = await listDrafts().catch(error => { if (error instanceof AuthorizationDeniedError) redirect("/no-access"); throw error; });
  return <DashboardLayout><WorkflowDraftList initial={data} /></DashboardLayout>;
}

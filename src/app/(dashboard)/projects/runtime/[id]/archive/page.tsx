import { notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RuntimeArchivePublisher } from "@/components/archives/runtime-archive-publisher";
import { getCurrentUser } from "@/lib/auth";
import { readRuntimeArchivePublication } from "@/lib/archive-runtime/service";
import { archiveRuntimeEnabled } from "@/lib/archive-runtime/activation";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!archiveRuntimeEnabled()) notFound();
  const user = await getCurrentUser(); if (!user) notFound();
  const data = await readRuntimeArchivePublication(user,(await params).id).catch(error => { if (error instanceof AuthorizationDeniedError) notFound(); throw error; });
  return <DashboardLayout><RuntimeArchivePublisher data={data} /></DashboardLayout>;
}

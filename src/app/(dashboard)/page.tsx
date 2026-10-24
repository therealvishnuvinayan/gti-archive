import { taskEnabled, conceptsEnabled } from "@/lib/tasker/contracts";
import { listTasks } from "@/lib/tasker/service";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { RoleDashboardWorkspace } from "@/components/dashboard/role-dashboard";
import { dashboardV2Enabled } from "@/lib/dashboard-v2/activation";
import { getRoleDashboard } from "@/lib/dashboard-v2/service";
import { TaskerError } from "@/lib/tasker/contracts";
import { StatCard } from "@/components/dashboard/stat-card";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { canCreateProjects, hasPermission } from "@/lib/permissions/resolver";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();

  if (!hasPermission(user, "dashboard.view")) {
    redirect(getAuthenticatedDefaultRoute(user));
  }

  if (dashboardV2Enabled()) {
    let data;
    try {
      data = await getRoleDashboard(await searchParams);
    } catch (error) {
      if (error instanceof TaskerError && error.status === 400) return <DashboardLayout><main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Invalid dashboard filters</h1><p>Choose a supported view to continue.</p><Link className="underline" href="/">Reset dashboard filters</Link></main></DashboardLayout>;
      throw error;
    }
    return <DashboardLayout><RoleDashboardWorkspace data={data} /></DashboardLayout>;
  }

  const snapshot = await getDashboardSnapshot(user);
  const general = taskEnabled() ? await listTasks() : null;
  const canCreateProject = canCreateProjects(user);

  return (
    <DashboardLayout>
      <main className="space-y-5 pb-2">
        <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[32px] font-bold leading-none tracking-[-0.035em] text-[#111713] sm:text-[38px]">
                Dashboard
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#38865d]">
                {snapshot.scopeLabel}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-[#68716a] sm:text-[14px]">
              Track project progress, attention items, and upcoming work.
            </p>
          </div>
          {canCreateProject ? (
            <Link
              href="/projects/new"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-[linear-gradient(90deg,#29905e,#15563b)] px-6 text-[13px] font-semibold text-white shadow-[0_12px_26px_rgba(28,108,69,0.22)] transition-transform hover:-translate-y-0.5 lg:self-auto"
            >
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          ) : null}
        </header>

        {general && <Link href="/tasks" className="block rounded-2xl border border-[#d9e2da] bg-white p-5 text-emerald-900"><strong>{conceptsEnabled() ? "My Tasks" : "My General Tasks"} · {general.total}</strong><p className="mt-1 text-sm">Open your assignments, conversations and completion reviews.</p></Link>}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.kpis.map((kpi) => (
            <StatCard key={kpi.label} {...kpi} />
          ))}
        </section>

        <DashboardWorkspace snapshot={snapshot} />
      </main>
    </DashboardLayout>
  );
}

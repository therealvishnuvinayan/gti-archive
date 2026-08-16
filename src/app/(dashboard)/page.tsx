import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { StatCard } from "@/components/dashboard/stat-card";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { canCreateProjects, hasPermission } from "@/lib/permissions/resolver";

export default async function Home() {
  const user = await requireUser();

  if (!hasPermission(user, "dashboard.view")) {
    redirect(getAuthenticatedDefaultRoute(user));
  }

  const snapshot = await getDashboardSnapshot(user);
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

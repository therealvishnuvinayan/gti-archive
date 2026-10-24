import Link from "next/link";
import { ArrowUpRight, FolderOpen, ListChecks, ShieldCheck } from "lucide-react";
import type { RoleDashboard } from "@/lib/dashboard-v2/service";
import { taskTypeLabels, type DashboardQuery } from "@/lib/dashboard-v2/contracts";
import { StatCard } from "./stat-card";

const panel = "rounded-[24px] border border-[#dce5dc] bg-white p-5 shadow-[0_8px_30px_rgba(18,34,25,0.025)] sm:p-6";
const linkStyle = "rounded-lg text-sm font-semibold text-[#246c49] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#246c49]";
function date(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(value)); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase()); }
function href(query: DashboardQuery, patch: Partial<DashboardQuery>, anchor: string) {
  const params = new URLSearchParams(Object.entries({ ...query, ...patch }).map(([key, value]) => [key, String(value)]));
  return `/?${params}#${anchor}`;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-2xl bg-[#f5f8f3] px-5 py-7 text-sm leading-6 text-[#647068]">{children}</p>; }
function Pages({ query, field, more, anchor }: { query: DashboardQuery; field: "workPage" | "projectPage" | "attentionPage"; more: boolean; anchor: string }) {
  if (!query[field] && !more) return null;
  return <nav aria-label={`${anchor} pages`} className="mt-5 flex items-center justify-between gap-4 text-sm">
    {query[field] > 0 ? <Link className={linkStyle} href={href(query, { [field]: query[field] - 1 }, anchor)}>Previous</Link> : <span />}
    <span className="text-[#647068]">Page {query[field] + 1}</span>
    {more && query[field] < 1000 ? <Link className={linkStyle} href={href(query, { [field]: query[field] + 1 }, anchor)}>Next</Link> : <span />}
  </nav>;
}
function Tabs({ values, active }: { values: { label: string; href: string; value: string }[]; active: string }) {
  return <div className="mb-5 flex flex-wrap gap-2">{values.map(v => <Link key={v.value} href={v.href} aria-current={v.value === active ? "page" : undefined}
    className={`rounded-full border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#246c49] ${v.value === active ? "border-[#246c49] bg-[#eaf5ed] text-[#246c49]" : "border-[#e2e8df] text-[#647068] hover:bg-[#f5f8f3]"}`}>{v.label}</Link>)}</div>;
}
export function RoleDashboardWorkspace({ data }: { data: RoleDashboard }) {
  const { query, projects, work, attention } = data;
  const intro = data.role === "DIRECTOR" ? "Your global project overview and decisions ready for review."
    : projects.manager ? "Your project responsibilities, assigned work and current decisions."
    : "Your assignments and Task Owner reviews, with the project context available to you.";
  const attentionLabels = { all: "All decisions", tasks: "Task reviews", workflows: "Workflow drafts", creation: "Creation requests", completion: "Final completion", policy: "Document policy", stages: "Stage approvals" };
  const attentionOptions = projects.manager ? data.role === "DIRECTOR" ? Object.keys(attentionLabels) : ["all", "tasks", "stages"] : ["all", "tasks"];
  return <main className="space-y-6 pb-6" data-dashboard-v2>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#38865d]">{data.roleLabel}</p><h1 className="text-3xl font-bold tracking-tight text-[#111713] sm:text-4xl">Dashboard</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#647068]">{intro}</p></div>
      {data.create && <Link href={data.create.href} className="self-start rounded-full bg-[#246c49] px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#246c49]">{data.create.label}</Link>}
    </header>
    <nav aria-label="Workspaces" className="flex flex-wrap gap-x-5 gap-y-3">{data.links.map(l => <Link className={linkStyle} key={l.href} href={l.href}>{l.label}<ArrowUpRight aria-hidden className="ml-1 inline h-3 w-3" /></Link>)}</nav>
    <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {projects.counts && <><StatCard label="Accessible active projects" value={projects.counts.active} note="Runtime + native + flexible" href={href(query, { projectStatus: "active", projectPage: 0 }, "projects")} icon="active" tone="green" />
        <StatCard label="Accessible completed projects" value={projects.counts.completed} note="Project-level completion" href={href(query, { projectStatus: "completed", projectPage: 0 }, "projects")} icon="completed" tone="green" /></>}
      {work.enabled && <StatCard label="Tasks ready for your action" value={work.actionable} note="Assigned executor · Ready" href={href(query, { work: "action", workPage: 0 }, "my-work")} icon="projects" tone="green" />}
      {attention.completeCount !== null && <StatCard label={query.attention === "all" ? "Pending dashboard decisions" : attentionLabels[query.attention]} value={attention.completeCount} note="Eligible for your review now" href="#needs-attention" icon="attention" tone="amber" />}
    </section>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section id="my-work" className={`${panel} scroll-mt-6`} aria-labelledby="my-work-heading">
        <div className="mb-2 flex items-center gap-2"><ListChecks className="h-5 w-5 text-[#38865d]" aria-hidden /><h2 id="my-work-heading" className="text-xl font-semibold">My Work</h2></div>
        <p className="mb-5 text-sm leading-6 text-[#647068]">Execute assignments or follow the tasks you own. Completion reviews appear in Needs My Attention.</p>
        <Tabs active={query.work} values={([['action', 'Ready for me'], ['assigned', 'Assigned to me'], ['owned', 'Owned by me'], ['completed', 'Completed']] as const).map(([value, text]) => ({ value, label: text, href: href(query, { work: value, workPage: 0 }, "my-work") }))} />
        {!work.enabled ? <Empty>My Tasks is not enabled in this environment.</Empty> : !work.items.length ? <Empty>No tasks in this view. Assignments and tasks you own will appear here when available.</Empty> : <>
          <p className="mb-3 text-xs text-[#647068]">{work.total} tasks in this view</p><ul tabIndex={0} aria-label="Current tasks" className="max-h-[480px] overflow-y-auto divide-y divide-[#e8ede5] pr-2 focus-visible:outline-2 focus-visible:outline-[#246c49]">{work.items.map(t => <li key={t.id} className="py-4 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-2"><Link className={`${linkStyle} min-w-0 break-words text-base`} href={t.href}>{t.title}</Link><span className="rounded-full bg-[#f0f5ef] px-2.5 py-1 text-xs text-[#3f5447]">{label(t.status)}</span></div>
            <p className="mt-2 text-xs text-[#647068]">{taskTypeLabels[t.type]}{t.isSister ? " · Sister task" : ""} · {t.relationship}{t.readOnly ? " · Project completed; read only" : ""}</p>
            <p className="mt-2 break-words text-sm text-[#46584b]">{t.project.name} <span className="text-xs text-[#647068]">· {t.project.family}</span></p>
            <p className="mt-1 text-xs leading-5 text-[#647068]">Owner: {t.owner.name ?? "Unnamed user"} · Executor: {t.executor.name ?? "Unnamed user"}<br />Due {date(t.dueAt)} (Dubai)</p>
          </li>)}</ul></>}
        <Pages query={query} field="workPage" more={work.hasMore} anchor="my-work" />
      </section>
      <section id="needs-attention" className={`${panel} scroll-mt-6`} aria-labelledby="attention-heading">
        <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#38865d]" aria-hidden /><h2 id="attention-heading" className="text-xl font-semibold">Needs My Attention</h2></div>
        <p className="mb-5 text-sm leading-6 text-[#647068]">Open the original workspace to review the evidence and make a decision. Task acceptance does not complete a stage or project.</p>
        <Tabs active={query.attention} values={attentionOptions.map(value => ({ value, label: attentionLabels[value as keyof typeof attentionLabels], href: href(query, { attention: value as DashboardQuery["attention"], attentionPage: 0 }, "needs-attention") }))} />
        {!attention.items.length ? <Empty>{attention.hasMore || attention.requiresWorkspace || query.attentionPage > 0 ? "No eligible decisions in this batch. Use the page links to check the other requests." : "Nothing needs your decision right now. New eligible requests will appear here."}</Empty> : <ul tabIndex={0} aria-label="Current decisions" className="max-h-[480px] overflow-y-auto divide-y divide-[#e8ede5] pr-2 focus-visible:outline-2 focus-visible:outline-[#246c49]">{attention.items.map(item => <li key={`${item.kind}:${item.id}`} className="py-4 first:pt-0"><p className="mb-2 text-xs font-medium text-[#647068]">{item.detail}</p><Link className={`${linkStyle} break-words text-base`} href={item.href}>{item.title}<ArrowUpRight className="ml-1 inline h-4 w-4" aria-hidden /></Link><p className="mt-2 text-xs text-[#647068]">{date(item.at)}</p></li>)}</ul>}
        {(attention.hasMore || query.attentionPage > 0) && <p className="mt-4 text-xs leading-5 text-[#647068]">Requests are checked in batches of 12 per category. The total is omitted while more requests remain to be checked.</p>}
        {attention.requiresWorkspace && <p className="mt-4 text-sm text-[#647068]">Some stage decisions need a larger evidence review. Open the relevant project workspace to review them.</p>}
        <Pages query={query} field="attentionPage" more={attention.hasMore} anchor="needs-attention" />
      </section>
    </div>
    {data.role === "JUNIOR_PROJECT_MANAGER" && <section className={panel} aria-labelledby="requests-heading"><h2 id="requests-heading" className="mb-2 text-xl font-semibold">My creation requests</h2><p className="mb-4 text-sm text-[#647068]">New runtime projects require Director approval and an eligible SPM Co-owner.</p>{!data.requests.length ? <Empty>No creation requests yet.</Empty> : <ul className="space-y-3">{data.requests.map(r => <li key={r.id} className="flex flex-wrap justify-between gap-2"><Link className={linkStyle} href={r.href}>{r.title}</Link><span className="text-sm text-[#647068]">{label(r.state)} · {date(r.at)}</span></li>)}</ul>}<Link href="/projects/runtime/requests" className={`${linkStyle} mt-4 inline-block`}>View creation requests</Link></section>}
    <section id="projects" className={`${panel} scroll-mt-6`} aria-labelledby="projects-heading">
      <div className="mb-2 flex items-center gap-2"><FolderOpen className="h-5 w-5 text-[#38865d]" aria-hidden /><h2 id="projects-heading" className="text-xl font-semibold">{projects.manager ? "Projects" : "Project context"}</h2></div>
      <p className="mb-5 text-sm leading-6 text-[#647068]">{projects.manager ? "Each project opens in its existing workspace. Runtime and native project statuses are shown separately." : "Only project references you can access are shown. Runtime assignment context stays inside My Tasks."}</p>
      <Tabs active={query.family} values={(projects.manager ? ["runtime", "native", "flexible"] as const : ["native", "flexible"] as const).map(value => ({ value, label: value === "runtime" ? "Runtime projects" : value === "native" ? "Native projects" : "Flexible projects", href: href(query, { family: value, projectPage: 0 }, "projects") }))} />
      {projects.manager && <Tabs active={query.projectStatus} values={(["all", "active", "completed"] as const).map(value => ({ value, label: label(value), href: href(query, { projectStatus: value, projectPage: 0 }, "projects") }))} />}
      <p className="mb-4 text-xs text-[#647068]">{projects.total} accessible {projects.manager ? "projects" : "references"} in this view</p>
      {!projects.items.length ? <Empty>No accessible projects in this view. Try another project family or status.</Empty> : <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.items.map(p => <li key={p.id} className="min-w-0 rounded-2xl border border-[#e1e8dd] p-5">
        <p className="mb-2 text-xs text-[#647068]">{p.family}{p.category ? ` · ${label(p.category)}` : ""}</p><Link href={p.href} className={`${linkStyle} break-words text-base`}>{p.name}</Link>
        {p.status && <p className="mt-3 text-sm font-medium text-[#3f5447]">{label(p.status)}</p>}
        {projects.manager && <p className="mt-3 text-xs leading-5 text-[#647068]">Owner: {p.owner ?? "Unassigned"}{p.coOwners.length > 0 && <><br />Co-owner: {p.coOwners.join(", ")}</>}</p>}
        {p.date && <p className="mt-2 text-xs text-[#647068]">{p.dateLabel} {date(p.date)}</p>}
      </li>)}</ul>}
      <Pages query={query} field="projectPage" more={projects.hasMore} anchor="projects" />
    </section>
  </main>;
}

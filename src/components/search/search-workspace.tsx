"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { UnifiedSearch } from "@/lib/search-v2/service";
import { familyLabels, searchHref, searchPageSize, taskTypeLabels, type SearchTaskType, type SearchFamily } from "@/lib/search-v2/contracts";

const control = "min-h-11 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const linkStyle = "rounded-lg text-emerald-800 underline decoration-emerald-200 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700";
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase()); }
export function SearchWorkspace({ data }: { data: UnifiedSearch }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), heading = useRef<HTMLHeadingElement>(null);
  const key = searchHref(data.query), previous = useRef(key);
  useEffect(() => { if (previous.current !== key) { heading.current?.focus(); previous.current = key; } }, [key]);
  const destination = (href: string) => `${href}?${new URLSearchParams({ returnTo: key })}`;
  const hasItems = Object.values(data.projects).some(g => g.items.length) || !!data.tasks?.items.length;
  return <main data-search-v2 className="mx-auto w-full max-w-5xl space-y-6 pb-6 [overflow-wrap:anywhere]">
    <header><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">FLUX workspace</p><h1 className="text-3xl font-bold tracking-tight text-[#111713]">Search</h1><p className="mt-2 text-sm text-[#68716a]">Find projects and tasks you can access.</p></header>
    <form key={key} action="/search" role="search" aria-label="Projects and tasks" className="space-y-4 rounded-2xl border border-[#d9e2da] bg-white p-4 shadow-sm sm:p-6"
      onSubmit={event => { event.preventDefault(); const params = new URLSearchParams(); for (const [k, v] of new FormData(event.currentTarget)) params.set(k, String(v)); startTransition(() => router.push(`/search?${params}`)); }}>
      <input type="hidden" name="page" value="0" />
      <label className="block text-sm font-semibold" htmlFor="search-term">Project name, identifier or task title</label>
      <div className="flex flex-col gap-3 sm:flex-row"><input id="search-term" type="search" name="q" maxLength={120} defaultValue={data.query.q} className={control} placeholder="Search projects and tasks" autoComplete="off" />
        <button type="submit" disabled={pending} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"><Search className="h-4 w-4" aria-hidden />{pending ? "Searching…" : "Search"}</button></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-2 text-sm"><span>Show</span><select name="kind" defaultValue={data.query.kind} className={control}><option value="all">Projects and Tasks</option><option value="projects">Projects</option>{data.options.types.length > 0 && <option value="tasks">Tasks</option>}</select></label>
        <label className="space-y-2 text-sm"><span>Project family</span><select name="family" defaultValue={data.query.family} className={control}><option value="all">All project families</option>{data.options.families.map(f => <option key={f} value={f}>{familyLabels[f]}</option>)}</select></label>
        {data.options.types.length > 0 && <label className="space-y-2 text-sm"><span>Task type</span><select name="type" defaultValue={data.query.type} className={control}><option value="all">All task types</option>{data.options.types.map(t => <option key={t} value={t}>{taskTypeLabels[t as SearchTaskType]}</option>)}</select></label>}
      </div><p className="text-xs text-[#68716a]">Family applies to project results; type applies to task results.</p>
    </form>
    <section aria-busy={pending} aria-labelledby="search-results" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="search-results" ref={heading} tabIndex={-1} className="rounded-md text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">{data.query.q ? `Results for “${data.query.q}”` : "Start your search"}</h2>{data.query.q && <p className="text-xs text-[#68716a]">Page {data.query.page + 1} · Up to {searchPageSize} per section, sorted by name</p>}</div>
      <p role="status" className="sr-only">{pending ? "Searching" : !data.query.q ? "Enter a search term" : hasItems ? "Search results ready" : "No accessible matches on this page"}</p>
      {!data.query.q ? <div className="rounded-2xl border border-dashed border-[#cbd8cf] p-8 text-sm text-[#68716a]">Enter a name, identifier or title above. Archive and Library searches remain in their own workspaces.</div> : !hasItems ? <div className="rounded-2xl border border-[#d9e2da] bg-white p-8"><h3 className="font-semibold">No accessible matches on this page</h3><p className="mt-2 text-sm text-[#68716a]">Try another name or title, broaden your filters, or return to the first page.</p></div> : null}
      {(Object.entries(data.projects) as [SearchFamily, NonNullable<UnifiedSearch["projects"][SearchFamily]>][]).filter(([, group]) => group.items.length).map(([family, group]) => <section key={family} aria-label={familyLabels[family]} className="overflow-hidden rounded-2xl border border-[#d9e2da] bg-white">
        <h3 className="border-b border-[#e5ebe6] bg-[#f3f7f3] px-5 py-3 text-sm font-semibold">{familyLabels[family]}</h3><ul className="divide-y divide-[#e5ebe6]">{group.items.map(p => <li key={p.id} className="space-y-2 px-5 py-4">
          <Link prefetch={false} href={destination(p.href)} className={`${linkStyle} inline-flex max-w-full items-start gap-2 font-semibold`}><span className="break-words [overflow-wrap:anywhere]">{p.name}</span><ArrowUpRight className="mt-1 h-4 w-4 shrink-0" aria-hidden /></Link>
          {p.contextOnly ? <p className="text-xs text-[#68716a]">Project reference · Your assigned context</p> : <><p className="text-xs text-[#526057]">{label(p.status!)}{p.category ? ` · ${label(p.category)}` : ""}</p><p className="text-xs text-[#68716a]">Owner: {p.owner ?? "Not assigned"}{p.coOwners?.length ? ` · Co-owners: ${p.coOwners.join(", ")}${p.moreCoOwners ? " · More in workspace" : ""}` : ""}</p></>}
          <p className="break-all text-[11px] text-[#68716a]">ID: {p.id}</p>
        </li>)}</ul></section>)}
      {!!data.tasks?.items.length && <section aria-label="Tasks" className="overflow-hidden rounded-2xl border border-[#d9e2da] bg-white"><h3 className="border-b border-[#e5ebe6] bg-[#f3f7f3] px-5 py-3 text-sm font-semibold">Tasks</h3><ul className="divide-y divide-[#e5ebe6]">{data.tasks.items.map(t => <li key={t.id} className="space-y-2 px-5 py-4">
        <Link prefetch={false} href={destination(t.href)} className={`${linkStyle} inline-flex max-w-full items-start gap-2 font-semibold`}><span className="break-words [overflow-wrap:anywhere]">{t.title}</span><ArrowUpRight className="mt-1 h-4 w-4 shrink-0" aria-hidden /></Link>
        <p className="text-xs text-[#526057]">{taskTypeLabels[t.type as SearchTaskType]} · {label(t.status)} · {t.relationships.join(" / ")}</p>
        <p className="text-xs text-[#68716a]">Due {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }).format(new Date(t.deadline))} (Dubai)</p>
        {t.isSister && <p className="text-xs text-[#68716a]">Sister Task{t.source && <> · From <Link prefetch={false} href={destination(t.source.href)} className={linkStyle}>{t.source.title}</Link></>}{t.root && t.root.id !== t.source?.id && <> · Original <Link prefetch={false} href={destination(t.root.href)} className={linkStyle}>{t.root.title}</Link></>}</p>}
      </li>)}</ul></section>}
      {data.query.q && <nav aria-label="Search pages" className="flex flex-wrap items-center gap-4 text-sm">
        {data.query.page > 0 && <><Link href={searchHref(data.query, 0)} className={linkStyle}>First page</Link><Link href={searchHref(data.query, data.query.page - 1)} className={linkStyle}>Previous</Link></>}
        {data.hasMore && <Link href={searchHref(data.query, data.query.page + 1)} className={linkStyle}>Next</Link>}
        {data.refine && <p className="text-[#68716a]">Refine your search to see more matches.</p>}
      </nav>}
    </section>
  </main>;
}

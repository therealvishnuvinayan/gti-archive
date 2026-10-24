"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskCalendar } from "@/lib/calendar-v2/service";
import { calendarHref, calendarStatusLabels, relationshipLabels, type CalendarTask } from "@/lib/calendar-v2/contracts";
import { addCalendarDays, calendarDateLabel, deadlineTime, moveMonth, validCalendarDate } from "@/lib/calendar-v2/dates";
import { taskTypeLabels } from "@/lib/search-v2/contracts";

const control = "min-h-11 w-full rounded-xl border border-[#cbd8cf] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd8cf] bg-white px-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
function Deadline({ task, returnTo, compact = false }: { task: CalendarTask; returnTo: string; compact?: boolean }) {
  return <li className="min-w-0"><Link prefetch={false} href={`${task.href}?${new URLSearchParams({ returnTo })}`} className={`block rounded-lg border border-[#dce5dd] bg-white p-2.5 text-[#183525] hover:border-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${compact ? "text-xs" : "text-sm"}`}>
    <div className="flex flex-wrap items-baseline gap-x-2"><time dateTime={task.deadline} className="font-semibold text-emerald-800">{deadlineTime(task.deadline)}</time><span className="font-semibold [overflow-wrap:anywhere]">{task.title}</span></div>
    <p className="mt-1 text-xs text-[#526057]">{taskTypeLabels[task.type]} · {calendarStatusLabels[task.status]}</p><p className="mt-1 text-[11px] text-[#68716a]">{task.relationships.join(" / ")}{task.isSister ? " · Sister Task" : ""}</p>
  </Link></li>;
}
export function TaskCalendarWorkspace({ data }: { data: TaskCalendar }) {
  const { query } = data, key = calendarHref(query), router = useRouter(), [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null), previous = useRef(key);
  useEffect(() => { if (previous.current !== key) { heading.current?.focus(); previous.current = key; } }, [key]);
  const dayAgenda = (date: string) => calendarHref(query, { view: "agenda", span: "day", date, after: undefined });
  const daily = query.view === "agenda" && query.span === "day";
  const move = (direction: number) => query.view === "week" || daily ? addCalendarDays(query.date, direction * (daily ? 1 : 7)) : moveMonth(query.date, direction);
  const period = query.view === "week" ? `${calendarDateLabel(data.range.start, { day: "numeric", month: "short" })} – ${calendarDateLabel(addCalendarDays(data.range.end, -1), { day: "numeric", month: "short", year: "numeric" })}` : calendarDateLabel(query.date, daily ? { dateStyle: "full" } : { month: "long", year: "numeric" });
  const empty = !data.days.some(d => d.items.length) && !data.agenda?.items.length;
  const agendaDates = [...new Set(data.agenda?.items.map(t => t.date))];
  return <main data-calendar-v2 className="min-w-0 space-y-5 pb-6 [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Universal Tasker</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111713]">Task Calendar</h1><p className="mt-2 text-sm text-[#68716a]">Real task deadlines · Asia/Dubai time</p></div>{data.enabled && <Link className={button} href="/tasks">Open My Tasks</Link>}</header>
    <form key={key} action="/calendar" aria-label="Calendar filters" className="grid gap-4 rounded-2xl border border-[#d9e2da] bg-white p-4 sm:grid-cols-2 xl:grid-cols-5"
      onSubmit={event => { event.preventDefault(); const params = new URLSearchParams(); for (const [k, v] of new FormData(event.currentTarget)) params.set(k, String(v)); startTransition(() => router.push(`/calendar?${params}`)); }}>
      <input type="hidden" name="view" value={query.view} /><input type="hidden" name="span" value={query.span} />
      <label className="space-y-2 text-sm"><span>Date</span><input type="date" name="date" required min="1900-01-01" max="2199-12-31" defaultValue={query.date} className={control} /></label>
      <label className="space-y-2 text-sm"><span>Relationship</span><select name="relationship" defaultValue={query.relationship} className={control}>{Object.entries(relationshipLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="space-y-2 text-sm"><span>Task type</span><select name="type" defaultValue={query.type} className={control}><option value="all">All task types</option>{data.types.map(t => <option key={t} value={t}>{taskTypeLabels[t]}</option>)}</select></label>
      <label className="space-y-2 text-sm"><span>Status</span><select name="status" defaultValue={query.status} className={control}><option value="all">All statuses</option>{Object.entries(calendarStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button type="submit" disabled={pending} className={`${button} self-end !bg-emerald-800 !text-white disabled:opacity-60`}>{pending ? "Loading…" : "Apply filters"}</button>
    </form>
    <section aria-busy={pending} aria-labelledby="calendar-period" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><nav aria-label="Calendar dates" className="flex items-center gap-2">
        {validCalendarDate(move(-1)) && <Link className={button} aria-label={query.view === "week" ? "Previous week" : daily ? "Previous day" : "Previous month"} href={calendarHref(query, { date: move(-1), after: undefined })}><ChevronLeft className="h-4 w-4" aria-hidden /></Link>}
        <Link href={calendarHref(query, { date: data.today, after: undefined })} className={button}>Today</Link>
        {validCalendarDate(move(1)) && <Link className={button} aria-label={query.view === "week" ? "Next week" : daily ? "Next day" : "Next month"} href={calendarHref(query, { date: move(1), after: undefined })}><ChevronRight className="h-4 w-4" aria-hidden /></Link>}
      </nav><h2 id="calendar-period" ref={heading} tabIndex={-1} className="rounded-lg text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">{period}</h2></div>
      <nav aria-label="Calendar views" className="flex gap-1 rounded-xl bg-[#e7eee7] p-1">{(["month", "week", "agenda"] as const).map(view => <Link key={view} aria-current={query.view === view ? "page" : undefined} href={calendarHref(query, { view, span: "month", after: undefined })} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-emerald-700 ${query.view === view ? "bg-white text-emerald-900 shadow-sm" : "text-[#68716a]"}`}>{view}</Link>)}</nav></div>
      <p role="status" className="sr-only">{pending ? "Loading deadlines" : empty ? "No task deadlines in this view" : "Task deadlines ready"}</p>
      {!data.enabled ? <p className="rounded-2xl border border-[#d9e2da] bg-white p-6">Task Calendar is unavailable while Universal Tasker is disabled.</p> : <>
      {empty && <div className="rounded-2xl border border-dashed border-[#cbd8cf] bg-white p-6"><h3 className="font-semibold">No task deadlines in this view</h3><p className="mt-1 text-sm text-[#68716a]">Choose another date or adjust your relationship, type or status filters.</p></div>}
      {query.view === "month" && <><p className="text-xs text-[#68716a] sm:hidden">Scroll across the month grid, or use Agenda for a list.</p><div role="region" aria-label="Month deadlines" tabIndex={0} className="overflow-x-auto rounded-2xl border border-[#d9e2da] bg-white focus-visible:outline-2 focus-visible:outline-emerald-700">
        <div className="min-w-[840px]"><div className="grid grid-cols-7 border-b border-[#d9e2da] bg-[#edf3ed]">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => <div key={d} className="px-3 py-3 text-xs font-semibold text-[#526057]">{d}</div>)}</div>
        <div className="grid grid-cols-7">{data.days.map(day => <section key={day.date} data-calendar-day={day.date} aria-label={calendarDateLabel(day.date)} className={`min-h-36 min-w-0 border-b border-r border-[#e5ebe6] p-2 ${day.date.slice(0, 7) === query.date.slice(0, 7) ? "bg-white" : "bg-[#f4f7f3]"}`}>
          <div className="mb-2">{validCalendarDate(day.date) ? <Link href={dayAgenda(day.date)} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700 ${day.date === data.today ? "bg-emerald-800 text-white" : "text-[#526057]"}`} aria-label={`Deadlines for ${calendarDateLabel(day.date)}`}>{Number(day.date.slice(-2))}</Link> : <span aria-label="Outside supported dates" className="inline-block p-2 text-sm text-gray-400">{Number(day.date.slice(-2))}</span>}</div>
          <ul className="space-y-2">{day.items.map(task => <Deadline key={task.id} task={task} returnTo={key} compact />)}</ul>
          {day.hasMore && <Link className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-emerald-800 underline" href={dayAgenda(day.date)}>More deadlines</Link>}
        </section>)}</div></div></div></>}
      {query.view === "week" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">{data.days.map(day => <section key={day.date} data-calendar-day={day.date} aria-label={calendarDateLabel(day.date)} className="min-w-0 rounded-2xl border border-[#d9e2da] bg-[#f3f7f3] p-3"><h3 className="mb-3 text-sm font-semibold">{validCalendarDate(day.date) ? <Link href={dayAgenda(day.date)} className="rounded text-emerald-900 underline underline-offset-4">{calendarDateLabel(day.date, { weekday: "short", day: "numeric", month: "short" })}</Link> : calendarDateLabel(day.date, { day: "numeric", month: "short" })}</h3><ul className="space-y-2">{day.items.map(task => <Deadline key={task.id} task={task} returnTo={key} compact />)}</ul>{!day.items.length && <p className="text-xs text-[#68716a]">No deadlines</p>}{day.hasMore && <Link className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-emerald-800 underline" href={dayAgenda(day.date)}>More deadlines</Link>}</section>)}</div>}
      {query.view === "agenda" && <div className="mx-auto max-w-4xl space-y-5">{daily && <Link href={calendarHref(query, { span: "month", after: undefined })} className="text-sm text-emerald-800 underline">Show full month</Link>}{agendaDates.map(date => <section key={date} data-calendar-day={date} aria-label={calendarDateLabel(date)}><h3 className="mb-3 text-sm font-semibold text-[#526057]">{calendarDateLabel(date)}</h3><ul className="space-y-2">{data.agenda!.items.filter(t => t.date === date).map(task => <Deadline key={task.id} task={task} returnTo={key} />)}</ul></section>)}<nav aria-label="Agenda pages" className="flex gap-3">{query.after && <Link className={button} href={calendarHref(query, { after: undefined })}>First page</Link>}{data.next && <Link className={button} href={calendarHref(query, { after: data.next })}>Next page</Link>}</nav></div>}
      </>}
    </section>
    <p className="text-xs text-[#68716a]">Open a task to view its details or update its deadline with your existing permissions.</p>
  </main>;
}

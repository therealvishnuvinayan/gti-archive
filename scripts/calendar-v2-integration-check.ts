import nodeAssert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getTaskCalendar } from "../src/lib/calendar-v2/service";
import { GET } from "../src/app/api/calendar/route";
import { calendarHref, calendarRange, parseCalendarQuery } from "../src/lib/calendar-v2/contracts";
import { addCalendarDays, dubaiDate, dubaiDayStart, weekStart } from "../src/lib/calendar-v2/dates";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";
import { createTask, getTask, mutateTask } from "../src/lib/tasker/service";
import { deadline } from "../src/lib/tasker/contracts";
import { getCurrentUser } from "../src/lib/auth";
import { getSidebarVisibility } from "../src/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "../src/lib/permissions/fallback-route";
import { getDashboardBackNavigation } from "../src/lib/dashboard-navigation";
import { GET as dashboardApi } from "../src/app/api/dashboard/route";
import { GET as searchApi } from "../src/app/api/search/route";

type Fixture = { db: PrismaClient; as: (id: string) => Promise<void>; setToken: (token: string | null) => void; queries: { query: string; params: string }[]; root: string; storageReads: () => number; external: () => number };
export async function runCalendarAcceptance({ db, as, setToken, queries, root, storageReads, external }: Fixture) {
  let assertions = 0, expectedDenials = 0, expectedFailures = 0;
  const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const v = Reflect.get(target, property); return typeof v === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(v, target, args); } : v; } });
  const artifact = process.env.FLUX_CALENDAR_ARTIFACTS!, fixture = JSON.parse(readFileSync(join(root, "browser-fixture.json"), "utf8"));
  const api = async (q = "") => GET(new Request(`http://local/api/calendar${q ? `?${q}` : ""}`));
  const denied = async (q: string, status: number) => { const r = await api(q); assert.equal(r.status, status); assert.equal(r.headers.get("cache-control"), "private, no-store"); if (status < 500) expectedDenials++; else expectedFailures++; return r; };
  const items = (r: Awaited<ReturnType<typeof getTaskCalendar>>) => r.agenda?.items ?? r.days.flatMap(d => d.items);
  const day = (date: string, extra = {}) => getTaskCalendar({ view: "agenda", span: "day", date, relationship: "all", ...extra });
  await as("spm");
  const create = (title: string, due: string, extra = {}) => createTask({ commandId: randomUUID(), contextTarget: "structured:native", title, brief: "PRIVATE_CALENDAR_BRIEF", type: "GENERAL", deadline: due, priority: "NORMAL", executorId: "designer", spectatorIds: [], ...extra });
  const edit = async (id: string, extra: object) => { const t = await getTask(id); return mutateTask(id, { commandId: randomUUID(), expectedVersion: t.version, action: "EDIT", title: t.title, brief: t.brief, context: t.context, deadline: t.deadline, priority: t.priority, executorId: t.executor.id, spectatorIds: t.spectators.map(s => s.id), ...extra }); };
  const endMonth = await create("Calendar October last minute", "2026-10-31T19:59:00Z");
  const midnight = await create("Calendar November midnight", "2026-10-31T20:00:00Z");
  const nextMonth = await create("Calendar December midnight", "2026-11-30T20:00:00Z");
  const offset = await create("Calendar explicit Dubai offset", "2026-11-02T00:15:00+04:00");
  const leap = await create("Calendar leap day", "2028-02-29T08:30:00Z");
  const yearEnd = await create("Calendar new year", "2026-12-31T20:00:00Z");
  const observed = await create("Calendar spectator deadline", "2026-11-18T09:45:00Z", { spectatorIds: ["digital"] });
  const progress = await create("Calendar in progress", "2026-11-19T10:00:00Z");
  await as("designer"); await mutateTask(progress.id, { commandId: randomUUID(), expectedVersion: 1, action: "SUBMIT", text: "Synthetic response" });
  await as("spm"); const closed = await create("Calendar closed task", "2026-11-19T11:00:00Z"); await mutateTask(closed.id, { commandId: randomUUID(), expectedVersion: 1, action: "CLOSE", text: "Synthetic closed work" });
  await as("jpm"); const jpmTask = await create("Calendar JPM owned", "2026-11-17T08:00:00Z");
  await as("spm");
  for (const value of [undefined, null, "", "2026-11-20", "2026-02-30T10:00:00Z"]) { assert.throws(() => deadline(value)); await assert.rejects(create("Undated rejected", value as string)); }
  const column = await db.$queryRaw<Array<{ is_nullable: string; data_type: string; datetime_precision: number }>>`SELECT is_nullable,data_type,datetime_precision FROM information_schema.columns WHERE table_name='UniversalTask' AND column_name='deadline'`;
  assert.deepEqual(column, [{ is_nullable: "NO", data_type: "timestamp without time zone", datetime_precision: 3 }]);
  assert.equal(await db.universalTask.count({ where: { title: "Undated rejected" } }), 0);
  assert.equal(dubaiDayStart("2026-11-01").toISOString(), "2026-10-31T20:00:00.000Z");
  assert.equal(dubaiDate(new Date("2026-10-31T19:59:59Z")), "2026-10-31"); assert.equal(dubaiDate(new Date("2026-10-31T20:00:00Z")), "2026-11-01");
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  const monthRange = calendarRange(parseCalendarQuery({ date: "2026-11-01" })); assert.equal(monthRange.start, "2026-10-26"); assert.equal(monthRange.end, "2026-12-07"); assert.equal(monthRange.days.length, 42);
  const weekRange = calendarRange(parseCalendarQuery({ date: "2026-11-01", view: "week" })); assert.equal(weekRange.start, "2026-10-26"); assert.equal(weekRange.end, "2026-11-02"); assert.equal(weekRange.days.length, 7);
  await as("designer");
  for (const [date, id] of [["2026-10-31", endMonth.id], ["2026-11-01", midnight.id], ["2026-11-02", offset.id], ["2026-12-01", nextMonth.id], ["2028-02-29", leap.id], ["2027-01-01", yearEnd.id]]) { const r = await day(date); assert.ok(items(r).some(t => t.id === id && t.date === date)); assert.ok(items(r).every(t => t.date === date)); }
  assert.ok(!items(await day("2026-10-31")).some(t => t.id === midnight.id)); assert.ok(!items(await day("2026-11-30")).some(t => t.id === nextMonth.id));
  const lastMonth = await getTaskCalendar({ date: "2199-12-31" }); assert.ok(lastMonth.days.filter(d => d.date > "2199-12-31").every(d => !d.items.length && !d.hasMore));
  const beforeZone = await getTaskCalendar({ date: "2026-11-01", view: "week" });
  const previousZone = process.env.TZ;
  for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Asia/Dubai"]) { process.env.TZ = tz; assert.deepEqual(await getTaskCalendar({ date: "2026-11-01", view: "week" }), beforeZone); }
  if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone;
  for (const type of ["GENERAL", "FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"]) {
    const r = await day("2026-11-20", { type, relationship: "assigned" }); assert.ok(items(r).length); assert.ok(items(r).every(t => t.type === type && t.relationships.includes("Executor"))); }
  assert.equal(items(await day("2026-11-20", { type: "DATA_INPUT" }))[0].status, "COMPLETED");
  assert.equal(items(await day("2026-11-19", { status: "IN_PROGRESS" }))[0].id, progress.id); assert.equal(items(await day("2026-11-19", { status: "CLOSED" }))[0].id, closed.id);
  for (const [who, relation, expected] of [["spm", "owned", "Task Owner"], ["designer", "assigned", "Executor"], ["digital", "observed", "Spectator"], ["director", "observed", "Director oversight"]]) { await as(who); const task = items(await day("2026-11-18", { relationship: relation })).find(t => t.id === observed.id)!; assert.deepEqual(task.relationships, [expected]); }
  await as("digital"); assert.equal(items(await day("2026-11-18", { relationship: "assigned" })).length, 0); assert.equal(items(await day("2026-11-18", { relationship: "owned" })).length, 0);
  const sister = items(await day("2026-11-20", { type: "INITIAL_CONCEPT" }))[0]; assert.equal(sister.id, fixture.sisterId); assert.equal(sister.isSister, true); assert.ok(!JSON.stringify(sister).includes(fixture.initialId)); assert.ok(!("source" in sister) && !("root" in sister));
  await as("jpm"); assert.equal(items(await day("2026-11-17", { relationship: "owned" }))[0].id, jpmTask.id);
  for (const who of ["spm", "jpm", "designer", "digital"]) { await as(who); const r = await getTaskCalendar({ date: "2026-11-01", view: "agenda", relationship: "all" }); assert.ok(!JSON.stringify(r).includes(fixture.privateTaskId)); assert.ok(!JSON.stringify(r).includes("PRIVATE_TASK_SENTINEL")); await assert.rejects(getTask(fixture.privateTaskId)); }
  // Hidden entries on an otherwise empty day cannot change even an overflow hint.
  await as("designer"); const hiddenBefore = await getTaskCalendar({ date: "2026-11-01", relationship: "all" });
  await as("director"); const hidden = await create("CALENDAR_HIDDEN_SENTINEL", "2026-11-07T06:00:00Z", { executorId: "designer2" });
  await as("designer"); assert.deepEqual(await getTaskCalendar({ date: "2026-11-01", relationship: "all" }), hiddenBefore);
  await as("spm"); await edit(observed.id, { spectatorIds: [] }); await as("digital"); assert.equal(items(await day("2026-11-18")).length, 0);
  await as("spm"); await edit(observed.id, { deadline: "2026-11-21T10:45:00Z", spectatorIds: ["digital"], executorId: "designer2" });
  await as("designer"); assert.equal(items(await day("2026-11-18")).length, 0); assert.ok(!items(await day("2026-11-21")).some(t => t.id === observed.id));
  await as("digital"); assert.equal(items(await day("2026-11-21", { relationship: "observed" }))[0].id, observed.id);
  await as("spm"); const removed = await create("Calendar deleted", "2026-11-03T10:00:00Z"); await mutateTask(removed.id, { commandId: randomUUID(), expectedVersion: 1, action: "DELETE", text: "Synthetic deletion" }); assert.equal(items(await day("2026-11-03")).length, 0);
  // Existing manually entered calendar records are not Tasker deadlines.
  await db.calendarEvent.create({ data: { title: "LEGACY_REMINDER_NOT_TASK", startAt: new Date("2026-11-01T10:00:00Z"), endAt: new Date("2026-11-01T11:00:00Z"), type: "REMINDERS", tone: "GREEN", createdById: "designer" } });
  for (let i = 0; i < 75; i++) await create(`Calendar busy day ${String(i).padStart(3, "0")}`, "2026-11-15T08:00:00Z");
  for (let i = 0; i < 120; i++) await create(`Calendar spread ${i}`, `${addCalendarDays("2026-10-26", i % 42)}T12:00:00Z`);
  await as("designer");
  const month = await getTaskCalendar({ date: "2026-11-01" }), busyDay = month.days.find(d => d.date === "2026-11-15")!;
  assert.equal(month.days.length, 42); assert.equal(busyDay.items.length, 3); assert.equal(busyDay.hasMore, true); assert.ok(month.days.every(d => d.items.length <= 3));
  assert.ok(month.days.find(d => d.date === "2026-12-01")!.items.some(t => t.id === nextMonth.id));
  const week = await getTaskCalendar({ date: "2026-11-15", view: "week" }); assert.equal(week.days.length, 7); assert.equal(week.days.find(d => d.date === "2026-11-15")!.items.length, 8); assert.equal(week.days.find(d => d.date === "2026-11-15")!.hasMore, true);
  const first = await day("2026-11-15"); assert.equal(items(first).length, 30); assert.ok(first.next); const second = await day("2026-11-15", { after: first.next! }); assert.equal(items(second).length, 30); assert.ok(items(second).every(t => !items(first).some(f => f.id === t.id))); assert.deepEqual(await day("2026-11-15"), first);
  const collected = [...items(first), ...items(second)]; let next = second.next;
  while (next) { const r = await day("2026-11-15", { after: next }); collected.push(...items(r)); next = r.next; }
  assert.equal(new Set(collected.map(t => t.id)).size, collected.length); assert.equal(collected.length, 78);
  assert.ok(collected.every((t, i) => !i || t.deadline > collected[i - 1].deadline || (t.deadline === collected[i - 1].deadline && t.id > collected[i - 1].id)));
  const returnTo = calendarHref(second.query); assert.deepEqual(getDashboardBackNavigation(`/tasks/${fixture.taskId}`, new URLSearchParams({ returnTo })), { owner: "topbar", href: returnTo, label: "Calendar", ariaLabel: "Back to Calendar" });
  assert.notEqual(getDashboardBackNavigation(`/tasks/${fixture.taskId}`, new URLSearchParams({ returnTo: "//evil.test/calendar?date=2026-11-01" })).owner, "topbar");
  await as("empty"); const empty = await getTaskCalendar({ date: "2026-11-01", relationship: "all" }); assert.ok(empty.days.every(d => !d.items.length && !d.hasMore));
  await as("tech"); await denied("date=2026-11-01", 403); await assert.rejects(getTaskCalendar());
  setToken(null); await denied("", 403);
  const version = (await db.userAuthorization.findUniqueOrThrow({ where: { userId: "empty" } })).authorizationVersion;
  const expired = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(version), expiresAt: new Date(0) } }); setToken(expired.token); await denied("", 403);
  const stale = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(version + 1), expiresAt: new Date(Date.now() + 3600_000) } }); setToken(stale.token); await denied("", 403);
  const revoked = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(version), expiresAt: new Date(Date.now() + 3600_000) } }); await db.session.delete({ where: { id: revoked.id } }); setToken(revoked.token); await denied("", 403);
  await db.session.deleteMany({ where: { id: { in: [expired.id, stale.id] } } });
  const directorToken = (await db.session.findFirstOrThrow({ where: { userId: "director" } })).token;
  const assignment = createRoleAssignmentService({ database: db, readSessionToken: async () => directorToken });
  await assignment.setAuthorizationStatus({ userId: "empty", accountStatus: "SUSPENDED", expectedVersion: version, reason: "Synthetic calendar suspension" });
  await as("empty"); await denied("", 403);
  await assignment.setAuthorizationStatus({ userId: "empty", accountStatus: "ACTIVE", expectedVersion: version + 1, reason: "Restore synthetic calendar account" }); await denied("", 403);
  await db.session.deleteMany({ where: { userId: "empty" } }); await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(version + 2), expiresAt: new Date(Date.now() + 3600_000) } });
  await as("designer");
  for (const q of ["date=2200-01-01", "date=1899-12-31", "date=2026-02-30", "date=2026-13-01", "date=2026-1-1", "date=2026-11-01T00:00:00Z", "date=2026-11-01&date=2026-12-01", "view=day", "span=week", "view=month&span=day", "start=2026-01-01&end=2099-01-01", "actorId=director", "type=UNKNOWN", "status=ACCEPTED", "relationship=director", "after=x", "view=agenda&date=2026-11-01&after=2026-10-01T00:00:00.000Z~x", "view=agenda&after=2026-02-30T00:00:00.000Z~x", "date=" + "a".repeat(1000)]) await denied(q, 400);
  for (const v of [null, [], { date: ["2026-11-01"] }, { view: true }, { after: 20 }]) await assert.rejects(getTaskCalendar(v));
  for (const dashboard of ["0", "1"]) for (const search of ["0", "1"]) for (const calendar of ["0", "1"]) {
    process.env.FLUX_DASHBOARD_V2 = dashboard; process.env.FLUX_SEARCH_V2 = search; process.env.FLUX_CALENDAR_V2 = calendar;
    const user = (await getCurrentUser())!, visibility = getSidebarVisibility(user); assert.equal(visibility.calendar, calendar === "1"); assert.equal(visibility.search, search === "1"); assert.equal(visibility.dashboard, dashboard === "1");
    assert.equal(getAuthenticatedDefaultRoute(user), dashboard === "1" ? "/" : "/tasks"); assert.equal((await api("date=2026-11-01")).status, calendar === "1" ? 200 : 404);
    assert.equal((await dashboardApi(new Request("http://local/api/dashboard"))).status, dashboard === "1" ? 200 : 404); assert.equal((await searchApi(new Request("http://local/api/search?q=Calendar"))).status, search === "1" ? 200 : 404);
  }
  process.env.FLUX_DASHBOARD_V2 = "1"; process.env.FLUX_SEARCH_V2 = "1"; process.env.FLUX_CALENDAR_V2 = "1";
  process.env.FLUX_UNIVERSAL_TASKER = "0"; const disabled = await getTaskCalendar({ date: "2026-11-01" }); assert.equal(disabled.enabled, false); assert.equal(items(disabled).length, 0); process.env.FLUX_UNIVERSAL_TASKER = "1";
  const counts = async () => [await db.businessEvent.count(), await db.universalTaskEntry.count(), await db.approvalDecision.count(), await db.runtimeActivity.count(), await db.calendarEvent.count()];
  const before = await counts(), reads = storageReads();
  await db.$executeRawUnsafe('ANALYZE "UniversalTask", "UniversalTaskSpectator"');
  const queryCounts: Record<string, number> = {}, plans = [];
  for (const [who, view] of [["designer", "month"], ["digital", "week"], ["director", "agenda"]]) {
    await as(who); queries.length = 0; process.env.FLUX_CALENDAR_CAPTURE = "1"; await getTaskCalendar({ date: "2026-11-15", view, relationship: "all" }); process.env.FLUX_CALENDAR_CAPTURE = "0";
    const selected = queries.filter(q => /^SELECT/.test(q.query) && /FROM "public"\."UniversalTask"/.test(q.query)); queryCounts[`${who}-${view}`] = selected.length;
    assert.equal(selected.length, view === "month" ? 42 : view === "week" ? 7 : 1);
    const sample = view === "month" ? [selected[0], selected[20], selected.at(-1)!] : [selected[0], ...(selected.length > 1 ? [selected.at(-1)!] : [])];
    for (const q of sample) {
      const parameters: unknown[] = JSON.parse(q.params);
      // Query-event logs serialize DateTime parameters as strings. Rebind them
      // explicitly as the schema's UTC timestamp type for an equivalent replay.
      const typed = q.query.replace(/\$(\d+)/g, (token, index) => typeof parameters[Number(index) - 1] === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:/.test(String(parameters[Number(index) - 1])) ? `${token}::timestamp` : token);
      plans.push({ who, view, query: q.query, replay: typed, parameters, plan: await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${typed}`, ...parameters) });
    }
  }
  for (const who of ["director", "spm", "jpm", "designer", "digital"]) { await as(who); const r = await api("date=2026-11-01&relationship=all"); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "private, no-store"); const body = await r.text(); for (const secret of ["PRIVATE_CALENDAR_BRIEF", "LEGACY_REMINDER_NOT_TASK", "RESTRICTED_ARCHIVE_FILE", "storageKey", "sourceTaskId", "rootTaskId", "ownerId", "executorId", "spectators", "inspiration", "evidence"]) assert.ok(!body.includes(secret)); }
  assert.deepEqual(await counts(), before); assert.equal(storageReads(), reads); assert.equal(external(), 0);
  const transaction = db.$transaction; db.$transaction = () => { throw new Error("PRIVATE_SQL_SENTINEL"); };
  try { assert.ok(!(await (await denied("", 500)).text()).includes("PRIVATE_SQL_SENTINEL")); } finally { db.$transaction = transaction; }
  writeFileSync(join(artifact, "query-plans.json"), JSON.stringify(plans, null, 2));
  writeFileSync(join(artifact, "service-result.json"), JSON.stringify({ status: "PASS", assertions, expectedDenials, expectedFailures, storedTasks: await db.universalTask.count(), queryCounts, queryPlans: plans.length, externalRequests: external(), calendarStorageReads: storageReads() - reads, storageColumn: column[0] }, null, 2));
  writeFileSync(join(root, "browser-fixture.json"), JSON.stringify({ ...fixture, calendar: { midnightId: midnight.id, endMonthId: endMonth.id, nextMonthId: nextMonth.id, observedId: observed.id, jpmTaskId: jpmTask.id, hiddenId: hidden.id, busyDate: "2026-11-15" } }), { mode: 0o600 });
  console.log(`PASS calendar: ${assertions} assertions, ${expectedDenials} expected denials/invalid inputs, ${expectedFailures} injected failure, ${plans.length} actual query plans; zero storage or external requests.`);
}

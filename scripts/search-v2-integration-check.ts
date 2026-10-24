import nodeAssert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";
import { unifiedSearch } from "../src/lib/search-v2/service";
import { GET } from "../src/app/api/search/route";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { createTask, getTask, mutateTask } from "../src/lib/tasker/service";
import { getRoleDashboard } from "../src/lib/dashboard-v2/service";
import { getCurrentUser } from "../src/lib/auth";
import { getSidebarVisibility } from "../src/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "../src/lib/permissions/fallback-route";
import { getDashboardBackNavigation } from "../src/lib/dashboard-navigation";
import { searchHref } from "../src/lib/search-v2/contracts";

type Fixture = { db: PrismaClient; as: (id: string) => Promise<void>; setToken: (token: string | null) => void; queries: { query: string; params: string }[]; root: string; storageReads: () => number; external: () => number };
export async function runSearchAcceptance({ db, as, setToken, queries, root, storageReads, external }: Fixture) {
  let assertions = 0, expectedDenials = 0, expectedFailures = 0;
  const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const v = Reflect.get(target, property); return typeof v === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(v, target, args); } : v; } });
  const artifact = process.env.FLUX_SEARCH_ARTIFACTS!;
  const fixture = JSON.parse(readFileSync(join(root, "browser-fixture.json"), "utf8"));
  const api = async (query = "") => GET(new Request(`http://local/api/search${query ? `?${query}` : ""}`));
  const denied = async (query: string, status: number) => { const r = await api(query); assert.equal(r.status, status); assert.equal(r.headers.get("cache-control"), "private, no-store"); if (status < 500) expectedDenials++; else expectedFailures++; return r; };
  const projects = (r: Awaited<ReturnType<typeof unifiedSearch>>) => Object.values(r.projects).flatMap(g => g.items);
  const empty = async (q: string) => { const r = await unifiedSearch({ q }); assert.deepEqual(projects(r), []); assert.equal(r.tasks?.items.length ?? 0, 0); assert.equal(r.hasMore, false); assert.ok(!("total" in r)); return r; };
  await as("director");
  for (const [q, family, href] of [["native", "native", "/projects/native"], ["dashboard-flexible", "flexible", "/projects/flexible/dashboard-flexible"], [fixture.projectId, "runtime", `/projects/runtime/${fixture.projectId}`]]) {
    const r = await unifiedSearch({ q }); assert.ok(projects(r).some(p => p.family === family && p.href === href));
  }
  const privateResult = await unifiedSearch({ q: "PRIVATE" }); assert.equal(projects(privateResult).length, 2); assert.equal(privateResult.tasks?.items.length, 1);
  assert.deepEqual(privateResult.tasks!.items[0].relationships, ["Task Owner"]);
  const oversight = await unifiedSearch({ q: "Prepare design brief" }); assert.deepEqual(oversight.tasks!.items[0].relationships, ["Director oversight"]);
  await as("spm"); assert.equal(projects(await unifiedSearch({ q: fixture.projectId })).filter(p => p.id === fixture.projectId).length, 1);
  await empty("PRIVATE"); await assert.rejects(getTask(fixture.privateTaskId));
  await as("jpm"); assert.equal(projects(await unifiedSearch({ q: fixture.projectId }))[0].family, "runtime"); assert.equal(projects(await unifiedSearch({ q: "native" }))[0].contextOnly, false); await empty("PRIVATE");
  // Genuine native and flexible context assignments; not inferred from archive rights.
  await db.flexibleMilestone.create({ data: { projectId: "flexible", name: "Limited context", sortOrder: 0, responsibleUserId: "digital" } });
  await db.projectExecutor.create({ data: { projectId: "native", userId: "jpm" } });
  await db.project.create({ data: { id: "context-only", name: "Context only project", ownerId: "spm2", createdById: "spm2", executors: { create: { userId: "spm" } } } });
  await as("spm"); const pmContext = projects(await unifiedSearch({ q: "context only" }))[0]; assert.equal(pmContext.contextOnly, true); assert.ok(!("status" in pmContext)); assert.ok(!("owner" in pmContext));
  await as("designer"); const native = projects(await unifiedSearch({ q: "native" }))[0]; assert.deepEqual(Object.keys(native).sort(), ["id", "name", "family", "href", "contextOnly"].sort());
  await as("digital"); const flexible = projects(await unifiedSearch({ q: "dashboard-flexible" }))[0]; assert.equal(flexible.contextOnly, true); assert.ok(!("status" in flexible));
  for (const who of ["designer", "digital"]) { await as(who); await empty("PRIVATE"); await empty(fixture.projectId); await denied("q=project&family=runtime", 400); assert.deepEqual((await unifiedSearch()).options.families, ["native", "flexible"]); }
  await as("designer");
  for (const [type, q] of [["GENERAL", "Prepare"], ["FILE_UPLOAD", "Upload"], ["DATA_INPUT", "Enter"], ["INSPECT_FILE", "Inspect"], ["INITIAL_CONCEPT", "Initial"], ["FINAL_CONCEPT", "Final"]]) {
    const r = await unifiedSearch({ q, kind: "tasks", type }); assert.equal(r.tasks!.items.length, 1); assert.equal(r.tasks!.items[0].type, type); assert.deepEqual(r.tasks!.items[0].relationships, ["Executor"]);
    assert.equal(r.tasks!.items[0].href, `/tasks/${r.tasks!.items[0].id}`);
  }
  assert.deepEqual((await unifiedSearch({ q: "Designer owned" })).tasks!.items[0].relationships, ["Task Owner"]);
  await as("digital"); const sister = (await unifiedSearch({ q: "Sister" })).tasks!.items[0]; assert.equal(sister.isSister, true); assert.equal(sister.source, null); assert.equal(sister.root, null);
  const initial = await db.universalTask.findFirstOrThrow({ where: { title: "Initial design concept" } }); assert.ok(!JSON.stringify(sister).includes(initial.id));
  await as("spm"); const ownedSister = (await unifiedSearch({ q: "Sister" })).tasks!.items[0]; assert.equal(ownedSister.source!.id, initial.id); assert.equal(ownedSister.root!.id, initial.id);
  const secret = await createTask({ commandId: randomUUID(), contextTarget: "structured:native", title: "Literal %_\\ Project plan", brief: "BRIEF_ONLY_SECRET", type: "GENERAL", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId: "designer", spectatorIds: ["digital"] });
  await as("digital"); assert.deepEqual((await unifiedSearch({ q: "%_\\" })).tasks!.items[0].relationships, ["Spectator"]);
  await empty("BRIEF_ONLY_SECRET"); await empty("Accepted dashboard deliverable"); await empty("concept.pdf"); await empty("RESTRICTED_ARCHIVE");
  // Revocation of a real task relationship removes the next search response.
  await as("spm"); await mutateTask(secret.id, { commandId: randomUUID(), expectedVersion: (await getTask(secret.id)).version, action: "EDIT", title: "Literal %_\\ Project plan", brief: "BRIEF_ONLY_SECRET", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId: "designer", spectatorIds: [] });
  await as("digital"); await empty("%_\\");
  await db.projectExecutor.delete({ where: { projectId_userId: { projectId: "native", userId: "designer" } } });
  await as("designer"); await empty("Native artwork"); await db.projectExecutor.create({ data: { projectId: "native", userId: "designer" } });
  await db.flexibleMilestone.updateMany({ where: { projectId: "flexible" }, data: { responsibleUserId: null } });
  await as("digital"); await empty("dashboard-flexible"); await db.flexibleMilestone.updateMany({ where: { projectId: "flexible" }, data: { responsibleUserId: "digital" } });
  await as("tech"); await denied("q=project", 403); await assert.rejects(unifiedSearch({ q: "project" }));
  setToken(null); await denied("q=project", 403);
  const expired = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(1), expiresAt: new Date(0) } }); setToken(expired.token); await denied("q=project", 403);
  const stale = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(2), expiresAt: new Date(Date.now() + 3600_000) } }); setToken(stale.token); await denied("q=project", 403);
  const revoked = await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(1), expiresAt: new Date(Date.now() + 3600_000) } }); await db.session.delete({ where: { id: revoked.id } }); setToken(revoked.token); await denied("q=project", 403);
  await db.session.deleteMany({ where: { id: { in: [expired.id, stale.id] } } });
  const directorToken = (await db.session.findFirstOrThrow({ where: { userId: "director" } })).token;
  const assignment = createRoleAssignmentService({ database: db, readSessionToken: async () => directorToken });
  await assignment.setAuthorizationStatus({ userId: "empty", accountStatus: "SUSPENDED", expectedVersion: 1, reason: "Synthetic search revocation check" });
  await as("empty"); await denied("q=project", 403);
  await assignment.setAuthorizationStatus({ userId: "empty", accountStatus: "ACTIVE", expectedVersion: 2, reason: "Restore synthetic account" });
  await denied("q=project", 403); // Reactivation cannot revive the old session version.
  await db.session.deleteMany({ where: { userId: "empty" } });
  await db.session.create({ data: { userId: "empty", token: createVersionedSessionToken(3), expiresAt: new Date(Date.now() + 3600_000) } });
  await as("designer");
  for (const q of ["q=x&q=y", "q=x&actorId=director", "q=" + "x".repeat(121), "q=%00", "page=-1", "page=100", "page=1e2", "page=01", "kind=archive", "family=library", "type=UNKNOWN", "page=0&page=1"]) await denied(q, 400);
  for (const value of [null, [], { q: ["x", "y"] }, { page: 2 }, { q: true }, { actor: {} }]) await assert.rejects(unifiedSearch(value));
  for (const dashboard of ["0", "1"]) for (const search of ["0", "1"]) {
    process.env.FLUX_DASHBOARD_V2 = dashboard; process.env.FLUX_SEARCH_V2 = search;
    const user = (await getCurrentUser())!; assert.equal(getSidebarVisibility(user).search, search === "1"); assert.equal(getSidebarVisibility(user).dashboard, dashboard === "1"); assert.equal(getAuthenticatedDefaultRoute(user), dashboard === "1" ? "/" : "/tasks");
    assert.equal((await api("q=design")).status, search === "1" ? 200 : 404);
    if (dashboard === "1") assert.equal((await getRoleDashboard()).role, "DESIGNER"); else await assert.rejects(getRoleDashboard());
  }
  process.env.FLUX_SEARCH_V2 = "1"; process.env.FLUX_DASHBOARD_V2 = "1";
  // Private lookalikes cannot influence totals, next-page hints or static options.
  const before = await empty("Invisible needle");
  await db.project.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ id: `search-private-${i}`, name: `Invisible needle ${i}`, ownerId: "spm2", createdById: "spm2" })) });
  await db.flexibleProject.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ id: `search-flex-${i}`, slug: `search-flex-${i}`, name: `Invisible needle ${i}`, ownerId: "spm2", createdById: "spm2" })) });
  assert.deepEqual(await empty("Invisible needle"), before);
  await as("spm");
  for (let i = 0; i < 35; i++) await createTask({ commandId: randomUUID(), contextTarget: "structured:native", title: "Paginated same title", brief: "Private text", type: "GENERAL", deadline: "2026-11-20T12:00:00Z", priority: "NORMAL", executorId: "designer", spectatorIds: [] });
  const first = await unifiedSearch({ q: "Paginated", kind: "tasks" }), second = await unifiedSearch({ q: "Paginated", kind: "tasks", page: "1" });
  assert.equal(first.tasks!.items.length, 8); assert.equal(first.hasMore, true); assert.ok(second.tasks!.items.every(t => !first.tasks!.items.some(f => f.id === t.id))); assert.deepEqual(await unifiedSearch({ q: "Paginated", kind: "tasks" }), first);
  assert.deepEqual(first.tasks!.items.map(t => t.id), [...first.tasks!.items.map(t => t.id)].sort());
  const href = searchHref(second.query); for (const path of ["/projects/native", `/projects/runtime/${fixture.projectId}`, "/projects/flexible/dashboard-flexible", `/tasks/${fixture.taskId}`]) assert.deepEqual(getDashboardBackNavigation(path, new URLSearchParams({ returnTo: href })), { owner: "topbar", href, label: "Search", ariaLabel: "Back to Search" });
  assert.notEqual(JSON.stringify(getDashboardBackNavigation("/projects/native", new URLSearchParams({ returnTo: "//evil.test/search?q=x" }))), href);
  // Inspect actual parameterized Prisma query plans against representative persisted
  // data. Plans are local evidence, not a production performance claim.
  await db.$executeRawUnsafe('ANALYZE "Project", "FlexibleProject", "RuntimeProject", "UniversalTask"');
  const events = async () => [await db.businessEvent.count(), await db.approvalDecision.count(), await db.runtimeActivity.count(), await db.universalTaskEntry.count()];
  const beforeEvents = await events(), reads = storageReads();
  await as("director"); queries.length = 0; process.env.FLUX_SEARCH_CAPTURE = "1";
  await unifiedSearch({ q: "project" }); await unifiedSearch({ q: "Paginated", page: "1" });
  await as("designer"); await unifiedSearch({ q: "needle" });
  process.env.FLUX_SEARCH_CAPTURE = "0";
  const plans = [];
  for (const query of queries.filter(e => /^SELECT/.test(e.query) && /FROM "public"\."(Project|FlexibleProject|RuntimeProject|UniversalTask)"/.test(e.query))) {
    const plan = await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.query}`, ...JSON.parse(query.params));
    plans.push({ query: query.query, parameters: JSON.parse(query.params), plan });
  }
  assert.ok(plans.length >= 8); writeFileSync(join(artifact, "query-plans.json"), JSON.stringify(plans, null, 2));
  assert.deepEqual(await events(), beforeEvents); assert.equal(storageReads(), reads); assert.equal(external(), 0);
  for (const who of ["director", "spm", "jpm", "designer", "digital"]) { await as(who); const response = await api("q=design"); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); const body = await response.text(); for (const term of ["storageKey", "brief", "inspiration", "snapshot", "evidence", "passwordHash", "authorizationVersion"]) assert.ok(!body.includes(`"${term}"`)); }
  // Unexpected database failures are sanitized at the HTTP boundary.
  const transaction = db.$transaction; db.$transaction = () => { throw new Error("SQL_SECRET_SENTINEL"); };
  try { const r = await denied("q=design", 500); assert.ok(!(await r.text()).includes("SQL_SECRET")); } finally { db.$transaction = transaction; }
  writeFileSync(join(artifact, "service-result.json"), JSON.stringify({ status: "PASS", assertions, expectedDenials, expectedFailures, fixtures: { native: await db.project.count(), flexible: await db.flexibleProject.count(), runtime: await db.runtimeProject.count(), tasks: await db.universalTask.count() }, queryPlans: plans.length, externalRequests: external(), storageReadsDuringSearch: storageReads() - reads }, null, 2));
  writeFileSync(join(root, "browser-fixture.json"), JSON.stringify({ ...fixture, sisterId: sister.id, initialId: initial.id, literalTaskId: secret.id }), { mode: 0o600 });
  console.log(`PASS unified search: ${assertions} assertions; ${expectedDenials} expected denied/invalid responses, ${expectedFailures} injected failure; ${plans.length} actual query plans; zero search storage/network reads.`);
}

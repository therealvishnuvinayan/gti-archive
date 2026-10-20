import assert from "node:assert/strict";
import { workspaceFixture } from "./workspace-test-fixture";

async function main() {
 const f = await workspaceFixture("flux_v2_workspace_test"), db = f.db;
 try {
  const permissions = f.load("src/lib/permissions/resolver.js") as typeof import("../src/lib/permissions/resolver");
  const landing = f.load("src/lib/permissions/fallback-route.js") as typeof import("../src/lib/permissions/fallback-route");
  const calendar = f.load("src/lib/calendar.js") as typeof import("../src/lib/calendar");
  const directory = f.load("src/lib/authorization/business-users.js") as typeof import("../src/lib/authorization/business-users");
  const contacts = f.load("src/lib/contact-directory.js") as typeof import("../src/lib/contact-directory");
  const oldUsers = f.load("src/lib/user-permissions.js") as typeof import("../src/lib/user-permissions");
  const actions = f.load("src/app/(dashboard)/users/actions.js") as typeof import("../src/app/(dashboard)/users/actions");
  const collaboration = f.load("src/lib/collaboration.js") as typeof import("../src/lib/collaboration");
  const avatar = f.load("src/app/api/users/[userId]/avatar/route.js") as typeof import("../src/app/api/users/[userId]/avatar/route");
  const avatarUpload = f.load("src/app/api/users/[userId]/avatar/upload-url/route.js") as typeof import("../src/app/api/users/[userId]/avatar/upload-url/route");
  const ai = f.load("src/lib/ai/access.js") as typeof import("../src/lib/ai/access");
  const counts = f.load("src/app/api/projects/dashboard-count/route.js") as typeof import("../src/app/api/projects/dashboard-count/route");
  const notifications = f.load("src/app/api/notifications/recent/route.js") as typeof import("../src/app/api/notifications/recent/route");
  const runtime = f.load("src/lib/authorization/runtime.js") as typeof import("../src/lib/authorization/runtime");
  const broker = f.load("src/lib/realtime/ably-server.js") as typeof import("../src/lib/realtime/ably-server");
  process.env.ABLY_API_KEY = "fixture-only-no-network";
  const accountsBefore = await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } });
  const auditBefore = await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] });
  const input = { title: "Isolated personal event", details: "", date: "2027-01-01", start: "10:00", end: "11:00", calendar: "Events" as const, tone: "green" as const };
  await db.calendarEvent.createMany({ data: [
   { id: "private", createdById: "outsider", title: "Other person's private calendar", type: "EVENTS", tone: "GREEN", startAt: new Date("2027-01-01"), endAt: new Date("2027-01-02") },
   { id: "business", createdById: "director", title: "Business schedule", type: "PROJECTS", tone: "GREEN", startAt: new Date("2027-01-01"), endAt: new Date("2027-01-02") },
  ] });
  for (const id of ["director", "spm", "jpm", "designer", "digital", "tech", "unassigned"]) {
   const user = await f.user(id), business = !["tech", "unassigned"].includes(id), manager = ["director", "spm", "jpm"].includes(id);
   const nav = permissions.getSidebarVisibility(user);
   assert.equal(nav.tasks, business); assert.equal(nav.projects, manager); assert.equal(nav.dashboard, manager);
   assert.equal(nav.users, id === "director"); assert.equal(nav.projectTracker, false); assert.equal(nav.projectApprovals, manager);
   assert.equal(landing.getAuthenticatedDefaultRoute(user), manager ? "/" : business ? "/tasks" : id === "tech" ? "/settings" : "/no-access");
   assert.equal(await ai.canUseChatAiTools(user, {}), false);
   await assert.rejects(() => broker.createAblyStageChatTokenRequest({ projectId: "guessed", stageId: "guessed", clientId: id }), /revocation integration/);
   await assert.rejects(() => broker.createAblyProjectAccessTokenRequest({ projectId: "guessed", clientId: id }), /revocation integration/);
   await assert.rejects(() => broker.createAblyNotificationTokenRequest({ userId: "outsider", clientId: id }), /denied/);
   if (business) {
    const request = await broker.createAblyNotificationTokenRequest({ userId: id, clientId: id });
    assert.deepEqual(request, { clientId: id, ttl: 600000, capability: { [`private:user:${id}:notifications`]: ["subscribe"] } });
   } else await assert.rejects(() => broker.createAblyNotificationTokenRequest({ userId: id, clientId: id }), /denied/);
   await assert.rejects(() => oldUsers.updateManagedUserPermissions({ userId: "outsider", role: "ADMIN", projectCreationAccessGranted: true, archiveAccessLevel: "FULL" }), /disabled/);
   assert.equal((await avatar.GET()).status, 403); assert.equal((await avatarUpload.POST()).status, 403);
   await assert.rejects(() => oldUsers.listUsersForPermissionManagement(), /disabled/);
   await assert.rejects(() => actions.syncPermissionDefinitionsAction(), /disabled/);
   await assert.rejects(() => collaboration.deleteCollaborator("outsider"), /disabled/);
   await assert.rejects(() => collaboration.acceptCollaboratorInvite("stale-token", "unused-password", "unused-password"), /disabled/);
   await assert.rejects(() => collaboration.updateCalendarCollaborators([id], id), /disabled/);
   if (id === "director") {
    const users = await directory.listBusinessUsers(user);
    assert.equal(users.length, 9); assert.equal(JSON.stringify(users).includes("passwordHash"), false); assert.equal(JSON.stringify(users).includes("technicalPrivileges"), false);
    assert.deepEqual(await contacts.getContactDirectory(user, "CLIENT"), []);
    assert.equal((await runtime.runtimeAuthorization.authorize({ capability: "technical.diagnostics", targetId: "root" })).decision, "DENY");
   } else {
    await assert.rejects(() => directory.listBusinessUsers(user));
    await assert.rejects(() => contacts.getContactDirectory(user, "CLIENT"));
    assert.equal((await runtime.runtimeAuthorization.authorize({ capability: "workspace.masterData", targetId: "root" })).decision, "DENY");
   }
   await assert.rejects(() => calendar.deleteCalendarEvent(user, "private"));
   if (business) {
    const created = await calendar.createCalendarEvent(user, input); assert.ok("event" in created);
    assert.equal((await db.calendarEvent.findUniqueOrThrow({ where: { id: created.event.id } })).createdById, id);
    const visible = await calendar.getCalendarEvents(user);
    assert.equal(visible.some(row => row.id === "private"), false);
    assert.equal(visible.some(row => row.id === "business"), id === "director");
    await calendar.deleteCalendarEvent(user, created.event.id);
    if (id !== "director") {
     await assert.rejects(() => calendar.createCalendarEvent(user, { ...input, calendar: "Projects" }));
     await assert.rejects(() => calendar.deleteCalendarEvent(user, "business"));
    }
   } else {
    await assert.rejects(() => calendar.getCalendarEvents(user));
    await assert.rejects(() => calendar.createCalendarEvent(user, input));
    assert.equal((await counts.GET()).status, 403);
    assert.equal((await notifications.GET()).status, 403);
   }
  }
  const director = await f.user("director");
  await f.user("tech");
  await assert.rejects(() => calendar.createCalendarEvent(director, input));
  await assert.rejects(() => directory.listBusinessUsers(director));
  assert.deepEqual(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }), accountsBefore);
  assert.deepEqual(await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] }), auditBefore);
  await f.user("spm"); const stale = await f.user("spm");
  await db.session.deleteMany({ where: { userId: "spm" } });
  await assert.rejects(() => calendar.createCalendarEvent(stale, input));
  assert.equal((await avatar.GET()).status, 401);
  await assert.rejects(() => broker.createAblyNotificationTokenRequest({ userId: "spm", clientId: "spm" }), /denied/);
  console.log("PASS: all V2 roles, landing/navigation, technical isolation, calendar privacy/ownership/types, direct APIs, legacy mutation denial, real actor binding, revoked sessions, nine-account/audit preservation.");
 } finally { await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

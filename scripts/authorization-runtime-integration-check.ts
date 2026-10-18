import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BusinessRole, PrismaClient } from "@prisma/client";
import { hashAuthPassword } from "../src/lib/auth-password";
import { createVersionedSessionToken, resolveAuthenticatedSession } from "../src/lib/authorization/session";
import { AuthorizationDeniedError, createAuthorizationService, type AuthorizationContext, type ResourcePolicies } from "../src/lib/authorization/policy";
import { businessCapabilityValues, technicalCapabilityValues } from "../src/lib/authorization/definitions";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";

// Refuse application URLs before constructing a client. The parent creates a
// fresh private cluster, all migrations, and this otherwise empty database.
const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-test-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_authorization_runtime_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as { PrismaClient: typeof PrismaClient };
const db = new Client({ datasourceUrl: url });
const tokens = new Map<string, string>();
const password = `Fixture-only-${randomUUID()}`;
const reason = "Isolated runtime authorization check";
const roleFixtures: Array<[string, BusinessRole | null, boolean]> = [
  ["director", "DIRECTOR", false], ["spm", "SENIOR_PROJECT_MANAGER", false],
  ["jpm", "JUNIOR_PROJECT_MANAGER", false], ["designer", "DESIGNER", false],
  ["digital", "DIGITAL_LEAD", false], ["tech", null, true], ["empty", null, false],
];
async function loginFixture(userId: string) {
  const row = await db.userAuthorization.findUnique({ where: { userId } });
  const token = createVersionedSessionToken(row?.authorizationVersion ?? null);
  await db.session.create({ data: { token, userId, expiresAt: new Date(Date.now() + 3600_000) } });
  tokens.set(userId, token);
  return token;
}
const assignment = (userId: string) => createRoleAssignmentService({ database: db,
  readSessionToken: async () => tokens.get(userId) ?? null });

const policies: ResourcePolicies = Object.fromEntries([...businessCapabilityValues, ...technicalCapabilityValues]
  .map((capability) => [capability, async ({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["project.view"]>>[0]) => {
    const [record] = await tx.$queryRaw<Array<{ evidence: AuthorizationContext }>>`
      SELECT evidence FROM "_RuntimePolicyFixture" WHERE id = ${request.targetId} FOR SHARE`;
    if (!record) return null;
    // Attribution comes from the trusted actor, except explicit negative fixtures.
    if (record.evidence.integrity?.actorUserId === "ACTUAL_ACTOR") record.evidence.integrity.actorUserId = actor.userId;
    if (record.evidence.technical?.actorUserId === "ACTUAL_ACTOR") record.evidence.technical.actorUserId = actor.userId;
    return record.evidence;
  }]));
const service = (userId: string, registered: ResourcePolicies = policies) => createAuthorizationService({
  database: db, readSessionToken: async () => tokens.get(userId) ?? null, policies: registered,
});
const integrity = { workflowAllowed: true, actorUserId: "ACTUAL_ACTOR", preservesOwnership: true, preservesHistory: true };
const project = { id: "project", participantUserIds: ["spm", "jpm", "designer", "digital"] };
const task = { id: "task", ownerUserId: "designer", executorUserIds: ["digital"], spectatorUserIds: ["jpm"] };
const taskContext = (): AuthorizationContext => ({ resource: { id: "task", kind: "task", projectId: "project" },
  project, task, integrity: { ...integrity }, resourcePermission: true, taskLifecycleAllowed: true,
  selfReviewPolicy: { policyId: "fixture-approved-policy", permitted: true } });
async function context(value: AuthorizationContext) {
  await db.$executeRaw`INSERT INTO "_RuntimePolicyFixture" (id, evidence) VALUES (${value.resource.id}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET evidence = EXCLUDED.evidence`;
}
async function decision(userId: string, capability: string, targetId: string, expected: "ALLOW" | "DENY", extra = {}) {
  const result = await service(userId).authorize({ capability, targetId, ...extra });
  assert.equal(result.decision, expected, `${userId}: ${capability}: ${JSON.stringify(result)}`);
  return result;
}
async function main() {
  const [identity] = await db.$queryRaw<Array<{ directory: string; tcp: string; socketOnly: boolean; database: string }>>`
    SELECT current_setting('data_directory') AS directory, current_setting('listen_addresses') AS tcp,
      inet_server_addr() IS NULL AS "socketOnly", current_database() AS database`;
  assert.deepEqual(identity, { directory: join(root, "data"), tcp: "", socketOnly: true, database: "flux_v2_authorization_runtime_test" });
  assert.equal(await db.user.count(), 0);
  for (const id of [...roleFixtures.map(([id]) => id), "legacy-root", "legacy-admin"]) {
    await db.user.create({ data: { id, email: `${id}@example.invalid`, passwordHash: hashAuthPassword(password),
      role: id === "legacy-root" ? "SUPER_ADMIN" : id === "legacy-admin" ? "ADMIN" : "USER" } });
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id', 'director', true),
      set_config('flux.authorization_reason', ${reason}, true), set_config('flux.authorization_change_id', ${randomUUID()}, true)`;
    for (const [userId, businessRole, technical] of roleFixtures) {
      await tx.userAuthorization.create({ data: { userId, businessRole, technicalPrivileges: technical ? ["TECHNICAL_ADMIN"] : [] } });
    }
  });
  for (const user of await db.user.findMany()) await loginFixture(user.id);
  await db.$executeRaw`CREATE TABLE "_RuntimePolicyFixture" (id text PRIMARY KEY, evidence jsonb NOT NULL)`;
  const originalUsers = await db.user.findMany({ orderBy: { id: "asc" } });

  for (const [userId, businessRole, technical] of roleFixtures) {
    const session = await resolveAuthenticatedSession(db, tokens.get(userId)!);
    assert.ok(session);
    assert.equal(session.principal.businessRole, businessRole);
    assert.deepEqual(session.principal.technicalPrivileges, technical ? ["TECHNICAL_ADMIN"] : []);
    assert.equal(session.principal.accountStatus, "ACTIVE");
    assert.equal(session.principal.authorizationVersion, 1);
    assert.equal(session.principal.userId, userId);
    assert.ok(Object.isFrozen(session.principal) && Object.isFrozen(session.principal.technicalPrivileges));
    for (const key of ["passwordHash", "inviteToken", "token"]) {
      assert.equal(key in session.user, false); assert.equal(key in session.principal, false);
    }
    assert.equal("token" in session.principal.session, false);
  }
  for (const id of ["legacy-root", "legacy-admin"]) {
    const principal = (await resolveAuthenticatedSession(db, tokens.get(id)!))!.principal;
    assert.equal(principal.businessRole, null); assert.deepEqual(principal.technicalPrivileges, []);
    assert.equal(principal.accountStatus, "UNASSIGNED");
  }
  console.log("PASS runtime: five roles, technical-only and unassigned principals; no legacy escalation, secrets or mutable authority.");

  await context({ resource: { id: "project", kind: "project" }, project, integrity, resourcePermission: true });
  await context({ resource: { id: "creation", kind: "projectCreation" }, integrity, resourcePermission: true, approvedTemplate: true });
  await context({ resource: { id: "archive", kind: "archive" }, integrity, resourcePermission: true });
  await context({ resource: { id: "support", kind: "technical" }, technical: {
    supportAuthorized: true, auditRecorded: true, noBusinessImpersonation: true, actorUserId: "ACTUAL_ACTOR" } });
  await context(taskContext());
  for (const id of ["legacy-root", "legacy-admin", "empty", "tech"]) {
    await decision(id, "project.view", "project", "DENY");
    await decision(id, "project.approveCompletion", "project", "DENY");
  }
  await decision("director", "project.approveCompletion", "project", "ALLOW");
  await decision("director", "technical.diagnostics", "support", "DENY");
  await decision("tech", "technical.diagnostics", "support", "ALLOW");
  await decision("spm", "project.approveCompletion", "project", "DENY");
  await decision("jpm", "project.delete", "project", "DENY");
  await decision("spm", "project.create", "creation", "ALLOW");
  await decision("jpm", "project.create", "creation", "DENY");
  await context({ resource: { id: "creation", kind: "projectCreation" }, integrity, resourcePermission: true,
    directorApprovedCreation: true, seniorProjectManagerCoOwner: true });
  await decision("jpm", "project.create", "creation", "ALLOW");
  await decision("spm", "project.create", "creation", "DENY");
  for (const id of ["designer", "digital"]) {
    await decision(id, "project.create", "creation", "DENY");
    await decision(id, "archive.upload", "archive", "DENY");
    await decision(id, "task.createDataInput", "project", "DENY");
    await decision(id, "task.createGeneral", "project", "ALLOW");
    await decision(id, "task.createFileUpload", "project", "DENY");
  }
  await decision("designer", "archive.verify", "archive", "DENY");
  await decision("digital", "archive.verify", "archive", "ALLOW");
  await decision("digital", "archive.manageCategoriesFolders", "archive", "ALLOW");
  await decision("spm", "archive.verify", "archive", "DENY");
  await decision("jpm", "archive.view", "archive", "DENY");
  await context({ resource: { id: "project", kind: "project" }, project, integrity, resourcePermission: true, authorizedDestinationFolder: true });
  await decision("designer", "task.createFileUpload", "project", "ALLOW");
  await decision("spm", "task.createFinalConcept", "project", "ALLOW");
  await decision("jpm", "task.createFinalConcept", "project", "ALLOW");
  await decision("spm", "project.requestCompletion", "project", "DENY");
  await context({ resource: { id: "project", kind: "project" }, project, integrity, resourcePermission: true,
    finalCompletionRequiresDirectorApproval: true });
  await decision("spm", "project.requestCompletion", "project", "ALLOW");
  console.log("PASS runtime: fixed role restrictions, SPM/JPM approval differences, Digital Lead archive eligibility and separate technical support gates.");

  await decision("designer", "task.complete", "task", "DENY");
  await decision("designer", "task.complete", "task", "ALLOW", { reason });
  await decision("digital", "task.complete", "task", "DENY", { reason });
  await decision("digital", "task.requestCompletion", "task", "ALLOW", { reason });
  await decision("designer", "task.requestCompletion", "task", "DENY", { reason });
  await decision("jpm", "task.viewAsSpectator", "task", "ALLOW");
  await decision("jpm", "task.execute", "task", "DENY");
  await decision("spm", "task.manage", "task", "DENY");
  await decision("director", "task.complete", "task", "DENY", { reason: " \t " });
  const intervention = await decision("director", "task.complete", "task", "ALLOW", { reason });
  assert.ok(intervention.decision === "ALLOW" && intervention.directorOverride && intervention.actorUserId === "director");
  await context({ ...taskContext(), taskLifecycleAllowed: false });
  await decision("director", "task.delete", "task", "DENY");
  await context({ ...taskContext(), selfReviewPolicy: undefined });
  await decision("designer", "task.review", "task", "DENY");
  await decision("director", "task.review", "task", "DENY");
  await context({ ...taskContext(), task: { ...task, executorUserIds: ["designer"] },
    selfReviewPolicy: { policyId: "fixture-no-self-review", permitted: false } });
  await decision("designer", "task.review", "task", "DENY");
  await context({ ...taskContext(), task: { ...task, spectatorUserIds: ["designer"] } });
  await decision("designer", "task.manage", "task", "DENY");
  for (const badIntegrity of [ { ...integrity, actorUserId: "impersonated" },
    { ...integrity, preservesOwnership: false }, { ...integrity, preservesHistory: false },
    { ...integrity, workflowAllowed: false } ]) {
    await context({ ...taskContext(), integrity: badIntegrity });
    await decision("director", "task.complete", "task", "DENY", { reason });
  }
  await context(taskContext());
  console.log("PASS runtime: owner/executor/spectator separation, completion reasons, self-review/lifecycle fail-closed and Director integrity/real-actor requirements.");

  await decision("director", "unknown.capability", "project", "DENY");
  await decision("director", "project.view", "missing", "DENY");
  await context({ resource: { id: "project", kind: "project" }, integrity, resourcePermission: true });
  await decision("director", "project.view", "project", "DENY");
  await context({ ...taskContext(), project: undefined });
  await decision("director", "task.view", "task", "DENY");
  await context({ ...taskContext(), resource: { id: "task", kind: "task", projectId: "wrong-project" } });
  await decision("director", "task.view", "task", "DENY");
  await context({ ...taskContext(), resourcePermission: false });
  await decision("designer", "task.view", "task", "DENY");
  await context({ ...taskContext(), project: { ...project, participantUserIds: [] } });
  await decision("designer", "task.view", "task", "DENY");
  await context(taskContext());
  assert.deepEqual(await service("director", {}).authorize({ capability: "project.view", targetId: "project" }),
    { decision: "DENY", reason: "POLICY_NOT_INTEGRATED" });
  for (const forged of [{ actor: { userId: "director", businessRole: "DIRECTOR" } }, { businessRole: "DIRECTOR" },
    { role: "SUPER_ADMIN" }, { technicalPrivileges: ["TECHNICAL_ADMIN"] }, { context: taskContext() },
    { permissionProfileSnapshot: { effectivePermissions: ["task.createDataInput"] } }, { userId: "director" }]) {
    assert.deepEqual(await service("designer").authorize({ capability: "task.createDataInput", targetId: "project", ...forged }),
      { decision: "DENY", reason: "INVALID_INPUT" });
  }
  let performed = false;
  await assert.rejects(service("designer").runAuthorized({ capability: "project.delete", targetId: "project" }, async () => {
    performed = true;
  }), AuthorizationDeniedError);
  assert.equal(performed, false);
  const actualActor = await service("director").runAuthorized({ capability: "task.manage", targetId: "task" }, async (_tx, grant) => grant.actorUserId);
  assert.equal(actualActor, "director");
  console.log("PASS runtime: unknown/unintegrated capability, missing/mismatched context, missing resource grants and forged identity/profile/evidence denied at direct service boundary.");

  const oldDesigner = tokens.get("designer")!;
  await assignment("director").assignBusinessRole({ userId: "designer", businessRole: "DIGITAL_LEAD", expectedVersion: 1, reason });
  assert.equal(await resolveAuthenticatedSession(db, oldDesigner), null);
  await decision("designer", "archive.verify", "archive", "DENY");
  // Editing the cookie's version cannot match the randomly generated DB token.
  assert.equal(await resolveAuthenticatedSession(db, oldDesigner.replace("v2.1.", "v2.2.")), null);
  await loginFixture("designer");
  await decision("designer", "archive.verify", "archive", "ALLOW");
  const oldDigital = tokens.get("digital")!;
  await assignment("tech").setTechnicalPrivileges({ userId: "digital", technicalPrivileges: ["TECHNICAL_ADMIN"], expectedVersion: 1, reason });
  assert.equal(await resolveAuthenticatedSession(db, oldDigital), null);
  await loginFixture("digital");
  const dual = (await resolveAuthenticatedSession(db, tokens.get("digital")!))!.principal;
  assert.equal(dual.businessRole, "DIGITAL_LEAD"); assert.deepEqual(dual.technicalPrivileges, ["TECHNICAL_ADMIN"]);
  await assignment("tech").setTechnicalPrivileges({ userId: "digital", technicalPrivileges: [], expectedVersion: 2, reason });
  assert.equal(await resolveAuthenticatedSession(db, tokens.get("digital")!), null);
  await assignment("director").setAuthorizationStatus({ userId: "designer", accountStatus: "SUSPENDED", expectedVersion: 2, reason });
  assert.equal(await resolveAuthenticatedSession(db, tokens.get("designer")!), null);
  await assignment("director").setAuthorizationStatus({ userId: "designer", accountStatus: "ACTIVE", expectedVersion: 3, reason });
  assert.equal(await resolveAuthenticatedSession(db, tokens.get("designer")!), null);
  const oldLegacy = tokens.get("legacy-admin")!;
  await assignment("director").assignBusinessRole({ userId: "legacy-admin", businessRole: "DESIGNER", expectedVersion: null, reason });
  assert.equal(await resolveAuthenticatedSession(db, oldLegacy), null);
  const oldDirector = tokens.get("director")!;
  await assignment("tech").setTechnicalPrivileges({ userId: "director", technicalPrivileges: ["TECHNICAL_ADMIN"], expectedVersion: 1, reason });
  await assert.rejects(assignment("director").assignBusinessRole({ userId: "empty", businessRole: "DESIGNER", expectedVersion: 1, reason }),
    (error: unknown) => error instanceof Error && error.message === "STALE_SESSION");
  assert.equal(await resolveAuthenticatedSession(db, oldDirector), null);
  await loginFixture("director");
  const expires = await loginFixture("spm");
  await db.session.update({ where: { token: expires }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await resolveAuthenticatedSession(db, expires), null);
  assert.equal(await resolveAuthenticatedSession(db, null), null);
  assert.equal(await resolveAuthenticatedSession(db, "not-a-session"), null);
  const legacyToken = randomUUID();
  await db.session.create({ data: { token: legacyToken, userId: "director", expiresAt: new Date(Date.now() + 3600_000) } });
  assert.equal(await resolveAuthenticatedSession(db, legacyToken), null);
  console.log("PASS runtime: role/privilege/status/first-mapping changes invalidate immediately, including assignment-service calls; reactivation cannot revive stale sessions, expiry and old token format fail closed.");

  await checkFrameworkAuthentication();
  assert.ok(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" } })) === JSON.stringify(originalUsers),
    "Synthetic users/passwords/legacy roles must be unchanged");
  await db.$executeRaw`DROP TABLE "_RuntimePolicyFixture"`;
  console.log("PASS runtime: synthetic users, passwords and legacy roles unchanged; no production resources used.");
}

async function checkFrameworkAuthentication() {
  // Exercise real auth.ts/password/Prisma logic. Only Next request cookies,
  // redirects and the unrelated legacy permission snapshot are framework stubs.
  const moduleApi = localRequire("node:module") as { _load: (name: string, ...args: unknown[]) => unknown };
  const originalLoad = moduleApi._load;
  const jar = new Map<string, string>();
  const cookieWrites: Array<{ value: string; options: Record<string, unknown> }> = [];
  const compiledRoot = dirname(dirname(__filename));
  moduleApi._load = function (name, ...args) {
    if (name === "@prisma/client") return localRequire(join(root, "client"));
    if (name === "next/headers") return { cookies: async () => ({
      get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined,
      set: (key: string, value: string, options: Record<string, unknown>) => { jar.set(key, value); cookieWrites.push({ value, options }); },
    }) };
    if (name === "next/navigation") return { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } };
    if (name === "@/lib/prisma" || (args[0] && name === "../prisma")) return { prisma: db, withPrismaRetry: (op: () => unknown) => op() };
    if (name === "@/lib/permissions/profiles") return { getPermissionProfileSnapshotForUser: async () => ({ effectivePermissions: new Set() }) };
    return originalLoad.call(this, name.startsWith("@/") ? resolve(compiledRoot, "src", name.slice(2)) : name, ...args);
  };
  try {
    const auth = localRequire(join(compiledRoot, "src/lib/auth.js")) as typeof import("../src/lib/auth");
    await assert.rejects(auth.signInUser({ email: "director@example.invalid", password: "wrong", rememberMe: false }), auth.AuthError);
    assert.equal(jar.size, 0);
    await auth.signInUser({ email: " DIRECTOR@example.invalid ", password, rememberMe: false });
    const token = jar.get(auth.SESSION_COOKIE_NAME)!;
    const principal = await auth.getCurrentActor();
    assert.equal(principal?.userId, "director"); assert.equal(principal?.businessRole, "DIRECTOR");
    const user = await auth.getCurrentUser();
    assert.ok(user && !("passwordHash" in user) && !("inviteToken" in user));
    assert.equal(user.role, "USER");
    const cookie = cookieWrites.at(-1)!;
    assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.secure, true);
    assert.equal(cookie.options.sameSite, "lax"); assert.equal(cookie.options.path, "/");
    const remaining = (cookie.options.expires as Date).getTime() - Date.now();
    assert.ok(remaining > 23.9 * 3600_000 && remaining <= 24 * 3600_000);
    await auth.signOutCurrentSession();
    assert.ok(await db.session.findUnique({ where: { token } }) === null, "Logout deletes its session");
    assert.equal(await resolveAuthenticatedSession(db, token), null);
    assert.equal(await auth.getCurrentActor(), null);
    assert.equal(cookieWrites.at(-1)!.options.maxAge, 0);
    assert.equal(auth.getExpiredSessionCookie().value, "");
    await assert.rejects(auth.requireUser("/projects"), /REDIRECT:.*sign-in/);

    await auth.signInUser({ email: "designer@example.invalid", password, rememberMe: true });
    const remembered = jar.get(auth.SESSION_COOKIE_NAME)!;
    const rememberedExpiry = (cookieWrites.at(-1)!.options.expires as Date).getTime() - Date.now();
    assert.ok(rememberedExpiry > 29.9 * 24 * 3600_000 && rememberedExpiry <= 30 * 24 * 3600_000);
    assert.equal((await auth.requireUser()).id, "designer");
    await assignment("director").setAuthorizationStatus({ userId: "designer", accountStatus: "SUSPENDED", expectedVersion: 4, reason });
    assert.equal(await auth.getCurrentUser(), null);
    assert.equal(await auth.getCurrentActor(), null);
    await assert.rejects(auth.requireUser(), /REDIRECT:.*sign-in/);
    await assert.rejects(auth.signInUser({ email: "designer@example.invalid", password, rememberMe: false }), auth.AuthError);
    await auth.signOutCurrentSession(); // Logout also works for an invalid session.
    assert.ok(await db.session.findUnique({ where: { token: remembered } }) === null, "Invalid-session logout deletes its session");
    const adapter = localRequire(join(compiledRoot, "src/lib/permissions/v2.js")) as typeof import("../src/lib/permissions/v2");
    await auth.signInUser({ email: "director@example.invalid", password, rememberMe: false });
    assert.equal(await adapter.hasV2Permission({ capability: "project.view", targetId: "project" }), false);
    await auth.signOutCurrentSession();
    console.log("PASS runtime: real login/password verification, cookie flags/1-day/30-day expiry, logout/replay, dashboard requireUser suspension and production V2 adapter remains closed.");
  } finally { moduleApi._load = originalLoad; }
}

main().catch((error: unknown) => {
  // Never print fixture bearer tokens, hashes, URLs, SQL parameters or raw errors.
  console.error("FAIL runtime:", error instanceof Error ? error.name : "UnknownError");
  if (error instanceof assert.AssertionError) console.error(error.message);
  // Module-load diagnostics contain file paths, not fixture credentials or SQL.
  if (error instanceof Error && "code" in error && error.code === "MODULE_NOT_FOUND" && "requireStack" in error) {
    console.error("Missing runtime dependency; require chain:", error.requireStack);
  }
  process.exitCode = 1;
}).finally(() => db.$disconnect());

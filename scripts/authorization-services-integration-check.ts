import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createDirectorBootstrapInvoker, createInitialTechnicalAdministratorInvoker } from "../src/lib/authorization/director-bootstrap";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";
import { AuthorizationMutationError, type AssignmentDatabase } from "../src/lib/authorization/assignment-transaction";

// No application URL fallback. Fail before loading/connecting the generated client
// unless the parent runner supplied its private, freshly-created cluster identity.
const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-test-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s"), data = join(root, "data");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_authorization_service_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
const clientPath = join(root, "client");
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, clientPath);
const { PrismaClient: TestClient } = createRequire(__filename)(clientPath) as { PrismaClient: typeof PrismaClient };
const db = new TestClient({ datasourceUrl: url });
const tokens = new Map<string, string>();
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const setupOptions = {
  database: db, trustedPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  audience: "isolated-phase-1.4a",
};
const bootstrap = createDirectorBootstrapInvoker(setupOptions);
const initialTechnicalAdmin = createInitialTechnicalAdministratorInvoker(setupOptions);
const service = (userId: string, database: AssignmentDatabase = db) => createRoleAssignmentService({
  database, readSessionToken: async () => tokens.get(userId) ?? null,
});
const reason = "Synthetic approved role management";
const business = (userId: string, businessRole: string | null, expectedVersion: number | null) =>
  ({ userId, businessRole, expectedVersion, reason });
const technical = (userId: string, technicalPrivileges: string[], expectedVersion: number | null) =>
  ({ userId, technicalPrivileges, expectedVersion, reason });
const status = (userId: string, accountStatus: string, expectedVersion: number | null) =>
  ({ userId, accountStatus, expectedVersion, reason });
const row = (userId: string) => db.userAuthorization.findUniqueOrThrow({ where: { userId } });
const state = async () => ({
  assignments: await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }),
  history: await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] }),
});
async function denied(operation: () => Promise<unknown>, code: string) {
  const before = await state();
  await assert.rejects(operation, (error: unknown) => error instanceof AuthorizationMutationError && error.code === code);
  assert.deepEqual(await state(), before, `${code} must have no assignment/history side effects`);
}
function approval(targetUserId: string, overrides: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ operation: "BOOTSTRAP_DIRECTOR", audience: "isolated-phase-1.4a",
    actorUserId: "operator", targetUserId, expectedVersion: null, reason,
    changeId: randomUUID(), issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60_000, ...overrides });
  return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString("base64url") };
}
async function businessSnapshot() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('_prisma_migrations', 'UserAuthorization', 'UserAuthorizationChange') ORDER BY tablename`;
  const results: Record<string, unknown> = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[A-Za-z0-9_]+$/);
    // Names come only from the verified isolated database catalog, never input.
    results[tablename] = await db.$queryRawUnsafe(`SELECT count(*)::text AS count,
      md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS digest FROM "${tablename}" t`);
  }
  return results;
}
async function seedAuthorization(userId: string, businessRole: "DESIGNER" | null, technicalPrivileges: "TECHNICAL_ADMIN"[], accountStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  // Explicit synthetic setup fixtures, not an application assignment mechanism.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id', 'operator', true),
      set_config('flux.authorization_reason', 'Synthetic setup fixture', true),
      set_config('flux.authorization_change_id', ${randomUUID()}, true)`;
    await tx.userAuthorization.create({ data: { userId, businessRole, technicalPrivileges, accountStatus } });
  });
}
async function contended(operations: Array<() => Promise<unknown>>) {
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "UserAuthorization" IN SHARE ROW EXCLUSIVE MODE`;
    locked();
    await gate;
  }, { timeout: 15000 });
  await ready;
  // Attach rejection handlers immediately, while proving both calls are waiting.
  const pending = Promise.allSettled(operations.map((operation) => operation()));
  try {
    const deadline = Date.now() + 3000;
    for (;;) {
      const [{ waiting }] = await db.$queryRaw<Array<{ waiting: number }>>`SELECT count(*)::int AS waiting
        FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE 'LOCK TABLE "UserAuthorization"%'`;
      if (waiting >= operations.length) break;
      assert.ok(Date.now() < deadline, "Both service calls must be genuinely concurrent and blocked on the lock");
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  } finally { release(); await holder; }
  return pending;
}

// Execute the real Prisma transaction, then inject a known rolled-back failure
// after a real write. This proves rollback/retry semantics rather than mocking SQL.
function faultDatabase(failures: number, code: string, afterWrite = 1) {
  let attempts = 0;
  const database: AssignmentDatabase = {
    $transaction: ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
      attempts += 1;
      const attempt = attempts;
      return db.$transaction((tx) => {
        let writes = 0;
        const delegate = new Proxy(tx.userAuthorization, {
          get(target, property) {
            if (property !== "updateMany") return Reflect.get(target, property);
            return async (...args: Parameters<typeof target.updateMany>) => {
              const result = await target.updateMany(...args);
              if (++writes === afterWrite && attempt <= failures) throw Object.assign(new Error("Injected transaction failure"), { code });
              return result;
            };
          },
        });
        return callback(new Proxy(tx, { get: (target, key) => key === "userAuthorization" ? delegate : Reflect.get(target, key) }));
      }, options);
    }) as AssignmentDatabase["$transaction"],
  };
  return { database, attempts: () => attempts };
}

async function main() {
  const [identity] = await db.$queryRaw<Array<{ directory: string; tcp: string; socketOnly: boolean; database: string }>>`
    SELECT current_setting('data_directory') AS directory, current_setting('listen_addresses') AS tcp,
      inet_server_addr() IS NULL AS "socketOnly", current_database() AS database`;
  assert.deepEqual(identity, { directory: data, tcp: "", socketOnly: true, database: "flux_v2_authorization_service_test" });
  assert.equal(await db.user.count(), 0);
  const ids = ["operator", "a", "b", "c", "designer", "digital", "spm", "jpm", "tech", "tech2", "mixed", "legacy", "suspended-operator", "suspended-target", "expired", "retry-target"];
  for (const id of ids) {
    await db.user.create({ data: { id, email: `${id}@example.invalid`, name: `Synthetic ${id}`,
      passwordHash: "not-a-real-password", role: id === "legacy" ? "SUPER_ADMIN" : "USER", department: "Preserve me" } });
    const token = randomUUID(); tokens.set(id, token);
    await db.session.create({ data: { userId: id, token, expiresAt: new Date(Date.now() + (id === "expired" ? -60_000 : 3600_000)) } });
  }
  await db.flexibleProject.create({ data: { id: "preserved-project", name: "Preserve ownership", slug: "synthetic",
    ownerId: "a", createdById: "operator", collaborators: { create: { userId: "b", addedById: "operator" } },
    milestones: { create: { name: "Preserve responsibility", sortOrder: 1, responsibleUserId: "a" } } } });
  await denied(() => initialTechnicalAdmin(approval("tech")), "INVALID_SETUP_SCOPE");
  await initialTechnicalAdmin(approval("tech", { operation: "INITIAL_TECHNICAL_ADMIN" }));
  assert.equal((await row("tech")).businessRole, null);
  // Revoking the first grant must not reopen setup as a recovery backdoor.
  await service("tech").setTechnicalPrivileges(technical("tech", [], 1));
  await denied(() => initialTechnicalAdmin(approval("tech", { operation: "INITIAL_TECHNICAL_ADMIN", expectedVersion: 2 })), "TECHNICAL_SETUP_CLOSED");
  // Restore only this synthetic fixture through SQL to test ordinary management.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id', 'operator', true),
      set_config('flux.authorization_reason', 'Synthetic fixture restoration', true),
      set_config('flux.authorization_change_id', ${randomUUID()}, true)`;
    await tx.userAuthorization.update({ where: { userId: "tech" }, data: { technicalPrivileges: ["TECHNICAL_ADMIN"] } });
  });
  await seedAuthorization("suspended-operator", null, ["TECHNICAL_ADMIN"], "SUSPENDED");
  await seedAuthorization("suspended-target", "DESIGNER", [], "SUSPENDED");
  const preserved = await businessSnapshot();
  await denied(() => service("legacy").assignBusinessRole(business("designer", "DESIGNER", null)), "ACTOR_NOT_ACTIVE");
  await denied(() => service("expired").assignBusinessRole(business("designer", "DESIGNER", null)), "UNAUTHENTICATED");
  await denied(() => service("absent").assignBusinessRole(business("designer", "DESIGNER", null)), "UNAUTHENTICATED");
  const forged = approval("a");
  await denied(() => bootstrap({ ...forged, payload: forged.payload.replace('"targetUserId":"a"', '"targetUserId":"b"') }), "INVALID_SETUP_SIGNATURE");
  await denied(() => bootstrap(approval("a", { audience: "other-environment" })), "INVALID_SETUP_SCOPE");
  await denied(() => bootstrap(approval("a", { issuedAt: Date.now() - 120_000, expiresAt: Date.now() - 60_000 })), "SETUP_APPROVAL_EXPIRED");
  await denied(() => bootstrap(approval("a", { actorUserId: "suspended-operator" })), "ACTOR_NOT_ACTIVE");
  await denied(() => bootstrap(approval("suspended-target", { expectedVersion: 1 })), "SUSPENDED_DIRECTOR_TARGET");
  await denied(() => bootstrap(approval("missing")), "USER_NOT_FOUND");
  await denied(() => bootstrap(approval("a", { actorUserId: "missing" })), "USER_NOT_FOUND");
  const bootstraps = await contended([() => bootstrap(approval("a")), () => bootstrap(approval("b"))]);
  assert.equal(bootstraps.filter((r) => r.status === "fulfilled").length, 1);
  const bootstrapLoser = bootstraps.find((r) => r.status === "rejected");
  assert.equal(bootstrapLoser?.reason.code, "DIRECTOR_ALREADY_EXISTS");
  let directorId = (await db.userAuthorization.findFirstOrThrow({ where: { businessRole: "DIRECTOR" } })).userId;
  let director = service(directorId);
  const replacement = directorId === "a" ? "b" : "a";
  assert.deepEqual((await row(directorId)).technicalPrivileges, []);
  const bootstrapHistory = await db.userAuthorizationChange.findUniqueOrThrow({ where: { userId_authorizationVersion: { userId: directorId, authorizationVersion: 1 } } });
  assert.equal(bootstrapHistory.actorUserId, "operator");
  await denied(() => bootstrap(approval(replacement, { changeId: bootstrapHistory.changeId })), "SETUP_APPROVAL_USED");
  await denied(() => bootstrap(approval(replacement)), "DIRECTOR_ALREADY_EXISTS");
  console.log("PASS services: independent initial technical grant, setup cannot recover revoked grants; signed/scoped/expiring Director setup, real concurrent bootstrap, replay/duplicate/suspended/missing identities denied.");

  for (const [id, role] of [["designer", "DESIGNER"], ["digital", "DIGITAL_LEAD"], ["spm", "SENIOR_PROJECT_MANAGER"], ["jpm", "JUNIOR_PROJECT_MANAGER"]]) {
    const result = await director.assignBusinessRole(business(id, role, null));
    assert.equal(result.status, "APPLIED");
    assert.equal((await row(id)).authorizationVersion, 1);
  }
  await denied(() => director.assignBusinessRole({ ...business("designer", "DIGITAL_LEAD", 1), actorUserId: "operator" }), "INVALID_INPUT");
  await denied(() => service("designer").assignBusinessRole(business("designer", "DIRECTOR", 1)), "BUSINESS_AUTHORITY_REQUIRED");
  await denied(() => service("tech").assignBusinessRole(business("designer", "DIRECTOR", 1)), "BUSINESS_AUTHORITY_REQUIRED");
  await denied(() => director.setTechnicalPrivileges(technical("designer", ["TECHNICAL_ADMIN"], 1)), "TECHNICAL_AUTHORITY_REQUIRED");
  await denied(() => director.assignBusinessRole(business("designer", "DIRECTOR", 1)), "USE_DIRECTOR_OPERATION");
  await denied(() => director.assignBusinessRole(business(directorId, null, 1)), "DIRECTOR_TRANSFER_REQUIRED");
  await denied(() => director.setAuthorizationStatus(status(directorId, "SUSPENDED", 1)), "DIRECTOR_TRANSFER_REQUIRED");
  await denied(() => director.assignBusinessRole(business("designer", "SUPER_ADMIN", 1)), "INVALID_BUSINESS_ROLE");
  await denied(() => director.assignBusinessRole({ ...business("designer", "DIGITAL_LEAD", 1), reason: " \t\n" }), "INVALID_REASON");
  await denied(() => director.assignBusinessRole(business("missing", "DESIGNER", null)), "USER_NOT_FOUND");
  await denied(() => director.assignBusinessRole(business("designer", "DIGITAL_LEAD", 99)), "STALE_VERSION");
  await denied(() => director.assignBusinessRole(business("designer", "DIGITAL_LEAD", null)), "STALE_VERSION");
  await denied(() => director.assignBusinessRole(business("designer", "DIGITAL_LEAD", 0)), "INVALID_VERSION");
  await denied(() => service("tech").setTechnicalPrivileges(technical("designer", ["DIRECTOR"], 1)), "INVALID_TECHNICAL_PRIVILEGES");
  await denied(() => service("tech").setTechnicalPrivileges(technical("designer", ["TECHNICAL_ADMIN", "TECHNICAL_ADMIN"], 1)), "INVALID_TECHNICAL_PRIVILEGES");
  const beforeNoop = await state();
  assert.deepEqual(await director.assignBusinessRole(business("designer", "DESIGNER", 1)), { status: "NO_CHANGE" });
  assert.deepEqual(await state(), beforeNoop);
  const changed = await director.assignBusinessRole(business("designer", "DIGITAL_LEAD", 1));
  assert.equal((await row("designer")).authorizationVersion, 2);
  assert.equal(changed.status, "APPLIED");
  if (changed.status === "APPLIED") {
    const audit = await db.userAuthorizationChange.findFirstOrThrow({ where: { changeId: changed.changeId } });
    assert.equal(audit.actorUserId, directorId); assert.equal(audit.reason, reason);
  }
  await director.setAuthorizationStatus(status("designer", "SUSPENDED", 2));
  await denied(() => service("designer").assignBusinessRole(business("digital", "DESIGNER", 1)), "ACTOR_NOT_ACTIVE");
  await director.assignBusinessRole(business("designer", "DESIGNER", 3));
  assert.equal((await row("designer")).accountStatus, "SUSPENDED");
  await director.setAuthorizationStatus(status("designer", "ACTIVE", 4));
  const roleRaces = await contended([
    () => director.assignBusinessRole(business("digital", "DESIGNER", 1)),
    () => director.assignBusinessRole(business("digital", "JUNIOR_PROJECT_MANAGER", 1)),
  ]);
  assert.equal(roleRaces.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(roleRaces.find((r) => r.status === "rejected")?.reason.code, "STALE_VERSION");
  await service("tech").setTechnicalPrivileges(technical("tech2", ["TECHNICAL_ADMIN"], null));
  assert.equal((await row("tech2")).businessRole, null);
  await service("tech").setTechnicalPrivileges(technical("mixed", ["TECHNICAL_ADMIN"], null));
  await director.assignBusinessRole(business("mixed", "DESIGNER", 1));
  assert.deepEqual((await row("mixed")).technicalPrivileges, ["TECHNICAL_ADMIN"]);
  await denied(() => director.setAuthorizationStatus(status("mixed", "SUSPENDED", 2)), "TECHNICAL_AUTHORITY_REQUIRED");
  await denied(() => service("tech").setAuthorizationStatus(status("mixed", "SUSPENDED", 2)), "BUSINESS_AUTHORITY_REQUIRED");
  await service("tech").setTechnicalPrivileges(technical("mixed", [], 2));
  assert.equal((await row("mixed")).businessRole, "DESIGNER");
  await service("tech").setAuthorizationStatus(status("tech2", "SUSPENDED", 1));
  await denied(() => service("tech2").setTechnicalPrivileges(technical("digital", ["TECHNICAL_ADMIN"], 1)), "ACTOR_NOT_ACTIVE");
  await service("tech").setAuthorizationStatus(status("tech2", "ACTIVE", 2));
  await service("tech").setTechnicalPrivileges(technical(directorId, ["TECHNICAL_ADMIN"], 1));
  assert.equal((await row(directorId)).businessRole, "DIRECTOR");
  await service("tech").setTechnicalPrivileges(technical(replacement, ["TECHNICAL_ADMIN"], null));
  console.log("PASS services: all five roles, independent privilege domains, forged actor/legacy escalation denial, status/version/no-op rules and actor attribution.");

  const transfer = { toUserId: replacement, fromExpectedVersion: 2, toExpectedVersion: 1,
    outgoingBusinessRole: "SENIOR_PROJECT_MANAGER", reason };
  await denied(() => service("tech").transferDirector(transfer), "BUSINESS_AUTHORITY_REQUIRED");
  await denied(() => director.transferDirector({ ...transfer, fromUserId: "operator" }), "INVALID_INPUT");
  await denied(() => director.transferDirector({ ...transfer, fromExpectedVersion: 1 }), "STALE_VERSION");
  await denied(() => director.transferDirector({ ...transfer, toUserId: "suspended-target" }), "SUSPENDED_DIRECTOR_TARGET");
  const beforeRollback = await state();
  const failure = faultDatabase(1, "TEST_FAILURE");
  await assert.rejects(() => service(directorId, failure.database).transferDirector(transfer), /Injected transaction failure/);
  assert.equal(failure.attempts(), 1);
  assert.deepEqual(await state(), beforeRollback);
  const outgoing = directorId;
  const transferred = await director.transferDirector(transfer);
  assert.equal(transferred.status, "APPLIED");
  if (transferred.status === "APPLIED") {
    const audits = await db.userAuthorizationChange.findMany({ where: { changeId: transferred.changeId } });
    assert.equal(audits.length, 2);
    assert.ok(audits.every((audit) => audit.actorUserId === outgoing && audit.reason === reason));
  }
  assert.equal((await row(outgoing)).businessRole, "SENIOR_PROJECT_MANAGER");
  assert.deepEqual((await row(outgoing)).technicalPrivileges, ["TECHNICAL_ADMIN"]);
  assert.deepEqual((await row(replacement)).technicalPrivileges, ["TECHNICAL_ADMIN"]);
  directorId = replacement; director = service(directorId);
  await denied(() => service(outgoing).transferDirector({ ...transfer, fromExpectedVersion: 3 }), "BUSINESS_AUTHORITY_REQUIRED");
  const transfers = await contended([
    () => director.transferDirector({ toUserId: "c", fromExpectedVersion: 2, toExpectedVersion: null, outgoingBusinessRole: null, reason }),
    () => director.transferDirector({ toUserId: outgoing, fromExpectedVersion: 2, toExpectedVersion: 3, outgoingBusinessRole: "DESIGNER", reason }),
  ]);
  assert.equal(transfers.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(transfers.find((r) => r.status === "rejected")?.reason.code, "BUSINESS_AUTHORITY_REQUIRED");
  directorId = (await db.userAuthorization.findFirstOrThrow({ where: { businessRole: "DIRECTOR" } })).userId;
  director = service(directorId);
  assert.equal(await db.userAuthorization.count({ where: { businessRole: "DIRECTOR" } }), 1);
  const beforeDelete = await state();
  await assert.rejects(() => db.userAuthorization.delete({ where: { userId: directorId } }));
  await assert.rejects(() => db.user.delete({ where: { id: directorId } }));
  assert.deepEqual(await state(), beforeDelete);
  const currentDirectorVersion = (await row(directorId)).authorizationVersion;
  await denied(() => director.setAuthorizationStatus(status(directorId, "SUSPENDED", currentDirectorVersion)), "DIRECTOR_TRANSFER_REQUIRED");
  console.log("PASS services: atomic demote/promote, post-write rollback, concurrent transfers, lost-Director authority, retained technical privileges and deletion protection.");

  await director.assignBusinessRole(business("retry-target", "DESIGNER", null));
  const retry = faultDatabase(1, "P2034");
  let sessionReads = 0;
  const retryingService = createRoleAssignmentService({ database: retry.database,
    readSessionToken: async () => { sessionReads += 1; return tokens.get(directorId)!; } });
  const retried = await retryingService.assignBusinessRole(business("retry-target", "DIGITAL_LEAD", 1));
  assert.equal(retry.attempts(), 2); assert.equal(sessionReads, 2);
  assert.equal(retried.status, "APPLIED");
  assert.equal((await row("retry-target")).authorizationVersion, 2);
  assert.equal(await db.userAuthorizationChange.count({ where: { userId: "retry-target" } }), 2);
  const beforeRetries = await state();
  const exhausted = faultDatabase(3, "P2034");
  await assert.rejects(() => service(directorId, exhausted.database).assignBusinessRole(business("retry-target", "DESIGNER", 2)), /Injected/);
  assert.equal(exhausted.attempts(), 3); assert.deepEqual(await state(), beforeRetries);
  const ambiguous = faultDatabase(3, "P1001");
  await assert.rejects(() => service(directorId, ambiguous.database).assignBusinessRole(business("retry-target", "DESIGNER", 2)), /Injected/);
  assert.equal(ambiguous.attempts(), 1); assert.deepEqual(await state(), beforeRetries);
  const revoked = faultDatabase(1, "P2034");
  let checks = 0;
  const revokedService = createRoleAssignmentService({ database: revoked.database,
    readSessionToken: async () => ++checks === 1 ? tokens.get(directorId)! : null });
  await denied(() => revokedService.assignBusinessRole(business("retry-target", "DESIGNER", 2)), "UNAUTHENTICATED");
  assert.equal(checks, 2);
  console.log("PASS services: real-write rollback, bounded known-abort retries, no duplicate audit/version, fresh authentication on retry, no ambiguous-outcome retry.");

  const history = await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] });
  for (const userId of new Set(history.map((audit) => audit.userId))) {
    const chain = history.filter((audit) => audit.userId === userId);
    chain.forEach((audit, index) => {
      assert.equal(audit.authorizationVersion, index + 1);
      assert.deepEqual(audit.before, index === 0 ? null : chain[index - 1].after);
    });
  }
  await assert.rejects(() => db.userAuthorizationChange.updateMany({ data: { reason: "tampered" } }));
  assert.deepEqual(await businessSnapshot(), preserved);
  console.log(`PASS services: contiguous immutable audit history; all ${Object.keys(preserved).length} business tables, users, sessions, project owners/collaborators/responsibilities preserved.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

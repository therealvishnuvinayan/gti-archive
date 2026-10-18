import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { accounts, approvedTarget, audience, environmentName, parseProvisioningArguments, requireSharedTestPasswordAllowed } from "./development-provisioning/accounts";
import { applySignedSetup, assignRemaining, databasePreflight, digest, inspectState, PartialAssignmentError, provisionIdentities, setupTarget, validatePassword } from "./development-provisioning/core";
import { hashAuthPassword, normalizeAuthEmail, verifyAuthPassword } from "../src/lib/auth-password";
import { getPasswordValidationErrors, MIN_PASSWORD_LENGTH } from "../src/lib/password-rules";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";
import { terminalInput } from "./development-provisioning/terminal";

// No application URL fallback and no remotely selectable target, including through flags.
const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-test-root");
const parent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(parent + "/flux-v2-auth-pg-") && (statSync(root).mode & 0o777) === 0o700);
const socket = join(root, "s"), data = join(root, "data");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_provisioning_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.ok(process.env.FLUX_AUTH_TEST_URL === url && process.env.FLUX_AUTH_TEST_CLIENT === join(root, "client"));
const { PrismaClient: TestClient } = createRequire(__filename)(join(root, "client")) as { PrismaClient: typeof PrismaClient };
const db = new TestClient({ datasourceUrl: url, log: [] });
let check = "isolated identity";
function secret() { return randomBytes(24).toString("base64url") + "A2"; }
const passwordSets = [new Map(accounts.map((account) => [account.email, secret()])), new Map(accounts.map((account) => [account.email, secret()]))];
const passwords = (set = 0) => async (email: string) => ({ password: passwordSets[set].get(email)!, confirmation: passwordSets[set].get(email)! });
const { privateKey, publicKey } = generateKeyPairSync("ed25519"); // Disposable fixture keys only; CLI never generates/loads a private key.
const trustedKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const reason = "Isolated provisioning verification";
async function approval(operation: string, targetEmail: string, overrides: Record<string, unknown> = {}) {
  const actor = await db.user.findUniqueOrThrow({ where: { email: accounts[7].email } });
  const target = await db.user.findUniqueOrThrow({ where: { email: targetEmail } });
  const payload = JSON.stringify({ operation, audience, actorUserId: actor.id, targetUserId: target.id, expectedVersion: null,
    reason, changeId: randomUUID(), issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60000, ...overrides });
  return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString("base64url") };
}
async function rejectedWithoutAuthorizationChanges(operation: () => Promise<unknown>) {
  const before = digest(await inspectState(db));
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  assert.ok(rejected);
  assert.ok(digest(await inspectState(db)) === before);
}
async function unrelatedSnapshot() {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('User','Session','UserAuthorization','UserAuthorizationChange','_prisma_migrations') ORDER BY tablename");
  const result: unknown[] = [];
  for (const { tablename } of tables) {
    assert.match(tablename, /^[A-Za-z0-9_]+$/);
    result.push(await db.$queryRawUnsafe(`SELECT count(*)::integer AS count, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM "${tablename}" t`));
  }
  return digest(result);
}

async function run() {
  const [identity] = await db.$queryRawUnsafe<Array<{ directory: string; socket: boolean; listen: string }>>("SELECT current_setting('data_directory') AS directory, inet_server_addr() IS NULL AS socket,current_setting('listen_addresses') AS listen");
  assert.ok(identity.directory === data && identity.socket && identity.listen === "");
  const manifest = readdirSync(join(root, "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    .map((name) => ({ name, checksum: createHash("sha256").update(readFileSync(join(root, "migrations", name, "migration.sql"))).digest("hex") }));
  const authorizationSql = readFileSync(join(root, "migrations/20261018120000_v2_authorization_foundation/migration.sql"), "utf8");
  const initial = await databasePreflight(db, manifest, authorizationSql);
  assert.ok(initial.state.users.length === 0 && initial.state.auditCount === 0);

  check = "nine fictional identities and Director bootstrap target";
  assert.equal(accounts.length, 9);
  assert.equal(new Set(accounts.map((account) => account.email)).size, 9);
  assert.ok(accounts.every((account) => /^[^@\s]+@example\.test$/.test(account.email)));
  assert.deepEqual(setupTarget("bootstrap-director"), {
    name: "Slavomir Kluziak", email: "director@example.test", businessRole: "DIRECTOR", technicalPrivileges: [],
  });

  check = "preflight integrity guards";
  const preserved = await unrelatedSnapshot();
  assert.throws(() => terminalInput("No interactive fixture input", true));
  await assert.rejects(databasePreflight(db, manifest.map((entry, index) => index ? entry : { ...entry, checksum: "incorrect" }), authorizationSql));
  await db.$executeRawUnsafe('ALTER TABLE "UserAuthorization" DISABLE TRIGGER "UserAuthorization_audit"');
  await assert.rejects(databasePreflight(db, manifest, authorizationSql));
  await db.$executeRawUnsafe('ALTER TABLE "UserAuthorization" ENABLE TRIGGER "UserAuthorization_audit"');

  check = "development target allowlist";
  const fixtureUrl = new URL("postgresql://fixture@ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require");
  fixtureUrl.password = randomBytes(20).toString("hex"); // Never connect this target in tests.
  assert.ok(approvedTarget(fixtureUrl.toString(), environmentName).direct.hostname.includes("ep-raspy-salad-b4iqfan0."));
  for (const mutate of [
    (u: URL) => { u.hostname = "production.invalid"; }, (u: URL) => { u.pathname = "/other"; },
    (u: URL) => { u.searchParams.set("host", "production.invalid"); }, (u: URL) => { u.searchParams.set("schema", "other"); },
    (u: URL) => { u.searchParams.set("options", "unsafe"); }, (u: URL) => { u.searchParams.set("sslmode", "disable"); },
  ]) { const u = new URL(fixtureUrl); mutate(u); assert.throws(() => approvedTarget(u.toString(), environmentName)); }
  assert.throws(() => approvedTarget(fixtureUrl.toString(), "production"));
  assert.throws(() => approvedTarget(fixtureUrl.toString(), environmentName, "production"));

  check = "shared password target, manifest and command guards";
  const sharedContext = { databaseUrl: fixtureUrl.toString(), environment: environmentName, nodeEnvironment: "development" };
  requireSharedTestPasswordAllowed(sharedContext); // Metadata validation only; db remains the private disposable socket client.
  const invalidContexts = [
    ...["production", "test", undefined].map((nodeEnvironment) => ({ ...sharedContext, nodeEnvironment })),
    ...["production", "unknown", "flux-v2-dev/other"].map((environment) => ({ ...sharedContext, environment })),
    ...[(u: URL) => { u.hostname = "unknown.invalid"; }, (u: URL) => { u.pathname = "/other"; },
      (u: URL) => { u.hostname = u.hostname.replace("-pooler.", "."); },
      (u: URL) => { u.searchParams.set("host", "production.invalid"); }].map((mutate) => {
      const u = new URL(fixtureUrl); mutate(u); return { ...sharedContext, databaseUrl: u.toString() };
    }),
  ];
  for (const context of invalidContexts) {
    assert.throws(() => requireSharedTestPasswordAllowed(context));
    let prompted = false;
    await assert.rejects(provisionIdentities(db, async () => { prompted = true; throw new Error("Unexpected prompt"); }, context));
    assert.ok(!prompted && await db.user.count() === 0);
  }
  for (const changed of [accounts.slice(1), [...accounts, accounts[0]],
    accounts.map((account, index) => index ? account : { ...account, email: "different@example.test" }),
    accounts.map((account, index) => index ? account : { ...account, email: "director@example.invalid" }),
    accounts.map((account, index) => index ? account : { ...account, name: "Different identity" }),
    accounts.map((account, index) => index ? account : { ...account, businessRole: null }),
  ]) assert.throws(() => requireSharedTestPasswordAllowed(sharedContext, changed));
  const identityArgs = ["apply", "--environment", environmentName, "--step", "identities"];
  assert.equal(parseProvisioningArguments(identityArgs)?.sharedTestPassword, false);
  assert.equal(parseProvisioningArguments([...identityArgs, "--shared-test-password"])?.sharedTestPassword, true);
  assert.equal(parseProvisioningArguments(["apply", "--shared-test-password", ...identityArgs.slice(1)])?.sharedTestPassword, true);
  const argumentFixture = secret(); // Never supplied to a process argument; parser rejection tests use memory only.
  for (const args of [[...identityArgs, "--shared-test-password", "--shared-test-password"],
    [...identityArgs, "--shared-test-password", argumentFixture], [...identityArgs, "--password", argumentFixture],
    [...identityArgs, `--shared-test-password=${argumentFixture}`],
    ...["plan", "verify"].map((mode) => [mode, ...identityArgs.slice(1), "--shared-test-password"]),
    ...["bootstrap-director", "bootstrap-technical", "business-roles", "technical-roles"].map((step) =>
      ["apply", "--environment", environmentName, "--step", step, "--shared-test-password"]),
  ]) {
    assert.throws(() => parseProvisioningArguments(args), (error: unknown) =>
      error instanceof Error && !error.message.includes(argumentFixture));
  }

  check = "shared eight-character password, confirmation, independent salts and login compatibility";
  const sharedSecret = `A${randomBytes(2).toString("hex")}@12`; // Random eight-character fixture; no configured password in source.
  assert.equal(sharedSecret.length, 8);
  assert.throws(() => validatePassword(sharedSecret, sharedSecret, accounts[0].email)); // Default provisioning policy remains strict.
  for (const [password, confirmation] of [[sharedSecret, secret()], [sharedSecret.slice(0, 7), sharedSecret.slice(0, 7)],
    [sharedSecret.toLowerCase(), sharedSecret.toLowerCase()], [" "+sharedSecret, " "+sharedSecret],
    [sharedSecret+"\n", sharedSecret+"\n"], [sharedSecret.repeat(33), sharedSecret.repeat(33)]]) {
    await assert.rejects(provisionIdentities(db, async () => ({ password, confirmation }), sharedContext));
    assert.equal(await db.user.count(), 0);
  }
  let sharedPrompts = 0;
  const entered = { password: sharedSecret, confirmation: sharedSecret };
  const logEntries: string[] = [], originalLogs = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...values: unknown[]) => { logEntries.push(JSON.stringify(values)); };
  try {
    console.log = capture; console.warn = capture; console.error = capture;
    const result = await provisionIdentities(db, async () => { sharedPrompts++; return entered; }, sharedContext);
    assert.ok(result.created.length === 9 && result.retained === 0 && !JSON.stringify(result).includes(sharedSecret));
  } finally { Object.assign(console, originalLogs); }
  assert.ok(sharedPrompts === 1 && entered.password === "" && entered.confirmation === "");
  assert.ok(!logEntries.join("").includes(sharedSecret));
  const sharedUsers = await db.user.findMany();
  assert.equal(sharedUsers.length, 9);
  assert.equal(new Set(sharedUsers.map((user) => user.passwordHash)).size, 9);
  assert.equal(new Set(sharedUsers.map((user) => user.passwordHash.split(":")[0])).size, 9);
  for (const user of sharedUsers) {
    const loginUser = await db.user.findUniqueOrThrow({ where: { email: normalizeAuthEmail(` ${user.email.toUpperCase()} `) } });
    assert.ok(verifyAuthPassword(sharedSecret, loginUser.passwordHash));
    assert.ok(user.role === "USER" && !user.projectCreationAccessGranted && user.passwordHash !== sharedSecret);
  }
  assert.ok(await db.userAuthorization.count() === 0 && await db.userAuthorizationChange.count() === 0 && await db.session.count() === 0);
  assert.ok(preserved === await unrelatedSnapshot());
  const sharedSnapshot = digest(sharedUsers);
  await assert.rejects(provisionIdentities(db, async () => { sharedPrompts++; return entered; }, sharedContext));
  assert.ok(sharedPrompts === 1 && digest(await db.user.findMany()) === sharedSnapshot);
  // Remove only this disposable suite's own new fixture identities, before running the existing normal-mode suite.
  await db.user.deleteMany({ where: { id: { in: sharedUsers.map((user) => user.id) } } });
  assert.equal(await db.user.count(), 0);
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  assert.deepEqual(getPasswordValidationErrors(sharedSecret.slice(0, 5) + "2"), []);
  assert.ok(getPasswordValidationErrors(sharedSecret.toLowerCase()).length > 0);
  assert.ok(getPasswordValidationErrors(sharedSecret.replace(/[0-9]/g, "x")).length > 0);

  check = "password policy, confirmation, salt and verification";
  const sample = secret(), first = hashAuthPassword(sample), second = hashAuthPassword(sample);
  validatePassword(sample, sample, accounts[0].email);
  assert.ok(first !== second && verifyAuthPassword(sample, first) && !verifyAuthPassword(secret(), first));
  assert.ok(!verifyAuthPassword(sample, "invalid"));
  assert.throws(() => validatePassword(sample, secret(), accounts[0].email));
  assert.throws(() => validatePassword("a".repeat(20), "a".repeat(20), accounts[0].email));
  assert.throws(() => validatePassword("A1".repeat(10), "A1".repeat(10), accounts[0].email));
  await assert.rejects(provisionIdentities(db, async () => ({ password: sample, confirmation: sample })));
  assert.ok(await db.user.count() === 0);

  check = "atomic rollback after a database insertion failure";
  await db.$executeRawUnsafe(`CREATE FUNCTION provisioning_test_reject() RETURNS trigger AS $$ BEGIN
    IF NEW.email = 'designer2@example.test' THEN RAISE EXCEPTION 'isolated insertion failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe('CREATE TRIGGER provisioning_test_reject BEFORE INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION provisioning_test_reject()');
  await assert.rejects(provisionIdentities(db, passwords()));
  assert.ok(await db.user.count() === 0);
  await assert.rejects(provisionIdentities(db, async () => ({ password: sharedSecret, confirmation: sharedSecret }), sharedContext));
  assert.ok(await db.user.count() === 0);
  await db.$executeRawUnsafe('DROP TRIGGER provisioning_test_reject ON "User"');
  await db.$executeRawUnsafe('DROP FUNCTION provisioning_test_reject()');

  check = "partial identity resume and conflicting records";
  const retainedUser = await db.user.create({ data: { name: accounts[0].name, email: accounts[0].email,
    passwordHash: hashAuthPassword(passwordSets[0].get(accounts[0].email)!), role: "USER" } });
  await assert.rejects(provisionIdentities(db, async () => { sharedPrompts++; return entered; }, sharedContext));
  assert.ok(sharedPrompts === 1 && digest(await db.user.findUniqueOrThrow({ where: { id: retainedUser.id } })) === digest(retainedUser));
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: retainedUser.id }, data: { role: "ADMIN" } });
    await inspectState(tx); // Rejection rolls back the conflicting test fixture.
  }));
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: retainedUser.id }, data: { name: "Conflicting fixture identity" } });
    await inspectState(tx);
  }));
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.user.create({ data: { email: accounts[0].email.toUpperCase(), name: accounts[0].name,
      passwordHash: hashAuthPassword(secret()), role: "USER" } });
    await inspectState(tx);
  }));
  const reused = passwordSets[0].get(accounts[0].email)!;
  await assert.rejects(provisionIdentities(db, async () => ({ password: reused, confirmation: reused })));
  assert.ok(await db.user.count() === 1);

  check = "concurrent provisioning and safe repeatability";
  const concurrent = await Promise.allSettled([provisionIdentities(db, passwords(0)), provisionIdentities(db, passwords(1))]);
  assert.ok(concurrent.filter((result) => result.status === "fulfilled").length === 1 && await db.user.count() === 9);
  const beforePasswords = digest(await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, passwordHash: true } }));
  let prompted = false;
  const repeated = await provisionIdentities(db, async () => { prompted = true; throw new Error("Unexpected password prompt"); });
  assert.ok(!prompted && repeated.created.length === 0 && repeated.retained === 9);
  assert.ok(beforePasswords === digest(await db.user.findMany({ orderBy: { id: "asc" }, select: { id: true, passwordHash: true } })));
  for (const user of await db.user.findMany()) {
    const winner = concurrent.findIndex((result) => result.status === "fulfilled");
    const expected = user.id === retainedUser.id ? passwordSets[0].get(user.email)! : passwordSets[winner].get(user.email)!;
    assert.ok(user.role === "USER" && verifyAuthPassword(expected, user.passwordHash));
  }

  check = "fictional Director email and existing password verification";
  const testDirector = await db.user.findUniqueOrThrow({ where: { email: normalizeAuthEmail(" DIRECTOR@EXAMPLE.TEST ") } });
  assert.equal(testDirector.id, retainedUser.id);
  assert.ok(verifyAuthPassword(passwordSets[0].get("director@example.test")!, testDirector.passwordHash));

  check = "signed bootstrap rejection and identity binding";
  const director = await approval("BOOTSTRAP_DIRECTOR", accounts[0].email);
  await rejectedWithoutAuthorizationChanges(() => applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey,
    { ...director, signature: randomBytes(64).toString("base64url") }));
  await rejectedWithoutAuthorizationChanges(async () => applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey,
    await approval("BOOTSTRAP_DIRECTOR", accounts[0].email, { audience: "wrong-environment" })));
  await rejectedWithoutAuthorizationChanges(async () => applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey,
    await approval("BOOTSTRAP_DIRECTOR", accounts[0].email, { issuedAt: Date.now() - 120000, expiresAt: Date.now() - 1000 })));
  await rejectedWithoutAuthorizationChanges(async () => applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey,
    await approval("INITIAL_TECHNICAL_ADMIN", accounts[0].email)));
  await applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey, director);
  await rejectedWithoutAuthorizationChanges(() => applySignedSetup(db, "bootstrap-director", accounts[7].email, trustedKey, director));
  const technical = await approval("INITIAL_TECHNICAL_ADMIN", accounts[7].email);
  await applySignedSetup(db, "bootstrap-technical", accounts[7].email, trustedKey, technical);
  await rejectedWithoutAuthorizationChanges(() => applySignedSetup(db, "bootstrap-technical", accounts[7].email, trustedKey, technical));

  check = "actual sessions, domain separation and ordinary assignments";
  const users = await db.user.findMany();
  const directorUser = users.find((user) => user.email === accounts[0].email)!;
  const developer = users.find((user) => user.email === accounts[7].email)!;
  const directorToken = randomBytes(32).toString("hex"), developerToken = randomBytes(32).toString("hex"), expired = randomBytes(32).toString("hex");
  for (const [token, userId, expiresAt] of [[directorToken, directorUser.id, new Date(Date.now() + 60000)],
    [developerToken, developer.id, new Date(Date.now() + 60000)], [expired, directorUser.id, new Date(Date.now() - 60000)]] as const) {
    await db.session.create({ data: { token, userId, expiresAt } });
  }
  await rejectedWithoutAuthorizationChanges(() => assignRemaining(db, "business", randomUUID(), reason));
  await rejectedWithoutAuthorizationChanges(() => assignRemaining(db, "business", expired, reason));
  await rejectedWithoutAuthorizationChanges(() => assignRemaining(db, "business", developerToken, reason));
  await rejectedWithoutAuthorizationChanges(() => assignRemaining(db, "technical", directorToken, reason));
  check = "partial ordinary assignment and safe resume";
  let committed = 0;
  const interruptedDatabase = new Proxy(db, {
    get(target, property) {
      if (property === "$transaction") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.$transaction, target, args);
        if (++committed === 1) await db.session.update({ where: { token: directorToken }, data: { expiresAt: new Date(Date.now() - 1000) } });
        return result;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  let partial: unknown;
  try { await assignRemaining(interruptedDatabase, "business", directorToken, reason); } catch (error) { partial = error; }
  assert.ok(partial instanceof PartialAssignmentError && partial.completed.length === 1 && partial.completed[0] === accounts[1].email);
  assert.ok((await inspectState(db)).auditCount === 3); // Two bootstrap grants plus one committed business assignment.
  await db.session.update({ where: { token: directorToken }, data: { expiresAt: new Date(Date.now() + 60000) } });
  await assignRemaining(db, "business", directorToken, reason);
  await assignRemaining(db, "technical", developerToken, reason);
  let state = await inspectState(db);
  assert.ok(state.directors === 1 && state.technicalAdministrators === 2 && state.auditCount === 9);
  assert.ok(state.users.every((user) => user.authorization?.authorizationVersion === 1));
  const stable = digest(state);
  await assignRemaining(db, "business", directorToken, reason);
  await assignRemaining(db, "technical", developerToken, reason);
  assert.ok(digest(await inspectState(db)) === stable);

  check = "audit attribution and version increments";
  const designer = users.find((user) => user.email === accounts[4].email)!;
  const service = createRoleAssignmentService({ database: db, readSessionToken: async () => directorToken });
  await service.assignBusinessRole({ userId: designer.id, businessRole: "DIGITAL_LEAD", expectedVersion: 1, reason });
  await service.assignBusinessRole({ userId: designer.id, businessRole: "DESIGNER", expectedVersion: 2, reason });
  state = await inspectState(db);
  assert.ok(state.auditCount === 11 && state.users.find((user) => user.id === designer.id)?.authorization?.authorizationVersion === 3);
  const history = await db.userAuthorizationChange.findMany();
  assert.ok(history.filter((entry) => entry.userId === designer.id).every((entry) => entry.actorUserId === directorUser.id));
  assert.ok(history.filter((entry) => entry.userId === developer.id).every((entry) => entry.actorUserId === developer.id));
  const final = await databasePreflight(db, manifest, authorizationSql);
  assert.ok(final.state.directors === 1 && final.state.technicalAdministrators === 2 && final.state.users.length === 9);
  assert.ok(preserved === await unrelatedSnapshot());
  assert.ok((await db.user.findMany({ select: { role: true } })).every((user) => user.role === "USER"));
  console.log("PASS: shared password development/endpoint/manifest/argument guards, eight-character input, one password collection, confirmation, independent salts, login compatibility, no secret logging, unchanged application/default password policies, and existing-account protection.");
  console.log("PASS: nine fictional identities, Director bootstrap target and password verification, provisioning target guards, password policy/hash/confirmation/uniqueness, identity conflicts, atomic rollback, concurrent creation, partial identity/assignment resume, repeatability, signed bootstrap/replay/expiry/scope, genuine sessions, domain separation, audit/version integrity, and unchanged unrelated tables.");
}

run().catch(() => { console.error(`FAIL: isolated provisioning check: ${check}. Sensitive fixture values withheld.`); process.exitCode = 1; })
  .finally(async () => { passwordSets.forEach((set) => set.clear()); await db.$disconnect(); });

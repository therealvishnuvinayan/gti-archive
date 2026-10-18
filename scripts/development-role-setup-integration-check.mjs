// Only the disposable cluster runner invokes this fixture. Never load application
// environment/configuration or use the actual Neon target. Sessions here are test fixtures.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completeRemaining, environment, validatePlan } from "./development-role-setup.mjs";

let db;
let stage = "fixture isolation and dependencies";
try {
  const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-test-root");
  const parent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
  assert.ok(root.startsWith(parent + "/flux-v2-auth-pg-") && (statSync(root).mode & 0o777) === 0o700);
  const socket = join(root, "s"), output = join(root, "provisioning-compiled");
  assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
  const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_guided_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
  assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require(join(root, "client"));
  const core = require(join(output, "scripts/development-provisioning/core.js"));
  const { accounts, audience } = require(join(output, "scripts/development-provisioning/accounts.js"));
  const { writeProtectedRequest, protectedFile } = require(join(output, "scripts/development-provisioning/protected-files.js"));
  db = new PrismaClient({ datasourceUrl: url, log: [] });
  const [identity] = await db.$queryRawUnsafe("SELECT current_setting('data_directory') AS directory, inet_server_addr() IS NULL AS socket, current_setting('listen_addresses') AS listen");
  assert.deepEqual(identity, { directory: join(root, "data"), socket: true, listen: "" });
  const repository = realpathSync(process.env.FLUX_AUTH_TEST_REPOSITORY);
  const manifest = readdirSync(join(root, "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    .map((name) => ({ name, checksum: createHash("sha256").update(readFileSync(join(root, "migrations", name, "migration.sql"))).digest("hex") }));
  const sql = readFileSync(join(root, "migrations/20261018120000_v2_authorization_foundation/migration.sql"), "utf8");
  const keys = join(root, "offline-issuer"), approvals = join(root, "offline-approvals");
  const trust = JSON.parse(protectedFile(join(keys, "trust.json"), repository));
  stage = "fixture identities";
  await core.provisionIdentities(db, async (email) => {
    // Random fixtures must satisfy the normal weak-pattern blacklist as well as
    // length/case rules; a random substring can otherwise make this test flaky.
    for (let attempt = 0; attempt < 100; attempt++) {
      const secret = randomBytes(24).toString("base64url") + "A2";
      try { core.validatePassword(secret, secret, email); }
      catch { continue; }
      return { password: secret, confirmation: secret };
    }
    throw new Error("FIXTURE_PASSWORD_GENERATION_FAILED");
  });
  const preserved = core.digest(await db.user.findMany({ orderBy: { id: "asc" } }));
  const users = await db.user.findMany({ select: { id: true, email: true } });
  const operator = users.find((user) => user.email === accounts[7].email);
  const director = users.find((user) => user.email === accounts[0].email);
  function exportRequest(operation, targetId) {
    const id = randomUUID(), now = Date.now();
    const files = { request: join(approvals, `guided-${id}-request.json`), approval: join(approvals, `guided-${id}-approval.json`) };
    writeProtectedRequest(files.request, repository, JSON.stringify({ operation, audience, actorUserId: operator.id, targetUserId: targetId,
      expectedVersion: null, reason: "Isolated guided bootstrap", changeId: id, issuedAt: now, expiresAt: now + 600000 }));
    return files;
  }
  function sign(files, operation, targetId) {
    // Separate disposable issuer process, no database environment. The real
    // interactive CLI confirmation is covered by the existing offline PTY suite.
    const program = `import {signRequest} from ${JSON.stringify(join(repository, "scripts/development-signing.mjs"))};
      await signRequest(process.argv[1],process.argv[2],process.argv[3],JSON.parse(process.argv[4]),async (_request,confirmation)=>confirmation);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", program, keys, files.request, files.approval,
      JSON.stringify({ operation, actorUserId: operator.id, targetUserId: targetId })],
    { env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C" }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
  }
  const initial = exportRequest("BOOTSTRAP_DIRECTOR", director.id);
  stage = "existing Director fixture";
  sign(initial, "BOOTSTRAP_DIRECTOR", director.id);
  await core.applySignedSetup(db, "bootstrap-director", operator.email, trust.publicKeyPem, JSON.parse(protectedFile(initial.approval, repository)));
  // These existing sessions are isolated test fixtures, never production sessions.
  const directorToken = randomBytes(32).toString("hex"), developerToken = randomBytes(32).toString("hex");
  for (const [token, userId] of [[directorToken, director.id], [developerToken, operator.id]]) {
    await db.session.create({ data: { token, userId, expiresAt: new Date(Date.now() + 600000) } });
  }
  const steps = [];
  async function plan() {
    const preflight = await core.databasePreflight(db, manifest, sql);
    return {
      // Coordinator interface fixture identity; the actual database identity was
      // independently pinned above to this private socket-only disposable cluster.
      environment, database: { database: "neondb", schema: "public", major: 18, readOnly: preflight.identity.readOnly },
      pooledFingerprint: "9d6f1df51a9db284", directFingerprint: "5b001dbfcdb263fa", manifestFingerprint: "6c64549f4682ae1b", audience,
      migrations: preflight.migrationCount, schemaDrift: "NONE", signing: "PUBLIC_VERIFICATION_KEY_CONFIGURED",
      accounts: core.publicState(preflight.state), counts: preflight.counts, directors: preflight.state.directors,
      technicalAdministrators: preflight.state.technicalAdministrators, auditCount: preflight.state.auditCount,
      authorizationAudit: preflight.state.authorizationAudit,
    };
  }
  const io = { plan, verify: plan, report: () => {},
    exportRequest: (id) => { assert.equal(id, operator.id); steps.push("request"); return exportRequest("INITIAL_TECHNICAL_ADMIN", id); },
    sign: (files, id) => { steps.push("sign"); sign(files, "INITIAL_TECHNICAL_ADMIN", id); },
    apply: async (step, files) => {
      steps.push(step);
      if (step === "bootstrap-technical") await core.applySignedSetup(db, step, operator.email, trust.publicKeyPem, JSON.parse(protectedFile(files.approval, repository)));
      else await core.assignRemaining(db, step === "business-roles" ? "business" : "technical",
        step === "business-roles" ? directorToken : developerToken, "Isolated guided assignment");
    },
  };
  // Simulate a session expiring immediately after one committed business grant.
  const interrupted = new Proxy(db, { get(target, property) {
    if (property === "$transaction") return async (...args) => {
      const result = await Reflect.apply(target.$transaction, target, args);
      await db.session.update({ where: { token: directorToken }, data: { expiresAt: new Date(Date.now() - 1000) } });
      return result;
    };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  stage = "interrupted guided assignments";
  await assert.rejects(completeRemaining({ ...io, apply: async (step, files) => {
    if (step === "business-roles") { steps.push(step); await core.assignRemaining(interrupted, "business", directorToken, "Isolated guided assignment"); }
    else await io.apply(step, files);
  } }), core.PartialAssignmentError);
  const partial = await plan();
  stage = "partial state verification";
  validatePlan(partial);
  assert.equal(partial.auditCount, 3);
  assert.ok(!steps.includes("technical-roles"));
  const directorAudit = partial.authorizationAudit.find((entry) => entry.userId === director.id);
  await db.session.update({ where: { token: directorToken }, data: { expiresAt: new Date(Date.now() + 600000) } });
  steps.length = 0;
  stage = "resume and final verification";
  const final = await completeRemaining(io);
  assert.deepEqual(steps, ["business-roles", "technical-roles"]);
  assert.equal(final.auditCount, 9);
  assert.equal(final.directors, 1);
  assert.equal(final.technicalAdministrators, 2);
  assert.ok(final.accounts.every((user) => user.legacyRole === "USER" && user.authorizationVersion === 1));
  assert.deepEqual(final.authorizationAudit.find((entry) => entry.userId === director.id), directorAudit);
  assert.equal(core.digest(await db.user.findMany({ orderBy: { id: "asc" } })), preserved);
  steps.length = 0;
  await completeRemaining(io);
  assert.deepEqual(steps, []);
  console.log("PASS: guided coordinator with real isolated PostgreSQL services, separate disposable signing process, session expiry after commit, stop/report, resume without repeated bootstrap, nine audited version-1 assignments, preserved Director/users/passwords, and read-only completed rerun.");
} catch (error) {
  const location = error?.stack?.split("\n").find((line) => /development-role-setup(?:-integration-check)?\.mjs:\d+:\d+/.test(line));
  console.error(`FAIL: isolated guided role workflow (${stage})${location ? ` ${location.trim()}` : ""}. Fixture credentials and raw database errors withheld.`);
  process.exitCode = 1;
} finally { await db?.$disconnect(); }

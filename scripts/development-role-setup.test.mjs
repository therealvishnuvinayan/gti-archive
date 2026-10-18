// Orchestration tests use no .env, application services, credentials or network.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { childEnvironment, completeRemaining, environment, requireLocalInvocation, validatePlan } from "./development-role-setup.mjs";

const emails = ["director", "spm1", "spm2", "jpm1", "designer1", "designer2", "digitallead1", "developer1", "developer2"].map((name) => `${name}@example.test`);
const roles = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DESIGNER", "DESIGNER", "DIGITAL_LEAD", null, null];
const order = [0, 7, 1, 2, 3, 4, 5, 6, 8];
function fixture() {
  let completed = 1;
  const audits = emails.map((_, index) => ({ userId: `fixture-${index}`, actorUserId: `fixture-${index === 0 || index >= 7 ? 7 : 0}`,
    authorizationVersion: 1, changeId: randomUUID(), reason: "Isolated coordinator fixture" }));
  const calls = [];
  function plan() {
    const assigned = new Set(order.slice(0, completed));
    return { environment, database: { database: "neondb", schema: "public", major: 18, readOnly: "on" },
      pooledFingerprint: "9d6f1df51a9db284", directFingerprint: "5b001dbfcdb263fa", manifestFingerprint: "6c64549f4682ae1b",
      audience: "flux-v2-dev:develop:neondb:5b001dbfcdb263fa:6c64549f4682ae1b", migrations: 104, schemaDrift: "NONE",
      signing: "PUBLIC_VERIFICATION_KEY_CONFIGURED; independent issuer approval still required",
      accounts: emails.map((email, index) => ({ email, id: `fixture-${index}`, identity: "PRESENT", legacyRole: "USER",
        businessRole: roles[index], technicalPrivileges: index >= 7 ? ["TECHNICAL_ADMIN"] : [],
        assignment: assigned.has(index) ? "MATCHES" : "PENDING", authorizationVersion: assigned.has(index) ? 1 : null })),
      counts: { User: 9, UserAuthorization: completed, UserAuthorizationChange: completed },
      directors: 1, technicalAdministrators: completed === 9 ? 2 : completed >= 2 ? 1 : 0, auditCount: completed,
      authorizationAudit: audits.filter((_, index) => assigned.has(index)).map((entry) => ({ ...entry })) };
  }
  const io = { plan: () => { calls.push("plan"); return plan(); }, verify: () => { calls.push("verify"); return plan(); }, report: () => {},
    exportRequest: (id) => { calls.push("request"); assert.equal(id, "fixture-7"); return { request: "fixture-request", approval: "fixture-approval" }; },
    sign: (files, id) => { calls.push("sign"); assert.equal(files.request, "fixture-request"); assert.equal(id, "fixture-7"); },
    apply: (step) => { calls.push(step); completed = { "bootstrap-technical": 2, "business-roles": 8, "technical-roles": 9 }[step]; } };
  return { io, calls, plan, setCompleted: (value) => { completed = value; } };
}

test("exact approved initial state, version and audit attribution required", () => {
  const { plan } = fixture();
  assert.equal(validatePlan(plan()).length, 9);
  for (const mutate of [
    (p) => { p.environment = "production"; }, (p) => { p.database.database = "other"; },
    (p) => { p.database.major = 14; }, (p) => { p.database.readOnly = "off"; },
    (p) => { p.directFingerprint = "2326cc86483bda5d"; }, (p) => { p.pooledFingerprint = "other"; },
    (p) => { p.audience = "other"; }, (p) => { p.manifestFingerprint = "other"; },
    (p) => { p.migrations = 103; }, (p) => { p.migrations = 105; }, (p) => { p.schemaDrift = "DETECTED"; },
    (p) => { p.counts.User = 10; }, (p) => { p.accounts.push(p.accounts[0]); },
    (p) => { p.accounts[0].technicalPrivileges = ["TECHNICAL_ADMIN"]; },
    (p) => { p.accounts[7].businessRole = "DIRECTOR"; }, (p) => { p.accounts[1].email = "outside@example.com"; },
    (p) => { p.accounts[1].id = p.accounts[0].id; }, (p) => { p.accounts[1].id = null; },
    (p) => { p.accounts[0].legacyRole = "ADMIN"; }, (p) => { p.accounts[0].authorizationVersion = 2; },
    (p) => { p.accounts[0].assignment = "PENDING"; p.accounts[0].authorizationVersion = null; },
    (p) => { p.signing = "NOT_CONFIGURED"; }, (p) => { p.directors = 0; },
    (p) => { p.auditCount = 0; }, (p) => { p.authorizationAudit[0].actorUserId = "fixture-0"; },
    (p) => { p.authorizationAudit[0].reason = ""; }, (p) => { p.authorizationAudit[0].changeId = "invalid"; },
    (p) => { p.accounts[8].assignment = "MATCHES"; p.accounts[8].authorizationVersion = 1; },
  ]) { const changed = plan(); mutate(changed); assert.throws(() => validatePlan(changed)); }
});

test("one guided sequence preserves Director and verifies after every step", async () => {
  const f = fixture();
  const final = await completeRemaining(f.io);
  assert.deepEqual(f.calls, ["plan", "request", "sign", "bootstrap-technical", "plan", "business-roles", "plan", "technical-roles", "plan", "verify"]);
  assert.equal(final.auditCount, 9);
  assert.equal(final.accounts[0].authorizationVersion, 1);
});

test("resume at every committed prefix; all-complete performs only read-only checks", async () => {
  for (let count = 2; count <= 9; count++) {
    const f = fixture(); f.setCompleted(count);
    await completeRemaining(f.io);
    assert.ok(!f.calls.includes("sign") && !f.calls.includes("request") && !f.calls.includes("bootstrap-technical"));
    assert.equal(f.calls.includes("business-roles"), count < 8);
    assert.equal(f.calls.includes("technical-roles"), count < 9);
    if (count === 9) assert.deepEqual(f.calls, ["plan", "verify"]);
  }
});

test("signature rejection, expiry, export conflict and uncertain commits stop without write retries", async () => {
  for (const point of ["exportRequest", "sign", "bootstrap-technical", "business-roles", "technical-roles"]) {
    const f = fixture();
    const fail = () => { throw new Error("fixture failure or expired approval"); };
    if (point === "exportRequest" || point === "sign") f.io[point] = fail;
    else {
      const apply = f.io.apply;
      f.io.apply = (step, files) => { apply(step, files); if (step === point) fail(); };
    }
    await assert.rejects(completeRemaining(f.io));
    if (point === "exportRequest" || point === "sign") assert.ok(!f.calls.includes("bootstrap-technical"));
    if (point === "bootstrap-technical") assert.ok(!f.calls.includes("business-roles"));
    if (point === "business-roles") assert.ok(!f.calls.includes("technical-roles"));
    assert.ok(f.calls.filter((call) => call === point).length <= 1);
  }
});

test("an unverified commit or mutation of an existing audit stops subsequent writes", async () => {
  const f = fixture();
  f.io.apply = (step) => { f.calls.push(step); }; // Child claimed success without a commit.
  await assert.rejects(completeRemaining(f.io), /EXPECTED_ASSIGNMENT_NOT_COMMITTED/);
  assert.ok(!f.calls.includes("business-roles"));
  const g = fixture();
  const plan = g.io.plan;
  g.io.plan = () => { const p = plan(); if (p.auditCount > 1) p.authorizationAudit[0].reason = "changed"; return p; };
  // Snapshot the fixture entries so the earlier plan cannot change by reference.
  const snapshot = g.io.plan; g.io.plan = () => structuredClone(snapshot());
  await assert.rejects(completeRemaining(g.io), /EXISTING_AUDIT_CHANGED/);
  assert.ok(!g.calls.includes("business-roles"));
});

test("wrong environment, unattended invocation and secret arguments rejected before any child", () => {
  const args = ["--environment", environment];
  requireLocalInvocation(args, {}, true);
  for (const invalid of [[], ["--environment", "production"], [...args, "--yes"], [...args, "--password", "fixture-secret"],
    [...args, "--session", "fixture-secret"], [...args, "--approval-file", "old-file"]]) {
    assert.throws(() => requireLocalInvocation(invalid, {}, true));
  }
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, { CI: "1" }, { VERCEL: "1" }]) {
    assert.throws(() => requireLocalInvocation(args, env, true));
  }
  assert.throws(() => requireLocalInvocation(args, {}, false));
  const tool = fileURLToPath(new URL("./development-role-setup.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [tool, ...args], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOCAL_INTERACTIVE_TERMINAL_REQUIRED/);
  assert.equal(result.stdout, "");
});

test("signer receives no database credentials; executor receives no signing secrets", () => {
  const env = { PATH: "/fixture", DATABASE_URL: "fixture-database-secret", AWS_SECRET_ACCESS_KEY: "fixture-aws-secret",
    PRIVATE_KEY: "fixture-signing-secret", SESSION: "fixture-session-secret", NODE_OPTIONS: "unsafe-fixture" };
  const signer = childEnvironment(env, true), executor = childEnvironment(env);
  assert.deepEqual(signer, { PATH: env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "development" });
  assert.deepEqual(executor, { ...signer, DATABASE_URL: env.DATABASE_URL });
});

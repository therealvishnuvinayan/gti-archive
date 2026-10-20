// Only invoked by the disposable PostgreSQL runner; no application database access.
import assert from "node:assert/strict";
import { randomUUID, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeSigner, installPublicTrust, signRequest, signingAudience, validateSigningRequest } from "./development-signing.mjs";

async function run() {
  const root = realpathSync(process.argv[2]), parent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
  assert.ok(root.startsWith(parent + "/flux-v2-auth-pg-") && (statSync(root).mode & 0o777) === 0o700);
  const directory = join(root, "offline-issuer"), approvals = join(root, "offline-approvals");
  mkdirSync(approvals, { mode: 0o700 });
  const tool = join(dirname(fileURLToPath(import.meta.url)), "development-signing.mjs");
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "development" };
  const initialized = spawnSync(process.execPath, [tool, "init", "--environment", "flux-v2-dev/develop", "--key-directory", directory], { env, encoding: "utf8" });
  assert.equal(initialized.status, 0);
  assert.ok(!initialized.stdout.includes("PRIVATE KEY") && !initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).publicKeySha256.length, 64);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(directory, "issuer-private.pem")).mode & 0o777, 0o600);
  const trust = JSON.parse(readFileSync(join(directory, "trust.json"), "utf8"));
  assert.equal(trust.audience, signingAudience);
  assert.ok(trust.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----"));
  assert.throws(() => initializeSigner(directory));
  assert.throws(() => initializeSigner(join(dirname(tool), "forbidden-signer-fixture")));
  const destination = join(root, "executor-public-trust");
  installPublicTrust(directory, destination);
  assert.deepEqual(JSON.parse(readFileSync(join(destination, "trust.json"), "utf8")), trust);
  assert.equal(statSync(join(destination, "trust.json")).mode & 0o777, 0o600);
  assert.ok(!existsSync(join(destination, "issuer-private.pem")));
  assert.throws(() => installPublicTrust(directory, destination));
  for (const [environment, variables] of [["production", env], ["unknown", env],
    ["flux-v2-dev/develop", { ...env, NODE_ENV: "production" }], ["flux-v2-dev/develop", { ...env, CI: "1" }]]) {
    const result = spawnSync(process.execPath, [tool, "init", "--environment", environment, "--key-directory", join(root, "rejected-issuer")], { env: variables, encoding: "utf8" });
    assert.ok(result.status !== 0 && !existsSync(join(root, "rejected-issuer")));
  }

  const now = Date.now();
  const request = { operation: "BOOTSTRAP_DIRECTOR", audience: signingAudience, actorUserId: "fixture-operator", targetUserId: "fixture-director",
    expectedVersion: null, reason: "Independent fixture approval", changeId: randomUUID(), issuedAt: now - 1000, expiresAt: now + 60000 };
  const expected = { operation: request.operation, actorUserId: request.actorUserId, targetUserId: request.targetUserId };
  const payload = JSON.stringify(request), requestFile = join(approvals, "request.json"), approvalFile = join(approvals, "approval.json");
  writeFileSync(requestFile, payload, { mode: 0o600 });
  for (const change of [{ audience: "other-database" }, { operation: "INITIAL_TECHNICAL_ADMIN" }, { actorUserId: "other" }, { targetUserId: "other" },
    { expectedVersion: 1 }, { reason: " " }, { reason: "Control\x1b" }, { changeId: "invalid" }, { expiresAt: now - 1 },
    { issuedAt: now + 60000 }, { expiresAt: now + 900000 }, { extra: true }]) {
    assert.throws(() => validateSigningRequest(JSON.stringify({ ...request, ...change }), expected, now));
  }
  await assert.rejects(signRequest(directory, requestFile, approvalFile, expected, async () => "not approved"));
  assert.ok(!existsSync(approvalFile));
  chmodSync(requestFile, 0o644);
  await assert.rejects(signRequest(directory, requestFile, approvalFile, expected, async (_, confirmation) => confirmation));
  chmodSync(requestFile, 0o600);
  const link = join(approvals, "linked-request.json");
  symlinkSync(requestFile, link);
  await assert.rejects(signRequest(directory, link, approvalFile, expected, async (_, confirmation) => confirmation));
  await signRequest(directory, requestFile, approvalFile, expected, async (shown, confirmation) => {
    assert.deepEqual(shown, request); return confirmation;
  });
  const envelope = JSON.parse(readFileSync(approvalFile, "utf8"));
  assert.equal(envelope.payload, payload);
  assert.ok(verify(null, Buffer.from(payload), trust.publicKeyPem, Buffer.from(envelope.signature, "base64url")));
  assert.ok(!verify(null, Buffer.from(payload + " "), trust.publicKeyPem, Buffer.from(envelope.signature, "base64url")));
  assert.equal(statSync(approvalFile).mode & 0o777, 0o600);
  await assert.rejects(signRequest(directory, requestFile, approvalFile, expected, async (_, confirmation) => confirmation));
  const noninteractive = spawnSync(process.execPath, [tool, "sign", "--environment", "flux-v2-dev/develop", "--key-directory", directory,
    "--request-file", requestFile, "--approval-file", join(approvals, "noninteractive.json"), "--operation", expected.operation,
    "--operator-id", expected.actorUserId, "--target-id", expected.targetUserId], { env, encoding: "utf8" });
  assert.ok(noninteractive.status !== 0 && noninteractive.stderr.includes("LOCAL_INTERACTIVE_SIGNER_REQUIRED"));
  assert.ok(!existsSync(join(approvals, "noninteractive.json")));
  console.log("PASS: offline Ed25519 key/public-trust creation, environment/audience/operation/operator/target/version/reason/expiry/change-ID binding, exact-byte signatures, protected files, no overwrite, explicit signing approval and noninteractive denial.");
}

run().catch(() => { console.error("FAIL: isolated signing workflow. Sensitive fixture contents withheld."); process.exitCode = 1; });

import { createPublicKey, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { AuthorizationMutationError } from "../../src/lib/authorization/assignment-transaction";
import { accounts, approvedTarget, audience, confirmation, environmentName, manifestFingerprint, ProvisioningError, requireProvisioning } from "./accounts";
import { applySignedSetup, assignRemaining, databasePreflight, digest, PartialAssignmentError, provisionIdentities, publicState, setupTarget, type Manifest } from "./core";
import { terminalInput } from "./terminal";
import { createHash } from "node:crypto";

const steps = ["identities", "bootstrap-director", "bootstrap-technical", "business-roles", "technical-roles"] as const;
type Step = typeof steps[number];
const help = `Private FLUX development provisioning (no emails, no runtime permission activation).
Usage: pnpm users:v2 <plan|apply|verify> --environment ${environmentName}
  [--step ${steps.join("|")}] [--operator-email <approved account>]
  [--approval-file <absolute signed-envelope path>] [--reason <non-secret reason>]
apply requires a real local TTY, the exact target/manifest confirmation, and a step.
Passwords and existing application session tokens are entered only at masked prompts.
No --password, --session, --yes, custom database URL, or signing-key option exists.`;

function parseArguments(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) { console.log(help); return null; }
  const [mode, ...rest] = args;
  requireProvisioning(["plan", "apply", "verify"].includes(mode), "INVALID_MODE_USE_HELP");
  const allowed = new Set(["--environment", "--step", "--operator-email", "--approval-file", "--reason"]);
  const options: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    requireProvisioning(allowed.has(key) && !(key in options) && value && !value.startsWith("--"), "UNSUPPORTED_OR_DUPLICATE_ARGUMENT");
    options[key] = value;
  }
  const step = options["--step"] as Step | undefined;
  requireProvisioning(!step || steps.includes(step), "INVALID_STEP");
  requireProvisioning(mode !== "apply" || step, "EXPLICIT_APPLY_STEP_REQUIRED");
  requireProvisioning(options["--environment"] === environmentName, "DEVELOPMENT_ENVIRONMENT_REQUIRED");
  return { mode, options, step };
}

function protectedFile(path: string, repository: string) {
  requireProvisioning(isAbsolute(path), "PROTECTED_FILE_REQUIRES_ABSOLUTE_PATH");
  const parent = realpathSync(dirname(path));
  const rel = relative(repository, parent);
  requireProvisioning(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel), "PROTECTED_FILES_MUST_BE_OUTSIDE_REPOSITORY");
  const directory = lstatSync(parent);
  requireProvisioning(directory.uid === process.getuid?.() && (directory.mode & 0o077) === 0, "PROTECTED_DIRECTORY_REQUIRES_OWNER_ONLY_ACCESS");
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    requireProvisioning(stat.isFile() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0 && stat.size <= 16384,
      "PROTECTED_FILE_REQUIRES_OWNER_ONLY_ACCESS");
    const content = readFileSync(descriptor, "utf8");
    requireProvisioning(!/PRIVATE KEY/.test(content), "PRIVATE_SIGNING_KEYS_FORBIDDEN");
    return content;
  } finally { closeSync(descriptor); }
}

function trustedKey(repository: string) {
  // Trusted local composition, not a public request/command-supplied key or audience.
  const path = join(homedir(), ".config", "flux-v2-development", "trust.json");
  requireProvisioning(existsSync(path), "INDEPENDENT_SIGNING_AUTHORITY_NOT_CONFIGURED");
  const config = JSON.parse(protectedFile(path, repository));
  requireProvisioning(config && Object.keys(config).sort().join(",") === "audience,publicKeyPem" && config.audience === audience &&
    typeof config.publicKeyPem === "string" && config.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----"), "INVALID_TRUST_CONFIGURATION");
  requireProvisioning(createPublicKey(config.publicKeyPem).asymmetricKeyType === "ed25519", "ED25519_PUBLIC_KEY_REQUIRED");
  return config.publicKeyPem as string;
}

function migrationManifest(repository: string): Manifest {
  const root = join(repository, "prisma", "migrations");
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    .map((name) => ({ name, checksum: createHash("sha256").update(readFileSync(join(root, name, "migration.sql"))).digest("hex") }));
}

function checkSchema(repository: string, direct: URL) {
  const url = new URL(direct);
  url.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=30000");
  const args = [process.env.FLUX_PROVISION_PRISMA_CLI!, "migrate", "diff", "--from-schema-datasource", join(repository, "prisma/schema.prisma"),
    "--to-schema-datamodel", join(repository, "prisma/schema.prisma"), "--script", "--exit-code"];
  const result = spawnSync(process.execPath, args, { cwd: repository, encoding: "utf8", timeout: 90000,
    env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", DATABASE_URL: url.toString(), CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
  // Never relay raw Prisma errors: they may embed URLs, SQL or credentials.
  requireProvisioning(result.status === 0 && /This is an empty migration/.test(result.stdout), "SCHEMA_DIFF_FAILED_OR_DRIFT_DETECTED");
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (!parsed) return;
  const { mode, options, step } = parsed;
  const repository = realpathSync(process.env.FLUX_PROVISION_REPOSITORY ?? "missing-repository");
  const target = approvedTarget(process.env.DATABASE_URL ?? "", options["--environment"], process.env.NODE_ENV);
  const manifest = migrationManifest(repository);
  const authorizationSql = readFileSync(join(repository, "prisma/migrations/20261018120000_v2_authorization_foundation/migration.sql"), "utf8");
  const direct = new URL(target.direct);
  // plan/verify cannot write, including if future preflight logic changes.
  const readUrl = new URL(direct);
  readUrl.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=30000");
  const reader = new PrismaClient({ datasourceUrl: readUrl.toString(), log: [] });
  let writer: PrismaClient | undefined;
  try {
    const preflight = await databasePreflight(reader, manifest, authorizationSql);
    requireProvisioning(preflight.identity.database === "neondb" && preflight.identity.schema === "public" && preflight.identity.major === 18,
      "DATABASE_IDENTITY_OR_VERSION_MISMATCH");
    checkSchema(repository, direct);
    let signing: string;
    try { trustedKey(repository); signing = "PUBLIC_VERIFICATION_KEY_CONFIGURED; independent issuer approval still required"; }
    catch (error) { signing = error instanceof ProvisioningError ? error.code : "INVALID_OR_UNREADABLE_TRUST_CONFIGURATION"; }
    console.log(JSON.stringify({ environment: environmentName, database: preflight.identity, pooledFingerprint: "9d6f1df51a9db284",
      directFingerprint: "5b001dbfcdb263fa", manifestFingerprint, audience, migrations: preflight.migrationCount, schemaDrift: "NONE",
      accounts: publicState(preflight.state), counts: preflight.counts, directors: preflight.state.directors,
      technicalAdministrators: preflight.state.technicalAdministrators, auditCount: preflight.state.auditCount, signing,
      legacyRuntime: "All nine identities use USER. V2 UI authority is inactive.", confirmationRequired: confirmation }, null, 2));
    if (mode === "verify") {
      requireProvisioning(preflight.state.users.length === 9 && preflight.state.users.every((user) => user.authorization) &&
        preflight.state.directors === 1 && preflight.state.technicalAdministrators === 2, "PROVISIONING_INCOMPLETE_NO_CHANGES_MADE");
      return;
    }
    const setup = step === "bootstrap-director" || step === "bootstrap-technical" ? step : undefined;
    if (mode === "plan") {
      if (setup) {
        const actor = preflight.state.users.find((user) => user.email === options["--operator-email"]);
        const subject = preflight.state.users.find((user) => user.email === setupTarget(setup).email);
        requireProvisioning(preflight.state.users.length === 9 && actor && subject, "EXISTING_OPERATOR_AND_ALL_NINE_IDENTITIES_REQUIRED");
        requireProvisioning(options["--reason"]?.trim(), "ROLE_CHANGE_REASON_REQUIRED");
        const now = Date.now();
        const payload = JSON.stringify({ operation: setup === "bootstrap-director" ? "BOOTSTRAP_DIRECTOR" : "INITIAL_TECHNICAL_ADMIN", audience,
          actorUserId: actor.id, targetUserId: subject.id, expectedVersion: subject.authorization?.authorizationVersion ?? null,
          reason: options["--reason"], changeId: randomUUID(), issuedAt: now, expiresAt: now + 600000 });
        console.log(JSON.stringify({ unsignedPayload: payload, instruction: "Independently authenticate and authorize the operator, then sign these exact UTF-8 bytes outside this process. This is not an authorization." }, null, 2));
      }
      return;
    }
    requireProvisioning(process.stdin.isTTY && process.stdout.isTTY, "LOCAL_INTERACTIVE_TERMINAL_REQUIRED");
    let key: string | undefined, envelope: { payload: string; signature: string } | undefined;
    if (setup) {
      key = trustedKey(repository);
      requireProvisioning(options["--operator-email"] && accounts.some((account) => account.email === options["--operator-email"]), "APPROVED_OPERATOR_IDENTITY_REQUIRED");
      requireProvisioning(options["--approval-file"], "INDEPENDENT_SIGNED_APPROVAL_REQUIRED");
      envelope = JSON.parse(protectedFile(options["--approval-file"], repository));
      requireProvisioning(envelope && typeof envelope.payload === "string" && typeof envelope.signature === "string" &&
        Object.keys(envelope).sort().join(",") === "payload,signature", "INVALID_SETUP_ENVELOPE");
    }
    if (step === "business-roles" || step === "technical-roles") requireProvisioning(options["--reason"]?.trim(), "ROLE_CHANGE_REASON_REQUIRED");
    const operator = await terminalInput("Actual provisioning operator (non-secret name/reference)");
    requireProvisioning(operator.trim().length > 0 && operator.length <= 256, "OPERATOR_ATTRIBUTION_REQUIRED");
    requireProvisioning(await terminalInput(`Type ${confirmation} to authorize ONLY ${step}`) === confirmation, "CONFIRMATION_DID_NOT_MATCH");
    // Recheck the complete preflight after the potentially long operator approval wait.
    const fresh = await databasePreflight(reader, manifest, authorizationSql);
    requireProvisioning(digest(fresh.state) === digest(preflight.state), "STATE_CHANGED_REPLAN_REQUIRED");
    checkSchema(repository, direct);
    writer = new PrismaClient({ datasourceUrl: direct.toString(), log: [] });
    if (step === "identities") {
      const result = await provisionIdentities(writer, async (email) => ({
        password: await terminalInput(`Unique password for ${email}`, true), confirmation: await terminalInput("Confirm password", true),
      }));
      // User has no creation-audit model. This safe operator receipt complements, but does not replace, V2 role audit records.
      console.log(JSON.stringify({ event: "IDENTITIES_PROVISIONED", operator, environment: environmentName, manifestFingerprint, ...result }));
    } else if (setup) {
      await applySignedSetup(writer, setup, options["--operator-email"], key!, envelope!);
      console.log(JSON.stringify({ event: "SIGNED_BOOTSTRAP_COMMITTED", step: setup }));
    } else {
      let token = await terminalInput(`Existing application session token for ${step === "business-roles" ? accounts[0].email : accounts[7].email}`, true);
      try { await assignRemaining(writer, step === "business-roles" ? "business" : "technical", token, options["--reason"]); }
      finally { token = ""; }
      console.log(JSON.stringify({ event: "AUTHORIZED_ASSIGNMENTS_COMMITTED", step }));
    }
    const result = await databasePreflight(reader, manifest, authorizationSql);
    console.log(JSON.stringify({ event: "VERIFIED_AFTER_OPERATION", accounts: publicState(result.state), auditCount: result.state.auditCount,
      directors: result.state.directors, technicalAdministrators: result.state.technicalAdministrators }, null, 2));
  } finally { await writer?.$disconnect(); await reader.$disconnect(); }
}

main().catch((error: unknown) => {
  if (error instanceof PartialAssignmentError) {
    console.error(JSON.stringify({ completedAssignments: error.completed, interruptedTarget: error.attempted,
      instruction: "Run plan to determine the authoritative result, including any uncertain commit. Resume the same authorized step; matching assignments are no-ops." }));
  }
  const code = error instanceof ProvisioningError || error instanceof AuthorizationMutationError ? error.code : "OPERATION_FAILED_CHECK_STATE_WITH_PLAN";
  console.error(`Provisioning stopped: ${code}. No automatic cleanup, password replacement, reset or rollback of prior successful steps was attempted. Run plan before resuming.`);
  process.exitCode = 1;
});

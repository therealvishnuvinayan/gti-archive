// Private local coordinator: delegates all database, signature and session work
// to the existing CLIs. No .env loading, database client or private-key reads here.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const environment = "flux-v2-dev/develop";
const manifest = "6c64549f4682ae1b";
const audience = `flux-v2-dev:develop:neondb:5b001dbfcdb263fa:${manifest}`;
const business = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DESIGNER", "DESIGNER", "DIGITAL_LEAD", null, null];
const emails = ["director", "spm1", "spm2", "jpm1", "designer1", "designer2", "digitallead1", "developer1", "developer2"].map((name) => `${name}@example.test`);
const assignmentOrder = [0, 7, 1, 2, 3, 4, 5, 6, 8];
class WorkflowError extends Error {}
function check(condition, code) { if (!condition) throw new WorkflowError(code); }

export function validatePlan(plan) {
  check(plan?.environment === environment && plan.database?.database === "neondb" && plan.database?.schema === "public" &&
    plan.database?.major === 18 && plan.database?.readOnly === "on" && plan.pooledFingerprint === "9d6f1df51a9db284" &&
    plan.directFingerprint === "5b001dbfcdb263fa" && plan.manifestFingerprint === manifest && plan.audience === audience &&
    plan.migrations === 104 && plan.schemaDrift === "NONE", "APPROVED_DATABASE_PREFLIGHT_REQUIRED");
  check(plan.signing?.startsWith("PUBLIC_VERIFICATION_KEY_CONFIGURED"), "EXISTING_PUBLIC_TRUST_REQUIRED");
  check(Array.isArray(plan.accounts) && plan.accounts.length === 9 && plan.counts?.User === 9 &&
    new Set(plan.accounts.map((account) => account.id)).size === 9, "EXACT_NINE_IDENTITIES_REQUIRED");
  const users = emails.map((email, index) => {
    const user = plan.accounts.find((account) => account.email === email);
    check(user && typeof user.id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(user.id) && user.identity === "PRESENT" && user.legacyRole === "USER" &&
      user.businessRole === business[index] && JSON.stringify(user.technicalPrivileges) === JSON.stringify(index >= 7 ? ["TECHNICAL_ADMIN"] : []) &&
      ((user.assignment === "MATCHES" && user.authorizationVersion === 1) ||
       (user.assignment === "PENDING" && user.authorizationVersion === null)), "UNEXPECTED_IDENTITY_OR_ASSIGNMENT");
    return user;
  });
  const completed = users.filter((user) => user.assignment === "MATCHES");
  check(users[0].assignment === "MATCHES" && plan.directors === 1, "EXISTING_SOLE_DIRECTOR_REQUIRED");
  let pendingSeen = false;
  for (const index of assignmentOrder) {
    if (users[index].assignment === "PENDING") pendingSeen = true;
    else check(!pendingSeen, "ASSIGNMENTS_OUT_OF_APPROVED_ORDER");
  }
  check(plan.technicalAdministrators === users.slice(7).filter((user) => user.assignment === "MATCHES").length &&
    plan.counts.UserAuthorization === completed.length && plan.counts.UserAuthorizationChange === completed.length &&
    plan.auditCount === completed.length && Array.isArray(plan.authorizationAudit) && plan.authorizationAudit.length === completed.length,
  "INITIAL_AUTHORIZATION_COUNTS_MISMATCH");
  check(new Set(plan.authorizationAudit.map((entry) => entry.changeId)).size === completed.length, "DUPLICATE_INITIAL_CHANGE_ID");
  for (const user of completed) {
    const entries = plan.authorizationAudit.filter((entry) => entry.userId === user.id);
    const actor = user.email === emails[0] || users.indexOf(user) >= 7 ? users[7] : users[0];
    check(entries.length === 1 && entries[0].authorizationVersion === 1 && entries[0].actorUserId === actor.id &&
      typeof entries[0].reason === "string" && entries[0].reason.trim() &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entries[0].changeId),
    "INITIAL_AUDIT_ATTRIBUTION_MISMATCH");
  }
  return users;
}

function verifyProgress(before, after, targetEmails) {
  const previous = validatePlan(before), current = validatePlan(after);
  for (const user of previous) {
    const next = current.find((row) => row.email === user.email);
    check(next.id === user.id, "IDENTITY_CHANGED_DURING_WORKFLOW");
    if (targetEmails.includes(user.email)) check(next.assignment === "MATCHES", "EXPECTED_ASSIGNMENT_NOT_COMMITTED");
    else check(JSON.stringify(next) === JSON.stringify(user), "UNEXPECTED_ASSIGNMENT_DURING_WORKFLOW");
  }
  check(before.authorizationAudit.every((entry) => after.authorizationAudit.some((next) => JSON.stringify(next) === JSON.stringify(entry))),
    "EXISTING_AUDIT_CHANGED_DURING_WORKFLOW");
}

// Dependency injection is only for isolated tests; the executable has no hooks,
// target overrides, session/password flags or unattended approval mode.
export async function completeRemaining(io) {
  let plan = await io.plan();
  let users = validatePlan(plan);
  io.report(plan);
  async function verifyStep(targetEmails) {
    const after = await io.plan();
    verifyProgress(plan, after, targetEmails);
    plan = after;
    users = validatePlan(plan);
    io.report(plan);
  }
  if (users[7].assignment === "PENDING") {
    const files = await io.exportRequest(users[7].id);
    await io.sign(files, users[7].id);
    await io.apply("bootstrap-technical", files);
    await verifyStep([emails[7]]);
  }
  if (users.slice(1, 7).some((user) => user.assignment === "PENDING")) {
    await io.apply("business-roles");
    await verifyStep(emails.slice(1, 7));
  }
  if (users[8].assignment === "PENDING") {
    await io.apply("technical-roles");
    await verifyStep([emails[8]]);
  }
  const final = await io.verify();
  verifyProgress(plan, final, []);
  check(validatePlan(final).every((user) => user.assignment === "MATCHES"), "ROLE_INITIALIZATION_INCOMPLETE");
  io.report(final);
  return final;
}

export function requireLocalInvocation(args, env, interactive) {
  check(args.length === 2 && args[0] === "--environment" && args[1] === environment, "EXACT_DEVELOPMENT_ENVIRONMENT_REQUIRED");
  check(!env.CI && !env.VERCEL && (!env.NODE_ENV || env.NODE_ENV === "development"), "LOCAL_DEVELOPMENT_ONLY");
  check(interactive, "LOCAL_INTERACTIVE_TERMINAL_REQUIRED");
}

export function childEnvironment(env, signer = false) {
  const result = { PATH: env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "development" };
  // Preserve a shell URL for the existing launcher's precedence conflict check.
  // The offline signer never receives it or any other application credential.
  if (!signer && env.DATABASE_URL) result.DATABASE_URL = env.DATABASE_URL;
  return result;
}

function report(plan) {
  const users = validatePlan(plan);
  console.table(users.map((user) => ({ email: user.email, state: user.assignment, legacy: user.legacyRole,
    businessRole: user.assignment === "MATCHES" ? user.businessRole : null,
    technicalPrivileges: user.assignment === "MATCHES" ? user.technicalPrivileges.join(",") : "",
    version: user.authorizationVersion })));
  console.log(JSON.stringify({ directors: plan.directors, technicalAdministrators: plan.technicalAdministrators,
    auditCount: plan.auditCount, completed: users.filter((user) => user.assignment === "MATCHES").map((user) => user.email),
    pending: users.filter((user) => user.assignment === "PENDING").map((user) => user.email) }));
}

async function main() {
  requireLocalInvocation(process.argv.slice(2), process.env, process.stdin.isTTY && process.stdout.isTTY);
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const launcher = join(repository, "scripts/development-users.mjs");
  const approvals = join(homedir(), ".config/flux-v2-development/approvals");
  function run(tool, args, capture = false, signer = false) {
    const result = spawnSync(process.execPath, [tool, ...args], { cwd: repository,
      env: childEnvironment(process.env, signer), stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8", maxBuffer: 1024 * 1024 });
    check(result.status === 0, "CHILD_PROCESS_STOPPED_REVIEW_STATE");
    return result.stdout;
  }
  function read(mode = "plan") {
    console.log(`Read-only ${mode}: verifying approved endpoint, migrations, schema, assignments and audit history...`);
    const output = run(launcher, [mode, "--environment", environment], true);
    try { return JSON.parse(output); } catch { throw new WorkflowError("INVALID_PREFLIGHT_OUTPUT"); }
  }
  try {
    const final = await completeRemaining({ plan: () => read(), verify: () => read("verify"), report,
      exportRequest: () => {
        // Always a fresh UUID filename and new service-generated change ID. Old
        // requests/envelopes are never reused, overwritten, deleted or renewed.
        const id = randomUUID();
        const files = { request: join(approvals, `technical-request-${id}.json`), approval: join(approvals, `technical-approval-${id}.json`) };
        run(launcher, ["plan", "--environment", environment, "--step", "bootstrap-technical", "--operator-email", emails[7],
          "--reason", "Independently approved initial development Technical Administrator setup", "--request-file", files.request]);
        return files;
      },
      sign: (files, operatorId) => {
        console.log("Independent signing authority: review the displayed request and explicitly approve it. No database writes occur in this process.");
        run(join(repository, "scripts/development-signing.mjs"), ["sign", "--environment", environment,
          "--key-directory", join(homedir(), ".config/flux-v2-development-signer"), "--request-file", files.request,
          "--approval-file", files.approval, "--operation", "INITIAL_TECHNICAL_ADMIN", "--operator-id", operatorId, "--target-id", operatorId], false, true);
      },
      apply: (step, files) => {
        const args = ["apply", "--environment", environment, "--step", step];
        if (step === "bootstrap-technical") args.push("--operator-email", emails[7], "--approval-file", files.approval);
        else {
          const email = step === "business-roles" ? emails[0] : emails[7];
          console.log(`Sign in normally to local FLUX as ${email}. Use that browser login's gti_session cookie ONLY at the CLI's masked session prompt. Never paste it into chat or a command. Passwords stay in the existing browser login.`);
          args.push("--reason", step === "business-roles" ? "Approved initial development business role assignments" :
            "Approved development Technical Administrator assignment for Developer Two");
        }
        // Inherit the real terminal; never supply confirmations or session tokens.
        run(launcher, args);
      },
    });
    console.log(JSON.stringify({ event: "REMAINING_ROLE_INITIALIZATION_VERIFIED", authorizationAudit: final.authorizationAudit }));
    console.log("Phase 1.4F complete. Legacy USER compatibility and inactive V2 runtime authorization preserved. Stop before Phase 1.5.");
  } catch (error) {
    console.error(`Role workflow stopped: ${error instanceof WorkflowError ? error.message : "UNEXPECTED_WORKFLOW_FAILURE"}. No write retry will run.`);
    // Reconcile an uncertain commit using only the existing read-only reader.
    try { report(read()); }
    catch { console.error("Authoritative state could not be verified. Stop; do not rerun writes until the discrepancy is reviewed."); }
    console.error("For a verified partial result, review completed/pending accounts before manually rerunning this same command. Existing assignments are retained.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Role workflow stopped: ${error instanceof WorkflowError ? error.message : "LOCAL_CONFIGURATION_FAILURE"}.`);
    process.exitCode = 1;
  });
}

import { createHash } from "node:crypto";
import type { BusinessRole, TechnicalPrivilege } from "../../src/lib/authorization/definitions";

type Account = { name: string; email: string; businessRole: BusinessRole | null; technicalPrivileges: readonly TechnicalPrivilege[] };

// An explicit development manifest, never a general-purpose user import.
export const accounts: readonly Account[] = Object.freeze([
  { name: "Slavomir Kluziak", email: "director@example.test", businessRole: "DIRECTOR", technicalPrivileges: [] },
  { name: "Senior PM One", email: "spm1@example.test", businessRole: "SENIOR_PROJECT_MANAGER", technicalPrivileges: [] },
  { name: "Senior PM Two", email: "spm2@example.test", businessRole: "SENIOR_PROJECT_MANAGER", technicalPrivileges: [] },
  { name: "Junior PM One", email: "jpm1@example.test", businessRole: "JUNIOR_PROJECT_MANAGER", technicalPrivileges: [] },
  { name: "Designer One", email: "designer1@example.test", businessRole: "DESIGNER", technicalPrivileges: [] },
  { name: "Designer Two", email: "designer2@example.test", businessRole: "DESIGNER", technicalPrivileges: [] },
  { name: "Digital Lead One", email: "digitallead1@example.test", businessRole: "DIGITAL_LEAD", technicalPrivileges: [] },
  { name: "Developer One", email: "developer1@example.test", businessRole: null, technicalPrivileges: ["TECHNICAL_ADMIN"] },
  { name: "Developer Two", email: "developer2@example.test", businessRole: null, technicalPrivileges: ["TECHNICAL_ADMIN"] },
].map((account) => Object.freeze({ ...account, technicalPrivileges: Object.freeze(account.technicalPrivileges) })) as Account[]);

export const manifestFingerprint = createHash("sha256").update(JSON.stringify(accounts)).digest("hex").slice(0, 16);
export const environmentName = "flux-v2-dev/develop";
export const audience = `flux-v2-dev:develop:neondb:5b001dbfcdb263fa:${manifestFingerprint}`;
export const confirmation = `APPLY flux-v2-dev develop nine accounts ${manifestFingerprint}`;

export class ProvisioningError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ProvisioningError"; }
}
export function requireProvisioning(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ProvisioningError(code);
}

export function endpointFingerprint(url: URL) {
  return createHash("sha256").update(`${url.hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`).digest("hex").slice(0, 16);
}

export function approvedTarget(raw: string, environment: string, nodeEnvironment?: string) {
  requireProvisioning(environment === environmentName && nodeEnvironment !== "production", "DEVELOPMENT_ENVIRONMENT_REQUIRED");
  let url: URL;
  try { url = new URL(raw); } catch { throw new ProvisioningError("INVALID_DATABASE_CONFIGURATION"); }
  const host = "ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech";
  requireProvisioning(["postgres:", "postgresql:"].includes(url.protocol) &&
    url.hostname === host && (!url.port || url.port === "5432") && url.pathname === "/neondb" &&
    url.searchParams.get("sslmode") === "require" && url.username && url.password && !url.hash,
  "DATABASE_NOT_ALLOWLISTED");
  const allowed = new Set(["sslmode", "channel_binding", "connect_timeout", "connection_limit", "pool_timeout", "pgbouncer", "schema"]);
  const keys = [...url.searchParams.keys()];
  requireProvisioning(keys.every((key) => allowed.has(key)) && new Set(keys).size === keys.length &&
    (!url.searchParams.has("schema") || url.searchParams.get("schema") === "public"), "UNSAFE_DATABASE_OPTIONS");
  requireProvisioning(endpointFingerprint(url) === "9d6f1df51a9db284", "DATABASE_NOT_ALLOWLISTED");
  const direct = new URL(url);
  direct.hostname = host.replace("-pooler.", ".");
  direct.searchParams.delete("pgbouncer");
  direct.searchParams.set("connection_limit", "1");
  direct.searchParams.set("connect_timeout", "20");
  requireProvisioning(endpointFingerprint(direct) === "5b001dbfcdb263fa", "DATABASE_NOT_ALLOWLISTED");
  return { pooled: url, direct };
}

export type SharedTestPasswordContext = { databaseUrl: string; environment: string; nodeEnvironment?: string };

export function requireSharedTestPasswordAllowed(context: SharedTestPasswordContext, accountManifest = accounts) {
  approvedTarget(context.databaseUrl, context.environment, context.nodeEnvironment);
  requireProvisioning(context.nodeEnvironment === "development", "SHARED_PASSWORD_DEVELOPMENT_ONLY");
  // Pin the approved identities, names and intended roles independently of the mutable source manifest digest.
  const fingerprint = createHash("sha256").update(JSON.stringify(accountManifest)).digest("hex").slice(0, 16);
  requireProvisioning(fingerprint === "6c64549f4682ae1b" && accountManifest.length === 9 &&
    accountManifest.every((account) => /^[^@\s]+@example\.test$/.test(account.email)), "SHARED_PASSWORD_MANIFEST_NOT_APPROVED");
}

export const provisioningSteps = ["identities", "bootstrap-director", "bootstrap-technical", "business-roles", "technical-roles"] as const;
type Step = typeof provisioningSteps[number];

export function parseProvisioningArguments(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) return null;
  const [mode, ...rest] = args;
  requireProvisioning(["plan", "apply", "verify"].includes(mode), "INVALID_MODE_USE_HELP");
  const allowed = new Set(["--environment", "--step", "--operator-email", "--approval-file", "--reason", "--request-file"]);
  const options: Record<string, string> = {};
  let sharedTestPassword = false;
  for (let index = 0; index < rest.length;) {
    const key = rest[index++];
    if (key === "--shared-test-password") {
      requireProvisioning(!sharedTestPassword, "UNSUPPORTED_OR_DUPLICATE_ARGUMENT");
      sharedTestPassword = true;
      continue;
    }
    const value = rest[index++];
    requireProvisioning(allowed.has(key) && !(key in options) && value && !value.startsWith("--"), "UNSUPPORTED_OR_DUPLICATE_ARGUMENT");
    options[key] = value;
  }
  const step = options["--step"] as Step | undefined;
  requireProvisioning(!step || provisioningSteps.includes(step), "INVALID_STEP");
  requireProvisioning(mode !== "apply" || step, "EXPLICIT_APPLY_STEP_REQUIRED");
  requireProvisioning(options["--environment"] === environmentName, "DEVELOPMENT_ENVIRONMENT_REQUIRED");
  requireProvisioning(!sharedTestPassword || (mode === "apply" && step === "identities"), "SHARED_PASSWORD_IDENTITIES_APPLY_ONLY");
  requireProvisioning(!options["--request-file"] || (mode === "plan" && (step === "bootstrap-director" || step === "bootstrap-technical")),
    "REQUEST_EXPORT_REQUIRES_BOOTSTRAP_PLAN");
  return { mode, options, step, sharedTestPassword };
}

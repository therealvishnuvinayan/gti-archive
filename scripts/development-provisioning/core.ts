import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hashAuthPassword, normalizeAuthEmail, verifyAuthPassword } from "../../src/lib/auth-password";
import { getPasswordValidationErrors } from "../../src/lib/password-rules";
import { createDirectorBootstrapInvoker, createInitialTechnicalAdministratorInvoker } from "../../src/lib/authorization/director-bootstrap";
import { createRoleAssignmentService } from "../../src/lib/authorization/role-assignment-service";
import { accounts, audience, requireProvisioning, requireSharedTestPasswordAllowed, type SharedTestPasswordContext } from "./accounts";

export class PartialAssignmentError extends Error {
  constructor(readonly completed: readonly string[], readonly attempted: string | null) {
    super("ASSIGNMENT_STEP_STOPPED_RECHECK_AUTHORITATIVE_STATE");
  }
}

const identitySelect = { id: true, email: true, name: true, role: true, projectCreationAccessGranted: true,
  authorization: true } satisfies Prisma.UserSelect;
type Reader = Pick<Prisma.TransactionClient, "user" | "userAuthorizationChange" | "$queryRawUnsafe">;
export type Manifest = readonly { name: string; checksum: string }[];
export type State = Awaited<ReturnType<typeof inspectState>>;

/** Safe error codes only: no supplied password, hash, session or raw Prisma error. */
export function validatePassword(password: string, confirmation: string, email: string) {
  requireProvisioning(password === confirmation, "PASSWORD_CONFIRMATION_MISMATCH");
  requireProvisioning(getPasswordValidationErrors(password).length === 0, "APPLICATION_PASSWORD_POLICY_FAILED");
  requireProvisioning(password.length >= 16 && password.length <= 256 && password.trim() === password &&
    !/[\x00-\x1f\x7f]/.test(password), "USE_16_TO_256_CHARACTERS_WITHOUT_CONTROL_CHARACTERS");
  const folded = password.toLowerCase().replace(/[@]/g, "a").replace(/[0]/g, "o").replace(/[1!]/g, "i").replace(/[$5]/g, "s");
  const account = accounts.find((item) => item.email === email);
  requireProvisioning(account, "UNEXPECTED_ACCOUNT");
  const obvious = ["password", "qwerty", "letmein", "welcome", "changeme", "admin", "gulbahar", "flux",
    ...account.name.toLowerCase().split(/\s+/).filter((word) => word.length >= 4), email.split("@")[0]];
  requireProvisioning(!obvious.some((word) => folded.includes(word)) && new Set(password).size >= 8 &&
    !/(.{1,6})\1{2,}/.test(password) && !/123456|654321|abcdef|fedcba|asdfgh|zxcvbn/.test(password.toLowerCase()), "OBVIOUSLY_WEAK_PASSWORD");
}

export async function inspectState(db: Reader) {
  const users = await db.user.findMany({ select: identitySelect, orderBy: { email: "asc" } });
  requireProvisioning(users.length <= accounts.length, "UNEXPECTED_ACCOUNTS_PRESENT");
  for (const user of users) {
    const intended = accounts.find((account) => account.email === normalizeAuthEmail(user.email));
    requireProvisioning(intended && user.email === intended.email && user.name === intended.name &&
      user.role === "USER" && !user.projectCreationAccessGranted, "EXISTING_IDENTITY_CONFLICT");
    if (user.authorization) {
      const row = user.authorization;
      requireProvisioning(row.accountStatus === "ACTIVE" && row.businessRole === intended.businessRole &&
        JSON.stringify(row.technicalPrivileges) === JSON.stringify(intended.technicalPrivileges), "EXISTING_AUTHORIZATION_CONFLICT");
    }
  }
  requireProvisioning(new Set(users.map((user) => normalizeAuthEmail(user.email))).size === users.length, "DUPLICATE_ACCOUNT_IDENTITY");
  const history = await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] });
  for (const user of users) {
    const entries = history.filter((entry) => entry.userId === user.id);
    requireProvisioning(entries.length === (user.authorization?.authorizationVersion ?? 0), "AUDIT_VERSION_GAP");
    for (const [index, entry] of entries.entries()) {
      requireProvisioning(entry.authorizationVersion === index + 1 && entry.reason.trim() && entry.changeId.trim() &&
        users.some((actor) => actor.id === entry.actorUserId), "INVALID_AUDIT_ATTRIBUTION");
      const after = entry.after as Record<string, unknown>;
      const before = entry.before as Record<string, unknown> | null;
      requireProvisioning(after.userId === user.id && after.authorizationVersion === index + 1 &&
        (index === 0 ? before === null : JSON.stringify(before) === JSON.stringify(entries[index - 1].after)), "AUDIT_CHAIN_MISMATCH");
    }
    if (user.authorization) {
      const last = entries.at(-1)!.after as Record<string, unknown>;
      for (const key of ["userId", "businessRole", "technicalPrivileges", "accountStatus", "authorizationVersion"] as const) {
        requireProvisioning(JSON.stringify(last[key]) === JSON.stringify(user.authorization[key]), "AUDIT_SNAPSHOT_MISMATCH");
      }
    }
  }
  requireProvisioning(history.every((entry) => users.some((user) => user.id === entry.userId)), "UNEXPECTED_AUDIT_SUBJECT");
  return { users, auditCount: history.length,
    directors: users.filter((user) => user.authorization?.businessRole === "DIRECTOR").length,
    technicalAdministrators: users.filter((user) => user.authorization?.technicalPrivileges.includes("TECHNICAL_ADMIN")).length };
}

export async function databasePreflight(db: PrismaClient, manifest: Manifest, authorizationSql: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [identity] = await tx.$queryRawUnsafe<Array<{ database: string; schema: string; version: string; major: number; readOnly: string }>>(
      `SELECT current_database() AS database, current_schema() AS schema, current_setting('server_version') AS version,
       (current_setting('server_version_num')::integer / 10000) AS major, current_setting('transaction_read_only') AS "readOnly"`);
    const ledger = await tx.$queryRawUnsafe<Array<{ migration_name: string; checksum: string; finished: boolean; rolled_back: boolean; steps: number }>>(
      `SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back,
       applied_steps_count AS steps FROM "_prisma_migrations" ORDER BY migration_name`);
    requireProvisioning(manifest.length === 103 && ledger.length === manifest.length && ledger.every((entry, index) =>
      entry.migration_name === manifest[index].name && entry.checksum === manifest[index].checksum &&
      entry.finished && !entry.rolled_back && entry.steps > 0), "MIGRATION_HISTORY_MISMATCH");
    const tables = await tx.$queryRawUnsafe<Array<{ tablename: string }>>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    requireProvisioning(tables.length === 91, "UNEXPECTED_APPLICATION_TABLES");
    const permitted = new Set(["_prisma_migrations", "User", "UserAuthorization", "UserAuthorizationChange", "Session", "ProjectStatusGroupOption", "ProjectStatusOption"]);
    const counts: Record<string, number> = {};
    for (const { tablename } of tables) {
      requireProvisioning(/^[A-Za-z0-9_]+$/.test(tablename), "UNEXPECTED_TABLE_IDENTIFIER");
      const [row] = await tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::integer AS count FROM "${tablename}"`);
      counts[tablename] = row.count;
      requireProvisioning(permitted.has(tablename) || row.count === 0, "UNRELATED_BUSINESS_DATA_PRESENT");
    }
    requireProvisioning(counts.ProjectStatusGroupOption === 6 && counts.ProjectStatusOption === 10, "REFERENCE_DATA_MISMATCH");
    const [guards] = await tx.$queryRawUnsafe<Array<{ uniqueDirector: boolean; enabledTriggers: number; deferredDirector: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='"UserAuthorization_one_active_director"'::regclass
       AND indisunique AND indisvalid AND indisready AND pg_get_expr(indpred,indrelid) LIKE '%DIRECTOR%ACTIVE%') AS "uniqueDirector",
       (SELECT count(*)::integer FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgrelid IN
       ('"UserAuthorization"'::regclass,'"UserAuthorizationChange"'::regclass)) AS "enabledTriggers",
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='UserAuthorization_preserve_director' AND tgdeferrable AND tginitdeferred) AS "deferredDirector"`);
    requireProvisioning(guards.uniqueDirector && guards.enabledTriggers === 8 && guards.deferredDirector, "AUTHORIZATION_GUARDS_MISSING");
    // Prisma drift does not cover these custom SQL objects. Compare their bodies
    // and trigger bindings with the unchanged migration, rather than counting only.
    const functions = await tx.$queryRawUnsafe<Array<{ name: string; source: string; language: string; securityDefiner: boolean }>>(
      `SELECT p.proname AS name,p.prosrc AS source,l.lanname AS language,p.prosecdef AS "securityDefiner"
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
       WHERE n.nspname='public' AND p.proname LIKE 'flux_v2_authorization_%'`);
    const expectedFunctions = [...authorizationSql.matchAll(/CREATE FUNCTION (\w+)\(\) RETURNS TRIGGER AS \$\$([\s\S]*?)\$\$ LANGUAGE plpgsql;/g)];
    requireProvisioning(expectedFunctions.length === 5 && functions.length === 5 && expectedFunctions.every((expected) =>
      functions.some((actual) => actual.name === expected[1] && actual.source.trim() === expected[2].trim() &&
        actual.language === "plpgsql" && !actual.securityDefiner)), "AUTHORIZATION_FUNCTION_DRIFT");
    const triggers = await tx.$queryRawUnsafe<Array<{ name: string; function: string; type: number; enabled: string; deferred: boolean; deferrable: boolean }>>(
      `SELECT t.tgname AS name,p.proname AS function,t.tgtype::integer AS type,t.tgenabled AS enabled,
       t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
       WHERE NOT t.tgisinternal AND t.tgrelid IN ('"UserAuthorization"'::regclass,'"UserAuthorizationChange"'::regclass)`);
    const expectedTriggers = [...authorizationSql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER "(\w+)"\s+([\s\S]*?)EXECUTE FUNCTION (\w+)\(\);/g)];
    requireProvisioning(expectedTriggers.length === 8 && triggers.length === 8 && expectedTriggers.every((expected) => {
      const clause = expected[2].split(/\bON\b/)[0];
      let type = /FOR EACH ROW/.test(expected[2]) ? 1 : 0;
      for (const [word, bit] of [["BEFORE", 2], ["INSERT", 4], ["DELETE", 8], ["UPDATE", 16], ["TRUNCATE", 32]] as const) {
        if (new RegExp(`\\b${word}\\b`).test(clause)) type |= bit;
      }
      return triggers.some((actual) => actual.name === expected[1] && actual.function === expected[3] && actual.type === type &&
        actual.enabled === "O" && actual.deferrable === /DEFERRABLE/.test(expected[2]) && actual.deferred === /INITIALLY DEFERRED/.test(expected[2]));
    }), "AUTHORIZATION_TRIGGER_DRIFT");
    return { identity, counts, migrationCount: ledger.length, guards, state: await inspectState(tx) };
  }, { isolationLevel: "RepeatableRead", maxWait: 20000, timeout: 180000 });
}

/** All missing identities commit together. Existing identities/passwords are never rewritten. */
export async function provisionIdentities(db: PrismaClient, passwordFor: (email: string) => Promise<{ password: string; confirmation: string }>,
  sharedTestPassword?: SharedTestPasswordContext) {
  if (sharedTestPassword) requireSharedTestPasswordAllowed(sharedTestPassword);
  const before = await inspectState(db);
  if (sharedTestPassword) requireProvisioning(before.users.length === 0, "SHARED_PASSWORD_REQUIRES_EMPTY_ACCOUNTS_REVIEW_EXISTING_STATE");
  const existing = await db.user.findMany({ select: { passwordHash: true } });
  const hashes = existing.map((user) => user.passwordHash);
  const pending: Array<{ name: string; email: string; passwordHash: string }> = [];
  try {
    if (sharedTestPassword) {
      const secret = await passwordFor(accounts[0].email);
      try {
        requireProvisioning(secret.password === secret.confirmation, "PASSWORD_CONFIRMATION_MISMATCH");
        requireProvisioning(getPasswordValidationErrors(secret.password).length === 0, "APPLICATION_PASSWORD_POLICY_FAILED");
        requireProvisioning(secret.password.length >= 8 && secret.password.length <= 256 && secret.password.trim() === secret.password &&
          !/[\x00-\x1f\x7f]/.test(secret.password), "USE_8_TO_256_CHARACTERS_WITHOUT_CONTROL_CHARACTERS");
        // Hash independently per identity; never reuse a salted hash or retain plaintext for the write transaction.
        for (const account of accounts) pending.push({ name: account.name, email: account.email, passwordHash: hashAuthPassword(secret.password) });
      } finally { secret.password = ""; secret.confirmation = ""; }
    } else {
      for (const account of accounts.filter((item) => !before.users.some((user) => user.email === item.email))) {
        const secret = await passwordFor(account.email);
        try {
          validatePassword(secret.password, secret.confirmation, account.email);
          requireProvisioning(!hashes.some((hash) => verifyAuthPassword(secret.password, hash)), "PASSWORD_MUST_BE_UNIQUE_PER_ACCOUNT");
          const passwordHash = hashAuthPassword(secret.password);
          hashes.push(passwordHash);
          pending.push({ name: account.name, email: account.email, passwordHash });
        } finally { secret.password = ""; secret.confirmation = ""; }
      }
    }
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe('LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE');
      const current = await inspectState(tx);
      requireProvisioning(JSON.stringify(current.users) === JSON.stringify(before.users), "STATE_CHANGED_REPLAN_REQUIRED");
      const currentHashes = await tx.user.findMany({ select: { passwordHash: true }, orderBy: { id: "asc" } });
      // Password changes during prompting must not weaken the cross-account uniqueness check.
      requireProvisioning(currentHashes.length === existing.length &&
        currentHashes.every((row) => existing.some((prior) => prior.passwordHash === row.passwordHash)), "STATE_CHANGED_REPLAN_REQUIRED");
      for (const account of pending) await tx.user.create({ data: { ...account, role: "USER", projectCreationAccessGranted: false } });
      return { created: pending.map((account) => account.email), retained: before.users.length };
    }, { maxWait: 10000, timeout: 30000 });
  } finally { pending.length = 0; hashes.length = 0; }
}

export type SetupStep = "bootstrap-director" | "bootstrap-technical";
export function setupTarget(step: SetupStep) { return accounts[step === "bootstrap-director" ? 0 : 7]; }
export async function applySignedSetup(db: PrismaClient, step: SetupStep, operatorEmail: string,
  trustedPublicKeyPem: string, envelope: { payload: string; signature: string }) {
  const state = await inspectState(db);
  requireProvisioning(state.users.length === 9, "PROVISION_ALL_NINE_IDENTITIES_FIRST");
  const actor = state.users.find((user) => user.email === operatorEmail);
  const target = state.users.find((user) => user.email === setupTarget(step).email)!;
  requireProvisioning(actor, "APPROVED_OPERATOR_IDENTITY_REQUIRED");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(envelope.payload); } catch { throw new Error("INVALID_SETUP_ENVELOPE"); }
  requireProvisioning(payload && payload.actorUserId === actor.id && payload.targetUserId === target.id && payload.audience === audience,
    "SETUP_IDENTITY_OR_AUDIENCE_MISMATCH");
  // Signature, scope, expiry, replay, status, version and uniqueness checks stay in the existing service.
  const options = { database: db, trustedPublicKeyPem, audience };
  const invoke = step === "bootstrap-director" ? createDirectorBootstrapInvoker(options) : createInitialTechnicalAdministratorInvoker(options);
  return invoke(envelope);
}

/** The token must come from an actual existing application login. This tool issues no sessions. */
export async function assignRemaining(db: PrismaClient, domain: "business" | "technical", sessionToken: string, reason: string) {
  requireProvisioning(reason.trim().length > 0 && reason.length <= 2000, "ROLE_CHANGE_REASON_REQUIRED");
  const state = await inspectState(db);
  requireProvisioning(state.users.length === 9, "PROVISION_ALL_NINE_IDENTITIES_FIRST");
  const expectedActor = state.users.find((user) => user.email === accounts[domain === "business" ? 0 : 7].email)!;
  const session = await db.session.findUnique({ where: { token: sessionToken }, select: { userId: true } });
  requireProvisioning(session?.userId === expectedActor.id, "EXPECTED_OPERATOR_SESSION_REQUIRED");
  const service = createRoleAssignmentService({ database: db, readSessionToken: async () => sessionToken });
  const targets = domain === "business" ? accounts.slice(1, 7) : [accounts[8]];
  const completed: string[] = [];
  let attempted: string | null = null;
  try { for (const target of targets) {
    attempted = target.email;
    const fresh = await inspectState(db);
    const user = fresh.users.find((row) => row.email === target.email)!;
    const input = { userId: user.id, expectedVersion: user.authorization?.authorizationVersion ?? null, reason };
    if (domain === "business") await service.assignBusinessRole({ ...input, businessRole: target.businessRole });
    else await service.setTechnicalPrivileges({ ...input, technicalPrivileges: [...target.technicalPrivileges] });
    completed.push(target.email);
  } } catch { throw new PartialAssignmentError(completed, attempted); }
  return completed;
}

export function publicState(state: State) {
  return accounts.map((account) => {
    const user = state.users.find((row) => row.email === account.email);
    return { ...account, id: user?.id ?? null, identity: user ? "PRESENT" : "MISSING", legacyRole: user?.role ?? "USER",
      assignment: user?.authorization ? "MATCHES" : "PENDING", authorizationVersion: user?.authorization?.authorizationVersion ?? null };
  });
}

export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

// Phase 1.3: only a NEW private cluster. Never accept URLs/credentials or reuse a DB.
import assert from "node:assert/strict";
import { withoutTaskerSchema, withoutTaskConceptsSchema } from "./tasker-schema-baseline.mjs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "flux-v2-auth-pg-"));
const data = join(root, "data"), socket = join(root, "s"), schemaPath = join(root, "schema.prisma");
const database = "flux_v2_authorization_test", username = "flux_v2_test", port = "55432";
const migrationName = "20261018120000_v2_authorization_foundation";
const migrationRoot = join(repository, "prisma/migrations");
const prismaCli = require.resolve("prisma/build/index.js");
// Deliberate whitelist: no inherited DATABASE_URL, PG*, credentials, HOME or .env.
const env = {
  PATH: process.env.PATH,
  LANG: "C", LC_ALL: "C",
  PGPASSFILE: join(root, "no-password-file"), PGSERVICEFILE: join(root, "no-service-file"),
  CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1",
};
const databaseUrl = `postgresql://${username}@localhost:${port}/${database}?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const prismaEnv = { ...env, DATABASE_URL: databaseUrl };
let started = false;
const clients = new Set();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, env, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || `${command} failed`);
  return result.stdout.trim();
}
function psqlArgs(db = database) {
  return ["-X", "-qAt", "-h", socket, "-p", port, "-U", username, "-d", db,
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
}
function sql(statement, db = database) {
  return run("psql", psqlArgs(db), { input: statement });
}
function json(statement) { return JSON.parse(sql(statement)); }
function expectedFailure(statement, code, message) {
  const result = spawnSync("psql", psqlArgs(), { cwd: root, env, encoding: "utf8", input: statement, timeout: 10000 });
  assert.notEqual(result.status, 0, `Expected SQL failure: ${message}`);
  assert.match(result.stderr, new RegExp(`ERROR:  ${code}:`), message);
  if (message) assert.ok(result.stderr.includes(message), result.stderr);
}
function context(changeId, actor = "operator", reason = "Synthetic verification") {
  // These helpers accept test constants only, never external SQL or identities.
  for (const value of [changeId, actor, reason]) assert.ok(!value.includes("'"));
  return `SET LOCAL flux.authorization_actor_id = '${actor}';
    SET LOCAL flux.authorization_reason = '${reason}';
    SET LOCAL flux.authorization_change_id = '${changeId}';`;
}
function transaction(statement, changeId = "test-change") {
  return `BEGIN; ${context(changeId)} ${statement} COMMIT;`;
}
function auth(userId) {
  return json(`SELECT to_jsonb(a) - 'createdAt' - 'updatedAt' FROM "UserAuthorization" a WHERE "userId" = '${userId}'`);
}
function authState() {
  return json(`SELECT jsonb_build_object(
    'assignments', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY "userId"), '[]') FROM "UserAuthorization" a),
    'history', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY "userId", "authorizationVersion"), '[]') FROM "UserAuthorizationChange" h))`);
}
function businessSnapshot() {
  const tables = sql(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN ('_prisma_migrations', 'UserAuthorization', 'UserAuthorizationChange') ORDER BY tablename`).split("\n");
  return Object.fromEntries(tables.map((table) => {
    assert.match(table, /^[A-Za-z0-9_]+$/);
    return [table, sql(`SELECT count(*) || ':' || md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) FROM "${table}" t`)];
  }));
}
function startClient(name, initialSql, closeInput = false) {
  const child = spawn("psql", psqlArgs(), { cwd: root, env: { ...env, PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"] });
  clients.add(child);
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completion = new Promise((resolveResult, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { clients.delete(child); resolveResult({ status, stdout, stderr }); });
  });
  child.stdin.write(initialSql + "\n");
  if (closeInput) child.stdin.end();
  return { child, completion, output: () => stdout };
}
async function until(predicate, label) {
  const deadline = Date.now() + 7000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 30));
  }
}
async function contend(holderSql, contenderSql, code) {
  const holder = startClient("flux-v2-holder", `${holderSql}\n\\echo HOLDER_READY`);
  await until(() => holder.output().includes("HOLDER_READY"), "holder performed its uncommitted write");
  const contender = startClient("flux-v2-contender", contenderSql, true);
  // Prove concurrent execution and a real PostgreSQL lock wait, not sequential attempts.
  await until(() => sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name = 'flux-v2-contender' AND wait_event_type = 'Lock'`) === "1", "contender blocked on holder's write");
  holder.child.stdin.end("COMMIT;\n");
  const [first, second] = await Promise.all([holder.completion, contender.completion]);
  assert.equal(first.status, 0, first.stderr);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, new RegExp(`ERROR:  ${code}:`));
}
function prisma(args) { return run(process.execPath, [prismaCli, ...args], { env: prismaEnv }); }
function cleanup() {
  for (const child of clients) child.kill("SIGTERM");
  if (started || existsSync(join(data, "postmaster.pid"))) {
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    started = false;
  }
  rmSync(root, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { cleanup(); process.exit(1); });
}

try {
  mkdirSync(socket, { mode: 0o700 });
  run("initdb", ["-D", data, "-U", username, "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o",
    `-h '' -k ${socket} -p ${port} -c unix_socket_permissions=0700 -c wal_level=minimal -c max_wal_senders=0 -c min_wal_size=32MB -c max_wal_size=64MB`, "-w", "start"]);
  started = true;
  const identity = jsonOnControl();
  assert.equal(identity.data_directory, data);
  assert.equal(identity.listen_addresses, "");
  assert.equal(identity.socket_only, true);
  sql(`CREATE DATABASE "${database}"`, "postgres");
  console.log(`Isolated PostgreSQL ${identity.version}; fresh cluster/database, private socket, TCP disabled.`);

  mkdirSync(join(root, "migrations"));
  copyFileSync(join(repository, "prisma/schema.prisma"), schemaPath);
  copyFileSync(join(migrationRoot, "migration_lock.toml"), join(root, "migrations/migration_lock.toml"));
  const migrations = readdirSync(migrationRoot).filter((name) => /^\d+_/.test(name)).sort();
  for (const name of migrations.filter((name) => name !== migrationName)) copyMigration(name);
  prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')), migrations.length - 1);
  console.log(`PASS: ${migrations.length - 1} repository migrations applied before V2.`);
  // Compare the pre-candidate chain against the same schema with ONLY the V2
  // additions removed. This attributes unrelated drift without masking/fixing it.
  let baselineSchema = readFileSync(schemaPath, "utf8");
  for (const [kind, name] of [
    ["model", "UserAuthorization"], ["model", "UserAuthorizationChange"],
    ["enum", "BusinessRole"], ["enum", "TechnicalPrivilege"], ["enum", "AuthorizationAccountStatus"],
  ]) {
    const block = new RegExp(`^${kind} ${name} \\{[\\s\\S]*?^\\}`, "m");
    assert.match(baselineSchema, block);
    baselineSchema = baselineSchema.replace(block, "");
  }
  baselineSchema = baselineSchema.replace(/^  (?:authorization|authorizationHistory|performedAuthorizationChanges)\s+[^\n]+\n/gm, "");
  const baselineSchemaPath = join(root, "baseline.prisma");
  writeFileSync(baselineSchemaPath, baselineSchema);
  prisma(["validate", "--schema", baselineSchemaPath]);
  const baselineDiff = prisma(["migrate", "diff", "--from-url", databaseUrl, "--to-schema-datamodel", baselineSchemaPath, "--script"]);
  if (!/This is an empty migration/.test(baselineDiff)) console.log(`Pre-existing schema drift before V2 (NOT applied):\n${baselineDiff}`);

  seedSyntheticBusinessRecords();
  const preserved = businessSnapshot();
  copyMigration(migrationName);
  prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')), migrations.length);
  assert.deepEqual(businessSnapshot(), preserved);
  console.log(`PASS: V2 candidate applied; all ${Object.keys(preserved).length} pre-existing business tables preserved.`);

  inspectDatabaseObjects();
  await checkGovernance();
  checkAuditAndVersions();
  assert.deepEqual(businessSnapshot(), preserved);
  prisma(["validate", "--schema", schemaPath]);
  const diff = prisma(["migrate", "diff", "--from-url", databaseUrl, "--to-schema-datamodel", schemaPath, "--script"]);
  assert.equal(diff, baselineDiff, `V2 introduced additional Prisma schema drift (NOT applied):\n${diff}`);
  console.log("PASS: V2 introduces no Prisma schema drift; synthetic Users/Archives/Library and all business rows unchanged.");
  if (/This is an empty migration/.test(diff)) {
    console.log("PASS: Phase 1.3 complete repository/PostgreSQL verification.");
  } else {
    console.log("FAIL: full repository schema consistency. V2 behavior passed; the identical pre-existing drift above requires separate review.");
    process.exitCode = 1;
  }
  sql(`DROP DATABASE "${database}"`, "postgres");
  sql("CHECKPOINT", "postgres");
  if (process.argv.includes("--services") || process.argv.includes("--provisioning")) checkAssignmentServices();
  if (process.argv.includes("--runtime")) checkAssignmentServices(true);
  if (process.argv.includes("--project-read")) checkAssignmentServices("project-read");
  if (process.argv.includes("--administration")) checkAssignmentServices("administration");
  if (process.argv.includes("--workspace")) checkAssignmentServices("workspace");
  if (process.argv.includes("--search")) checkAssignmentServices("search");
  if (process.argv.includes("--library")) checkAssignmentServices("library");
  if (process.argv.includes("--archives")) checkAssignmentServices("archives");
  if (process.argv.includes("--completion-documents")) checkAssignmentServices("completion-documents");
  if (process.argv.includes("--file-identity")) { checkSharedFileMigration(); checkAssignmentServices("file-identity"); }
  if (process.argv.includes("--events")) checkAssignmentServices("events");
  if (process.argv.includes("--approvals")) { checkApprovalMigration(); checkAssignmentServices("approvals"); }
  if (process.argv.includes("--project-governance")) checkAssignmentServices("project-governance");
  if (process.argv.includes("--project-write")) checkAssignmentServices("project-write");
  if (process.argv.includes("--provisioning")) checkProvisioning();
  console.log("Existing application databases, credentials and S3 were not used.");
} catch (error) {
  // Prisma can report only the aborted transaction after a PL/pgSQL compile
  // error. Keep the original fixture-server diagnostic before removing it.
  const log = join(root, "postgres.log");
  if (existsSync(log)) console.error(readFileSync(log, "utf8").split("\n").filter(line => /\] (ERROR|DETAIL|CONTEXT|HINT):/.test(line)).slice(-30).join("\n"));
  throw error;
} finally {
  cleanup();
  console.log("Disposable PostgreSQL cluster stopped and removed.");
}

function checkAssignmentServices(runtime = false) {
  // A second NEW database keeps service bootstrap fixtures independent of the
  // original governance suite. Same private cluster; no inherited app URL.
  const administration = runtime === "administration";
  const workspace = runtime === "workspace", search = runtime === "search";
  const library = runtime === "library";
  const archives = runtime === "archives";
  const events = runtime === "events";
  const approvals = runtime === "approvals" || events;
  const fileIdentity = runtime === "file-identity" || approvals;
  const documents = runtime === "completion-documents" || fileIdentity;
  const governance = runtime === "project-governance";
  const projectWrite = runtime === "project-write";
  const projectRead = runtime === "project-read";
  const serviceDatabase = administration ? "flux_v2_administration_test" : workspace ? "flux_v2_workspace_test" : search ? "flux_v2_search_test" : library ? "flux_v2_library_test" : archives ? "flux_v2_archives_test" : documents ? "flux_v2_completion_documents_test" : governance ? "flux_v2_authorization_project_governance_test" : projectWrite ? "flux_v2_authorization_project_write_test" : projectRead ? "flux_v2_authorization_project_read_test" : runtime ? "flux_v2_authorization_runtime_test" : "flux_v2_authorization_service_test";
  sql(`CREATE DATABASE "${serviceDatabase}"`, "postgres");
  const serviceUrl = databaseUrl.replace(`/${database}?`, `/${serviceDatabase}?`);
  const serviceEnv = { ...prismaEnv, DATABASE_URL: serviceUrl, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" };
  let deploymentSchema = schemaPath;
  if (events) {
    const baseline = join(root, "events-baseline");
    mkdirSync(join(baseline, "migrations"), { recursive: true });
    copyFileSync(join(migrationRoot, "migration_lock.toml"), join(baseline, "migrations/migration_lock.toml"));
    for (const name of readdirSync(migrationRoot).filter(n => /^\d+_/.test(n) && n < "20261021190000_shared_audit_events")) {
      mkdirSync(join(baseline, "migrations", name));
      copyFileSync(join(migrationRoot, name, "migration.sql"), join(baseline, "migrations", name, "migration.sql"));
    }
    deploymentSchema = join(baseline, "schema.prisma");
    writeFileSync(deploymentSchema, withoutEventSchema(readFileSync(schemaPath, "utf8")));
  }
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", deploymentSchema], { env: serviceEnv });
  let eventMigrationSchema = schemaPath, eventFollowupSchema = schemaPath;
  if (events) {
    const eventTarget = join(root, "events-target");
    mkdirSync(join(eventTarget, "migrations"), { recursive: true });
    copyFileSync(join(migrationRoot, "migration_lock.toml"), join(eventTarget, "migrations/migration_lock.toml"));
    for (const name of readdirSync(migrationRoot).filter(n => /^\d+_/.test(n) && n <= "20261021190000_shared_audit_events")) {
      mkdirSync(join(eventTarget, "migrations", name));
      copyFileSync(join(migrationRoot, name, "migration.sql"), join(eventTarget, "migrations", name, "migration.sql"));
    }
    eventMigrationSchema = join(eventTarget, "schema.prisma");
    writeFileSync(eventMigrationSchema, withoutTaskerSchema(readFileSync(schemaPath, "utf8")));
    const phase32 = join(root, "events-phase32"); mkdirSync(join(phase32, "migrations"), { recursive: true });
    copyFileSync(join(migrationRoot, "migration_lock.toml"), join(phase32, "migrations/migration_lock.toml"));
    for (const name of readdirSync(migrationRoot).filter(n => /^\d+_/.test(n) && n < "20261022010000_universal_tasker_concepts")) {
      mkdirSync(join(phase32, "migrations", name)); copyFileSync(join(migrationRoot, name, "migration.sql"), join(phase32, "migrations", name, "migration.sql"));
    }
    eventFollowupSchema = join(phase32, "schema.prisma"); writeFileSync(eventFollowupSchema, withoutTaskConceptsSchema(readFileSync(schemaPath, "utf8")));
    // Preserve the baseline diff location used by the event suite.
    mkdirSync(join(eventTarget, "events-baseline"));
    copyFileSync(deploymentSchema, join(eventTarget, "events-baseline/schema.prisma"));
  }
  const clientPath = join(root, "client"), generatedSchema = join(root, "client.prisma");
  mkdirSync(join(root, "node_modules/@prisma"), { recursive: true });
  if (!existsSync(join(root, "node_modules/@prisma/client"))) {
    symlinkSync(dirname(require.resolve("@prisma/client/package.json")), join(root, "node_modules/@prisma/client"), "dir");
  }
  writeFileSync(generatedSchema, readFileSync(schemaPath, "utf8").replace(
    'provider        = "prisma-client-js"', `provider        = "prisma-client-js"\n  output = ${JSON.stringify(clientPath)}`,
  ));
  run(process.execPath, [prismaCli, "generate", "--schema", generatedSchema], { env: serviceEnv });
  const configPath = join(root, administration ? "tsconfig.administration.json" : workspace ? "tsconfig.workspace.json" : search ? "tsconfig.search.json" : library ? "tsconfig.library.json" : archives ? "tsconfig.archives.json" : documents ? "tsconfig.completion-documents.json" : governance ? "tsconfig.project-governance.json" : projectWrite ? "tsconfig.project-write.json" : projectRead ? "tsconfig.project-read.json" : runtime ? "tsconfig.runtime.json" : "tsconfig.services.json");
  const output = join(root, administration ? "administration-compiled" : workspace ? "workspace-compiled" : search ? "search-compiled" : library ? "library-compiled" : archives ? "archives-compiled" : documents ? "completion-documents-compiled" : governance ? "project-governance-compiled" : projectWrite ? "project-write-compiled" : projectRead ? "project-read-compiled" : runtime ? "runtime-compiled" : "compiled");
  const paths = { "@/*": [join(repository, "src/*")], "@prisma/client": [clientPath] };
  writeFileSync(configPath, JSON.stringify({
    extends: join(repository, administration ? "scripts/tsconfig.administration.json" : workspace ? "scripts/tsconfig.workspace.json" : search ? "scripts/tsconfig.flux-ai-archive-search-integration.json" : library ? "scripts/tsconfig.library.json" : archives ? "scripts/tsconfig.archives.json" : documents ? "scripts/tsconfig.completion-documents.json" : governance ? "scripts/tsconfig.authorization-project-governance.json" : projectWrite ? "scripts/tsconfig.authorization-project-write.json" : projectRead ? "scripts/tsconfig.authorization-project-read.json" : runtime ? "scripts/tsconfig.authorization-runtime.json" : "scripts/tsconfig.authorization-services.json"),
    compilerOptions: { outDir: output, paths, typeRoots: [join(repository, "node_modules/@types")] },
  }));
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", configPath], { timeout: 60000 });
  // Next resolves server-only as an empty module on the server. Reproduce that
  // boundary ONLY inside disposable Node test output; production imports retain
  // the Next client-build poison marker. Nothing is installed in the repository.
  const marker = join(output, "node_modules/server-only");
  mkdirSync(marker, { recursive: true });
  writeFileSync(join(marker, "index.js"), "// Isolated Node server test only.\n");
  console.log(run(process.execPath, [join(output, administration ? "scripts/administration-integration-check.js" : workspace ? "scripts/workspace-authorization-integration-check.js" : search ? "scripts/flux-ai-archive-search-integration-check.js" : library ? "scripts/library-authorization-integration-check.js" : archives ? "scripts/archives-authorization-integration-check.js" : documents ? "scripts/completion-documents-integration-check.js" : governance ? "scripts/authorization-project-governance-integration-check.js" : projectWrite ? "scripts/authorization-project-write-integration-check.js" : projectRead ? "scripts/authorization-project-read-integration-check.js" : runtime ? "scripts/authorization-runtime-integration-check.js" : "scripts/authorization-services-integration-check.js")], {
    env: { ...serviceEnv, NODE_ENV: "production", FLUX_EVENT_TEST: events ? "1" : "", FLUX_EVENT_FOLLOWUP_SCHEMA: events ? eventFollowupSchema : "", FLUX_EVENT_MIGRATION_SCHEMA: events ? eventMigrationSchema : "", FLUX_FILE_IDENTITY_TEST: fileIdentity ? "1" : "", FLUX_APPROVAL_TEST: approvals ? "1" : "", FLUX_AUTH_TEST_ROOT: root, FLUX_AUTH_TEST_URL: serviceUrl, FLUX_AUTH_TEST_CLIENT: clientPath,
      NODE_PATH: join(repository, "node_modules") },
    timeout: events ? 180000 : 60000,
  }));
  if (events) {
    const query = statement => run("psql", psqlArgs(serviceDatabase), { input: statement });
    assert.equal(query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'), "110");
    for (const table of ["ApprovalRequest", "ApprovalDecision", "CompletionDocumentEvent", "BusinessEvent", "EventOutbox", "SharedFileVersion"]) assert.ok(Number(query(`SELECT count(*) FROM "${table}"`)) > 0, `${table} must be populated`);
    const tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
    const snapshot = () => tables.map(t => query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? "WHERE migration_name NOT IN ('20261022010000_universal_tasker_concepts','20261022030000_universal_tasker_sisters','20261023010000_stage_builder_drafts','20261023020000_workflow_publication')" : ""}`));
    const before = snapshot(); run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { env: serviceEnv });
    assert.deepEqual(snapshot(), before); assert.equal(query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'), "114");
    assert.equal(query("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "128");
    console.log("PASS Phase 3.3/3.4/4.1/4.2 additional populated migrations: all 119 tables preserved, including nine accounts, accepted/rejected approvals, native document history, exact file versions, business events and delivery diagnostics.");
  }
  const drift = run(process.execPath, [prismaCli, "migrate", "diff", "--from-url", serviceUrl,
    "--to-schema-datamodel", schemaPath, "--script"], { env: serviceEnv });
  assert.match(drift, /This is an empty migration/);
  sql(`DROP DATABASE "${serviceDatabase}"`, "postgres");
  sql("CHECKPOINT", "postgres");
  console.log(`PASS: ${approvals ? "Phase 2.2 reusable approvals" : fileIdentity ? "Phase 2.1 shared file identity" : administration ? "Phase 1.5I administration" : workspace ? "Phase 1.5H workspace" : search ? "Phase 1.5H search" : library ? "Phase 1.5G Library" : archives ? "Phase 1.5F Archives" : documents ? "Phase 1.5E completion documents" : governance ? "Phase 1.5D project governance" : projectWrite ? "Phase 1.5C project write" : projectRead ? "Phase 1.5B project read" : runtime ? "Phase 1.5A runtime" : "Phase 1.4A Prisma service"} integration, targeted TypeScript and empty schema drift.`);
}

function withoutEventSchema(schema) {
  schema = withoutTaskerSchema(schema);
  for (const name of ["BusinessEvent", "EventOutbox", "EventDeliveryAttempt", "EventConsumerReceipt", "BusinessEventType", "EventDeliveryState", "EventAttemptOutcome"]) {
    schema = schema.replace(new RegExp(`^(?:model|enum) ${name} \{[\\s\\S]*?^\}`, "m"), "");
  }
  return schema.replace(/^  (?:businessEvents|businessEvent)\s+[^\n]+\n/gm, "");
}
function withoutApprovalSchema(schema) {
  schema = withoutEventSchema(schema);
  for (const name of ["ApprovalRequest", "ApprovalStep", "ApprovalEvidence", "ApprovalDecision", "ApprovalEvent", "ApprovalSubjectType", "ApprovalRequestState", "ApprovalStepEligibility", "ApprovalDecisionOutcome", "ApprovalEventAction"]) {
    schema = schema.replace(new RegExp(`^(?:model|enum) ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  }
  return schema.replace(/^  (?:approvalRequests|approvalDecisions|approvalEvents|approvalRequest|requestedApproval|approvalDecision|approvalEvidence)\s+[^\n]+\n/gm, "");
}

function checkSharedFileMigration() {
  const candidate = "20261018210000_shared_file_identity", db = "flux_v2_file_migration_test";
  const directory = join(root, "file-baseline"), baselinePath = join(directory, "schema.prisma");
  const url = databaseUrl.replace(`/${database}?`, `/${db}?`), isolatedEnv = { ...env, DATABASE_URL: url };
  mkdirSync(join(directory, "migrations"), { recursive: true });
  copyFileSync(join(migrationRoot, "migration_lock.toml"), join(directory, "migrations/migration_lock.toml"));
  for (const name of readdirSync(migrationRoot).filter(name => /^\d+_/.test(name) && name < candidate)) {
    mkdirSync(join(directory, "migrations", name));
    copyFileSync(join(migrationRoot, name, "migration.sql"), join(directory, "migrations", name, "migration.sql"));
  }
  const phase21Schema = withoutApprovalSchema(readFileSync(schemaPath, "utf8"));
  let baseline = phase21Schema;
  for (const name of ["SharedFile", "SharedFileVersion", "SharedFileReference", "SharedFileProvenance", "SharedFileVersionStatus", "SharedFileChecksumEvidence", "SharedFileReferenceRole"]) {
    const block = new RegExp(`^(?:model|enum) ${name} \\{[\\s\\S]*?^\\}`, "m");
    assert.match(baseline, block); baseline = baseline.replace(block, "");
  }
  baseline = baseline.replace(/^  sharedFile\w*\s+[^\n]+\n/gm, "");
  writeFileSync(baselinePath, baseline);
  sql(`CREATE DATABASE "${db}"`, "postgres");
  const migrate = args => run(process.execPath, [prismaCli, ...args], { env: isolatedEnv });
  migrate(["validate", "--schema", baselinePath]);
  migrate(["migrate", "deploy", "--schema", baselinePath]);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL', db), "105");
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", db), "99");
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", baselinePath, "--script"]), /This is an empty migration/);
  seedSyntheticBusinessRecords(db);
  sql(`BEGIN;
    ${context("file-migration-bootstrap")}
    INSERT INTO "UserAuthorization" ("userId", "businessRole") VALUES ('director-a', 'DIRECTOR');
    COMMIT;
    INSERT INTO "Project" (id,name,"ownerId","createdById","updatedAt") VALUES ('file-project','Preserved project','spm','operator',now());
    INSERT INTO "ProjectStage" (id,"projectId",name,"order","updatedAt") VALUES ('file-stage','file-project','Preserved stage',1,now());
    INSERT INTO "ProjectRevision" (id,"projectId","stageId","createdById","reviewedById","reviewedAt","revisionNumber",title,status,"updatedAt")
      VALUES ('file-revision','file-project','file-stage','spm','director-a',now(),1,'Accepted before adoption','APPROVED',now());
    INSERT INTO "ProjectAttachment" (id,"projectId","stageId","revisionId","uploadedById","fileName","originalFileName","mimeType","fileSize",bucket,"storageKey","assetType",status,"updatedAt")
      VALUES ('file-source','file-project','file-stage','file-revision','spm','proof.pdf','proof.pdf','application/pdf',8,'synthetic-no-s3','legacy/proof','STAGE_SUBMISSION','READY',now());
    INSERT INTO "ProjectStageFileHandoff" (id,"projectId","sourceWorkflowStageKey","targetWorkflowStageKey","sourceAttachmentId","handedOffById","updatedAt")
      VALUES ('file-handoff','file-project','PROJECT_DEVELOPMENT','FINAL_LAYOUT','file-source','spm',now());`, db);
  const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename", db).split("\n");
  const snapshot = () => tables.map(table => {
    assert.match(table, /^[A-Za-z0-9_]+$/);
    const filter = table === "_prisma_migrations" ? ` WHERE migration_name <> '${candidate}'` : "";
    return sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]') FROM "${table}" t${filter}`, db);
  });
  const before = snapshot();
  mkdirSync(join(directory, "migrations", candidate));
  copyFileSync(join(migrationRoot, candidate, "migration.sql"), join(directory, "migrations", candidate, "migration.sql"));
  writeFileSync(baselinePath, phase21Schema);
  migrate(["migrate", "deploy", "--schema", baselinePath]);
  assert.deepEqual(snapshot(), before, "Every pre-existing row and migration checksum must remain identical");
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL', db), "106");
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", db), "103");
  const checksum = createHash("sha256").update(readFileSync(join(migrationRoot, candidate, "migration.sql"))).digest("hex");
  assert.equal(sql(`SELECT checksum FROM "_prisma_migrations" WHERE migration_name = '${candidate}'`, db), checksum);
  assert.equal(sql('SELECT (SELECT count(*) FROM "SharedFile") + (SELECT count(*) FROM "SharedFileVersion") + (SELECT count(*) FROM "SharedFileReference") + (SELECT count(*) FROM "SharedFileProvenance")', db), "0");
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", baselinePath, "--script"]), /This is an empty migration/);
  sql(`DROP DATABASE "${db}"`, "postgres");
  sql("CHECKPOINT", "postgres");
  console.log(`PASS files migration: 105/99 -> 106/103 migrations/tables; unchanged old schema, every legacy row/checksum/approval/file/handoff/account/audit, no backfill, zero drift; SHA-256 ${checksum}.`);
}

function checkApprovalMigration() {
  const candidate = "20261020200000_reusable_approval_engine", db = "flux_v2_approval_migration_test";
  const directory = join(root, "approval-baseline"), baselinePath = join(directory, "schema.prisma");
  const url = databaseUrl.replace(`/${database}?`, `/${db}?`), isolatedEnv = { ...env, DATABASE_URL: url };
  mkdirSync(join(directory, "migrations"), { recursive: true });
  copyFileSync(join(migrationRoot, "migration_lock.toml"), join(directory, "migrations/migration_lock.toml"));
  for (const name of readdirSync(migrationRoot).filter(name => /^\d+_/.test(name) && name < candidate)) {
    mkdirSync(join(directory, "migrations", name));
    copyFileSync(join(migrationRoot, name, "migration.sql"), join(directory, "migrations", name, "migration.sql"));
  }
  writeFileSync(baselinePath, withoutApprovalSchema(readFileSync(schemaPath, "utf8")));
  sql(`CREATE DATABASE "${db}"`, "postgres");
  const migrate = args => run(process.execPath, [prismaCli, ...args], { env: isolatedEnv });
  migrate(["migrate", "deploy", "--schema", baselinePath]);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL', db), "106");
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'", db), "103");
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", baselinePath, "--script"]), /This is an empty migration/);
  seedSyntheticBusinessRecords(db);
  sql(`BEGIN; ${context("approval-migration-bootstrap")}
    INSERT INTO "UserAuthorization" ("userId","businessRole") VALUES ('director-a','DIRECTOR'),('spm','SENIOR_PROJECT_MANAGER'),('jpm','JUNIOR_PROJECT_MANAGER');
    INSERT INTO "Project" (id,name,"ownerId","createdById","updatedAt") VALUES ('approval-existing','Preserved completion','spm','operator',now());
    INSERT INTO "ProjectCompletionWorkflow" (id,"projectId","invoiceRequired","invoiceStatus","updatedAt") VALUES ('approval-workflow','approval-existing',true,'COMPLETED',now());
    INSERT INTO "ProjectCompletionDocument" (id,"projectId","workflowId",type,"originalFileName","archiveFileName","mimeType","fileSize",bucket,"storageKey","uploadedById","uploadedAt","updatedAt")
      VALUES ('approval-legacy-document','approval-existing','approval-workflow','INVOICE','legacy.pdf','legacy.pdf','application/pdf',7,'synthetic-no-s3','legacy/invoice','spm',now(),now());
    SELECT set_config('flux.completion_actor','spm',true);
    INSERT INTO "CompletionDocumentEvent" (id,"projectId","workflowId","actorId",action,details) VALUES ('approval-native-history','approval-existing','approval-workflow','spm','FIXTURE_PRESERVED','{}');
    INSERT INTO "SharedFile" (id) VALUES ('approval-existing-file');
    INSERT INTO "SharedFileVersion" (id,"fileId",number,"uploadedById","originalFileName","mimeType","fileSize",bucket,"storageKey")
      VALUES ('approval-existing-version','approval-existing-file',1,'operator','fixture.svg','image/svg+xml',9,'synthetic-no-s3','fixture/library');
    INSERT INTO "SharedFileReference" (id,"versionId",role,"manualLibraryAssetId") VALUES ('approval-existing-reference','approval-existing-version','SOURCE','fixture-library');
    UPDATE "SharedFileVersion" SET status='READY',"objectETag"='opaque-fixture-validator',"observedAt"=now(),"finalizedAt"=now() WHERE id='approval-existing-version';
    COMMIT;`, db);
  const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename", db).split("\n");
  const snapshot = () => tables.map(table => {
    assert.match(table, /^[A-Za-z0-9_]+$/);
    return sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${table}" t${table === "_prisma_migrations" ? ` WHERE migration_name <> '${candidate}'` : ""}`, db);
  });
  const before = snapshot();
  mkdirSync(join(directory, "migrations", candidate));copyFileSync(join(migrationRoot, candidate, "migration.sql"), join(directory, "migrations", candidate, "migration.sql"));
  writeFileSync(baselinePath, withoutEventSchema(readFileSync(schemaPath, "utf8")));migrate(["migrate", "deploy", "--schema", baselinePath]);
  assert.deepEqual(snapshot(), before, "All existing rows and ledger checksums must survive approval migration unchanged");
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL', db), "107");
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'", db), "108");
  for (const table of ["ApprovalRequest","ApprovalStep","ApprovalEvidence","ApprovalDecision","ApprovalEvent"]) assert.equal(sql(`SELECT count(*) FROM "${table}"`, db), "0");
  const checksum = createHash("sha256").update(readFileSync(join(migrationRoot,candidate,"migration.sql"))).digest("hex");
  assert.equal(sql(`SELECT checksum FROM "_prisma_migrations" WHERE migration_name='${candidate}'`, db), checksum);
  assert.match(migrate(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", baselinePath, "--script"]), /This is an empty migration/);
  sql(`DROP DATABASE "${db}"`, "postgres");sql("CHECKPOINT", "postgres");
  console.log(`PASS approval migration: 106/103 -> 107/108; all old rows, roles, native evidence, file versions, Archives/Library and ledger checksums unchanged; no backfill, zero drift; SHA-256 ${checksum}.`);
}

function checkProvisioning() {
  console.log(run(process.execPath, ["--test", join(repository, "scripts/development-role-setup.test.mjs")], { env, timeout: 30000 }));
  console.log(run(process.execPath, [join(repository, "scripts/development-signing-check.mjs"), root], { env, timeout: 30000 }));
  const provisioningDatabase = "flux_v2_provisioning_test";
  sql(`CREATE DATABASE "${provisioningDatabase}"`, "postgres");
  const provisioningUrl = databaseUrl.replace(`/${database}?`, `/${provisioningDatabase}?`);
  const testEnv = { ...prismaEnv, DATABASE_URL: provisioningUrl };
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { env: testEnv });
  const clientPath = join(root, "client"), output = join(root, "provisioning-compiled");
  const configPath = join(root, "tsconfig.provisioning.json");
  writeFileSync(configPath, JSON.stringify({
    extends: join(repository, "scripts/tsconfig.development-provisioning-tests.json"),
    compilerOptions: { outDir: output, paths: { "@/*": [join(repository, "src/*")], "@prisma/client": [clientPath] },
      typeRoots: [join(repository, "node_modules/@types")] },
  }));
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", configPath], { timeout: 60000 });
  mkdirSync(join(output, "node_modules"), { recursive: true });
  symlinkSync(dirname(require.resolve("next/dist/compiled/server-only/package.json")), join(output, "node_modules/server-only"), "dir");
  console.log(run(process.execPath, ["--conditions=react-server", join(output, "scripts/development-provisioning-integration-check.js")], {
    env: { ...testEnv, FLUX_AUTH_TEST_ROOT: root, FLUX_AUTH_TEST_URL: provisioningUrl, FLUX_AUTH_TEST_CLIENT: clientPath,
      FLUX_AUTH_TEST_REPOSITORY: repository }, timeout: 90000,
  }));
  checkProvisioningTerminal(join(output, "scripts/development-provisioning/terminal.js"));
  const guidedDatabase = "flux_v2_guided_test";
  sql(`CREATE DATABASE "${guidedDatabase}"`, "postgres");
  const guidedUrl = databaseUrl.replace(`/${database}?`, `/${guidedDatabase}?`);
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { env: { ...env, DATABASE_URL: guidedUrl } });
  console.log(run(process.execPath, ["--conditions=react-server", join(repository, "scripts/development-role-setup-integration-check.mjs")], {
    env: { ...env, FLUX_AUTH_TEST_ROOT: root, FLUX_AUTH_TEST_URL: guidedUrl, FLUX_AUTH_TEST_REPOSITORY: repository }, timeout: 90000,
  }));
  assert.match(run(process.execPath, [prismaCli, "migrate", "diff", "--from-url", guidedUrl,
    "--to-schema-datamodel", schemaPath, "--script"], { env: { ...env, DATABASE_URL: guidedUrl } }), /This is an empty migration/);
  if (events) {
    const query = statement => run("psql", psqlArgs(serviceDatabase), { input: statement });
    assert.equal(query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'), "110");
    for (const table of ["ApprovalRequest", "ApprovalDecision", "CompletionDocumentEvent", "BusinessEvent", "EventOutbox", "SharedFileVersion"]) assert.ok(Number(query(`SELECT count(*) FROM "${table}"`)) > 0, `${table} must be populated`);
    const tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
    const snapshot = () => tables.map(t => query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? "WHERE migration_name NOT IN ('20261022010000_universal_tasker_concepts','20261022030000_universal_tasker_sisters','20261023010000_stage_builder_drafts','20261023020000_workflow_publication')" : ""}`));
    const before = snapshot(); run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { env: serviceEnv });
    assert.deepEqual(snapshot(), before); assert.equal(query('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'), "114");
    assert.equal(query("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "128");
    console.log("PASS Phase 3.3/3.4/4.1/4.2 additional populated migrations: all 119 tables preserved, including nine accounts, accepted/rejected approvals, native document history, exact file versions, business events and delivery diagnostics.");
  }
  const drift = run(process.execPath, [prismaCli, "migrate", "diff", "--from-url", provisioningUrl,
    "--to-schema-datamodel", schemaPath, "--script"], { env: testEnv });
  assert.match(drift, /This is an empty migration/);
  console.log("PASS: Phase 1.4D isolated provisioning and empty schema drift. No remote database was used.");
}

function checkProvisioningTerminal(terminalModule) {
  // Python's standard-library PTY controls a synthetic local terminal. Generated
  // fixture secrets travel only through that PTY, never arguments or output.
  const program = String.raw`
import base64, os, pty, select, subprocess, sys, time
node, module = sys.argv[1:]
code = """
const {terminalInput,identityPasswordInput}=require(process.argv[1]);
(async()=>{const before=!!process.stdin.isRaw;
 const {password:first,confirmation:second}=process.argv[2]==='shared-confirmed'
   ?await identityPasswordInput()
   :{password:await terminalInput('Secret',true),confirmation:await terminalInput('Confirm',true)};
 if(first!==second||!!process.stdin.isRaw!==before)throw Error('TERMINAL_ASSERTION_FAILED');
 console.log('TERMINAL_PASS');
})().catch(e=>{console.log(e.code||'TERMINAL_FAILURE');process.exitCode=1;});
"""
for scenario in ['confirmed','cancelled','multiline','shared-confirmed']:
    master, slave = pty.openpty()
    process = subprocess.Popen([node,'-e',code,module,scenario],stdin=slave,stdout=slave,stderr=slave)
    os.close(slave)
    output = bytearray()
    secret = b'A'+os.urandom(2).hex().encode()+b'@12' if scenario=='shared-confirmed' else base64.urlsafe_b64encode(os.urandom(24))
    def until(marker):
        deadline=time.monotonic()+10
        while marker not in output:
            if time.monotonic()>deadline: raise RuntimeError('Terminal fixture timeout')
            readable,_,_=select.select([master],[],[],0.1)
            if readable:
                try: chunk=os.read(master,65536)
                except OSError: chunk=b''
                if not chunk: raise RuntimeError('Terminal fixture ended unexpectedly')
                output.extend(chunk)
    try:
        until(b'Shared development password for all nine accounts: ' if scenario=='shared-confirmed' else b'Secret: ')
        if scenario in ['confirmed','shared-confirmed']:
            os.write(master,secret+b'x\x7f\r')
            until(b'Confirm password: ' if scenario=='shared-confirmed' else b'Confirm: ')
            os.write(master,secret+b'\r')
            until(b'TERMINAL_PASS')
            if b'*' not in output: raise RuntimeError('Masking absent')
            if scenario=='shared-confirmed' and (output.count(b'Shared development password for all nine accounts: ')!=1 or output.count(b'Confirm password: ')!=1):
                raise RuntimeError('Expected exactly one shared password prompt and one confirmation')
        elif scenario=='cancelled':
            os.write(master,b'\x03')
            until(b'OPERATOR_CANCELLED')
        else:
            os.write(master,secret+b'\n'+secret+b'\n')
            until(b'MULTILINE_INPUT_REJECTED')
        if secret in output: raise RuntimeError('Secret echoed by terminal')
        if any(secret in arg.encode() for arg in process.args): raise RuntimeError('Secret present in command arguments')
        process.wait(timeout=5)
    finally:
        if process.poll() is None: process.kill(); process.wait()
        os.close(master)
print('PASS: actual PTY masking, one shared password prompt plus one confirmation, backspace, cancellation, multiline rejection and terminal restoration; no fixture secrets printed or supplied in command arguments.')
`;
  console.log(run("python3", ["-c", program, process.execPath, terminalModule], { timeout: 45000 }));
}

function jsonOnControl() {
  return JSON.parse(sql(`SELECT json_build_object('version', current_setting('server_version'),
    'data_directory', current_setting('data_directory'), 'listen_addresses', current_setting('listen_addresses'),
    'socket_only', inet_server_addr() IS NULL)`, "postgres"));
}
function copyMigration(name) {
  const source = join(migrationRoot, name, "migration.sql");
  const contents = readFileSync(source, "utf8");
  assert.doesNotMatch(contents, /^\s*\\(?:connect|c\s|i\s|include|!)/m);
  mkdirSync(join(root, "migrations", name));
  copyFileSync(source, join(root, "migrations", name, "migration.sql"));
  assert.equal(createHash("sha256").update(readFileSync(source)).digest("hex"),
    createHash("sha256").update(readFileSync(join(root, "migrations", name, "migration.sql"))).digest("hex"));
}
function seedSyntheticBusinessRecords(targetDatabase = database) {
  sql(`INSERT INTO "User" (id, email, "passwordHash", role, "updatedAt")
    SELECT id, id || '@example.invalid', 'synthetic-not-a-password-hash', 'USER', now()
    FROM unnest(ARRAY['operator','director-a','director-b','director-c','technical-only','designer','digital','jpm','spm','unmapped']) id;
    INSERT INTO "ArchiveCategory" (id, name, slug, "updatedAt") VALUES ('fixture-category', 'Synthetic category', 'fixture-category', now());
    INSERT INTO "ManualArchiveFile" (id, "fileName", "originalFileName", "archiveCategoryId", "mimeType", "fileSize", bucket, "storageKey", status, "uploadedById", "updatedAt")
    VALUES ('fixture-archive', 'Synthetic archive', 'fixture.pdf', 'fixture-category', 'application/pdf', 7, 'synthetic-no-s3', 'fixture/archive', 'READY', 'operator', now());
    INSERT INTO "ManualLibraryAsset" (id, "assetName", "originalFileName", description, "mimeType", "fileSize", bucket, "storageKey", status, "uploadedById", "updatedAt")
    VALUES ('fixture-library', 'Synthetic library', 'fixture.svg', 'Preservation fixture', 'image/svg+xml', 9, 'synthetic-no-s3', 'fixture/library', 'READY', 'operator', now());
    INSERT INTO "ArchiveFileShareLink" (id, "tokenHash", "manualArchiveFileId", "createdById", "expiresAt", "updatedAt")
    VALUES ('fixture-share', 'synthetic-unused-token-hash', 'fixture-archive', 'operator', now() + interval '1 day', now());`, targetDatabase);
}
function inspectDatabaseObjects() {
  for (const [type, values] of [
    ["BusinessRole", ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DESIGNER", "DIGITAL_LEAD"]],
    ["TechnicalPrivilege", ["TECHNICAL_ADMIN"]], ["AuthorizationAccountStatus", ["ACTIVE", "SUSPENDED"]],
  ]) {
    assert.deepEqual(json(`SELECT json_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = '${type}'`), values);
  }
  const index = sql(`SELECT indexdef FROM pg_indexes WHERE indexname = 'UserAuthorization_one_active_director'`);
  assert.match(index, /UNIQUE/); assert.match(index, /WHERE/); assert.match(index, /DIRECTOR/); assert.match(index, /ACTIVE/);
  const deferred = json(`SELECT json_build_object('deferrable', tgdeferrable, 'deferred', tginitdeferred) FROM pg_trigger WHERE tgname = 'UserAuthorization_preserve_director'`);
  assert.deepEqual(deferred, { deferrable: true, deferred: true });
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('"UserAuthorization"'::regclass, '"UserAuthorizationChange"'::regclass)`), "8");
  assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('"UserAuthorization"'::regclass, '"UserAuthorizationChange"'::regclass) AND confdeltype = 'r' AND confupdtype = 'r'`), "3");
  console.log("PASS: role enums, partial unique index, deferred trigger, retention triggers and restrictive foreign keys exist.");
}
async function checkGovernance() {
  assert.equal(sql('SELECT count(*) FROM "UserAuthorization"'), "0");
  const insertDirector = (id) => `INSERT INTO "UserAuthorization" ("userId", "businessRole") VALUES ('${id}', 'DIRECTOR');`;
  await contend(`BEGIN; ${context("bootstrap-a")} ${insertDirector("director-a")}`,
    transaction(insertDirector("director-b"), "bootstrap-b"), "23505");
  assert.equal(sql(`SELECT count(*) FROM "UserAuthorization" WHERE "businessRole" = 'DIRECTOR'`), "1");
  assert.deepEqual(auth("director-a").technicalPrivileges, []);
  expectedFailure(transaction(insertDirector("director-b")), "23505", "UserAuthorization_one_active_director");
  const beforeFailures = authState();
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "accountStatus" = 'SUSPENDED' WHERE "userId" = 'director-a';`), "23514", "UserAuthorization_director_active");
  expectedFailure(transaction(`DELETE FROM "UserAuthorization" WHERE "userId" = 'director-a';`), "P0001", "must be retained");
  expectedFailure(`DELETE FROM "User" WHERE id = 'director-a';`, "23503", "UserAuthorization_userId_fkey");
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "businessRole" = NULL WHERE "userId" = 'director-a';`), "P0001", "must be replaced atomically");
  assert.deepEqual(authState(), beforeFailures);
  console.log("PASS: zero-Director bootstrap; competing bootstrap really blocked; second Director, suspension, deletion and demotion rejected without side effects.");

  sql(transaction(`INSERT INTO "UserAuthorization" ("userId", "businessRole", "technicalPrivileges") VALUES
    ('technical-only', NULL, ARRAY['TECHNICAL_ADMIN']::"TechnicalPrivilege"[]),
    ('director-b', 'DESIGNER', ARRAY[]::"TechnicalPrivilege"[]),
    ('designer', 'DESIGNER', ARRAY[]::"TechnicalPrivilege"[]);`, "initial-mappings"));
  assert.equal(auth("technical-only").businessRole, null);
  const beforeTransfer = authState();
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'SENIOR_PROJECT_MANAGER' WHERE "userId" = 'director-a';
    UPDATE "UserAuthorization" SET "businessRole" = 'DIRECTOR', "accountStatus" = 'SUSPENDED' WHERE "userId" = 'director-b';`, "failed-transfer"), "23514", "UserAuthorization_director_active");
  assert.deepEqual(authState(), beforeTransfer);
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'DIRECTOR' WHERE "userId" = 'director-b';
    UPDATE "UserAuthorization" SET "businessRole" = NULL WHERE "userId" = 'director-a';`), "23505", "UserAuthorization_one_active_director");
  assert.deepEqual(authState(), beforeTransfer);
  sql(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'SENIOR_PROJECT_MANAGER' WHERE "userId" = 'director-a';
    UPDATE "UserAuthorization" SET "businessRole" = 'DIRECTOR' WHERE "userId" = 'director-b';`, "valid-transfer"));
  assert.equal(auth("director-a").authorizationVersion, 2);
  assert.equal(auth("director-b").authorizationVersion, 2);
  assert.deepEqual(auth("director-b").technicalPrivileges, []);
  assert.deepEqual(auth("technical-only").technicalPrivileges, ["TECHNICAL_ADMIN"]);
  const history = json(`SELECT json_agg(h ORDER BY "userId") FROM "UserAuthorizationChange" h WHERE "changeId" = 'valid-transfer'`);
  assert.equal(history.length, 2);
  for (const entry of history) {
    assert.equal(entry.actorUserId, "operator");
    assert.equal(entry.before.authorizationVersion, 1);
    assert.equal(entry.after.authorizationVersion, 2);
    assert.deepEqual(entry.after, auth(entry.userId));
  }
  // Competing transfers must serialize on the outgoing Director and honor CAS.
  const demote = `DO $$ BEGIN
    UPDATE "UserAuthorization" SET "businessRole" = NULL
      WHERE "userId" = 'director-b' AND "businessRole" = 'DIRECTOR' AND "authorizationVersion" = 2;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stale Director transfer'; END IF;
  END $$;`;
  await contend(`BEGIN; ${context("transfer-winner")} ${demote} ${insertDirector("director-c")}`,
    transaction(`${demote} UPDATE "UserAuthorization" SET "businessRole" = 'DIRECTOR' WHERE "userId" = 'director-a';`, "transfer-loser"), "P0001");
  assert.equal(sql(`SELECT "userId" FROM "UserAuthorization" WHERE "businessRole" = 'DIRECTOR'`), "director-c");
  assert.equal(sql(`SELECT count(*) FROM "UserAuthorizationChange" WHERE "changeId" = 'transfer-loser'`), "0");
  console.log("PASS: transfer ordering, deferred commit enforcement, atomic rollback, independent technical privileges and real-actor history.");
}
function checkAuditAndVersions() {
  const before = authState();
  expectedFailure(`UPDATE "UserAuthorization" SET "businessRole" = 'DIGITAL_LEAD' WHERE "userId" = 'designer';`, "P0001", "require an actor, reason and change ID");
  expectedFailure(`BEGIN; ${context("blank-reason", "operator", " ")} UPDATE "UserAuthorization" SET "businessRole" = 'DIGITAL_LEAD' WHERE "userId" = 'designer'; COMMIT;`, "P0001", "require an actor, reason and change ID");
  expectedFailure(`BEGIN; ${context("unknown-actor", "missing-user")} UPDATE "UserAuthorization" SET "businessRole" = 'DIGITAL_LEAD' WHERE "userId" = 'designer'; COMMIT;`, "23503", "UserAuthorizationChange_actorUserId_fkey");
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "authorizationVersion" = 10 WHERE "userId" = 'designer';`), "P0001", "version changes require");
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'SUPER_ADMIN' WHERE "userId" = 'designer';`), "22P02", "BusinessRole");
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "technicalPrivileges" = ARRAY['TECHNICAL_ADMIN','TECHNICAL_ADMIN']::"TechnicalPrivilege"[] WHERE "userId" = 'designer';`), "23514", "technical_privileges_set");
  expectedFailure(transaction(`UPDATE "UserAuthorization" SET "technicalPrivileges" = ARRAY[NULL]::"TechnicalPrivilege"[] WHERE "userId" = 'designer';`), "23514", "technical_privileges_set");
  expectedFailure(`BEGIN; ${context("whitespace-reason")} SET LOCAL flux.authorization_reason = E'\\n\\t';
    UPDATE "UserAuthorization" SET "businessRole" = 'DIGITAL_LEAD' WHERE "userId" = 'designer'; COMMIT;`, "P0001", "require an actor, reason and change ID");
  assert.deepEqual(authState(), before);
  sql('UPDATE "UserAuthorization" SET "businessRole" = "businessRole" WHERE "userId" = \'designer\';');
  assert.deepEqual(authState(), before);

  sql(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'DIGITAL_LEAD', "authorizationVersion" = 999 WHERE "userId" = 'designer';`, "role-change"));
  assert.equal(auth("designer").authorizationVersion, 2);
  sql(transaction(`UPDATE "UserAuthorization" SET "technicalPrivileges" = ARRAY['TECHNICAL_ADMIN']::"TechnicalPrivilege"[] WHERE "userId" = 'designer';`, "technical-grant"));
  assert.equal(auth("designer").authorizationVersion, 3);
  sql(transaction(`UPDATE "UserAuthorization" SET "accountStatus" = 'SUSPENDED' WHERE "userId" = 'designer';`, "suspend"));
  assert.equal(auth("designer").authorizationVersion, 4);
  assert.equal(auth("designer").businessRole, "DIGITAL_LEAD");
  assert.deepEqual(auth("designer").technicalPrivileges, ["TECHNICAL_ADMIN"]);
  sql(transaction(`UPDATE "UserAuthorization" SET "accountStatus" = 'ACTIVE' WHERE "userId" = 'designer';`, "reactivate"));
  assert.equal(auth("designer").authorizationVersion, 5);
  const entries = json(`SELECT json_agg(h ORDER BY "authorizationVersion") FROM "UserAuthorizationChange" h WHERE "userId" = 'designer'`);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].before, null);
  for (let i = 0; i < entries.length; i += 1) {
    assert.equal(entries[i].actorUserId, "operator");
    assert.equal(entries[i].authorizationVersion, i + 1);
    assert.equal(entries[i].after.authorizationVersion, i + 1);
    if (i > 0) assert.deepEqual(entries[i].before, entries[i - 1].after);
  }
  assert.deepEqual(entries.at(-1).after, auth("designer"));
  const stable = authState();
  sql(transaction(`UPDATE "UserAuthorization" SET "businessRole" = 'DESIGNER' WHERE "userId" = 'designer' AND "authorizationVersion" = 1;`, "stale"));
  assert.deepEqual(authState(), stable);
  for (const statement of [
    'UPDATE "UserAuthorizationChange" SET reason = \'rewritten\';',
    'DELETE FROM "UserAuthorizationChange";', 'TRUNCATE "UserAuthorizationChange";', 'TRUNCATE "UserAuthorization";',
  ]) expectedFailure(statement, "P0001", "must be retained");
  assert.deepEqual(authState(), stable);
  // Audit history must not accept fabricated versions unrelated to an assignment write.
  expectedFailure(`INSERT INTO "UserAuthorizationChange" ("userId", "authorizationVersion", "actorUserId", "changeId", reason, "after")
    VALUES ('designer', 99, 'operator', 'forged', 'fabricated history', '{}');`, "P0001", "generated by authorization changes");
  expectedFailure(`COPY "UserAuthorizationChange" ("userId", "authorizationVersion", "actorUserId", "changeId", reason, "after") FROM STDIN;
designer\t99\toperator\tforged-copy\tfabricated history\t{}
\\.
`, "P0001", "generated by authorization changes");
  assert.deepEqual(authState(), stable);
  console.log("PASS: versions, no-op/stale writes, suspension/reactivation, attribution requirements and immutable, trigger-generated audit history.");
}

// Phase 1.3: only a NEW private cluster. Never accept URLs/credentials or reuse a DB.
import assert from "node:assert/strict";
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
    `-h '' -k ${socket} -p ${port} -c unix_socket_permissions=0700`, "-w", "start"]);
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
  if (process.argv.includes("--services") || process.argv.includes("--provisioning")) checkAssignmentServices();
  if (process.argv.includes("--provisioning")) checkProvisioning();
  console.log("Existing application databases, credentials, S3 and runtime authorization were not used.");
} finally {
  cleanup();
  console.log("Disposable PostgreSQL cluster stopped and removed.");
}

function checkAssignmentServices() {
  // A second NEW database keeps service bootstrap fixtures independent of the
  // original governance suite. Same private cluster; no inherited app URL.
  const serviceDatabase = "flux_v2_authorization_service_test";
  sql(`CREATE DATABASE "${serviceDatabase}"`, "postgres");
  const serviceUrl = databaseUrl.replace(`/${database}?`, `/${serviceDatabase}?`);
  const serviceEnv = { ...prismaEnv, DATABASE_URL: serviceUrl, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" };
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { env: serviceEnv });
  const clientPath = join(root, "client"), generatedSchema = join(root, "client.prisma");
  mkdirSync(join(root, "node_modules/@prisma"), { recursive: true });
  symlinkSync(dirname(require.resolve("@prisma/client/package.json")), join(root, "node_modules/@prisma/client"), "dir");
  writeFileSync(generatedSchema, readFileSync(schemaPath, "utf8").replace(
    'provider        = "prisma-client-js"', `provider        = "prisma-client-js"\n  output = ${JSON.stringify(clientPath)}`,
  ));
  run(process.execPath, [prismaCli, "generate", "--schema", generatedSchema], { env: serviceEnv });
  const configPath = join(root, "tsconfig.services.json"), output = join(root, "compiled");
  const paths = { "@/*": [join(repository, "src/*")], "@prisma/client": [clientPath] };
  writeFileSync(configPath, JSON.stringify({
    extends: join(repository, "scripts/tsconfig.authorization-services.json"),
    compilerOptions: { outDir: output, paths, typeRoots: [join(repository, "node_modules/@types")] },
  }));
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", configPath], { timeout: 60000 });
  // Next resolves server-only as an empty module on the server. Reproduce that
  // boundary ONLY inside disposable Node test output; production imports retain
  // the Next client-build poison marker. Nothing is installed in the repository.
  const marker = join(output, "node_modules/server-only");
  mkdirSync(marker, { recursive: true });
  writeFileSync(join(marker, "index.js"), "// Isolated Node server test only.\n");
  console.log(run(process.execPath, [join(output, "scripts/authorization-services-integration-check.js")], {
    env: { ...serviceEnv, FLUX_AUTH_TEST_ROOT: root, FLUX_AUTH_TEST_URL: serviceUrl, FLUX_AUTH_TEST_CLIENT: clientPath },
    timeout: 60000,
  }));
  const drift = run(process.execPath, [prismaCli, "migrate", "diff", "--from-url", serviceUrl,
    "--to-schema-datamodel", schemaPath, "--script"], { env: serviceEnv });
  assert.match(drift, /This is an empty migration/);
  console.log("PASS: Phase 1.4A Prisma service integration, targeted TypeScript and empty schema drift.");
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
function seedSyntheticBusinessRecords() {
  sql(`INSERT INTO "User" (id, email, "passwordHash", role, "updatedAt")
    SELECT id, id || '@example.invalid', 'synthetic-not-a-password-hash', 'USER', now()
    FROM unnest(ARRAY['operator','director-a','director-b','director-c','technical-only','designer','digital','jpm','spm','unmapped']) id;
    INSERT INTO "ArchiveCategory" (id, name, slug, "updatedAt") VALUES ('fixture-category', 'Synthetic category', 'fixture-category', now());
    INSERT INTO "ManualArchiveFile" (id, "fileName", "originalFileName", "archiveCategoryId", "mimeType", "fileSize", bucket, "storageKey", status, "uploadedById", "updatedAt")
    VALUES ('fixture-archive', 'Synthetic archive', 'fixture.pdf', 'fixture-category', 'application/pdf', 7, 'synthetic-no-s3', 'fixture/archive', 'READY', 'operator', now());
    INSERT INTO "ManualLibraryAsset" (id, "assetName", "originalFileName", description, "mimeType", "fileSize", bucket, "storageKey", status, "uploadedById", "updatedAt")
    VALUES ('fixture-library', 'Synthetic library', 'fixture.svg', 'Preservation fixture', 'image/svg+xml', 9, 'synthetic-no-s3', 'fixture/library', 'READY', 'operator', now());
    INSERT INTO "ArchiveFileShareLink" (id, "tokenHash", "manualArchiveFileId", "createdById", "expiresAt", "updatedAt")
    VALUES ('fixture-share', 'synthetic-unused-token-hash', 'fixture-archive', 'operator', now() + interval '1 day', now());`);
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

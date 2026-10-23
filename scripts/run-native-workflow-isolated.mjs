import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
const require = createRequire(import.meta.url), repository = resolve(import.meta.dirname, "..");
export function runNativeWorkflowSuite(kind) {
  assert.ok(["tasks", "concepts"].includes(kind));
  const root = mkdtempSync("/private/tmp/flux-native-"), socket = join(root, "s"), data = join(root, "data");
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", PGPASSFILE: join(root, "no-pass"), PGSERVICEFILE: join(root, "no-service"), NODE_PATH: join(repository, "node_modules"), FLUX_NATIVE_TEST_ROOT: root, NEXT_PUBLIC_REALTIME_PROVIDER: "none", APP_URL: "http://fixture.invalid" };
  let started = false;
  const run = (command, args, options = {}) => { const r = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...options }); if (r.status !== 0) throw new Error(r.stdout + r.stderr + (r.error?.message ?? "")); return r.stdout.trim(); };
  const sql = (statement, database) => run("psql", ["-X", "-qAt", "-h", socket, "-p", "55432", "-U", "native_test", "-d", database, "-v", "ON_ERROR_STOP=1"], { input: statement });
  const prisma = args => run(process.execPath, [require.resolve("prisma/build/index.js"), ...args]);
  try {
    mkdirSync(socket); run("initdb", ["-D", data, "--username=native_test", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
    run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-k ${socket} -p 55432 -h '' -c shared_buffers=16MB -c max_connections=25`, "-w", "start"]); started = true;
    const schema = readFileSync(join(repository, "prisma/schema.prisma"), "utf8"), schemaPath = join(root, "schema.prisma");
    writeFileSync(schemaPath, schema); mkdirSync(join(root, "migrations")); copyFileSync(join(repository, "prisma/migrations/migration_lock.toml"), join(root, "migrations/migration_lock.toml"));
    const migrations = readdirSync(join(repository, "prisma/migrations")).filter(n => /^\d+_/.test(n)).sort();
    for (const name of migrations) { mkdirSync(join(root, "migrations", name)); copyFileSync(join(repository, "prisma/migrations", name, "migration.sql"), join(root, "migrations", name, "migration.sql")); }
    if (kind === "tasks") {
      // Rehearse the historical assignment migration in chronological order.
      const history = join(root, "history"), cutoff = "20261005200000_task_assignment_sender";
      mkdirSync(join(history, "migrations"), { recursive: true }); writeFileSync(join(history, "schema.prisma"), schema);
      copyFileSync(join(root, "migrations/migration_lock.toml"), join(history, "migrations/migration_lock.toml"));
      const historyCopy = name => { mkdirSync(join(history, "migrations", name)); copyFileSync(join(root, "migrations", name, "migration.sql"), join(history, "migrations", name, "migration.sql")); };
      for (const name of migrations.filter(n => n < cutoff)) historyCopy(name);
      run("createdb", ["-h", socket, "-p", "55432", "-U", "native_test", "native_history"]);
      env.DATABASE_URL = env.DIRECT_URL = `postgresql://native_test@localhost:55432/native_history?host=${encodeURIComponent(socket)}&connect_timeout=5`;
      prisma(["migrate", "deploy", "--schema", join(history, "schema.prisma")]);
      sql(readFileSync(join(repository, "scripts/native-task-assignment-fixture.sql"), "utf8"), "native_history");
      for (const name of migrations.filter(n => n >= cutoff)) historyCopy(name);
      prisma(["migrate", "deploy", "--schema", join(history, "schema.prisma")]);
      assert.equal(sql(`SELECT "assignedById" FROM "ProjectConceptFolder" WHERE id='legacy-assigned-task'`, "native_history"), "legacy-task-admin");
      assert.equal(sql(`SELECT count(*) FROM "ProjectConceptFolder" WHERE id IN ('legacy-unassigned-task','legacy-unknown-creator-task') AND "assignedById" IS NULL`, "native_history"), "2");
      assert.equal(sql(`SELECT count(*) FROM "ProjectConceptFolder" WHERE "assignedExecutorId"='legacy-task-user'`, "native_history"), "2");
      console.log("PASS historical assignment migration: 3 assertions; recorded creator preserved; unassigned/unknown assigners not invented; received tasks preserved.");
    }
    const client = join(root, "client"); mkdirSync(join(root, "node_modules/@prisma"), { recursive: true }); symlinkSync(dirname(require.resolve("@prisma/client/package.json")), join(root, "node_modules/@prisma/client"));
    writeFileSync(join(root, "client.prisma"), schema.replace('provider        = "prisma-client-js"', `provider        = "prisma-client-js"\n  output = ${JSON.stringify(client)}`));
    env.DATABASE_URL = env.DIRECT_URL = `postgresql://native_test@localhost:55432/native_template?host=${encodeURIComponent(socket)}&connect_timeout=5`;
    run("createdb", ["-h", socket, "-p", "55432", "-U", "native_test", "native_template"]);
    assert.equal(sql("SHOW listen_addresses", "native_template"), ""); assert.equal(sql("SHOW data_directory", "native_template"), data);
    prisma(["migrate", "deploy", "--schema", schemaPath]); prisma(["generate", "--schema", join(root, "client.prisma")]);
    const output = join(root, "compiled"), config = join(root, "tsconfig.json");
    writeFileSync(config, JSON.stringify({ extends: join(repository, kind === "tasks" ? "scripts/tsconfig.tasks-integration.json" : "scripts/tsconfig.project-concept-integration.json"), compilerOptions: { outDir: output, paths: { "@/*": [join(repository, "src/*")], "@prisma/client": [client] }, typeRoots: [join(repository, "node_modules/@types")] } }));
    run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", config]); env.COMPILED_ALIAS_ROOT = output;
    const suites = kind === "tasks" ? ["tasks-integration-check", "user-projects-integration-check"] : ["project-concept-completion-revocation-check", "project-stage-skip-revocation-check", "project-concept-manual-stage-check", "project-concept-completion-request-check", "project-concept-without-file-check", "project-concept-integration-check", "project-concept-round-four-integration-check"];
    const failures = [];
    for (const [index, suite] of suites.entries()) {
      const database = `native_${kind}_${index}`;
      run("createdb", ["-h", socket, "-p", "55432", "-U", "native_test", "-T", "native_template", database]);
      env.DATABASE_URL = env.DIRECT_URL = `postgresql://native_test@localhost:55432/${database}?host=${encodeURIComponent(socket)}&connect_timeout=5`;
      console.log(`RUN ${suite}: private Unix socket, fresh database, real V2 authorization`);
      try { console.log(run(process.execPath, ["-r", join(repository, "scripts/native-workflow-bootstrap.cjs"), join(output, `scripts/${suite}.js`)])); }
      catch (error) { failures.push(suite); console.error(String(error)); }
    }
    if (failures.length) throw new Error(`Native suites failed: ${failures.join(", ")}`);
  } finally { if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); rmSync(root, { recursive: true, force: true }); console.log("Disposable native-workflow database removed; no Neon or live storage used."); }
}

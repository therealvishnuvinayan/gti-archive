import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { withoutTaskerSchema, withoutTaskDeliverablesSchema, withoutTaskConceptsSchema, withoutTaskSistersSchema, withoutStageBuilderSchema, withoutWorkflowPublicationSchema, withoutStageRuntimeSchema } from "./tasker-schema-baseline.mjs";
const require = createRequire(import.meta.url), repository = resolve(import.meta.dirname, ".."), root = mkdtempSync("/private/tmp/flux-v2-tasker-");
const runtimeCandidate = "20261023030000_stage_runtime";
const publicationCandidate = "20261023020000_workflow_publication";
const draftsCandidate = "20261023010000_stage_builder_drafts";
const sistersCandidate = "20261022030000_universal_tasker_sisters";
const conceptsCandidate = "20261022010000_universal_tasker_concepts";
const deliverablesCandidate = "20261021230000_universal_tasker_deliverables";
const socket = join(root, "s"), data = join(root, "data"), candidate = "20261021210000_universal_tasker_general";
const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", PGPASSFILE: join(root, "no-pass"), PGSERVICEFILE: join(root, "no-service") };
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const localEnv = { ...env, DATABASE_URL: url, DIRECT_URL: url, NODE_PATH: join(repository, "node_modules"), FLUX_TASKER_TEST_ROOT: root, FLUX_TASKER_TEST_URL: url };
let started = false;
function run(command, args, options = {}) { const r = spawnSync(command, args, { cwd: root, env: localEnv, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options }); if (r.status !== 0) throw new Error(r.stdout + r.stderr + (r.error?.message ?? "")); return r.stdout.trim(); }
const sql = statement => run("psql", ["-X", "-qAt", "-h", socket, "-p", "55432", "-U", "flux_tasker_test", "-d", "flux_tasker_test", "-v", "ON_ERROR_STOP=1"], { input: statement });
const prisma = args => run(process.execPath, [require.resolve("prisma/build/index.js"), ...args]);
try {
  mkdirSync(socket); run("initdb", ["-D", data, "--username=flux_tasker_test", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-k ${socket} -p 55432 -h '' -c shared_buffers=16MB -c max_connections=25`, "-w", "start"]); started = true;
  run("createdb", ["-h", socket, "-p", "55432", "-U", "flux_tasker_test", "flux_tasker_test"]);
  assert.equal(sql("SHOW listen_addresses"), ""); assert.equal(sql("SHOW data_directory"), data);
  const runtimeSchema = readFileSync(join(repository, "prisma/schema.prisma"), "utf8"), completeSchema = withoutStageRuntimeSchema(runtimeSchema), schema = withoutStageBuilderSchema(completeSchema), schemaPath = join(root, "schema.prisma");
  mkdirSync(join(root, "migrations")); copyFileSync(join(repository, "prisma/migrations/migration_lock.toml"), join(root, "migrations/migration_lock.toml"));
  const migrations = readdirSync(join(repository, "prisma/migrations")).filter(n => /^\d+_/.test(n)).sort();
  function copy(name) { mkdirSync(join(root, "migrations", name)); copyFileSync(join(repository, "prisma/migrations", name, "migration.sql"), join(root, "migrations", name, "migration.sql")); }
  for (const name of migrations.filter(n => n !== runtimeCandidate && n !== candidate && n !== deliverablesCandidate && n !== conceptsCandidate && n !== sistersCandidate && n !== draftsCandidate && n !== publicationCandidate)) copy(name);
  writeFileSync(schemaPath, withoutTaskerSchema(schema)); prisma(["validate", "--schema", schemaPath]); prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations"'), "108"); assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "112");
  assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
  const client = join(root, "client"); mkdirSync(join(root, "node_modules/@prisma"), { recursive: true }); symlinkSync(dirname(require.resolve("@prisma/client/package.json")), join(root, "node_modules/@prisma/client"));
  writeFileSync(join(root, "client.prisma"), runtimeSchema.replace('provider        = "prisma-client-js"', `provider        = "prisma-client-js"\n  output = ${JSON.stringify(client)}`)); prisma(["generate", "--schema", join(root, "client.prisma")]);
  const output = join(root, "compiled"), config = join(root, "tsconfig.json"); writeFileSync(config, JSON.stringify({ extends: join(repository, "scripts/tsconfig.universal-tasker.json"), compilerOptions: { outDir: output, paths: { "@/*": [join(repository, "src/*")], "@prisma/client": [client] }, typeRoots: [join(repository, "node_modules/@types")] } }));
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", config]); mkdirSync(join(output, "node_modules/server-only"), { recursive: true }); writeFileSync(join(output, "node_modules/server-only/index.js"), "");
  const test = join(output, "scripts/universal-tasker-integration-check.js"); console.log(run(process.execPath, [test, "--seed"]));
  const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
  const snapshot = () => tables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${candidate}'` : ""}`));
  const before = snapshot(); copy(candidate); writeFileSync(schemaPath, withoutTaskDeliverablesSchema(schema)); prisma(["migrate", "deploy", "--schema", schemaPath]); assert.deepEqual(snapshot(), before);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations"'), "109"); assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "116");
  assert.equal(sql('SELECT count(*) FROM "UniversalTask"'), "0"); assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
  console.log("PASS populated migration: 108/112 → 109/116; all previous rows/checksums preserved; zero backfill; zero schema drift.");
  console.log(run(process.execPath, [test]));
  const phase31Tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
  const phase31Snapshot = () => phase31Tables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${deliverablesCandidate}'` : ""}`));
  const preserved = phase31Snapshot(); copy(deliverablesCandidate); writeFileSync(schemaPath, withoutTaskConceptsSchema(schema)); prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.deepEqual(phase31Snapshot(), preserved);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations"'), "110"); assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "119");
  assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
  console.log("PASS Phase 3.2 populated migration: 109/116 → 110/119; all prior rows/checksums preserved; zero schema drift; pre-migration GENERAL passed.");
  console.log(run(process.execPath, [join(output, "scripts/tasker-deliverables-integration-check.js")]));
  const phase32Tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
  const phase32Snapshot = () => phase32Tables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${conceptsCandidate}'` : ""}`));
  const phase32Before = phase32Snapshot(); copy(conceptsCandidate); writeFileSync(schemaPath, withoutTaskSistersSchema(schema)); prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.deepEqual(phase32Snapshot(), phase32Before);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations"'), "111"); assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "120");
  assert.equal(sql('SELECT count(*) FROM "UniversalTaskReference"'), "0");
  assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='"UniversalTaskReference"'::regclass AND contype='f' AND convalidated AND confdeltype='r' AND confupdtype='r'`), "7");
  assert.equal(sql(`SELECT count(*) FROM pg_index WHERE indrelid='"UniversalTaskReference"'::regclass AND indisvalid AND indisready`), "4");
  assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='"UniversalTaskReference"'::regclass AND contype='c' AND convalidated`), "1");
  assert.equal(sql(`SELECT count(*) FROM pg_trigger WHERE tgname IN ('flux_task_reference_guard','flux_task_reference_truncate','flux_task_reference_consistency','flux_task_concept_consistency') AND tgenabled='O'`), "4");
  assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
  console.log("PASS Phase 3.3 populated migration: 110/119 → 111/120; every prior row/checksum preserved; no backfill; no drift; General/deliverables with flag off passed before candidate.");
  console.log(run(process.execPath, [join(output, "scripts/tasker-concepts-integration-check.js")]));
  console.log(run(process.execPath, [join(output, "scripts/tasker-sisters-integration-check.js"), "--baseline"]));
  const phase33Tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
  const phase33Snapshot = () => phase33Tables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${sistersCandidate}'` : ""}`));
  const phase33Before = phase33Snapshot(); copy(sistersCandidate); writeFileSync(schemaPath, schema); prisma(["migrate", "deploy", "--schema", schemaPath]);
  assert.deepEqual(phase33Snapshot(), phase33Before);
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), "112");
  assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL'), "0");
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "122");
  for (const table of ["UniversalTaskFamilyLink", "UniversalTaskInheritedEvidence"]) assert.equal(sql(`SELECT count(*) FROM "${table}"`), "0");
  assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
  for (const [table, foreignKeys, indexes] of [["UniversalTaskFamilyLink", 4, 4], ["UniversalTaskInheritedEvidence", 5, 3]]) {
    assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='"${table}"'::regclass AND contype='f' AND convalidated AND confdeltype='r' AND confupdtype='r'`), String(foreignKeys));
    assert.equal(sql(`SELECT count(*) FROM pg_index WHERE indrelid='"${table}"'::regclass AND indisvalid AND indisready`), String(indexes));
    assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='"${table}"'::regclass AND contype='c' AND convalidated`), "1");
  }
  assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname IN ('flux_task_family_guard','flux_task_family_truncate','flux_task_inherited_guard','flux_task_inherited_truncate','flux_task_family_entry_consistency','flux_task_family_consistency','flux_task_inherited_consistency') AND tgenabled='O'"), "7");
  console.log("PASS Phase 3.4 populated migration: 111/120 → 112/122; completed tasks across all six types, exact files, native reviews, events, accounts and legacy rows unchanged; zero backfill/drift.");
  console.log(run(process.execPath, [join(output, "scripts/tasker-sisters-integration-check.js")]));

  if (process.argv.includes("--stage-builder") || (process.argv.includes("--workflow-publication") || process.argv.includes("--stage-runtime"))) {
    const draftTest = join(output, "scripts/stage-builder-integration-check.js");
    console.log(run(process.execPath, [draftTest, "--baseline"]));
    const oldTables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
    const snapshot112 = () => oldTables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${draftsCandidate}'` : ""}`));
    const before112 = snapshot112(); copy(draftsCandidate); writeFileSync(schemaPath, withoutWorkflowPublicationSchema(completeSchema)); prisma(["migrate", "deploy", "--schema", schemaPath]);
    assert.deepEqual(snapshot112(), before112);
    assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), "113");
    assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "124");
    for (const table of ["WorkflowDraft", "WorkflowDraftRevision"]) assert.equal(sql(`SELECT count(*) FROM "${table}"`), "0");
    assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
    console.log("PASS Phase 4.1 populated migration: 112/122 → 113/124; all previous tables and ledger checksums unchanged; zero backfill, drafts, publication and schema drift.");
    console.log(run(process.execPath, [draftTest]));
    if ((process.argv.includes("--workflow-publication") || process.argv.includes("--stage-runtime"))) {
      const publicationTest = join(output, "scripts/workflow-publication-integration-check.js");
      console.log(run(process.execPath, [publicationTest, "--baseline"]));
      const tables113 = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
      const snapshot113 = () => tables113.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${publicationCandidate}'` : ""}`));
      const before113 = snapshot113(); copy(publicationCandidate); writeFileSync(schemaPath, completeSchema); prisma(["migrate", "deploy", "--schema", schemaPath]);
      assert.deepEqual(snapshot113(), before113);
      assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), "114");
      assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL'), "0");
      assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "128");
      for (const table of ["WorkflowPublicationSubmission", "WorkflowPublicationAudit", "PublishedWorkflow", "PublishedWorkflowVersion"]) assert.equal(sql(`SELECT count(*) FROM "${table}"`), "0");
      assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
      console.log("PASS Phase 4.2 populated migration: 113/124 → 114/128; all existing draft revisions, six Tasker types, Sisters, file provenance, events, accounts and ledger preserved; empty publication tables; zero drift.");
      const publicationTables = "'WorkflowPublicationSubmission','WorkflowPublicationAudit','PublishedWorkflow','PublishedWorkflowVersion'";
      console.log("Publication object inventory: " + sql(`SELECT json_build_object(
        'indexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relname IN (${publicationTables}) AND i.indisvalid AND i.indisready),
        'foreignKeys',(SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname IN (${publicationTables}) AND c.contype='f' AND c.convalidated),
        'checks',(SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname IN (${publicationTables}) AND c.contype='c' AND c.convalidated),
        'newFunctions',(SELECT count(*) FROM pg_proc WHERE proname IN ('flux_workflow_actor_current','flux_workflow_publication_guard','flux_workflow_approval_consistency','flux_workflow_publication_consistency','flux_workflow_supersede_review','flux_emit_workflow_publication_event')),
        'newTriggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN ('flux_workflow_publication_guard','flux_workflow_publication_truncate','flux_workflow_publication_consistency','flux_workflow_supersede_review','flux_emit_workflow_publication_event')))`));
      console.log(run(process.execPath, [publicationTest]));
      if (process.argv.includes("--stage-runtime")) {
        const runtimeTest = join(output, "scripts/stage-runtime-integration-check.js");
        console.log(run(process.execPath, [runtimeTest, "--baseline"]));
        const oldTables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
        const snapshot114 = () => oldTables.map(t => sql(`SELECT coalesce(jsonb_agg(to_jsonb(t)-ARRAY['runtimeStageId','runtimeSubmissionId'] ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t === "_prisma_migrations" ? `WHERE migration_name <> '${runtimeCandidate}'` : ""}`));
        const before114 = snapshot114(); copy(runtimeCandidate); writeFileSync(schemaPath, runtimeSchema); prisma(["migrate", "deploy", "--schema", schemaPath]);
        assert.deepEqual(snapshot114(), before114);
        assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'), "115");
        assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "134");
        assert.match(prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--script"]), /empty migration/);
        console.log("PASS Phase 4.3 populated migration: 114/128 → 115/134; every pre-existing column/row and ledger checksum preserved, nullable file adapters empty; no backfill/drift.");
        console.log("Runtime object inventory: " + sql(`SELECT json_build_object(
          'newTables',(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Runtime%'),
          'indexes',(SELECT count(*) FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid WHERE t.relname LIKE 'Runtime%' AND i.indisvalid AND i.indisready),
          'foreignKeys',(SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname LIKE 'Runtime%' AND c.contype='f' AND c.convalidated),
          'checks',(SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname LIKE 'Runtime%' AND c.contype='c' AND c.convalidated),
          'newFunctions',(SELECT count(*) FROM pg_proc WHERE proname IN ('flux_runtime_authorized','flux_runtime_ready','flux_runtime_guard','flux_runtime_consistency','flux_emit_runtime_event','flux_runtime_approval_write','flux_runtime_approval_consistency')),
          'newTriggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN ('flux_runtime_guard','flux_runtime_truncate','flux_runtime_consistency','flux_emit_runtime_event')))`));
        console.log(run(process.execPath, [runtimeTest]));
      }
    }

  }

} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true }); console.log("Disposable Tasker PostgreSQL removed; no application database or real storage used.");
}

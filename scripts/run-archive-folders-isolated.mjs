// Phase 6.1 always uses a newly created private cluster. Never accepts a DB URL.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { archiveFoldersMigration, withoutArchiveFoldersSchema } from "./archive-folders-schema-baseline.mjs";
const repository=resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const root=mkdtempSync("/private/tmp/flux-v2-auth-pg-"), data=join(root,"data"),socket=join(root,"s"),client=join(root,"client"),schemaPath=join(root,"schema.prisma");
const url=`postgresql://flux_v2_test@localhost:55432/flux_v2_archives_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const env={PATH:process.env.PATH,LANG:"C",LC_ALL:"C",CHECKPOINT_DISABLE:"1",PRISMA_HIDE_UPDATE_MESSAGE:"1",PGPASSFILE:join(root,"no-pass"),PGSERVICEFILE:join(root,"no-service"),DATABASE_URL:url,DIRECT_URL:url};
const localEnv={...env,NODE_ENV:"production",NODE_PATH:join(repository,"node_modules"),FLUX_AUTH_TEST_ROOT:root,FLUX_AUTH_TEST_URL:url,FLUX_AUTH_TEST_CLIENT:client};
const run=(command,args,options={})=>{const r=spawnSync(command,args,{cwd:root,env,encoding:"utf8",timeout:120000,maxBuffer:20*1024*1024,...options});if(r.status!==0)throw new Error(r.stdout+r.stderr+(r.error?.message??""));return r.stdout.trim();};
const pg=["-X","-qAt","-h",socket,"-p","55432","-U","flux_v2_test","-d","flux_v2_archives_test","-v","ON_ERROR_STOP=1"];
const sql=input=>run("psql",pg,{input});
const prisma=args=>run(process.execPath,[require.resolve("prisma/build/index.js"),...args]);
let started=false;
try {
 mkdirSync(socket,{mode:0o700});run("initdb",["-D",data,"-U","flux_v2_test","-A","trust","--no-locale","--encoding=UTF8"]);
 run("pg_ctl",["-D",data,"-l",join(root,"pg.log"),"-o",`-k ${socket} -p 55432 -h '' -c unix_socket_permissions=0700 -c shared_buffers=16MB -c max_connections=25`,"-w","start"]);started=true;
 run("createdb",["-h",socket,"-p","55432","-U","flux_v2_test","flux_v2_archives_test"]);
 assert.equal(sql("SHOW data_directory"),data);assert.equal(sql("SHOW listen_addresses"),"");console.log("Disposable PostgreSQL "+sql("SHOW server_version")+"; socket only.");
 const schema=readFileSync(join(repository,"prisma/schema.prisma"),"utf8"),migrations=join(repository,"prisma/migrations");
 mkdirSync(join(root,"migrations"));copyFileSync(join(migrations,"migration_lock.toml"),join(root,"migrations/migration_lock.toml"));
 const copy=name=>{mkdirSync(join(root,"migrations",name));copyFileSync(join(migrations,name,"migration.sql"),join(root,"migrations",name,"migration.sql"));};
 for(const name of readdirSync(migrations).filter(n=>/^\d+_/.test(n)&&n!==archiveFoldersMigration))copy(name);
 writeFileSync(schemaPath,withoutArchiveFoldersSchema(schema));prisma(["migrate","deploy","--schema",schemaPath]);
 assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),"116");assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),"150");
 assert.match(prisma(["migrate","diff","--from-url",url,"--to-schema-datamodel",schemaPath,"--script"]),/empty migration/);
 mkdirSync(join(root,"node_modules/@prisma"),{recursive:true});symlinkSync(dirname(require.resolve("@prisma/client/package.json")),join(root,"node_modules/@prisma/client"));
 writeFileSync(join(root,"client.prisma"),schema.replace('provider        = "prisma-client-js"',`provider        = "prisma-client-js"\n  output = ${JSON.stringify(client)}`));prisma(["generate","--schema",join(root,"client.prisma")]);
 const output=join(root,"compiled"),config=join(root,"tsconfig.json");writeFileSync(config,JSON.stringify({extends:join(repository,"scripts/tsconfig.archive-folders.json"),compilerOptions:{outDir:output,paths:{"@/*":[join(repository,"src/*")],"@prisma/client":[client]},typeRoots:[join(repository,"node_modules/@types")]}}));
 run(process.execPath,[require.resolve("typescript/bin/tsc"),"--project",config]);mkdirSync(join(output,"node_modules/server-only"),{recursive:true});writeFileSync(join(output,"node_modules/server-only/index.js"),"");
 const test=join(output,"scripts/archive-folders-integration-check.js");console.log(run(process.execPath,[test,"--seed"],{env:localEnv}));
 const tables=sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
 const snapshot=()=>tables.map(t=>sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') FROM "${t}" t ${t==="_prisma_migrations"?`WHERE migration_name <> '${archiveFoldersMigration}'`:""}`));
 const catalog=()=>JSON.parse(sql(`SELECT coalesce(jsonb_object_agg(kind||':'||name,definition),'{}') FROM (
 SELECT 'table' AS kind,tablename::text AS name,tablename::text AS definition FROM pg_tables WHERE schemaname='public'
 UNION ALL SELECT 'index',indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 UNION ALL SELECT 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid<>0
 UNION ALL SELECT 'function',oid::regprocedure::text,pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'
 UNION ALL SELECT 'trigger',tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
 UNION ALL SELECT 'enum',typname,string_agg(enumlabel,',' ORDER BY enumsortorder) FROM pg_type JOIN pg_enum ON enumtypid=pg_type.oid WHERE typnamespace='public'::regnamespace GROUP BY typname
 ) objects`));
 const catalogBefore=catalog();
 const before=snapshot();copy(archiveFoldersMigration);writeFileSync(schemaPath,schema);prisma(["migrate","deploy","--schema",schemaPath]);assert.deepEqual(snapshot(),before);
 const catalogAfter=catalog();
 const inventory={added:Object.fromEntries(Object.entries(catalogAfter).filter(([key])=>!(key in catalogBefore))),changed:Object.fromEntries(Object.entries(catalogAfter).filter(([key,value])=>key in catalogBefore && catalogBefore[key]!==value).map(([key,value])=>[key,{before:catalogBefore[key],after:value}])),removed:Object.keys(catalogBefore).filter(key=>!(key in catalogAfter))};
 assert.deepEqual(inventory.removed,[]);
 assert.deepEqual(Object.keys(inventory.changed).sort(),['constraint:"BusinessEvent".BusinessEvent_contract_check','enum:BusinessEventType','function:flux_event_write_guard()','function:flux_shared_file_reference_guard()'].sort());
 assert.equal(Object.keys(inventory.added).filter(key=>key.startsWith('table:')).length,7);
 writeFileSync('/private/tmp/flux-phase63-migration-inventory.json',JSON.stringify(inventory,null,2));
 assert.equal(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),"117");assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),"157");
 for(const table of ["ArchiveFolder","ArchiveFilePlacement","ArchiveOrganizationCommand","ArchiveVerificationDecision","RetainedArchiveSource","ArchiveGrantScope","ArchiveAccessDecision"])assert.equal(sql(`SELECT count(*) FROM "${table}"`),"0");
 console.log("PASS populated additive migration: 116/150 → 117/157. Every original table/row/ledger checksum unchanged; zero relocation/backfill.");
 console.log("Candidate "+archiveFoldersMigration+"/migration.sql SHA-256 "+createHash("sha256").update(readFileSync(join(migrations,archiveFoldersMigration,"migration.sql"))).digest("hex"));
 console.log(run(process.execPath,[test,...process.argv.slice(2).filter(arg=>["--verification","--sharing"].includes(arg))],{env:localEnv}));
 assert.match(prisma(["migrate","diff","--from-url",url,"--to-schema-datamodel",schemaPath,"--script"]),/empty migration/);
 console.log("PASS schema drift empty. No remote database or storage used.");
} finally {if(started)run("pg_ctl",["-D",data,"-m","fast","-w","stop"]);rmSync(root,{recursive:true,force:true});console.log("Disposable Phase 6.1 cluster removed.");}

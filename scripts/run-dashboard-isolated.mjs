// This runner accepts no database URL and never reads an environment file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repository = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const root = mkdtempSync('/private/tmp/flux-v2-dashboard-'), data = join(root, 'data'), socket = join(root, 's');
const url = `postgresql://dashboard_test@localhost:55439/dashboard_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const flags = Object.fromEntries(['DASHBOARD_V2','SHARED_FILE_IDENTITY','APPROVAL_ENGINE','SHARED_EVENTS','UNIVERSAL_TASKER','TASKER_DELIVERABLES','TASKER_CONCEPTS','TASKER_SISTERS','STAGE_BUILDER_DRAFTS','STAGE_BUILDER_PUBLICATION','STAGE_RUNTIME','RUNTIME_INTEGRATION','ARCHIVE_FOLDERS','ARCHIVE_VERIFICATION','ARCHIVE_SHARING','ARCHIVE_RUNTIME'].map(k => ['FLUX_'+k,'1']));
const env = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', NEXT_TELEMETRY_DISABLED: '1', PGPASSFILE: join(root,'no-password'), PGSERVICEFILE: join(root,'no-service'), DATABASE_URL: url, DIRECT_URL: url, NODE_PATH: join(repository,'node_modules'), FLUX_DASHBOARD_TEST_ROOT: root, ...flags };
const run = (cmd,args,options={}) => { const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,...options}); assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message); return r.stdout.trim(); };
let started=false;
try {
 mkdirSync(socket,{mode:0o700});
 run('initdb',['-D',data,'-U','dashboard_test','-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'pg.log'),'-o',`-h '' -k ${socket} -p 55439 -c unix_socket_permissions=0700 -c shared_buffers=16MB`,'-w','start']);started=true;
 run('createdb',['-h',socket,'-p','55439','-U','dashboard_test','dashboard_test']);
 cpSync(join(repository,'prisma'),join(root,'prisma'),{recursive:true});
 run(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',join(root,'prisma/schema.prisma')]);
 const output=join(root,'compiled'), config=join(root,'tsconfig.json');
 writeFileSync(config,JSON.stringify({extends:join(repository,'scripts/tsconfig.dashboard-v2.json'),compilerOptions:{outDir:output}}));
 run(process.execPath,[require.resolve('typescript/bin/tsc'),'--project',config]);
 mkdirSync(join(output,'node_modules/server-only'),{recursive:true});writeFileSync(join(output,'node_modules/server-only/index.js'),'');
 console.log(run(process.execPath,[join(output,'scripts/dashboard-v2-integration-check.js')]));
 if(process.argv.includes('--browser')) console.log(run(process.execPath,[join(repository,'scripts/dashboard-browser-check.mjs')],{env:{...env,FLUX_BROWSER_BUILD:process.env.FLUX_BROWSER_BUILD,FLUX_BROWSER_ARTIFACTS:process.env.FLUX_BROWSER_ARTIFACTS||join(repository,'.tmp/phase71/browser'),FLUX_PLAYWRIGHT_PACKAGE:process.env.FLUX_PLAYWRIGHT_PACKAGE},timeout:240000}));
} finally {
 if(started) run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
 rmSync(root,{recursive:true,force:true});console.log('Disposable dashboard database, sessions and application removed. No live credentials or storage used.');
}

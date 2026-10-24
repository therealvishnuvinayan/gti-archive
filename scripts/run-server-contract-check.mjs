// No environment files, database access or marker shims. Next ships this marker.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repository=resolve(import.meta.dirname,'..'), require=createRequire(import.meta.url);
export function runCurrentContract(mode) {
 const root=mkdtempSync('/private/tmp/flux-server-contract-'), output=join(root,'compiled');
 const env={PATH:process.env.PATH,LANG:'C',LC_ALL:'C',NODE_PATH:[join(repository,'node_modules'),join(repository,'node_modules/next/dist/compiled')].join(':'),COMPILED_ALIAS_ROOT:output,DATABASE_URL:'postgresql://no_database@127.0.0.1:1/no_database?connect_timeout=1',NEXT_TELEMETRY_DISABLED:'1'};
 const run=(args)=>{const r=spawnSync(process.execPath,args,{cwd:repository,env,encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message);return r.stdout;};
 try {
  const client=spawnSync(process.execPath,['-e',"require('server-only')"],{env,encoding:'utf8'});
  assert.notEqual(client.status,0);assert.match(client.stderr,/cannot be imported from a Client Component/);
  run(['--conditions=react-server','-e',"require('server-only')"]);
  const config=join(root,'tsconfig.json');writeFileSync(config,JSON.stringify({extends:join(repository,mode==='user-projects'?'scripts/tsconfig.user-projects.json':'scripts/tsconfig.phase75-contract.json'),compilerOptions:{outDir:output}}));
  run([require.resolve('typescript/bin/tsc'),'--project',config]);
  console.log(run(['--conditions=react-server','-r',join(repository,'scripts/register-server-contract.cjs'),'-r',join(repository,'scripts/register-compiled-alias.cjs'),join(output,'scripts',mode==='user-projects'?'user-projects-page-check.js':'phase75-contract-check.js'),mode]).trim());
 } finally {rmSync(root,{recursive:true,force:true});}
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)runCurrentContract(process.argv[2]);

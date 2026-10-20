// Uses a disposable private PostgreSQL cluster and genuine fictional logins.
// No .env files, live credentials, email or storage operations.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repository=process.cwd(), require=createRequire(join(repository,'package.json'));
const root=mkdtempSync(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'flux-administration-browser-'));
const data=join(root,'data'), socket=join(root,'s'), app=join(root,'app');
const artifact=process.env.FLUX_BROWSER_ARTIFACTS||'/private/tmp/flux-phase15i-browser-artifacts';mkdirSync(artifact,{recursive:true,mode:0o700});
const build=resolve(process.env.FLUX_BROWSER_BUILD||repository);
const env={PATH:process.env.PATH,LANG:'C',LC_ALL:'C',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',NEXT_TELEMETRY_DISABLED:'1',PGPASSFILE:join(root,'no-password'),PGSERVICEFILE:join(root,'no-service')};
const url=`postgresql://flux_browser@localhost:55437/flux_library_browser?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const pgArgs=['-X','-qAt','-h',socket,'-p','55437','-U','flux_browser','-v','ON_ERROR_STOP=1','-d','flux_library_browser'];
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();};
const sql=q=>run('psql',pgArgs,{input:q});
let started=false,server,browser,db;
const result={checks:[],screens:[],pageErrors:[],blockedExternalRequests:[],storageOperations:[]};
const logs=[], pass=message=>{result.checks.push(message);console.log('PASS browser: '+message);};
try {
 mkdirSync(socket,{mode:0o700});mkdirSync(app);
 run('initdb',['-D',data,'-U','flux_browser','-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p 55437 -c unix_socket_permissions=0700 -c wal_level=minimal -c max_wal_senders=0 -c min_wal_size=32MB -c max_wal_size=64MB`,'-w','start']);started=true;
 run('psql',[...pgArgs.slice(0,-1),'postgres'],{input:'CREATE DATABASE flux_library_browser;'});
 const identity=JSON.parse(sql(`SELECT json_build_object('data',current_setting('data_directory'),'tcp',current_setting('listen_addresses'),'version',current_setting('server_version'))`));assert.equal(identity.data,data);assert.equal(identity.tcp,'');result.postgres=identity.version;
 cpSync(join(repository,'prisma/schema.prisma'),join(root,'schema.prisma'));mkdirSync(join(root,'migrations'));
 for(const entry of readdirSync(join(repository,'prisma/migrations')))cpSync(join(repository,'prisma/migrations',entry),join(root,'migrations',entry),{recursive:true});
 run(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',join(root,'schema.prisma')],{env:{...env,DATABASE_URL:url}});
 assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')),105);
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasourceUrl:url});
 const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex'),passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 const roles=[['director','DIRECTOR'],['spm','SENIOR_PROJECT_MANAGER'],['spm2','SENIOR_PROJECT_MANAGER'],['jpm','JUNIOR_PROJECT_MANAGER'],['designer','DESIGNER'],['designer2','DESIGNER'],['digital','DIGITAL_LEAD'],['tech',null],['tech2',null]];
 for(const [id] of roles)await db.user.create({data:{id,email:`${id}@browser.invalid`,name:`Fixture ${id}`,passwordHash,role:'USER'}});
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable navigation browser fixtures',true),set_config('flux.authorization_change_id','browser-fixture-roles',true)`;for(const [userId,businessRole]of roles)await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:businessRole?[]:['TECHNICAL_ADMIN']}});});
 const accountSnapshot=JSON.stringify(await db.user.findMany({orderBy:{id:'asc'}}));
 const originalAudit=await db.userAuthorizationChange.findMany({orderBy:[{userId:'asc'},{authorizationVersion:'asc'}]});
 await db.project.create({data:{id:'project',name:'Unchanged owned project',ownerId:'spm',createdById:'director'}});
 const projectSnapshot=JSON.stringify(await db.project.findMany());
 for(const path of ['package.json','public','next.config.ts'])cpSync(join(build,path),join(app,path),{recursive:true});
 cpSync(join(build,'.next'),join(app,'.next'),{recursive:true,filter:source=>!source.startsWith(join(build,'.next/dev'))&&!source.startsWith(join(build,'.next/cache'))});symlinkSync(join(repository,'node_modules'),join(app,'node_modules'),'dir');
 // Guard Node's HTTP clients as well as the browser, independently of AWS endpoint configuration.
 const guard=join(root,'local-network-only.cjs');writeFileSync(guard,`for (const protocol of ['http','https']) { const module = require('node:'+protocol), original=module.request; module.request=function(...args){const arg=args[0];const host=typeof arg==='string'||arg instanceof URL?new URL(arg).hostname:arg?.hostname||arg?.host||'localhost';if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('EXTERNAL_NETWORK_FORBIDDEN:'+host);return original.apply(this,args);}; } const originalFetch=global.fetch; global.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','::1'].includes(url.hostname))throw new Error('EXTERNAL_FETCH_FORBIDDEN:'+url.hostname);return originalFetch(input,...args);};`);
 server=spawn(process.execPath,['--require',guard,require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3107'],{cwd:app,env:{...env,DATABASE_URL:url,DIRECT_URL:url,APP_URL:'http://127.0.0.1:3107',NODE_ENV:'production',NEXT_PUBLIC_REALTIME_PROVIDER:'none'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs.push(b.toString()));
 const origin='http://127.0.0.1:3107';for(let i=0;i<80;i++){try{if((await fetch(origin+'/sign-in')).status===200)break;}catch{}assert.ok(i<79,'Server did not start');await new Promise(r=>setTimeout(r,250));}
 const harness=process.env.FLUX_PLAYWRIGHT_PACKAGE||'/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';const {chromium}=createRequire(harness)('playwright-core');browser=await chromium.launch({headless:true,args:['--disable-background-networking']});result.chromium=browser.version();
 const pages=new Map();async function freshPage(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||['data:','blob:'].includes(u.protocol))return route.continue();result.blockedExternalRequests.push(u.origin);return route.abort();});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.pageErrors.push(e.message));return page;}
 async function pageFor(id){if(pages.has(id))return pages.get(id);const page=await freshPage();await page.goto(origin+'/sign-in');await page.locator('[name=email]').fill(`${id}@browser.invalid`);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));pages.set(id,page);return page;}
 async function shot(page,name){await page.waitForTimeout(600);await page.screenshot({path:join(artifact,name+'.png'),fullPage:true,animations:'disabled'});result.screens.push(name);}

 const row=(page,id)=>page.getByRole('row').filter({has:page.getByText(`${id}@browser.invalid`,{exact:true})});
 async function loginAgain(id){pages.delete(id);return pageFor(id);}
 async function prepare(page,id,button){await row(page,id).getByRole('button',{name:button,exact:true}).click();return page.getByRole('dialog');}
 async function acknowledge(dialog,reason){await dialog.getByLabel('Reason (required)').fill(reason);await dialog.getByRole('checkbox').check();}
 async function waitSaved(page){await page.getByRole('status').filter({hasText:'Change saved and audited'}).waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});}
 for(const id of ['director','spm','jpm','designer','digital','tech']){
  const page=await pageFor(id);await page.goto(origin+'/users');
  if(id==='director'){
   await page.getByRole('heading',{name:'Business Users',exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),9);
   assert.equal(await row(page,'director').getByRole('button',{name:/Edit role|Suspend/}).count(),0);
   assert.equal(await row(page,'tech').getByRole('button',{name:'Suspend',exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:/technical access/}).count(),0);await shot(page,'director-business-users');
  }else await page.waitForURL(u=>u.pathname!=='/users');
  await page.goto(origin+'/settings');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Manage technical privileges',exact:true}).count(),id==='tech'?1:0);
  await page.goto(origin+'/settings/technical-administration');
  if(id==='tech'){
   await page.getByRole('heading',{name:'Technical Administration',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Edit role',exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:/Transfer Director/}).count(),0);
   await shot(page,'technical-administration');
  }else await page.waitForURL(u=>u.pathname!=='/settings/technical-administration');
  const denied=await page.evaluate(async()=>({legacy:(await fetch('/api/users/director/avatar/upload-url',{method:'POST'})).status,library:(await fetch('/api/library')).status}));
  assert.equal(denied.legacy,403);if(id==='tech')assert.equal(denied.library,403);
  pass(id+': authorized administration navigation and direct route/API separation');
 }
 const director=await pageFor('director');await director.goto(origin+'/users');
 // A second genuine Director login keeps an old target version open.
 const stale=await loginAgain('director');await stale.goto(origin+'/users');
 let dialog=await prepare(stale,'designer','Edit role');await dialog.getByLabel('New business role').selectOption('DIGITAL_LEAD');await acknowledge(dialog,'Stale concurrent browser review');
 dialog=await prepare(director,'designer','Edit role');await dialog.getByLabel('New business role').selectOption('JUNIOR_PROJECT_MANAGER');
 assert.equal(await dialog.getByRole('button',{name:'Confirm change',exact:true}).isDisabled(),true);
 assert.ok((await dialog.innerText()).includes('Director approval and an SPM Co-owner'));
 await acknowledge(dialog,'Browser role review');await shot(director,'role-impact-confirmation');
 const mutationRequest=director.waitForRequest(request=>request.method()==='POST'&&!!request.headers()['next-action']);
 await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();const request=await mutationRequest;await waitSaved(director);
 const originalRequest={action:request.headers()['next-action'],body:request.postData()};
 assert.equal((await db.userAuthorization.findUniqueOrThrow({where:{userId:'designer'}})).businessRole,'JUNIOR_PROJECT_MANAGER');
 dialog=stale.getByRole('dialog');await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();await dialog.getByText(/changed after you opened/).waitFor();await shot(stale,'stale-version');
 await dialog.getByRole('button',{name:'Discard and refresh',exact:true}).click();
 const designer=await pageFor('designer');await designer.goto(origin+'/tasks');await designer.waitForURL(u=>u.pathname==='/sign-in');
 const auditCount=await db.userAuthorizationChange.count();
 async function actionPost(page,payload){return page.evaluate(async({action,body})=>{const r=await fetch('/users',{method:'POST',headers:{'Next-Action':action,'Content-Type':'text/plain;charset=UTF-8'},body});return r.text();},payload);}
 const tech=await pageFor('tech');
 assert.match(await actionPost(tech,originalRequest),/BUSINESS_AUTHORITY_REQUIRED/);
 assert.match(await actionPost(director,originalRequest),/STALE_VERSION/);
 const forged=JSON.parse(originalRequest.body);assert.ok(Array.isArray(forged));forged[0].actorUserId='director';
 assert.match(await actionPost(director,{...originalRequest,body:JSON.stringify(forged)}),/INVALID_INPUT/);
 assert.equal(await db.userAuthorizationChange.count(),auditCount);
 pass('Role change with reason/impact/confirmation; immediate session invalidation; stale UI, direct HTTP action replay, forged actor and technical bypass rejected');
 await row(director,'designer').getByRole('button',{name:'History',exact:true}).click();
 await director.getByRole('region',{name:'Authorization history'}).getByText('Browser role review',{exact:true}).waitFor();await shot(director,'business-history');
 // Suspension and reactivation preserve passwords, ownership and old-session invalidity.
 const jpm=await pageFor('jpm');dialog=await prepare(director,'jpm','Suspend');await acknowledge(dialog,'Browser suspension');await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();await waitSaved(director);
 await jpm.goto(origin+'/tasks');await jpm.waitForURL(u=>u.pathname==='/sign-in');
 await jpm.locator('[name=email]').fill('jpm@browser.invalid');await jpm.locator('[name=password]').fill(password);await jpm.locator('button[type=submit]').click();await jpm.getByText(/unavailable/i).waitFor();
 dialog=await prepare(director,'jpm','Reactivate');await acknowledge(dialog,'Browser reactivation');await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();await waitSaved(director);
 await jpm.goto(origin+'/tasks');await jpm.waitForURL(u=>u.pathname==='/sign-in');await loginAgain('jpm');
 pass('Suspended account cannot log in; reactivation requires a fresh genuine password login');
 // Technical changes cannot change the target's business role.
 await tech.goto(origin+'/settings/technical-administration');dialog=await prepare(tech,'designer2','Grant technical access');await acknowledge(dialog,'Browser technical grant');await shot(tech,'technical-impact-confirmation');
 const technicalRequest=tech.waitForRequest(request=>request.method()==='POST'&&!!request.headers()['next-action']);
 await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();const techRequest=await technicalRequest;await waitSaved(tech);
 const technicalHttp={action:techRequest.headers()['next-action'],body:techRequest.postData()};
 const countAfterGrant=await db.userAuthorizationChange.count();
 assert.match(await actionPost(director,technicalHttp),/TECHNICAL_AUTHORITY_REQUIRED/);
 assert.match(await actionPost(tech,technicalHttp),/STALE_VERSION/);
 assert.equal(await db.userAuthorizationChange.count(),countAfterGrant);

 let assignment=await db.userAuthorization.findUniqueOrThrow({where:{userId:'designer2'}});assert.equal(assignment.businessRole,'DESIGNER');assert.deepEqual(assignment.technicalPrivileges,['TECHNICAL_ADMIN']);
 await row(tech,'designer2').getByRole('button',{name:'History',exact:true}).click();await tech.getByRole('region',{name:'Authorization history'}).getByText('Browser technical grant',{exact:true}).waitFor();await shot(tech,'technical-history');
 await director.reload();assert.equal(await row(director,'designer2').getByRole('button',{name:'Suspend',exact:true}).count(),0);
 await row(director,'designer2').getByRole('button',{name:'History',exact:true}).click();await director.getByRole('region',{name:'Authorization history'}).waitFor();assert.ok(!(await director.getByRole('region',{name:'Authorization history'}).innerText()).includes('Browser technical grant'));
 dialog=await prepare(tech,'designer2','Revoke technical access');await acknowledge(dialog,'Browser technical revocation');await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();await waitSaved(tech);
 pass('Technical grant/revocation and history; business role preserved; business history filters technical-only changes; shared status remains protected');
 // Actual Director transfer, both session versions invalidated, atomic audit attribution.
 const incoming=await pageFor('spm2');await director.reload();await director.getByLabel('New Director',{exact:true}).selectOption('spm2');await director.getByRole('button',{name:'Review Director transfer',exact:true}).click();dialog=director.getByRole('dialog');
 await dialog.getByLabel('Your role after transfer').selectOption('SENIOR_PROJECT_MANAGER');await dialog.getByLabel('Reason (required)').fill('Browser Director handover');
 assert.equal(await dialog.getByRole('button',{name:'Transfer Director',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Type TRANSFER DIRECTOR to confirm').fill('TRANSFER DIRECTOR');await shot(director,'director-transfer-confirmation');
 await dialog.getByRole('button',{name:'Transfer Director',exact:true}).click();await waitSaved(director);await director.getByRole('link',{name:'Sign in again',exact:true}).waitFor();await shot(director,'transfer-reauthentication');
 assert.equal(await db.userAuthorization.count({where:{businessRole:'DIRECTOR'}}),1);assert.equal((await db.userAuthorization.findUniqueOrThrow({where:{userId:'spm2'}})).businessRole,'DIRECTOR');
 const transferAudit=await db.userAuthorizationChange.findMany({where:{reason:'Browser Director handover'}});assert.equal(transferAudit.length,2);assert.ok(transferAudit.every(row=>row.actorUserId==='director'&&row.changeId===transferAudit[0].changeId));
 await incoming.goto(origin+'/users');await incoming.waitForURL(u=>u.pathname==='/sign-in');
 await director.getByRole('link',{name:'Sign in again',exact:true}).click();await director.waitForURL(u=>u.pathname==='/sign-in');
 const outgoing=await loginAgain('director');await outgoing.goto(origin+'/users');await outgoing.waitForURL(u=>u.pathname!=='/users');
 const newDirector=await loginAgain('spm2');await newDirector.goto(origin+'/users');await newDirector.getByRole('heading',{name:'Business Users',exact:true}).waitFor();await shot(newDirector,'new-director-business-users');
 pass('Atomic Director transfer with real outgoing identity; one Director; both old sessions rejected; genuine new Director login works and outgoing Director loses administration');
 dialog=await prepare(tech,'tech','Revoke technical access');await acknowledge(dialog,'Browser self revocation');await dialog.getByRole('button',{name:'Confirm change',exact:true}).click();await waitSaved(tech);await tech.getByRole('link',{name:'Sign in again',exact:true}).waitFor();
 await tech.goto(origin+'/settings/technical-administration');await tech.waitForURL(u=>u.pathname==='/sign-in');
 pass('Self technical revocation requires reauthentication immediately');
 assert.equal(JSON.stringify(await db.user.findMany({orderBy:{id:'asc'}})),accountSnapshot);
 assert.equal(JSON.stringify(await db.project.findMany()),projectSnapshot);
 for(const entry of originalAudit)assert.deepEqual(await db.userAuthorizationChange.findUniqueOrThrow({where:{userId_authorizationVersion:{userId:entry.userId,authorizationVersion:entry.authorizationVersion}}}),entry);
 assert.equal(await db.user.count(),9);assert.equal(await db.project.count(),1);assert.equal(await db.manualArchiveFile.count(),0);assert.equal(await db.manualLibraryAsset.count(),0);
 assert.deepEqual(result.storageOperations,[]);assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.blockedExternalRequests,[]);assert.ok(!/EXTERNAL_NETWORK_FORBIDDEN|EXTERNAL_FETCH_FORBIDDEN/.test(logs.join('')));
 pass('Nine User records/passwords, initial audit and project ownership preserved; zero storage operations, browser errors or external requests');
 result.status='PASS';
} catch(error) {result.status='FAIL';result.error=error.message;console.error(error.stack);process.exitCode=1;if(browser)for(const [i,context]of browser.contexts().entries())for(const [j,page]of context.pages().entries()){await page.screenshot({path:join(artifact,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});console.log(JSON.stringify({url:page.url().split('#')[0],text:(await page.locator('body').innerText()).slice(-3500)}));}}
finally {writeFileSync(join(artifact,'result.json'),JSON.stringify(result,null,2),{mode:0o600});writeFileSync(join(artifact,'server.log'),logs.join(''),{mode:0o600});await browser?.close();server?.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db?.$disconnect();if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(root,{recursive:true,force:true});console.log('Disposable browser app/database removed. Artifacts: '+artifact);}

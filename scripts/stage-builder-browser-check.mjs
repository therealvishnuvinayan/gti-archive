// Stage Builder acceptance: disposable PostgreSQL, fictional logins and an
// isolated production build. No environment files, live storage or external consumers.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repository=process.cwd(), require=createRequire(join(repository,'package.json'));
const root=mkdtempSync(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'flux-stage-builder-browser-'));
const data=join(root,'data'), socket=join(root,'s'), app=join(root,'app');
const artifact=process.env.FLUX_BROWSER_ARTIFACTS||'/private/tmp/flux-phase41-browser-artifacts';mkdirSync(artifact,{recursive:true,mode:0o700});
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
 assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')),113);
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasourceUrl:url});
 const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex'),passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 const roles=[['director','DIRECTOR'],['spm','SENIOR_PROJECT_MANAGER'],['spm2','SENIOR_PROJECT_MANAGER'],['jpm','JUNIOR_PROJECT_MANAGER'],['designer','DESIGNER'],['designer2','DESIGNER'],['digital','DIGITAL_LEAD'],['tech',null],['tech2',null]];
 for(const [id] of roles)await db.user.create({data:{id,email:`${id}@browser.invalid`,name:`Fixture ${id}`,passwordHash,role:'USER'}});
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable navigation browser fixtures',true),set_config('flux.authorization_change_id','browser-fixture-roles',true)`;for(const [userId,businessRole]of roles)await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:businessRole?[]:['TECHNICAL_ADMIN']}});});
 const accountSnapshot=JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}}));
 for(const path of ['package.json','public','next.config.ts'])cpSync(join(build,path),join(app,path),{recursive:true});
 cpSync(join(build,'.next'),join(app,'.next'),{recursive:true,filter:source=>!source.startsWith(join(build,'.next/dev'))&&!source.startsWith(join(build,'.next/cache'))});symlinkSync(join(repository,'node_modules'),join(app,'node_modules'),'dir');
 // Guard Node's HTTP clients as well as the browser, independently of AWS endpoint configuration.
 const guard=join(root,'local-network-only.cjs');writeFileSync(guard,`for (const protocol of ['http','https']) { const module = require('node:'+protocol), original=module.request; module.request=function(...args){const arg=args[0];const host=typeof arg==='string'||arg instanceof URL?new URL(arg).hostname:arg?.hostname||arg?.host||'localhost';if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('EXTERNAL_NETWORK_FORBIDDEN:'+host);return original.apply(this,args);}; } const originalFetch=global.fetch; global.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','::1'].includes(url.hostname))throw new Error('EXTERNAL_FETCH_FORBIDDEN:'+url.hostname);return originalFetch(input,...args);};`);
 server=spawn(process.execPath,['--require',guard,require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3117'],{cwd:app,env:{...env,DATABASE_URL:url,DIRECT_URL:url,APP_URL:'http://127.0.0.1:3117',NODE_ENV:'production',FLUX_STAGE_BUILDER_DRAFTS:'1',FLUX_TASKER_SISTERS:'1',FLUX_TASKER_CONCEPTS:'1',FLUX_TASKER_DELIVERABLES:'1',FLUX_UNIVERSAL_TASKER:'1',FLUX_SHARED_FILE_IDENTITY:'1',FLUX_APPROVAL_ENGINE:'1',FLUX_SHARED_EVENTS:'1',NEXT_PUBLIC_REALTIME_PROVIDER:'none',AWS_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'fixture-only',AWS_SECRET_ACCESS_KEY:'fixture-only',AWS_S3_BUCKET:'fixture-bucket',AWS_ENDPOINT_URL_S3:'http://127.0.0.1:3118',S3_USE_ACCELERATE_ENDPOINT:'false'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs.push(b.toString()));
 const origin='http://127.0.0.1:3117';for(let i=0;i<80;i++){try{if((await fetch(origin+'/sign-in')).status===200)break;}catch{}assert.ok(i<79,'Server did not start');await new Promise(r=>setTimeout(r,250));}
 const harness=process.env.FLUX_PLAYWRIGHT_PACKAGE||'/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';const {chromium}=createRequire(harness)('playwright-core');browser=await chromium.launch({headless:true,args:['--disable-background-networking']});result.chromium=browser.version();
 const pages=new Map();async function freshPage(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.route('**/*',route=>{const u=new URL(route.request().url());if([origin,'http://127.0.0.1:3118'].includes(u.origin)||['data:','blob:'].includes(u.protocol))return route.continue();result.blockedExternalRequests.push(u.origin);return route.abort();});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.pageErrors.push(e.message));return page;}
 async function pageFor(id){if(pages.has(id))return pages.get(id);const page=await freshPage();await page.goto(origin+'/sign-in');await page.locator('[name=email]').fill(`${id}@browser.invalid`);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));pages.set(id,page);return page;}
 async function shot(page,name,locator){await page.waitForTimeout(600);if(locator)await locator.scrollIntoViewIfNeeded();await (locator||page).screenshot({path:join(artifact,name+'.png'),...(locator?{}:{fullPage:true}),animations:'disabled'});result.screens.push(name);}

 async function request(page,path,data,method='PATCH'){return page.evaluate(async({path,data,method})=>{const r=await fetch(path,data?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():(await r.arrayBuffer(),null),disposition:r.headers.get('content-disposition')};},{path,data,method});}
 const director=await pageFor('director');
 await director.goto(origin+'/projects');await director.getByRole('link',{name:'Workflow drafts · Stage Builder'}).click();
 await director.getByRole('heading',{name:'Workflow drafts',exact:true}).waitFor();await shot(director,'director-draft-list');
 await director.getByRole('button',{name:'Create New Workflow Draft'}).click();await director.getByRole('heading',{name:'Custom Stage Builder'}).waitFor();
 const draftId=director.url().split('/').at(-1);
 await director.getByLabel('Workflow name',{exact:true}).fill('Browser reusable workflow');await director.getByLabel('Workflow description',{exact:true}).fill('Synthetic draft with all typed capabilities');await director.getByLabel('Intended project type',{exact:true}).selectOption('CUSTOM');
 await director.getByRole('button',{name:'Add Stage',exact:true}).first().click();await director.getByLabel('Stage title',{exact:true}).fill('Brief');await director.getByLabel('Stage description',{exact:true}).fill('Gather structured information');
 await director.getByRole('button',{name:/^Information Instructions/}).click();await director.getByRole('button',{name:'Add field',exact:true}).click();
 let field=director.getByRole('group',{name:'Field 1',exact:true});await field.getByLabel('Field label',{exact:true}).fill('Audience');await field.getByLabel('Help text',{exact:true}).fill('Who is this for?');
 for(const [i,type]of ['NUMBER','DATE','SELECT','LONG_TEXT','READ_ONLY'].entries()){
  await director.getByRole('button',{name:'Add field',exact:true}).click();const f=director.getByRole('group',{name:`Field ${i+2}`,exact:true});await f.getByLabel('Field label',{exact:true}).fill(type+' field');await f.getByLabel('Field type',{exact:true}).selectOption(type);
  if(type==='SELECT')await f.getByLabel('Options (one per line)',{exact:true}).fill('Option A\nOption B');
  await f.getByText('Default value and validation',{exact:true}).click();
  if(type==='NUMBER'){await f.getByLabel('Default number',{exact:true}).fill('5');await f.getByLabel('Minimum value',{exact:true}).fill('1');await f.getByLabel('Maximum value',{exact:true}).fill('10');}
  if(type==='DATE')await f.getByLabel('Default date',{exact:true}).fill('2026-11-20');
  if(type==='READ_ONLY')await f.getByLabel('Read-only information',{exact:true}).fill('Director final completion remains authoritative.');
 }
 if(!await director.getByLabel('Add completion gate',{exact:true}).isVisible())await director.getByText('Completion gates (0)',{exact:true}).click();
 let gates=director.getByLabel('Add completion gate',{exact:true});await gates.selectOption({label:'Required fields completed: Information'});
 await shot(director,'director-information-fields');
 await director.getByRole('button',{name:'Add Stage',exact:true}).click();await director.getByLabel('Stage title',{exact:true}).fill('Review');
 await director.getByRole('button',{name:/^File requirement Required submissions/}).click();await director.getByLabel('Accepted file types (comma separated)',{exact:true}).fill('.pdf,.png');await director.getByLabel('Maximum files',{exact:true}).fill('3');
 await director.getByRole('button',{name:/^Checklist Required items/}).click();await director.getByRole('button',{name:'Add checklist item',exact:true}).click();await director.getByLabel('Item label',{exact:true}).fill('Check proof');await director.getByLabel('Item description',{exact:true}).fill('Review exact output');await director.getByLabel('Item evidence',{exact:true}).selectOption('SHARED_FILE_VERSION');
 await director.getByRole('button',{name:/^Approval Draft requirements/}).click();await director.getByRole('button',{name:'Add approval step',exact:true}).click();
 let step=director.getByRole('group',{name:'Approval step 1',exact:true});await step.getByLabel('Step label',{exact:true}).fill('Owner review');await step.getByLabel('Eligible approver',{exact:true}).selectOption('PROJECT_OWNER');await step.getByLabel('Approval evidence',{exact:true}).selectOption('SHARED_FILE_VERSION');
 await director.getByRole('button',{name:'Add approval step',exact:true}).click();step=director.getByRole('group',{name:'Approval step 2',exact:true});await step.getByLabel('Step label',{exact:true}).fill('Director review');
 await director.getByRole('button',{name:'Move approval step 2 up',exact:true}).click();await director.getByRole('button',{name:'Move approval step 1 down',exact:true}).click();
 if(!await director.getByLabel('Add completion gate',{exact:true}).isVisible())await director.getByText('Completion gates (0)',{exact:true}).click();gates=director.getByLabel('Add completion gate',{exact:true});
 for(const label of ['Required preceding stage completed: Brief','Required files submitted and accepted: File requirement','Required checklist items satisfied: Checklist','Required approval steps completed: Approval'])await gates.selectOption({label});
 await director.getByRole('button',{name:'Save Draft',exact:true}).click();await director.getByRole('status').filter({hasText:'Saved revision 2'}).waitFor();
 const first=await db.workflowDraftRevision.findUniqueOrThrow({where:{workflowId_revision:{workflowId:draftId,revision:2}}});
 assert.equal(first.validationStatus,'VALID');assert.equal(first.definition.stages[0].capabilities[0].fields.length,6);
 await shot(director,'director-file-checklist-approval-gates');
 await director.getByRole('button',{name:'Preview Workflow',exact:true}).click();await director.getByRole('region',{name:'Workflow preview'}).waitFor();assert.equal(await director.getByRole('button',{name:/Upload|Approve decision|Complete stage/}).count(),0);await shot(director,'director-structure-preview');
 await director.getByRole('button',{name:'Edit workflow',exact:true}).click();await director.getByRole('button',{name:'Duplicate stage',exact:true}).click();await director.getByRole('button',{name:'Move stage 3 up',exact:true}).focus();await director.keyboard.press('Enter');await director.getByLabel('Stage title',{exact:true}).fill('Independent review copy');await director.getByRole('button',{name:'Save Draft',exact:true}).click();await director.getByRole('status').filter({hasText:'Saved revision 3'}).waitFor();
 const r3=await db.workflowDraftRevision.findUniqueOrThrow({where:{workflowId_revision:{workflowId:draftId,revision:3}}});assert.equal(r3.definition.stages[1].title,'Independent review copy');assert.notEqual(r3.definition.stages[1].id,r3.definition.stages[2].id);assert.equal(r3.definition.stages[0].capabilities[0].fields[0].id,first.definition.stages[0].capabilities[0].fields[0].id);
 await director.getByRole('button',{name:'Remove stage',exact:true}).click();await director.getByRole('button',{name:'Save Draft',exact:true}).click();await director.getByRole('status').filter({hasText:'Saved revision 4'}).waitFor();
 await director.reload();await director.getByLabel('Workflow name',{exact:true}).waitFor();assert.equal(await director.getByLabel('Workflow name',{exact:true}).inputValue(),'Browser reusable workflow');
 await director.goto(origin+`/projects/workflow-drafts/${draftId}?revision=2`);await director.getByText('Historical revision 2 is read-only.',{exact:false}).waitFor();assert.equal(await director.getByLabel('Workflow name',{exact:true}).count(),0);await shot(director,'immutable-historical-preview');
 await director.goto(origin+`/projects/workflow-drafts/${draftId}`);await director.getByRole('button',{name:'Duplicate draft',exact:true}).click();await director.waitForURL(u=>u.pathname.startsWith('/projects/workflow-drafts/')&&!u.pathname.endsWith(draftId));const cloneId=director.url().split('/').at(-1);assert.notEqual(cloneId,draftId);await shot(director,'independent-draft-clone');
 pass('Director authors all field types and four capability types, ordered approvals and gates, saves/reopens, previews, duplicates/reorders/removes a stage with keyboard, preserves field identities and views immutable history; independent draft clone.');
 const spm=await pageFor('spm');await spm.goto(origin+'/projects/workflow-drafts');assert.equal(await spm.getByRole('link',{name:/Browser reusable workflow/}).count(),0);await spm.getByRole('button',{name:'Create New Workflow Draft'}).click();await spm.getByRole('heading',{name:'Custom Stage Builder'}).waitFor();const ownId=spm.url().split('/').at(-1);
 await spm.getByLabel('Workflow name',{exact:true}).fill('SPM scoped draft');await spm.getByRole('button',{name:'Save Draft',exact:true}).click();await spm.getByRole('status').filter({hasText:'Saved revision 2'}).waitFor();await spm.getByRole('region',{name:'Validation results'}).getByText('Add at least one stage.').waitFor();await shot(spm,'spm-incomplete-validation');
 await spm.getByRole('button',{name:'Add Stage',exact:true}).first().click();await spm.getByRole('button',{name:/^Information Instructions/}).click();await spm.getByLabel('Instructions',{exact:true}).fill('SPM instructions');await spm.getByRole('button',{name:'Save Draft',exact:true}).click();await spm.getByRole('status').filter({hasText:'Saved revision 3'}).waitFor();
 // A second genuine session edits the same draft; stale browser edits stay intact.
 await director.goto(origin+`/projects/workflow-drafts/${ownId}`);await director.getByLabel('Workflow name',{exact:true}).fill('Director revised SPM draft');await director.getByRole('button',{name:'Save Draft',exact:true}).click();await director.getByRole('status').filter({hasText:'Saved revision 4'}).waitFor();
 await spm.getByLabel('Workflow name',{exact:true}).fill('Unsaved SPM changes');await spm.getByRole('button',{name:'Save Draft',exact:true}).click();await spm.getByRole('alert').filter({hasText:'This draft changed'}).waitFor();assert.equal(await spm.getByLabel('Workflow name',{exact:true}).inputValue(),'Unsaved SPM changes');await shot(spm,'stale-revision-preserves-edits');
 await spm.reload();await spm.getByLabel('Workflow name',{exact:true}).waitFor();assert.equal(await spm.getByLabel('Workflow name',{exact:true}).inputValue(),'Director revised SPM draft');await spm.setViewportSize({width:390,height:844});await shot(spm,'spm-mobile-stage-editor');assert.ok(await spm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await spm.getByRole('button',{name:'Preview Workflow',exact:true}).click();await shot(spm,'spm-mobile-preview');assert.ok(await spm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 pass('SPM drafts are scoped; incomplete drafts show validation; Director can revise globally; conflicting SPM changes are retained with a stale-revision message; mobile editor and preview fit.');
 for(const id of ['jpm','designer','digital','tech','spm2']){
  const page=await pageFor(id);const denied=await request(page,`/api/workflow-drafts/${ownId}`);assert.equal(denied.status,403);assert.equal((await request(page,`/api/workflow-drafts/${ownId}`,{commandId:crypto.randomUUID(),expectedRevision:4,definition:first.definition})).status,403);
  assert.equal((await request(page,`/api/workflow-drafts/${ownId}/clone`,{commandId:crypto.randomUUID(),expectedRevision:4},'POST')).status,403);
  if(id!=='spm2'){assert.equal((await request(page,'/api/workflow-drafts',{commandId:crypto.randomUUID(),definition:first.definition},'POST')).status,403);await page.goto(origin+'/projects/workflow-drafts');await page.waitForURL(u=>u.pathname==='/no-access');await shot(page,id+'-browser-denial');}
 }
 for(const action of ['publish','approve','activate']){const attempt=await director.request.post(origin+`/api/workflow-drafts/${draftId}/${action}`,{data:{}});assert.equal(attempt.status(),404);}
 assert.equal((await request(director,`/api/workflow-drafts/${draftId}`,{commandId:crypto.randomUUID(),expectedRevision:4,definition:first.definition,approved:true})).status,400);
 const originDenied=await director.request.patch(origin+`/api/workflow-drafts/${draftId}`,{headers:{Origin:'https://forged.invalid'},data:{commandId:crypto.randomUUID(),expectedRevision:4,definition:first.definition}});assert.equal(originDenied.status(),403);
 assert.equal((await director.request.post(origin+'/api/workflow-drafts',{headers:{Origin:origin,'Content-Type':'application/json'},data:'x'.repeat(140000)})).status(),413);
 assert.equal(await db.project.count(),0);assert.equal(await db.approvalRequest.count(),0);assert.equal(await db.legacyProjectPresetApproval.count(),0);assert.equal(await db.workflowDraft.count({where:{status:{not:'DRAFT'}}}),0);
 assert.equal(JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}})),accountSnapshot);
 assert.equal(result.pageErrors.length,0);assert.equal(result.blockedExternalRequests.length,0);assert.equal(logs.some(s=>/EXTERNAL_(NETWORK|FETCH)_FORBIDDEN/.test(s)),false);
 pass('Unauthorized role and cross-SPM browser/API denials; forged approval, origin and oversized bodies rejected; publication/approval/activation endpoints absent; projects, real approval requests and approved presets never created; synthetic accounts preserved.');
 console.log(JSON.stringify({screenshots:result.screens.length,pageErrors:result.pageErrors.length,externalRequests:result.blockedExternalRequests.length}));
} finally {
 if(browser)await browser.close();if(db)await db.$disconnect();if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
 writeFileSync(join(artifact,'result.json'),JSON.stringify(result,null,2));writeFileSync(join(artifact,'server.log'),logs.join(''));
 rmSync(root,{recursive:true,force:true});console.log('Disposable Stage Builder browser environment removed. Evidence: '+artifact);
}

// Uses a disposable private PostgreSQL cluster, fictional logins and a local S3
// protocol fixture. No .env files, live credentials, email or remote storage.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repository=process.cwd(), require=createRequire(join(repository,'package.json'));
const root=mkdtempSync(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'flux-tasker-browser-'));
const data=join(root,'data'), socket=join(root,'s'), app=join(root,'app');
const artifact=process.env.FLUX_BROWSER_ARTIFACTS||'/private/tmp/flux-phase31-browser-artifacts';mkdirSync(artifact,{recursive:true,mode:0o700});
const build=resolve(process.env.FLUX_BROWSER_BUILD||repository);
const env={PATH:process.env.PATH,LANG:'C',LC_ALL:'C',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',NEXT_TELEMETRY_DISABLED:'1',PGPASSFILE:join(root,'no-password'),PGSERVICEFILE:join(root,'no-service')};
const url=`postgresql://flux_browser@localhost:55437/flux_library_browser?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const pgArgs=['-X','-qAt','-h',socket,'-p','55437','-U','flux_browser','-v','ON_ERROR_STOP=1','-d','flux_library_browser'];
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();};
const sql=q=>run('psql',pgArgs,{input:q});
let started=false,server,browser,db,storage;
const result={checks:[],screens:[],pageErrors:[],blockedExternalRequests:[],storageOperations:[]};
const logs=[], objects=new Map(), pass=message=>{result.checks.push(message);console.log('PASS browser: '+message);};
try {
 mkdirSync(socket,{mode:0o700});mkdirSync(app);
 run('initdb',['-D',data,'-U','flux_browser','-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p 55437 -c unix_socket_permissions=0700 -c wal_level=minimal -c max_wal_senders=0 -c min_wal_size=32MB -c max_wal_size=64MB`,'-w','start']);started=true;
 run('psql',[...pgArgs.slice(0,-1),'postgres'],{input:'CREATE DATABASE flux_library_browser;'});
 const identity=JSON.parse(sql(`SELECT json_build_object('data',current_setting('data_directory'),'tcp',current_setting('listen_addresses'),'version',current_setting('server_version'))`));assert.equal(identity.data,data);assert.equal(identity.tcp,'');result.postgres=identity.version;
 cpSync(join(repository,'prisma/schema.prisma'),join(root,'schema.prisma'));mkdirSync(join(root,'migrations'));
 for(const entry of readdirSync(join(repository,'prisma/migrations')))cpSync(join(repository,'prisma/migrations',entry),join(root,'migrations',entry),{recursive:true});
 run(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',join(root,'schema.prisma')],{env:{...env,DATABASE_URL:url}});
 assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')),111);
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasourceUrl:url});
 const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex'),passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 const roles=[['director','DIRECTOR'],['spm','SENIOR_PROJECT_MANAGER'],['spm2','SENIOR_PROJECT_MANAGER'],['jpm','JUNIOR_PROJECT_MANAGER'],['designer','DESIGNER'],['designer2','DESIGNER'],['digital','DIGITAL_LEAD'],['tech',null],['tech2',null]];
 for(const [id] of roles)await db.user.create({data:{id,email:`${id}@browser.invalid`,name:`Fixture ${id}`,passwordHash,role:'USER'}});
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable navigation browser fixtures',true),set_config('flux.authorization_change_id','browser-fixture-roles',true)`;for(const [userId,businessRole]of roles)await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:businessRole?[]:['TECHNICAL_ADMIN']}});});
 const accountSnapshot=JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}}));
 const source=Buffer.from('%PDF-1.4');
 await db.project.create({data:{id:'project',name:'Assigned project',ownerId:'spm',createdById:'spm'}});
 await db.projectCoOwner.create({data:{projectId:'project',userId:'jpm'}});
 for(const id of ['designer','digital']){
  await db.projectExecutor.create({data:{projectId:'project',userId:id}});
  await db.projectStage.create({data:{id:`task-${id}`,projectId:'project',name:id,order:id==='designer'?1:2,isTasker:true}});
  await db.projectConceptFolder.create({data:{id:`concept-${id}`,projectId:'project',taskerStageId:`task-${id}`,assignedExecutorId:id,assignedById:'director',name:id,normalizedName:id}});
  await db.projectAttachment.create({data:{id:`file-${id}`,projectId:'project',stageId:`task-${id}`,uploadedById:'director',fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:`fixture/${id}.pdf`,status:'READY',assetType:'STAGE_SUBMISSION'}});
  objects.set(`/fixture-bucket/fixture/${id}.pdf`,{body:source,type:'application/pdf',etag:'"'+createHash('md5').update(source).digest('hex')+'"'});
 }
 await db.assetTag.create({data:{id:'tag',name:'Browser tag'}});
 for(const id of ['director','spm','jpm']){
  await db.manualLibraryAsset.create({data:{id:`manual-${id}`,assetName:`manual-${id}.pdf`,originalFileName:`manual-${id}.pdf`,uploadedById:id,mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:`fixture/manual-${id}.pdf`,status:'READY',assetTags:{create:{tagId:'tag'}}}});
  objects.set(`/fixture-bucket/fixture/manual-${id}.pdf`,{body:source,type:'application/pdf',etag:'"'+createHash('md5').update(source).digest('hex')+'"'});
 }
 await db.flexibleProject.create({data:{id:'flex',slug:'flex',name:'Flexible project',ownerId:'spm',createdById:'spm',collaborators:{create:{userId:'jpm'}},milestones:{create:{name:'Digital work',sortOrder:1,responsibleUserId:'digital'}}}});
 const projectSnapshot=JSON.stringify(await db.project.findMany());
 storage=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3107');res.setHeader('Access-Control-Allow-Methods','PUT,GET,HEAD,OPTIONS');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Expose-Headers','ETag');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const key=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);result.storageOperations.push(req.method+' '+key);
  if(req.method==='PUT'){
   const copy=req.headers['x-amz-copy-source'];
   if(copy){const original=objects.get('/'+decodeURIComponent(copy).replace(/^\//,''));if(!original||req.headers['x-amz-copy-source-if-match']!==original.etag){res.writeHead(412);res.end();return;}objects.set(key,{...original,body:Buffer.from(original.body)});res.setHeader('Content-Type','application/xml');res.end(`<CopyObjectResult><LastModified>${new Date().toISOString()}</LastModified><ETag>${original.etag}</ETag></CopyObjectResult>`);return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),etag='"'+createHash('md5').update(body).digest('hex')+'"';objects.set(key,{body,type:req.headers['content-type'],etag});res.setHeader('ETag',etag);res.end();return;
  }
  const object=objects.get(key);if(object&&req.headers['if-match']&&req.headers['if-match']!==object.etag){res.writeHead(412);res.end();return;}if(!object){res.writeHead(404);res.end();return;}res.setHeader('Content-Length',object.body.length);res.setHeader('Content-Type',object.type);res.setHeader('ETag',object.etag);res.end(req.method==='HEAD'?undefined:object.body);
 });await new Promise(r=>storage.listen(3108,'127.0.0.1',r));
 for(const path of ['package.json','public','next.config.ts'])cpSync(join(build,path),join(app,path),{recursive:true});
 cpSync(join(build,'.next'),join(app,'.next'),{recursive:true,filter:source=>!source.startsWith(join(build,'.next/dev'))&&!source.startsWith(join(build,'.next/cache'))});symlinkSync(join(repository,'node_modules'),join(app,'node_modules'),'dir');
 // Guard Node's HTTP clients as well as the browser, independently of AWS endpoint configuration.
 const guard=join(root,'local-network-only.cjs');writeFileSync(guard,`for (const protocol of ['http','https']) { const module = require('node:'+protocol), original=module.request; module.request=function(...args){const arg=args[0];const host=typeof arg==='string'||arg instanceof URL?new URL(arg).hostname:arg?.hostname||arg?.host||'localhost';if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('EXTERNAL_NETWORK_FORBIDDEN:'+host);return original.apply(this,args);}; } const originalFetch=global.fetch; global.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','::1'].includes(url.hostname))throw new Error('EXTERNAL_FETCH_FORBIDDEN:'+url.hostname);return originalFetch(input,...args);};`);
 server=spawn(process.execPath,['--require',guard,require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3107'],{cwd:app,env:{...env,DATABASE_URL:url,DIRECT_URL:url,APP_URL:'http://127.0.0.1:3107',NODE_ENV:'production',FLUX_UNIVERSAL_TASKER:'1',FLUX_SHARED_FILE_IDENTITY:'1',FLUX_APPROVAL_ENGINE:'1',FLUX_SHARED_EVENTS:'1',NEXT_PUBLIC_REALTIME_PROVIDER:'none',AWS_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'fixture-only',AWS_SECRET_ACCESS_KEY:'fixture-only',AWS_S3_BUCKET:'fixture-bucket',AWS_ENDPOINT_URL_S3:'http://127.0.0.1:3108',S3_USE_ACCELERATE_ENDPOINT:'false'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs.push(b.toString()));
 const origin='http://127.0.0.1:3107';for(let i=0;i<80;i++){try{if((await fetch(origin+'/sign-in')).status===200)break;}catch{}assert.ok(i<79,'Server did not start');await new Promise(r=>setTimeout(r,250));}
 const harness=process.env.FLUX_PLAYWRIGHT_PACKAGE||'/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';const {chromium}=createRequire(harness)('playwright-core');browser=await chromium.launch({headless:true,args:['--disable-background-networking']});result.chromium=browser.version();
 const pages=new Map();async function freshPage(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.route('**/*',route=>{const u=new URL(route.request().url());if([origin,'http://127.0.0.1:3108'].includes(u.origin)||['data:','blob:'].includes(u.protocol))return route.continue();result.blockedExternalRequests.push(u.origin);return route.abort();});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.pageErrors.push(e.message));return page;}
 async function pageFor(id){if(pages.has(id))return pages.get(id);const page=await freshPage();await page.goto(origin+'/sign-in');await page.locator('[name=email]').fill(`${id}@browser.invalid`);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));pages.set(id,page);return page;}
 async function shot(page,name){await page.waitForTimeout(600);await page.screenshot({path:join(artifact,name+'.png'),fullPage:true,animations:'disabled'});result.screens.push(name);}

 async function requestStatus(page,path,data,method='PATCH'){return page.evaluate(async({path,data,method})=>(await fetch(path,data?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})).status,{path,data,method});}
 async function createTaskUI(page,title,executor,context='structured:project',spectator){
  await page.goto(origin+'/tasks');await page.getByRole('button',{name:'New General Task',exact:true}).click();
  await page.locator('[name=contextTarget]').selectOption(context);await page.locator('[name=title]').fill(title);await page.locator('[name=brief]').fill('Authorized General Task brief');
  await page.locator('[name=deadline]').fill('2026-10-20T12:00');await page.locator('[name=priority]').selectOption('HIGH');await page.locator('[name=executorId]').selectOption(executor);
  if(spectator)await page.locator(`[name=spectatorIds][value=${spectator}]`).check();
  await page.getByRole('button',{name:'Create General Task',exact:true}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();
  return await db.universalTask.findFirstOrThrow({where:{title}});
 }
 async function action(page,text,button){await page.getByLabel('Message or decision reason').fill(text);await page.getByRole('button',{name:button,exact:true}).click();await page.waitForFunction(()=>{const el=document.querySelector('textarea[aria-label="Message or decision reason"]');return !el||el.value==='';});await page.waitForFunction(()=>!document.querySelector('button:disabled')?.textContent?.includes('Saving'));await page.waitForTimeout(400);assert.equal(await page.locator('p[role=alert]').count(),0);}
 const director=await pageFor('director');const task=await createTaskUI(director,'Director General Task','designer','structured:project','digital');
 assert.equal(task.ownerId,'director');await director.getByRole('button',{name:'List view',exact:true}).click();await shot(director,'director-list');
 const designer=await pageFor('designer');await designer.goto(origin+'/tasks');await designer.getByRole('heading',{name:'Director General Task',exact:true}).waitFor();await shot(designer,'designer-grid-overdue');
 await designer.goto(origin+'/tasks/'+task.id);await designer.getByText('Authorized General Task brief',{exact:true}).first().waitFor();
 assert.equal(await designer.locator('a[href*="/stages/"]').count(),0);assert.equal(await designer.getByRole('button',{name:'Approve completion',exact:true}).count(),0);
 await designer.getByLabel('Supporting file',{exact:true}).setInputFiles({name:'general-response.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
 await designer.getByText('general-response.pdf · v1',{exact:true}).waitFor();await action(designer,'First response with exact file','Submit response');
 await action(designer,'Work is ready for review','Request completion');assert.equal((await db.universalTask.findUniqueOrThrow({where:{id:task.id}})).status,'COMPLETION_REQUESTED');await shot(designer,'designer-completion-requested');
 const digital=await pageFor('digital');await digital.goto(origin+'/tasks/'+task.id);await digital.getByRole('heading',{name:'Director General Task',exact:true}).waitFor();assert.equal(await digital.getByRole('button',{name:'Send message',exact:true}).count(),0);
 const file=await db.universalTaskUpload.findFirstOrThrow({where:{taskId:task.id}});const filePath=`/api/tasker/${task.id}/files/${file.id}?versionId=${file.versionId}`;
 assert.equal(await requestStatus(digital,filePath),200);assert.equal(await requestStatus(digital,'/api/tasker/'+task.id,{action:'CLOSE',text:'Spectator cannot close',expectedVersion:5,commandId:'spectator-no-access'}),403);await shot(digital,'digital-spectator');
 await director.goto(origin+'/tasks/'+task.id);await action(director,'Please revise the wording','Request changes');
 await designer.reload();await action(designer,'Revised response','Submit response');await action(designer,'Revisions are ready','Request completion');
 await director.reload();await action(director,'Reviewed and approved exact submitted work','Approve completion');assert.equal((await db.universalTask.findUniqueOrThrow({where:{id:task.id}})).status,'COMPLETED');await shot(director,'director-completed');
 pass('Director creates; Designer submits file/revises/requests completion; Director rejects then approves; Digital Lead spectator views/downloads but cannot mutate');
 const owned=await createTaskUI(designer,'Designer owns SPM task','spm');const spm=await pageFor('spm');await spm.goto(origin+'/tasks/'+owned.id);await action(spm,'SPM response','Submit response');await action(spm,'SPM requests owner review','Request completion');
 await designer.goto(origin+'/tasks/'+owned.id);await action(designer,'Designer approves as real owner','Approve completion');assert.equal((await db.universalTask.findUniqueOrThrow({where:{id:owned.id}})).status,'COMPLETED');await shot(designer,'designer-owner-review');
 const jpm=await pageFor('jpm');const jpmTask=await createTaskUI(jpm,'JPM General Task','designer');await jpm.goto(origin+'/tasks/'+jpmTask.id);await action(jpm,'Closed directly with a reason','Close task');assert.equal((await db.universalTask.findUniqueOrThrow({where:{id:jpmTask.id}})).status,'CLOSED');
 await action(jpm,'Remove task from normal lists','Delete task');await jpm.waitForURL(u=>u.pathname==='/tasks');assert.ok((await db.universalTask.findUniqueOrThrow({where:{id:jpmTask.id}})).deletedAt);assert.ok(await db.universalTaskEntry.count({where:{taskId:jpmTask.id}})>=3);
 await createTaskUI(spm,'SPM General Task','designer');await createTaskUI(digital,'Digital flexible task','spm','flexible:flex');
 await digital.goto(origin+'/projects/flexible/flex');await digital.getByRole('link',{name:'Project General Tasks',exact:true}).waitFor();assert.equal(await digital.locator('a[href*="/stages/"]').count(),0);await shot(digital,'digital-flexible-context');
 await designer.goto(origin+'/projects/project');await designer.getByRole('link',{name:'Project General Tasks',exact:true}).waitFor();await designer.getByRole('link',{name:'Project General Tasks',exact:true}).click();await designer.getByRole('heading',{name:'Project General Tasks',exact:true}).waitFor();
 pass('Designer owns/reviews SPM work; SPM/JPM create; JPM closes/deletes with retained history; Digital Lead creates in assigned flexible context; project links remain scoped');
 const outsider=await pageFor('designer2');assert.equal(await requestStatus(outsider,'/api/tasker/'+task.id),403);assert.equal(await requestStatus(outsider,filePath),403);
 const tech=await pageFor('tech');assert.equal(await requestStatus(tech,'/api/tasker'),403);assert.equal(await requestStatus(tech,'/api/tasker/'+task.id),403);assert.equal(await requestStatus(tech,filePath),403);
 await tech.goto(origin+'/tasks');assert.equal(await tech.getByRole('heading',{name:'My General Tasks',exact:true}).count(),0);await shot(tech,'technical-admin-denied');
 await designer.goto(origin+'/tasks');await designer.getByText('Legacy concept tasks',{exact:true}).click();await designer.getByText('designer',{exact:true}).first().waitFor();
 await designer.setViewportSize({width:390,height:844});await designer.goto(origin+'/tasks/'+owned.id);await shot(designer,'mobile-task-history');
 assert.equal(JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}})),accountSnapshot);
 assert.equal(JSON.stringify(await db.project.findMany()),projectSnapshot);assert.equal(await db.user.count(),9);assert.equal(await db.archivedProjectFile.count(),0);assert.equal(await db.manualArchiveFile.count(),0);
 assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.blockedExternalRequests,[]);assert.ok(!logs.join('').includes('EXTERNAL_NETWORK_FORBIDDEN'));assert.ok(result.storageOperations.some(o=>o.startsWith('PUT')));
 pass('Unrelated and Technical Admin direct APIs/files denied; legacy concept view preserved; mobile history; nine identities/projects unchanged; fake storage only and no external requests');
 result.status='PASS';
} catch(error) {result.status='FAIL';result.error=error.message;console.error(error.stack);process.exitCode=1;if(browser)for(const [i,context]of browser.contexts().entries())for(const [j,page]of context.pages().entries()){await page.screenshot({path:join(artifact,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});console.log(JSON.stringify({url:page.url().split('#')[0],text:(await page.locator('body').innerText()).slice(-3500)}));}}
finally {writeFileSync(join(artifact,'result.json'),JSON.stringify(result,null,2),{mode:0o600});writeFileSync(join(artifact,'server.log'),logs.join(''),{mode:0o600});await browser?.close();server?.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db?.$disconnect();if(storage)await new Promise(r=>storage.close(r));if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(root,{recursive:true,force:true});console.log('Disposable browser app/database/object fixture removed. Artifacts: '+artifact);}

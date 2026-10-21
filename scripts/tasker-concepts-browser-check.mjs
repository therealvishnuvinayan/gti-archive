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
const artifact=process.env.FLUX_BROWSER_ARTIFACTS||'/private/tmp/flux-phase33-browser-artifacts';mkdirSync(artifact,{recursive:true,mode:0o700});
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
 assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')),112);
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
 await db.projectWorkflowStage.createMany({data:[{projectId:'project',stageKey:'FINAL_LAYOUT',status:'AVAILABLE'},{projectId:'project',stageKey:'PROJECT_RESEARCH_AND_PLANNING',status:'AVAILABLE'}]});
 await db.projectResearchWorkspace.create({data:{id:'research',projectId:'project',ownerUserId:'spm',folders:{create:{id:'research-folder',name:'Approved research folder',normalizedName:'research',createdById:'spm'}}}});
 for(const ownerUserId of ['designer','digital'])await db.projectPrivateFolder.create({data:{id:ownerUserId+'-folder',projectId:'project',ownerUserId,name:'Private destination'}});
 await db.projectStageFileHandoff.create({data:{id:'handoff',projectId:'project',sourceAttachmentId:'file-designer',sourceWorkflowStageKey:'PROJECT_DEVELOPMENT',targetWorkflowStageKey:'FINAL_LAYOUT',handedOffById:'spm'}});
 await db.projectFileChecklist.create({data:{id:'checklist',projectId:'project',sourceAttachmentId:'file-designer',handoffId:'handoff',items:{create:[{id:'output',fieldKey:'OUTPUT_NAME',value:{text:'Original output'}},{id:'drawing',fieldKey:'TECHNICAL_DRAWING'},{id:'trace',fieldKey:'TRACK_TRACE'}]}}});
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
 server=spawn(process.execPath,['--require',guard,require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3107'],{cwd:app,env:{...env,DATABASE_URL:url,DIRECT_URL:url,APP_URL:'http://127.0.0.1:3107',NODE_ENV:'production',FLUX_TASKER_CONCEPTS:'1',FLUX_TASKER_DELIVERABLES:'1',FLUX_UNIVERSAL_TASKER:'1',FLUX_SHARED_FILE_IDENTITY:'1',FLUX_APPROVAL_ENGINE:'1',FLUX_SHARED_EVENTS:'1',NEXT_PUBLIC_REALTIME_PROVIDER:'none',AWS_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'fixture-only',AWS_SECRET_ACCESS_KEY:'fixture-only',AWS_S3_BUCKET:'fixture-bucket',AWS_ENDPOINT_URL_S3:'http://127.0.0.1:3108',S3_USE_ACCELERATE_ENDPOINT:'false'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs.push(b.toString()));
 const origin='http://127.0.0.1:3107';for(let i=0;i<80;i++){try{if((await fetch(origin+'/sign-in')).status===200)break;}catch{}assert.ok(i<79,'Server did not start');await new Promise(r=>setTimeout(r,250));}
 const harness=process.env.FLUX_PLAYWRIGHT_PACKAGE||'/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';const {chromium}=createRequire(harness)('playwright-core');browser=await chromium.launch({headless:true,args:['--disable-background-networking']});result.chromium=browser.version();
 const pages=new Map();async function freshPage(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.route('**/*',route=>{const u=new URL(route.request().url());if([origin,'http://127.0.0.1:3108'].includes(u.origin)||['data:','blob:'].includes(u.protocol))return route.continue();result.blockedExternalRequests.push(u.origin);return route.abort();});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.pageErrors.push(e.message));return page;}
 async function pageFor(id){if(pages.has(id))return pages.get(id);const page=await freshPage();await page.goto(origin+'/sign-in');await page.locator('[name=email]').fill(`${id}@browser.invalid`);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));pages.set(id,page);return page;}
 async function shot(page,name){await page.waitForTimeout(600);await page.screenshot({path:join(artifact,name+'.png'),fullPage:true,animations:'disabled'});result.screens.push(name);}

 async function request(page,path,data,method='PATCH'){return page.evaluate(async({path,data,method})=>{const r=await fetch(path,data?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():(await r.arrayBuffer(),null),disposition:r.headers.get('content-disposition')};},{path,data,method});}
 async function createTaskUI(page,title,type,{executor='designer2',sourceVersionId,inspiration=[],spectator,destination}={}){
  await page.goto(origin+'/tasks');await page.getByRole('button',{name:'New Task',exact:true}).click();await page.locator('[name=contextTarget]').selectOption('structured:project');await page.getByLabel('Task type',{exact:true}).selectOption(type);
  if(sourceVersionId)await page.locator('[name=sourceVersionId]').selectOption(sourceVersionId);
  for(const version of inspiration)await page.locator(`[name=inspirationVersionIds][value="${version}"]`).check();
  if(destination){await page.getByLabel('Task destination',{exact:true}).selectOption(destination);await page.getByLabel('Requested answer',{exact:true}).selectOption('FILE');}
  await page.locator('[name=title]').fill(title);await page.locator('[name=brief]').fill('Exact protected source and independent task review');await page.locator('[name=deadline]').fill('2026-11-20T12:00');await page.locator('[name=executorId]').selectOption(executor);
  if(spectator)await page.locator(`[name=spectatorIds][value=${spectator}]`).check();
  await page.getByRole('button',{name:/^Create .* Task$/,exact:false}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();return db.universalTask.findFirstOrThrow({where:{title}});
 }
 async function attach(page,name,inspection=false){await page.waitForLoadState('networkidle');await page.getByLabel(inspection?'Inspection source upload':'Supporting file',{exact:true}).setInputFiles({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});await page.getByText(name+' · v',{exact:false}).first().waitFor();await page.getByRole('button',{name:'Send message',exact:true}).waitFor();}
 async function action(page,text,button){await page.getByLabel('Message or decision reason').fill(text);await page.getByRole('button',{name:button,exact:true}).click();await page.waitForFunction(()=>{const el=document.querySelector('textarea[aria-label="Message or decision reason"]');return !el||el.value==='';});await page.waitForTimeout(350);assert.equal(await page.locator('p[role=alert]').count(),0);}
 const director=await pageFor('director'),designer=await pageFor('designer'),executor=await pageFor('designer2'),spm=await pageFor('spm'),jpm=await pageFor('jpm'),digital=await pageFor('digital');
 const inspection=await createTaskUI(director,'Inspect exact owner source','INSPECT_FILE',{spectator:'digital'});
 await executor.goto(origin+'/tasks/'+inspection.id);assert.equal(await executor.getByRole('button',{name:'Submit response',exact:true}).count(),0);
 await director.goto(origin+'/tasks/'+inspection.id);await attach(director,'owner-source.pdf',true);await director.getByRole('link',{name:'Download exact version',exact:true}).waitFor();await shot(director,'director-pinned-inspection-source');
 const ref=await db.universalTaskReference.findFirstOrThrow({where:{taskId:inspection.id}});const filePath=`/api/tasker/${inspection.id}/references/${ref.id}?versionId=${ref.versionId}`;
 await executor.reload();assert.equal((await request(executor,filePath)).status,200);assert.ok((await request(executor,filePath+'&disposition=inline')).disposition.startsWith('inline'));
 await attach(executor,'findings.pdf');await action(executor,'Inspection findings only','Submit response');await action(executor,'Please review findings','Request completion');await shot(executor,'designer-inspection-review-pending');
 await director.reload();await action(director,'Clarify the findings','Request changes');await executor.reload();await action(executor,'Clarified inspection findings','Submit response');await action(executor,'Ready for another review','Request completion');await director.reload();await action(director,'Inspection task accepted; source remains unchanged','Approve completion');
 await digital.goto(origin+'/tasks/'+inspection.id);assert.equal(await digital.getByRole('link',{name:'Download exact version',exact:true}).count(),0);assert.equal((await request(digital,filePath)).status,403);await shot(digital,'digital-spectator-source-denial');
 pass('Director uploads/pins inspection; task-only Designer downloads/previews, submits/revises and requests review; owner independently accepts; spectator cannot read source.');

 const initial=await createTaskUI(spm,'Initial creative concepts','INITIAL_CONCEPT',{executor:'designer'});await designer.goto(origin+'/tasks/'+initial.id);
 await attach(designer,'supporting.pdf');await action(designer,'Private original conversation','Send message');await attach(designer,'selected-concept.pdf');await attach(designer,'unselected-concept.pdf');await action(designer,'Two submitted creative concepts','Submit response');await shot(designer,'designer-initial-submitted');
 const selected=await db.universalTaskUpload.findFirstOrThrow({where:{taskId:initial.id,version:{originalFileName:'selected-concept.pdf'}}});const unselected=await db.universalTaskUpload.findFirstOrThrow({where:{taskId:initial.id,version:{originalFileName:'unselected-concept.pdf'}}});
 const final=await createTaskUI(spm,'Final with selected inspiration','FINAL_CONCEPT',{inspiration:[selected.versionId],spectator:'digital'});
 await executor.goto(origin+'/tasks/'+final.id);await executor.getByText('selected-concept.pdf · v1',{exact:true}).waitFor();assert.equal(await executor.getByText('Private original conversation',{exact:true}).count(),0);assert.equal(await executor.getByText('unselected-concept.pdf · v1',{exact:true}).count(),0);
 const selectedRef=await db.universalTaskReference.findFirstOrThrow({where:{taskId:final.id}});assert.equal((await request(executor,`/api/tasker/${final.id}/references/${selectedRef.id}?versionId=${selected.versionId}&disposition=inline`)).status,200);
 assert.equal((await request(executor,`/api/tasker/${final.id}/references/${selectedRef.id}?versionId=${unselected.versionId}`)).status,403);assert.equal((await request(executor,'/api/tasker/'+initial.id)).status,403);assert.equal((await request(executor,`/api/tasker/${initial.id}/files/${unselected.id}?versionId=${unselected.versionId}`)).status,403);await shot(executor,'final-selected-inspiration-only');
 await designer.reload();await action(designer,'Initial concepts ready for review','Request completion');await spm.goto(origin+'/tasks/'+initial.id);await action(spm,'Revise initial concept','Request changes');await shot(spm,'spm-initial-rejected');
 await designer.reload();await designer.getByLabel('Attachment version',{exact:true}).selectOption((await db.sharedFileVersion.findUniqueOrThrow({where:{id:selected.versionId}})).fileId);await attach(designer,'revised-initial.pdf');await action(designer,'Revised initial evidence','Submit response');await action(designer,'Review revised concept','Request completion');await spm.reload();await action(spm,'Approve revised initial concept','Approve completion');await shot(spm,'spm-initial-approved-history');
 await executor.reload();await executor.getByText('selected-concept.pdf · v1',{exact:true}).waitFor();await attach(executor,'independent-final.pdf');await action(executor,'Independent final deliverable','Submit response');await action(executor,'Review final task only','Request completion');await spm.goto(origin+'/tasks/'+final.id);await action(spm,'Final task accepted','Approve completion');await shot(spm,'spm-final-accepted');
 pass('SPM Initial Concept with supporting/submitted/rejected/revised/approved evidence; selected Final inspiration remains original v1 after later approval; unselected versions/conversation and original task APIs denied; independent Final review.');

 const noSource=await createTaskUI(jpm,'Final without inherited files','FINAL_CONCEPT',{executor:'digital'});await digital.goto(origin+'/tasks/'+noSource.id);await digital.getByText('No Initial Concept inspiration was selected.',{exact:true}).waitFor();await action(digital,'Digital Lead final concept description','Submit response');await action(digital,'Review requested','Request completion');await jpm.goto(origin+'/tasks/'+noSource.id);await action(jpm,'Accept the described final concept','Approve completion');await shot(jpm,'jpm-final-without-inspiration');
 for(const page of [designer,digital]){await page.goto(origin+'/tasks');await page.getByRole('button',{name:'New Task',exact:true}).click();await page.locator('[name=contextTarget]').selectOption('structured:project');
  for(const type of ['INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT']){assert.equal(await page.locator(`select[aria-label="Task type"] option[value="${type}"]`).count(),0);assert.equal((await request(page,'/api/tasker',{commandId:crypto.randomUUID(),contextTarget:'structured:project',type,title:'Denied',brief:'Denied',deadline:'2026-11-20T12:00:00Z',priority:'NORMAL',executorId:'spm'},'POST')).status,403);}}
 await shot(digital,'digital-creation-restricted');
 // Publish only into fake storage through the established File Upload workflow,
 // then exercise actual SPM project-source selection in the new picker.
 const publication=await createTaskUI(director,'Project inspection source publication','FILE_UPLOAD',{destination:'research-folder:research-folder'});await executor.goto(origin+'/tasks/'+publication.id);await attach(executor,'project-source.pdf');await action(executor,'Publish source evidence','Submit response');await action(executor,'Please accept project source','Request completion');await director.goto(origin+'/tasks/'+publication.id);await director.getByLabel('Confirm destination and submission').check();await action(director,'Accepted native project source','Approve completion');
 const published=await db.universalTaskPublication.findFirstOrThrow({where:{application:{taskId:publication.id}}});const picked=await createTaskUI(spm,'Inspect existing project version','INSPECT_FILE',{sourceVersionId:published.publishedVersionId});await spm.goto(origin+'/tasks/'+picked.id);await shot(spm,'spm-project-source-picker-result');await executor.goto(origin+'/tasks/'+picked.id);assert.equal((await request(spm,'/api/project-assets/'+published.attachmentId+'/preview')).status,200);assert.equal((await request(executor,'/api/project-assets/'+published.attachmentId+'/preview')).status,404);await executor.getByRole('link',{name:'Preview exact version',exact:true}).waitFor();
 const tech=await pageFor('tech'),outsider=await pageFor('spm2');for(const page of [tech,outsider]){assert.equal((await request(page,'/api/tasker/'+final.id)).status,403);assert.equal((await request(page,filePath)).status,403);}await tech.goto(origin+'/tasks');await shot(tech,'technical-business-denial');
 await executor.setViewportSize({width:390,height:844});await executor.goto(origin+'/tasks/'+final.id);await shot(executor,'mobile-final-history');
 assert.equal(JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}})),accountSnapshot);assert.equal(JSON.stringify(await db.project.findMany()),projectSnapshot);
 assert.equal(await db.user.count(),9);assert.equal(await db.approvalRequest.count(),0);assert.equal(await db.archivedProjectFile.count(),0);assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.blockedExternalRequests,[]);assert.ok(!logs.join('').includes('EXTERNAL_NETWORK_FORBIDDEN'));
 pass('JPM and Digital Lead execute/review without fabricated inspiration; Designer/Digital creation denied in UI/API; SPM selects sealed project file without granting executor folder access; unrelated and technical denials; accounts/project approval gates unchanged; no page errors or external requests.');
 result.status='PASS';
} catch(error) {result.status='FAIL';result.error=error.message;console.error(error.stack);process.exitCode=1;if(browser)for(const [i,context]of browser.contexts().entries())for(const [j,page]of context.pages().entries()){await page.screenshot({path:join(artifact,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});console.log(JSON.stringify({url:page.url().split('#')[0],text:(await page.locator('body').innerText()).slice(-3500)}));}}
finally {writeFileSync(join(artifact,'result.json'),JSON.stringify(result,null,2),{mode:0o600});writeFileSync(join(artifact,'server.log'),logs.join(''),{mode:0o600});await browser?.close();server?.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db?.$disconnect();if(storage)await new Promise(r=>storage.close(r));if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(root,{recursive:true,force:true});console.log('Disposable browser app/database/object fixture removed. Artifacts: '+artifact);}

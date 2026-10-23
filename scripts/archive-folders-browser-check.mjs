// Uses a disposable private PostgreSQL cluster, fictional logins and a local S3
// protocol fixture. No .env files, live credentials, email or remote storage.
import assert from 'node:assert/strict';
import { archiveSharingAcceptance, confirmBrowserGrant } from './archive-sharing-browser-acceptance.mjs';
import { archiveVerificationAcceptance } from './archive-verification-browser-acceptance.mjs';
import { archiveFolderAcceptance } from './archive-folders-browser-acceptance.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repository=process.cwd(), require=createRequire(join(repository,'package.json'));
const root=mkdtempSync(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'flux-archive-folders-browser-'));
const data=join(root,'data'), socket=join(root,'s'), app=join(root,'app');
const artifact=process.env.FLUX_BROWSER_ARTIFACTS||'/private/tmp/flux-phase61-browser-artifacts';mkdirSync(artifact,{recursive:true,mode:0o700});
const build=resolve(process.env.FLUX_BROWSER_BUILD||repository);
const env={PATH:process.env.PATH,LANG:'C',LC_ALL:'C',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',NEXT_TELEMETRY_DISABLED:'1',PGPASSFILE:join(root,'no-password'),PGSERVICEFILE:join(root,'no-service')};
const url=`postgresql://flux_browser@localhost:55437/flux_archive_browser?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const pgArgs=['-X','-qAt','-h',socket,'-p','55437','-U','flux_browser','-v','ON_ERROR_STOP=1','-d','flux_archive_browser'];
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();};
const sql=q=>run('psql',pgArgs,{input:q});
let started=false,server,browser,db,storage;
const result={checks:[],screens:[],pageErrors:[],blockedExternalRequests:[],storageOperations:[],expectedDenials:[],unexpectedResponses:[],redirects:[],failedFileRequests:[]};
const logs=[], objects=new Map(), pass=message=>{result.checks.push(message);console.log('PASS browser: '+message);};
try {
 mkdirSync(socket,{mode:0o700});mkdirSync(app);
 run('initdb',['-D',data,'-U','flux_browser','-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p 55437 -c unix_socket_permissions=0700 -c wal_level=minimal -c max_wal_senders=0 -c min_wal_size=32MB -c max_wal_size=64MB`,'-w','start']);started=true;
 run('psql',[...pgArgs.slice(0,-1),'postgres'],{input:'CREATE DATABASE flux_archive_browser;'});
 const identity=JSON.parse(sql(`SELECT json_build_object('data',current_setting('data_directory'),'tcp',current_setting('listen_addresses'),'version',current_setting('server_version'))`));assert.equal(identity.data,data);assert.equal(identity.tcp,'');result.postgres=identity.version;
 cpSync(join(repository,'prisma/schema.prisma'),join(root,'schema.prisma'));mkdirSync(join(root,'migrations'));
 for(const entry of readdirSync(join(repository,'prisma/migrations')))cpSync(join(repository,'prisma/migrations',entry),join(root,'migrations',entry),{recursive:true});
 run(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',join(root,'schema.prisma')],{env:{...env,DATABASE_URL:url}});
 assert.equal(Number(sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')),117);
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasourceUrl:url});
 const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex'),passwordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 const roles=[['director','DIRECTOR'],['spm','SENIOR_PROJECT_MANAGER'],['spm2','SENIOR_PROJECT_MANAGER'],['jpm','JUNIOR_PROJECT_MANAGER'],['designer','DESIGNER'],['designer2','DESIGNER'],['digital','DIGITAL_LEAD'],['tech',null],['tech2',null]];
 for(const [id] of roles)await db.user.create({data:{id,email:`${id}@browser.invalid`,name:`Fixture ${id}`,passwordHash,role:'USER'}});
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable Archive browser fixtures',true),set_config('flux.authorization_change_id','browser-fixture-roles',true)`;for(const [userId,businessRole]of roles)await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:businessRole?[]:['TECHNICAL_ADMIN']}});});
 const accountSnapshot=JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}}));
 await db.archiveCategory.create({data:{id:'artwork',name:'Fixture Artwork',slug:'fixture-artwork'}});
 await db.manualArchiveFile.create({data:{id:'artwork-file',archiveCategoryId:'artwork',fileName:'approved-artwork.pdf',originalFileName:'approved-artwork.pdf',mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:'fixture/artwork.pdf',status:'READY',uploadedById:'director',uploadedAt:new Date()}});
 for(const userId of ['designer','digital'])await db.userArchiveAssetAccess.create({data:{userId,manualArchiveFileId:'artwork-file',grantedById:'director'}});
 const source=Buffer.from('%PDF-1.4');objects.set('/fixture-bucket/fixture/artwork.pdf',{body:source,type:'application/pdf',etag:'"'+createHash('md5').update(source).digest('hex')+'"'});
 storage=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3107');res.setHeader('Access-Control-Allow-Methods','PUT,GET,HEAD,OPTIONS');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Expose-Headers','ETag');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const key=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);result.storageOperations.push(req.method+' '+key);
  if(req.method==='PUT'){
   const copy=req.headers['x-amz-copy-source'];
   if(copy){const original=objects.get('/'+decodeURIComponent(copy).replace(/^\//,''));if(!original||req.headers['x-amz-copy-source-if-match']!==original.etag){res.writeHead(412);res.end();return;}objects.set(key,{...original,body:Buffer.from(original.body)});res.setHeader('Content-Type','application/xml');res.end(`<CopyObjectResult><LastModified>${new Date().toISOString()}</LastModified><ETag>${original.etag}</ETag></CopyObjectResult>`);return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),etag='"'+createHash('md5').update(body).digest('hex')+'"';objects.set(key,{body,type:req.headers['content-type'],etag});res.setHeader('ETag',etag);res.end();return;
  }
  const object=objects.get(key);if(object && ((req.headers['if-match'] && req.headers['if-match']!==object.etag) || (new URL(req.url,'http://127.0.0.1').searchParams.get('versionId') && new URL(req.url,'http://127.0.0.1').searchParams.get('versionId')!==object.version))){res.writeHead(412);res.end();return;}if(object?.version)res.setHeader('x-amz-version-id',object.version);if(!object){res.writeHead(404);res.end();return;}res.setHeader('Content-Length',object.body.length);res.setHeader('Content-Type',object.type);res.setHeader('ETag',object.etag);res.end(req.method==='HEAD'?undefined:object.body);
 });await new Promise(r=>storage.listen(3108,'127.0.0.1',r));
 for(const path of ['package.json','public','next.config.ts'])cpSync(join(build,path),join(app,path),{recursive:true});
 cpSync(join(build,'.next'),join(app,'.next'),{recursive:true,filter:source=>!source.startsWith(join(build,'.next/dev'))&&!source.startsWith(join(build,'.next/cache'))});symlinkSync(join(repository,'node_modules'),join(app,'node_modules'),'dir');
 // Guard Node's HTTP clients as well as the browser, independently of AWS endpoint configuration.
 const guard=join(root,'local-network-only.cjs');writeFileSync(guard,`for (const protocol of ['http','https']) { const module = require('node:'+protocol), original=module.request; module.request=function(...args){const arg=args[0];const host=typeof arg==='string'||arg instanceof URL?new URL(arg).hostname:arg?.hostname||arg?.host||'localhost';if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('EXTERNAL_NETWORK_FORBIDDEN:'+host);return original.apply(this,args);}; } const originalFetch=global.fetch; global.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','::1'].includes(url.hostname))throw new Error('EXTERNAL_FETCH_FORBIDDEN:'+url.hostname);return originalFetch(input,...args);};`);
 server=spawn(process.execPath,['--require',guard,require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3107'],{cwd:app,env:{...env,DATABASE_URL:url,DIRECT_URL:url,APP_URL:'http://127.0.0.1:3107',NODE_ENV:'production',FLUX_ARCHIVE_FOLDERS:process.argv.includes('--without-folders')?'0':'1',FLUX_ARCHIVE_VERIFICATION:process.argv.includes('--verification')?'1':'0',FLUX_ARCHIVE_SHARING:process.argv.includes('--sharing')?'1':'0',NEXT_PUBLIC_REALTIME_PROVIDER:'none',AWS_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'fixture-only',AWS_SECRET_ACCESS_KEY:'fixture-only',AWS_S3_BUCKET:'fixture-bucket',AWS_ENDPOINT_URL_S3:'http://127.0.0.1:3108',S3_USE_ACCELERATE_ENDPOINT:'false'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',b=>logs.push(b.toString()));
 const origin='http://127.0.0.1:3107';for(let i=0;i<80;i++){try{if((await fetch(origin+'/sign-in')).status===200)break;}catch{}assert.ok(i<79,'Server did not start');await new Promise(r=>setTimeout(r,250));}
 const harness=process.env.FLUX_PLAYWRIGHT_PACKAGE||'/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';const {chromium}=createRequire(harness)('playwright-core');browser=await chromium.launch({headless:true,args:['--disable-background-networking']});result.chromium=browser.version();
 const pages=new Map();async function freshPage(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.route('**/*',route=>{const u=new URL(route.request().url());if([origin,'http://127.0.0.1:3108'].includes(u.origin)||['data:','blob:'].includes(u.protocol))return route.continue();result.blockedExternalRequests.push(u.origin);return route.abort();});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>result.pageErrors.push(e.message));page.on('requestfailed',request=>{if(/\/api\/(archives\/files|file-versions)\//.test(request.url()))result.failedFileRequests.push({url:request.url(),error:request.failure()});});page.on('response',response=>{if(response.status()>=300&&response.status()<400&&response.url().includes('/api/archives/files/'))result.redirects.push({url:response.url(),location:response.headers().location});if(response.status()<400)return;const path=new URL(response.url()).pathname;const expected=([403,404].includes(response.status())&&/^\/api\/archives\/(files\/[^/]+\/(download|preview)|organization|verification|access)$/.test(path))||([403,404].includes(response.status())&&path.startsWith('/api/file-versions/'))||(response.status()===409&&path==='/api/archives/organization');(expected?result.expectedDenials:result.unexpectedResponses).push({path,status:response.status()});});return page;}
 async function pageFor(id){if(pages.has(id))return pages.get(id);const page=await freshPage();await page.goto(origin+'/sign-in');await page.locator('[name=email]').fill(`${id}@browser.invalid`);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.startsWith('/sign-in'));pages.set(id,page);return page;}
 async function shot(page,name){await page.screenshot({path:join(artifact,name+'.png'),fullPage:true});result.screens.push(name);}
 for(const id of ['director','spm','designer','digital']){
  const page=await pageFor(id);await page.goto(origin+'/archives/fixture-artwork?view=all');await page.getByText('approved-artwork.pdf',{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).count(),['director','spm'].includes(id)?1:0);
  assert.equal(await page.getByRole('button',{name:'Delete',exact:true}).count(),id==='director'?1:0);
  assert.equal(await page.getByRole('button',{name:process.argv.includes('--sharing')?'Manage access':'File access',exact:true}).count(),['director','spm'].includes(id)?1:0);
  assert.equal(await page.getByRole('link',{name:'Download',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:/^Verify/}).count(),0);
  await shot(page,id+'-archive');
  const code=await page.evaluate(async()=> (await fetch('/api/archives/files/artwork-file/download')).status);assert.equal(code,200);
 }
 pass('Genuine Director/SPM/Designer/Digital Lead logins: authorized file visible, downloads work, edit/delete/grant controls match role; no premature verification control');
 for(const id of ['jpm','tech','tech2','designer2']){
  const page=await pageFor(id);const code=await page.evaluate(async()=> (await fetch('/api/archives/files/artwork-file/download')).status);assert.ok([403,404].includes(code));
  await page.goto(origin+'/archives/fixture-artwork?view=all');assert.equal(await page.getByRole('link',{name:'Download',exact:true}).count(),0);
 }
 pass('JPM, both technical administrators and an ungranted Designer cannot download through direct routes or the Archive UI');
 const spm=await pageFor('spm');await spm.goto(origin+'/archives/fixture-artwork?view=all');await spm.getByRole('button',{name:process.argv.includes('--sharing')?'Manage access':'File access',exact:true}).click();
 if(process.argv.includes('--sharing')) {const dialog=await confirmBrowserGrant(spm);await dialog.getByRole('button',{name:'Close',exact:true}).click();} else {
 const grantSaved=spm.waitForResponse(response=>response.url().endsWith('/api/archives/access')&&response.request().method()==='PUT');
 const grantReloaded=spm.waitForResponse(response=>response.url().includes('/api/archives/access?')&&response.request().method()==='GET');
 await spm.getByLabel('Fixture designer2',{exact:true}).click();assert.equal((await grantSaved).status(),200);await grantReloaded;
 await spm.waitForFunction(()=>[...document.querySelectorAll('label')].some(label=>label.textContent.includes('Fixture designer2')&&label.querySelector('input')?.checked));
 assert.equal(await spm.getByLabel('Fixture designer2',{exact:true}).isChecked(),true);
 }
 for(let i=0;i<50;i++){if(await db.userArchiveAssetAccess.count({where:{userId:'designer2',manualArchiveFileId:'artwork-file'}}))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await db.userArchiveAssetAccess.count({where:{userId:'designer2',manualArchiveFileId:'artwork-file',grantedById:'spm'}}),1);
 const scoped=await pageFor('designer2');await scoped.goto(origin+'/archives/fixture-artwork?view=all');await scoped.getByRole('link',{name:'Download',exact:true}).waitFor();await shot(spm,'spm-file-grants');
 pass('SPM file-grant UI persists actual grantor and unlocks only the selected file for the Designer');
 const digital=await pageFor('digital');await digital.goto(origin+'/archives/settings/categories');await digital.getByRole('button',{name:/Add.*category/i}).waitFor();assert.equal(await digital.getByRole('button',{name:/delete/i}).count(),0);await shot(digital,'digital-category-management');
 const director=await pageFor('director');await director.goto(origin+'/archives/settings/categories');await director.getByRole('button',{name:/Add.*category/i}).waitFor();await shot(director,'director-category-management');
 const designer=await pageFor('designer');await designer.goto(origin+'/archives/settings/categories');await designer.waitForURL(url=>url.pathname==='/tasks');assert.ok(!new URL(designer.url()).pathname.includes('/archives/settings/categories'));
 pass('Digital Lead category management is available without deletion; Designer cannot enter category management');
 if(!process.argv.includes('--without-folders')) await archiveFolderAcceptance({pageFor,db,origin,shot,pass});
 if(process.argv.includes('--verification')) await archiveVerificationAcceptance({pageFor,db,origin,shot,pass,objects,foldersEnabled:!process.argv.includes('--without-folders')});
 if(process.argv.includes('--sharing')) await archiveSharingAcceptance({pageFor,db,origin,shot,pass,objects,foldersEnabled:!process.argv.includes('--without-folders')});
 assert.equal(JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:'asc'},include:{user:{select:{role:true,email:true,passwordHash:true}}}})),accountSnapshot);
 assert.equal(await db.project.count(),0);assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.unexpectedResponses,[]);assert.deepEqual(result.blockedExternalRequests,[]);assert.deepEqual(result.failedFileRequests,[]);assert.ok(!logs.join('').includes('EXTERNAL_NETWORK_FORBIDDEN'));
 pass('Nine account assignments preserved; no projects created; all browser/storage traffic stays on isolated loopback');
 result.status='PASS';
} catch(error) {result.status='FAIL';result.error=error.message;console.error(error.stack);process.exitCode=1;if(browser)for(const [i,context]of browser.contexts().entries())for(const [j,page]of context.pages().entries()){await page.screenshot({path:join(artifact,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});console.log(JSON.stringify({url:page.url().split('#')[0],text:(await page.locator('body').innerText()).slice(-3500)}));}}
finally {writeFileSync(join(artifact,'result.json'),JSON.stringify(result,null,2),{mode:0o600});writeFileSync(join(artifact,'server.log'),logs.join(''),{mode:0o600});await browser?.close();server?.kill('SIGTERM');await new Promise(r=>setTimeout(r,300));await db?.$disconnect();if(storage)await new Promise(r=>storage.close(r));if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(root,{recursive:true,force:true});console.log('Disposable browser app/database/object fixture removed. Artifacts: '+artifact);}

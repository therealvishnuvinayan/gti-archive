import nodeAssert from "node:assert/strict";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(value, target, args); } : value; } });
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";


const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url }), authStore = new AsyncLocalStorage<string>();
let token: string | null = null;
async function as(id: string) { token = (await db.session.findFirstOrThrow({ where: { userId: id } })).token; }
async function asConcurrent<T>(id: string, fn: () => Promise<T>) { const session = await db.session.findFirstOrThrow({ where: { userId: id } }); return authStore.run(session.token, fn); }

async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`)[0], { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string }>();
  let copies = 0, reads = 0;
  let external = 0;
  global.fetch = async () => { external++; throw new Error("External requests forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    if (name === "@/lib/storage/s3") return {
      getS3BucketName: () => "isolated-fake-bucket", createPresignedUploadUrl: async () => "http://fixture.invalid/upload",
      getObjectMetadata: async (key: string) => { const o = objects.get(key); assert.ok(o); return { ...o }; },
      copyStoredObject: async ({ sourceKey, storageKey, sourceETag }: { sourceKey: string; storageKey: string; sourceETag: string }) => { const o = objects.get(sourceKey); assert.equal(o?.ETag, sourceETag); objects.set(storageKey, { ...o! }); copies++; },
      readPinnedStoredObject: async ({ storageKey, objectETag, objectVersionId }: { storageKey: string; objectETag: string; objectVersionId?: string }) => {
        const o = objects.get(storageKey); assert.equal(o?.ETag, objectETag); if (objectVersionId) assert.equal(o?.VersionId, objectVersionId); reads++;
        return { ...o, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(o!.ContentLength)); c.close(); } }) } };
      },
    };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const tasks = requireLocal(join(compiled, "src/lib/tasker/service.js")) as typeof import("../src/lib/tasker/service");
  const runtime = requireLocal(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const events = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  const { runtimeAuthorization: authorization } = requireLocal(join(compiled, "src/lib/authorization/runtime.js")) as typeof import("../src/lib/authorization/runtime");
  for (const key of ["SHARED_FILE_IDENTITY","APPROVAL_ENGINE","SHARED_EVENTS","UNIVERSAL_TASKER","TASKER_DELIVERABLES","TASKER_CONCEPTS","TASKER_SISTERS","STAGE_BUILDER_DRAFTS","STAGE_BUILDER_PUBLICATION","STAGE_RUNTIME","RUNTIME_INTEGRATION"]) process.env[`FLUX_${key}`] = "1";
  if(process.argv.includes("--baseline")) {
    process.env.FLUX_RUNTIME_INTEGRATION="0"; await as("director");
    const runtimeProject=await db.runtimeProject.findFirstOrThrow();
    const native=await db.universalTask.findFirstOrThrow({where:{type:"GENERAL",deletedAt:null}});
    assert.ok(await tasks.getTask(native.id)); assert.ok(await tasks.taskOptions()); assert.ok(await tasks.listTasks({scope:"accessible"})); assert.ok(await tasks.countMyGeneralTasks()>=0);
    await assert.rejects(tasks.taskOptions(`runtime:${runtimeProject.id}`)); await assert.rejects(tasks.listTasks({context:`runtime:${runtimeProject.id}`}));
    await assert.rejects(tasks.createTask({commandId:randomUUID(),contextTarget:`runtime:${runtimeProject.id}`,type:"GENERAL",title:"Disabled",brief:"Denied",deadline:"2026-11-15T12:00:00Z",priority:"NORMAL",executorId:"designer"}));
    assert.equal((await db.$queryRaw<Array<{exists:boolean}>>`SELECT to_regclass('public."RuntimeTaskContext"') IS NOT NULL AS exists`)[0].exists,false);
    const completion = requireLocal(join(compiled, "src/lib/runtime-completion/service.js")) as typeof import("../src/lib/runtime-completion/service");
    await assert.rejects(completion.getRuntimeCompletion(runtimeProject.id));
    await assert.rejects(completion.runtimeCompletionCommand(runtimeProject.id, {}));
    await assert.rejects(completion.openRuntimeDocument(runtimeProject.id, "unavailable"));
    await assert.rejects(completion.runtimeDocumentUploadTarget(runtimeProject.id, "unavailable"));
    await assert.rejects(completion.listRuntimeCompletionRequests());
    console.log(`PASS runtime Tasker disabled on actual 115 schema: ${assertions} assertions; latest generated client reads native tasks/options/lists/counts, runtime entry points deny without new-table queries.`);return;
  }
  const project = await db.runtimeProject.findFirstOrThrow({ where: { title: "SPM integration project", ownerId: "spm" } });
  const ctx = `runtime:${project.id}`;
  const stable = async () => JSON.stringify([await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true, sessions: true } }), await db.runtimeProject.findMany({ orderBy: { id: "asc" } }), await db.runtimeStage.findMany({ orderBy: { id: "asc" } }), await db.runtimeActivity.count(), await db.runtimeFileSubmission.count(), await db.projectArchive.count(), await db.manualLibraryAsset.count()]);
  const before = await stable();
  const historical = await db.universalTask.findMany({ orderBy: { id: "asc" }, include: { entries: { orderBy: { id: "asc" } }, uploads: true } });
  const oldEvents = await db.businessEvent.findMany({ orderBy: { id: "asc" } });
  const command = (extra = {}) => ({ commandId: randomUUID(), contextTarget: ctx, type: "GENERAL", title: "Runtime General fixture", brief: "Only the assigned task brief", context: "Minimal task context", deadline: "2026-11-15T12:00:00Z", priority: "HIGH", executorId: "designer", spectatorIds: ["digital"], ...extra });
  const create = (extra = {}) => tasks.createTask(command(extra));
  const change = async (taskId: string, action: string, extra = {}) => tasks.mutateTask(taskId, { commandId: randomUUID(), expectedVersion: (await tasks.getTask(taskId)).version, action, text: "Meaningful runtime task reason", ...extra });
  await as("director"); const directorTask = await create();
  assert.equal((await tasks.getTask(directorTask.id)).owner.id,"director");
  await as("spm"); await assert.rejects(tasks.getTask(directorTask.id));
  const t = await create({ title: "Unique runtime acceptance" });
  assert.equal((await tasks.getTask(t.id)).owner.id,"spm");
  await as("jpm"); const coOwned = await create({ spectatorIds: [], executorId: "digital" });
  await assert.rejects(change(t.id,"CLOSE"));
  await as("digital"); await change(coOwned.id,"SUBMIT"); await change(coOwned.id,"REQUEST_COMPLETION");
  await assert.rejects(runtime.getRuntimeProject(project.id));
  await as("jpm"); await change(coOwned.id,"APPROVE");
  await as("designer"); const detail = await tasks.getTask(t.id);
  assert.deepEqual(detail.project,{id:project.id,name:project.title,kind:"runtime"});
  assert.equal(detail.owner.id,"spm"); assert.equal(detail.executor.id,"designer"); assert.equal(detail.brief,"Only the assigned task brief");
  for(const forbidden of ["stages","workflow","participants","values","approvals","configuration"]) assert.equal(forbidden in detail,false);
  assert.equal(detail.permissions.manage,false); assert.equal(detail.permissions.submit,true);
  await assert.rejects(runtime.getRuntimeProject(project.id)); await assert.rejects(tasks.taskOptions(ctx));
  await assert.rejects(create({ executorId:"spm", spectatorIds:[] }));
  const child = await create({ contextTarget:`task:${t.id}`,executorId:"spm",spectatorIds:[] });
  assert.equal((await tasks.getTask(child.id)).owner.id,"designer");
  assert.equal((await tasks.taskOptions(`task:${t.id}`)).generalOnly,true);
  await as("spm"); await change(child.id,"SUBMIT"); await change(child.id,"REQUEST_COMPLETION");
  await as("designer"); await change(child.id,"APPROVE"); assert.equal((await tasks.getTask(child.id)).status,"COMPLETED");
  assert.equal((await tasks.listTasks({context:ctx,search:"Unique runtime acceptance"})).total,1);
  assert.equal(await tasks.countMyGeneralTasks(),(await tasks.listTasks()).total);
  const options=await tasks.taskOptions(); assert.ok(options.contexts.some(c=>c.target===`task:${t.id}`)); assert.ok(!options.contexts.some(c=>c.target===ctx));
  const prepared=await change(t.id,"PREPARE_UPLOAD",{fileName:"runtime-proof.pdf",mimeType:"application/pdf",fileSize:8});
  const upload=await db.universalTaskUpload.findUniqueOrThrow({where:{id:prepared.uploadId},include:{version:{include:{file:true}}}});
  assert.equal(upload.version.uploadedById,"designer"); assert.equal(upload.version.file.taskId,t.id);
  assert.equal(upload.version.file.projectId,null); assert.equal(upload.version.file.flexibleProjectId,null); assert.equal(upload.version.file.runtimeStageId,null);
  objects.set(upload.stagingKey,{ContentLength:8,ContentType:"application/pdf",ETag:'"runtime-one"',VersionId:"pin-runtime-one"});
  assert.match((await tasks.uploadTicket(t.id,upload.id)).uploadUrl,/fixture.invalid/);
  await change(t.id,"FINALIZE_UPLOAD",{uploadId:upload.id}); await change(t.id,"MESSAGE",{text:"Executor clarifies work"});
  await change(t.id,"SUBMIT",{fileIds:[upload.id]});
  await assert.rejects(change(t.id,"REQUEST_COMPLETION",{text:" "})); await change(t.id,"REQUEST_COMPLETION");
  await assert.rejects(change(t.id,"APPROVE"));
  await as("digital"); assert.equal((await tasks.getTask(t.id)).permissions.submit,false);
  for(const action of ["MESSAGE","SUBMIT","APPROVE","REJECT","CLOSE","DELETE","EDIT","PREPARE_UPLOAD","REQUEST_COMPLETION"]) await assert.rejects(change(t.id,action));
  await assert.rejects(create({contextTarget:`task:${t.id}`,executorId:"spm",spectatorIds:[]}));
  assert.equal((await tasks.downloadTaskFile(t.id,upload.id,upload.versionId)).size,8);
  for(const actor of ["tech","outsider","spm2"]){await as(actor); await assert.rejects(tasks.getTask(t.id)); await assert.rejects(create()); await assert.rejects(tasks.downloadTaskFile(t.id,upload.id,upload.versionId)); if(actor!=="tech")assert.equal((await tasks.listTasks({context:ctx})).total,0);else {await assert.rejects(tasks.listTasks());await assert.rejects(tasks.countMyGeneralTasks());}}
  await as("spm"); await change(t.id,"MESSAGE",{text:"Owner asks for correction"}); await assert.rejects(change(t.id,"REJECT",{text:""})); await change(t.id,"REJECT");
  await as("designer"); const second=await change(t.id,"PREPARE_UPLOAD",{fileName:"runtime-proof-v2.pdf",mimeType:"application/pdf",fileSize:9,replaceFileId:upload.version.fileId});
  const nextUpload=await db.universalTaskUpload.findUniqueOrThrow({where:{id:second.uploadId},include:{version:true}});
  objects.set(nextUpload.stagingKey,{ContentLength:9,ContentType:"application/pdf",ETag:'"runtime-two"'});
  await change(t.id,"FINALIZE_UPLOAD",{uploadId:nextUpload.id}); await change(t.id,"SUBMIT",{fileIds:[nextUpload.id]}); await change(t.id,"REQUEST_COMPLETION");
  assert.equal(nextUpload.version.number,2); assert.equal((await tasks.downloadTaskFile(t.id,upload.id,upload.versionId)).size,8);
  await as("spm"); const approve={commandId:randomUUID(),expectedVersion:(await tasks.getTask(t.id)).version,action:"APPROVE",text:"Accepted both exact versions"};
  await tasks.mutateTask(t.id,approve); const count=await db.businessEvent.count(); assert.equal((await tasks.mutateTask(t.id,approve)).replayed,true); assert.equal(await db.businessEvent.count(),count);
  const completed=await tasks.getTask(t.id); assert.equal(completed.status,"COMPLETED"); assert.equal(completed.permissions.createSister,true); assert.equal(completed.sistersEnabled,true);
  assert.equal((await tasks.sisterDraft(t.id)).values.contextTarget,ctx);
  await as("director");
  for(const target of [ctx,`task:${t.id}`])for(const type of ["FILE_UPLOAD","DATA_INPUT","INSPECT_FILE","INITIAL_CONCEPT","FINAL_CONCEPT"]){await assert.rejects(create({contextTarget:target,type,destination:"stage:concept-stage",inputMode:"FILE"}));}
  for(const target of ["runtime:missing",`structured:${project.id}`,`flexible:${project.id}`,`${ctx}:extra`])await assert.rejects(create({contextTarget:target}));
  await assert.rejects(create({projectId:"project"})); await assert.rejects(create({runtimeProjectId:project.id}));
  for(const extra of [{destination:"stage:concept-stage"},{inputMode:"FILE"},{sourceVersionId:upload.versionId},{inspirationVersionIds:[]}])await assert.rejects(create(extra));
  await assert.rejects(tasks.downloadTaskFile(directorTask.id,upload.id,upload.versionId));
  const intervention=await change(coOwned.id,"DELETE"); assert.ok(intervention.version);
  const deleted=await tasks.getTask(coOwned.id); assert.equal(deleted.owner.id,"jpm"); assert.equal(deleted.entries.at(-1)?.actor.id,"director"); assert.equal(deleted.entries.at(-1)?.directorOverride,true);
  assert.ok(deleted.deletedAt); assert.ok(!(await tasks.listTasks({context:ctx})).tasks.some(t=>t.id===coOwned.id));
  const closed=await create({spectatorIds:[]}); await assert.rejects(change(closed.id,"CLOSE",{text:""})); await change(closed.id,"CLOSE"); assert.equal((await tasks.getTask(closed.id)).status,"CLOSED");
  const concurrent=await create();
  const changes=["one","two"].map(text=>({commandId:randomUUID(),action:"MESSAGE",expectedVersion:1,text}));
  const outcomes=await Promise.allSettled(changes.map(c=>asConcurrent("director",()=>tasks.mutateTask(concurrent.id,c)))); assert.equal(outcomes.filter(o=>o.status==="fulfilled").length,1); assert.equal((await tasks.getTask(concurrent.id)).version,2);
  const replayCommand=command({spectatorIds:[]}); const replays=await Promise.all([tasks.createTask(replayCommand),tasks.createTask(replayCommand)]); assert.equal(replays[0].id,replays[1].id);
  await assert.rejects(tasks.createTask({...replayCommand,title:"Conflicting reuse"}));
  const snapshot=async()=>JSON.stringify([await db.universalTask.findMany({orderBy:{id:"asc"}}),await db.universalTaskEntry.count(),await db.runtimeTaskContext.count(),await db.runtimeTaskEventContext.count(),await db.businessEvent.count(),await db.eventOutbox.count(),await db.sharedFile.count(),await db.sharedFileVersion.count(),await db.sharedFileReference.count(),await db.sharedFileProvenance.count()]);
  const rollback=await snapshot();
  await db.$executeRawUnsafe(`CREATE FUNCTION fixture_runtime_task_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'task:%' THEN RAISE EXCEPTION 'forced runtime task outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_runtime_task_failure BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION fixture_runtime_task_failure()`);
  try {await assert.rejects(create()); assert.equal(await snapshot(),rollback); await assert.rejects(change(concurrent.id,"MESSAGE")); assert.equal(await snapshot(),rollback); await assert.rejects(change(concurrent.id,"PREPARE_UPLOAD",{fileName:"rollback.pdf",mimeType:"application/pdf",fileSize:8})); assert.equal(await snapshot(),rollback);}
  finally {await db.$executeRawUnsafe('DROP TRIGGER fixture_runtime_task_failure ON "EventOutbox"');await db.$executeRawUnsafe('DROP FUNCTION fixture_runtime_task_failure()');}
  await assert.rejects(db.runtimeTaskContext.update({where:{taskId:t.id},data:{projectId:"missing"}})); await assert.rejects(db.runtimeTaskContext.delete({where:{taskId:t.id}}));
  await assert.rejects(db.$executeRawUnsafe('TRUNCATE "RuntimeTaskEventContext"'));
  await assert.rejects(authorization.runAuthorized({capability:"task.createGeneral",targetId:ctx},async tx=>{
    const task=await tx.universalTask.create({data:{type:"GENERAL",title:"Missing association",brief:"Must not commit",deadline:new Date(),ownerId:"director",executorId:"designer"}});
    const actor=await tx.userAuthorization.findUniqueOrThrow({where:{userId:"director"}});
    await tx.universalTaskEntry.create({data:{taskId:task.id,version:1,commandId:randomUUID(),commandHash:"a".repeat(64),action:"CREATED",text:"Missing runtime context",snapshot:{},actorId:"director",actorRole:"DIRECTOR",actorVersion:actor.authorizationVersion,directorOverride:false}});
  }));
  await assert.rejects(authorization.runAuthorized({capability:"task.createGeneral",targetId:ctx},async tx=>{
    const task=await tx.universalTask.create({data:{type:"GENERAL",title:"Mixed association",brief:"Must not commit",deadline:new Date(),ownerId:"director",executorId:"designer",projectId:"project"}});
    await tx.runtimeTaskContext.create({data:{taskId:task.id,projectId:project.id}});
  }));
  for(const event of await db.businessEvent.findMany({where:{task:{runtimeContext:{isNot:null}}},include:{runtimeTaskContext:true}})){
    const decoded=events.decodeBusinessEvent(event); assert.equal(decoded.type,"TASK_ACTIVITY"); assert.ok("runtimeProjectId" in decoded.context); assert.equal((decoded.context as {runtimeProjectId:string}).runtimeProjectId,project.id);
    assert.equal(event.projectId,null); assert.equal(event.flexibleProjectId,null); assert.equal(event.runtimeTaskContext?.taskId,event.taskId); assert.ok(await db.eventOutbox.findUnique({where:{eventId:event.id}}));
    assert.throws(()=>events.decodeBusinessEvent({...event,runtimeTaskContext:null}));
  }
  const session=await db.session.findUniqueOrThrow({where:{token:token!}});
  await db.session.update({where:{id:session.id},data:{expiresAt:new Date(0)}});
  try {await assert.rejects(tasks.getTask(t.id));await assert.rejects(tasks.listTasks({context:ctx}));await assert.rejects(tasks.downloadTaskFile(t.id,upload.id,upload.versionId));}
  finally {await db.session.update({where:{id:session.id},data:{expiresAt:session.expiresAt,updatedAt:session.updatedAt}});}
  const {createInternalDispatcher}=requireLocal(join(compiled,"src/lib/events/dispatcher.js")) as typeof import("../src/lib/events/dispatcher");
  let runtimeDeliveries=0;
  const dispatcher=createInternalDispatcher(db,async (_tx,event)=>{if(event.type==="TASK_ACTIVITY"&&event.context.runtimeProjectId){assert.equal(event.context.runtimeProjectId,project.id);runtimeDeliveries++;}});
  for(let i=0;i<10000;i++){const claim=await dispatcher.claim();if(!claim)break;assert.equal(await dispatcher.deliver(claim),"DELIVERED");assert.equal(await dispatcher.deliver(claim),"STALE");}
  assert.ok(runtimeDeliveries>0);
  await as("designer"); const onCount=await tasks.countMyGeneralTasks(); process.env.FLUX_RUNTIME_INTEGRATION="0";
  await assert.rejects(tasks.getTask(t.id)); await assert.rejects(tasks.taskOptions(ctx)); await assert.rejects(tasks.downloadTaskFile(t.id,upload.id,upload.versionId));
  assert.ok(await tasks.countMyGeneralTasks()<onCount); assert.ok((await tasks.listTasks()).tasks.every(t=>t.project.kind!=="runtime")); assert.ok((await tasks.taskOptions()).contexts.every(c=>!c.target.startsWith("runtime:")&&c.target!==`task:${t.id}`));
  process.env.FLUX_RUNTIME_INTEGRATION="1";
  assert.ok(await stable()===before,"Accounts, sessions and runtime records must remain unchanged");
  assert.deepEqual(await db.universalTask.findMany({where:{id:{in:historical.map(t=>t.id)}},orderBy:{id:"asc"},include:{entries:{orderBy:{id:"asc"}},uploads:true}}),historical);
  assert.deepEqual(await db.businessEvent.findMany({where:{id:{in:oldEvents.map(e=>e.id)}},orderBy:{id:"asc"}}),oldEvents);
  assert.equal(external,0); assert.equal(copies,2); assert.equal(reads,2);
  console.log(`PASS runtime General Task integration: ${assertions} assertions; role scope, full lifecycle, exact-version files, minimal context, invalid mixed-adapter denial, SQL identity, replay/concurrency, rollback, event/outbox and old-record preservation.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());

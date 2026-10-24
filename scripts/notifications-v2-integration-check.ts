import nodeAssert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getLiveAttention } from "../src/lib/notifications-v2/service";
import { GET } from "../src/app/api/notifications/attention/route";
import { attentionHref, parseAttentionQuery } from "../src/lib/notifications-v2/contracts";
import { addCalendarDays, dubaiDate, dubaiDayStart } from "../src/lib/calendar-v2/dates";
import { createTask, getTask, mutateTask } from "../src/lib/tasker/service";
import { getRoleDashboard } from "../src/lib/dashboard-v2/service";
import { getWorkflowApproval, decideWorkflowPublication } from "../src/lib/stage-builder/publication";
import { createRuntimeProject, runtimeStageCommand } from "../src/lib/stage-runtime/service";
import { decideRuntimeCreation } from "../src/lib/runtime-integration/creation";
import { getRuntimeCompletion, runtimeCompletionCommand } from "../src/lib/runtime-completion/service";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { createRoleAssignmentService } from "../src/lib/authorization/role-assignment-service";
import { getDashboardBackNavigation } from "../src/lib/dashboard-navigation";
import { getCurrentUser } from "../src/lib/auth";
import { getSidebarVisibility } from "../src/lib/permissions/resolver";
import { GET as dashboardApi } from "../src/app/api/dashboard/route";
import { GET as searchApi } from "../src/app/api/search/route";
import { GET as calendarApi } from "../src/app/api/calendar/route";

type Fixture = { db: PrismaClient; as: (id: string) => Promise<void>; setToken: (token: string | null) => void; queries: { query: string; params: string }[]; root: string; storageReads: () => number; external: () => number };
export async function runAttentionAcceptance({ db, as, setToken, queries, root, storageReads, external }: Fixture) {
  let assertions = 0, expectedDenials = 0, expectedFailures = 0;
  const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const v = Reflect.get(target, property); return typeof v === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(v, target, args); } : v; } });
  const artifact = process.env.FLUX_NOTIFICATIONS_ARTIFACTS!, fixture = JSON.parse(readFileSync(join(root, "browser-fixture.json"), "utf8"));
  const api = (q = "") => GET(new Request(`http://local/api/notifications/attention?${q}`));
  const denied = async (q: string, status: number) => { const r = await api(q); assert.equal(r.status,status); assert.equal(r.headers.get("cache-control"),"private, no-store"); if(status<500)expectedDenials++;else expectedFailures++; return r; };
  const live = (source: string) => getLiveAttention({source});
  const now = new Date(), today = dubaiDate(now), yesterday = addCalendarDays(today,-1), tomorrow = addCalendarDays(today,1), end = addCalendarDays(today,3);
  const watch = (extra = {}) => getLiveAttention({view:"deadlines",watch:"all",start:yesterday,end,relationship:"all",...extra});
  const change = async (id: string, action: string, extra = {}) => mutateTask(id,{commandId:randomUUID(),expectedVersion:(await getTask(id)).version,action,text:"Synthetic attention acceptance",...extra});
  await as("spm");
  const create = (title: string, due: Date, extra = {}) => createTask({commandId:randomUUID(),contextTarget:"structured:native",type:"GENERAL",title,brief:"PRIVATE_ATTENTION_BRIEF",deadline:due.toISOString(),priority:"NORMAL",executorId:"designer",spectatorIds:[],...extra});
  const beforeMidnight = await create("Attention before Dubai midnight",new Date(dubaiDayStart(today).getTime()-60_000));
  const midnight = await create("Attention Dubai midnight",dubaiDayStart(today));
  const nextDay = await create("Attention tomorrow midnight",dubaiDayStart(tomorrow));
  const past = await create("Attention past deadline",new Date(now.getTime()-120_000),{spectatorIds:["digital"]});
  const future = await create("Attention coming up",dubaiDayStart(end));
  const completed = await create("Attention completed historical",new Date(now.getTime()-180_000));
  await as("designer");await change(completed.id,"REQUEST_COMPLETION");await as("spm");await change(completed.id,"APPROVE");
  const closed = await create("Attention closed historical",new Date(now.getTime()-180_000));await change(closed.id,"CLOSE");
  const review = await create("Attention review requested",new Date(now.getTime()-180_000));await as("designer");await change(review.id,"REQUEST_COMPLETION");
  const todayItems=(await watch({watch:"today",start:today,end:today})).deadlines;
  assert.ok(todayItems.some(t=>t.id===midnight.id));assert.ok(!todayItems.some(t=>t.id===beforeMidnight.id||t.id===nextDay.id));
  assert.ok(todayItems.every(t=>t.date===today));
  const overdue=(await watch({watch:"past"})).deadlines;assert.ok(overdue.some(t=>t.id===past.id&&t.indicator==="Past deadline"));assert.ok(overdue.some(t=>t.id===review.id&&t.status==="COMPLETION_REQUESTED"));
  assert.ok(!overdue.some(t=>[completed.id,closed.id,future.id].includes(t.id)));
  const upcoming=(await watch({watch:"upcoming"})).deadlines;assert.ok(upcoming.some(t=>t.id===future.id));assert.ok(!upcoming.some(t=>t.id===past.id));
  const history=(await watch()).deadlines;for(const id of [completed.id,closed.id])assert.equal(history.find(t=>t.id===id)?.indicator,"Historical deadline");
  assert.ok(!(await live("execution")).attention.some(t=>[review.id,completed.id,closed.id].includes(t.id)));
  assert.ok((await live("execution")).attention.some(t=>t.id===past.id&&t.actionable));
  await as("spm");assert.ok((await live("tasks")).attention.some(t=>t.id===review.id&&t.detail.startsWith("Task Owner")&&t.dateLabel==="Updated"));
  await as("director");assert.ok((await live("tasks")).attention.some(t=>t.id===review.id&&t.detail.startsWith("Director intervention")));
  await as("digital");assert.equal((await watch({relationship:"observed"})).deadlines.find(t=>t.id===past.id)?.relationships.join(),"Spectator");
  await as("director");assert.equal((await watch()).deadlines.find(t=>t.id===past.id)?.relationships.join(),"Director oversight");
  await as("spm");await change(review.id,"REJECT");assert.ok(!(await live("tasks")).attention.some(t=>t.id===review.id));
  await as("designer");await change(review.id,"REQUEST_COMPLETION");
  await as("spm");await change(review.id,"APPROVE");assert.ok(!(await live("tasks")).attention.some(t=>t.id===review.id));
  await as("spm");const waiting=await create("Attention awaiting Owner",new Date(now.getTime()-180_000));await as("designer");await change(waiting.id,"REQUEST_COMPLETION");
  // A separate pending review is retained for genuine Chromium decision mutation.
  await as("spm");const browserReview=await create("Attention browser Owner review",new Date(now.getTime()-180_000));await as("designer");await change(browserReview.id,"REQUEST_COMPLETION");
  for(const type of ["GENERAL","FILE_UPLOAD","DATA_INPUT","INSPECT_FILE","INITIAL_CONCEPT","FINAL_CONCEPT"]){const r=await watch({start:"2026-11-20",end:"2026-11-20",type});assert.ok(r.deadlines.length);assert.ok(r.deadlines.every(t=>t.type===type));}
  await as("digital");const sister=(await watch({start:"2026-11-20",end:"2026-11-20",type:"INITIAL_CONCEPT"})).deadlines.find(t=>t.id===fixture.sisterId)!;assert.ok(sister.isSister);assert.ok(!JSON.stringify(sister).includes(fixture.initialId));
  for(const who of ["spm","jpm","designer","digital"]){await as(who);const r=await watch({start:"2026-11-01",end:"2026-11-30"});assert.ok(!JSON.stringify(r).includes(fixture.privateTaskId));assert.ok(!JSON.stringify(r).includes("PRIVATE_TASK_SENTINEL"));await assert.rejects(getTask(fixture.privateTaskId));}
  await as("designer");const hiddenBefore=await watch();await as("director");await create("HIDDEN_ATTENTION_SENTINEL",dubaiDayStart(today),{executorId:"designer2"});await as("designer");const hiddenAfter=await watch();assert.deepEqual({...hiddenAfter,asOf:null},{...hiddenBefore,asOf:null});
  for(const who of ["designer","digital","spm","jpm"]){await as(who);await denied("source=workflows",403);await denied("source=policy",403);}
  await as("designer");assert.ok((await live("tasks")).attention.some(t=>t.id===fixture.ownedId));
  await as("director");
  const publication=(await live("workflows")).attention[0];assert.ok(publication);const approval=await getWorkflowApproval(publication.href.split("/").at(-1)!);
  await decideWorkflowPublication(approval.id,{expected:{...approval.expected,commandId:randomUUID()},configurationHash:approval.configurationHash,outcome:"REJECT",reason:"Synthetic stale decision check",confirmed:true});assert.ok(!(await live("workflows")).attention.some(t=>t.id===publication.id));
  // Configured SPM can review JPM evidence; contributing evidence disqualifies them.
  const spmProject=await db.runtimeProject.findFirstOrThrow({where:{title:"SPM stage decision"}}),spmStage=await db.runtimeStage.findFirstOrThrow({where:{projectId:spmProject.id}});
  const stageChange=async(action:string,extra={})=>runtimeStageCommand(spmProject.id,spmStage.id,{commandId:randomUUID(),expectedRevision:(await db.runtimeStage.findUniqueOrThrow({where:{id:spmStage.id}})).revision,action,...extra});
  await as("spm");assert.ok((await live("stages")).attention.some(t=>t.href.includes(spmProject.id)));await stageChange("FIELDS",{values:{note:"SPM contributed evidence"}});assert.ok(!(await live("stages")).attention.some(t=>t.href.includes(spmProject.id)));await stageChange("APPROVAL_SUBMITTED",{capabilityId:"approval"});assert.ok(!(await live("stages")).attention.some(t=>t.href.includes(spmProject.id)));
  await as("director");assert.ok(!(await live("stages")).attention.some(t=>t.href.includes(spmProject.id)));assert.ok((await live("stages")).attention.some(t=>t.href.includes(fixture.projectId)));
  const creation=(await live("creation")).attention[0];assert.ok(creation);const request=await db.runtimeCreationRequest.findUniqueOrThrow({where:{id:creation.id}});
  await as("jpm");assert.ok((await live("requests")).attention.some(t=>t.id===creation.id&&!t.actionable&&t.status==="Awaiting Director decision"));
  await as("director");await decideRuntimeCreation({commandId:randomUUID(),requestId:request.id,snapshotHash:request.snapshotHash,outcome:"REJECT",reason:"Synthetic decline",confirmed:true});assert.ok(!(await live("creation")).attention.some(t=>t.id===creation.id));await as("jpm");assert.equal((await live("requests")).attention.find(t=>t.id===creation.id)?.status,"Rejected");
  // Completion policy actions disappear after the real Director command.
  await as("director");const policy=(await live("policy")).attention[0];assert.ok(policy);const pid=policy.href.split("/")[3];const completion=await getRuntimeCompletion(pid);
  await runtimeCompletionCommand(pid,{commandId:randomUUID(),expectedRevision:completion.revision,expectedProjectRevision:completion.projectRevision,expectedPolicyRevision:completion.policyRevision,action:"POLICY_APPROVED",settings:{AUTHORITY_APPROVAL_PROOF:"NOT_APPLICABLE",COPYRIGHT_TRANSFER:"NOT_APPLICABLE",INVOICE:"NOT_APPLICABLE"},reason:"Synthetic policy",confirmed:true});assert.ok(!(await live("policy")).attention.some(t=>t.id===policy.id));
  // Genuine final completion remains separate from task acceptance and policy.
  const originalProject=await db.runtimeProject.findUniqueOrThrow({where:{id:fixture.projectId}});
  const finalId=(await createRuntimeProject({commandId:randomUUID(),publishedVersionId:originalProject.publishedVersionId,definitionHash:originalProject.definitionHash,title:"Attention final completion",description:"Synthetic only",ownerId:"spm",coOwnerIds:["jpm"],executorIds:["designer"]})).projectId;
  const finalStage=await db.runtimeStage.findFirstOrThrow({where:{projectId:finalId}});await as("spm");await runtimeStageCommand(finalId,finalStage.id,{commandId:randomUUID(),expectedRevision:finalStage.revision,action:"COMPLETED",reason:"Synthetic stage complete"});
  const finalCommand=async(action:string,extra={})=>{const d=await getRuntimeCompletion(finalId);return runtimeCompletionCommand(finalId,{commandId:randomUUID(),expectedRevision:d.revision,expectedProjectRevision:d.projectRevision,expectedPolicyRevision:d.policyRevision,action,reason:"Synthetic explicit decision",confirmed:true,...extra});};
  await as("director");await finalCommand("POLICY_APPROVED",{settings:{AUTHORITY_APPROVAL_PROOF:"NOT_APPLICABLE",COPYRIGHT_TRANSFER:"NOT_APPLICABLE",INVOICE:"NOT_APPLICABLE"}});await as("spm");await finalCommand("COMPLETION_REQUESTED");
  await as("director");assert.ok((await live("completion")).attention.some(t=>t.href.includes(finalId)));const pending=(await getRuntimeCompletion(finalId)).requests[0];await finalCommand("COMPLETION_DECIDED",{requestId:pending.id,requestHash:pending.hash,outcome:"REJECT"});assert.ok(!(await live("completion")).attention.some(t=>t.href.includes(finalId)));
  await as("spm");await finalCommand("COMPLETION_REQUESTED");await as("director");assert.ok((await live("completion")).attention.some(t=>t.href.includes(finalId)));
  // Keep the chosen source's existing Dashboard eligibility exactly aligned.
  for(const source of ["tasks","workflows","creation","stages","completion","policy"]){const a=await live(source),b=await getRoleDashboard({attention:source});assert.deepEqual(a.attention.map(t=>t.id),b.attention.items.map(t=>t.id));}
  await as("spm");for(let i=0;i<36;i++)await create(`Attention pagination ${String(i).padStart(2,"0")}`,dubaiDayStart(addCalendarDays(today,2)));
  await as("designer");const first=await watch(),second=await watch({after:first.next!});assert.equal(first.deadlines.length,30);assert.ok(first.next);assert.ok(second.deadlines.length);assert.ok(second.deadlines.every(t=>!first.deadlines.some(x=>x.id===t.id)));
  const a1=await live("execution"),a2=await getLiveAttention({source:"execution",page:"1"});assert.equal(a1.attention.length,12);assert.ok(a1.hasMore);assert.ok(a2.attention.every(t=>!a1.attention.some(x=>x.id===t.id)));
  const returnTo=attentionHref(second.query);assert.equal(getDashboardBackNavigation(`/tasks/${future.id}`,new URLSearchParams({returnTo})).owner,"topbar");assert.notEqual(getDashboardBackNavigation(`/tasks/${future.id}`,new URLSearchParams({returnTo:"//evil.test/notifications"})).owner,"topbar");
  const previousZone=process.env.TZ;for(const tz of ["UTC","America/Los_Angeles","Asia/Tokyo","Asia/Dubai"]){process.env.TZ=tz;const r=await watch();assert.deepEqual(r.deadlines,first.deadlines);}if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;
  await as("empty");assert.equal((await live("execution")).attention.length,0);assert.equal((await watch()).deadlines.length,0);
  await as("tech");await denied("",403);setToken(null);await denied("",403);
  const version=(await db.userAuthorization.findUniqueOrThrow({where:{userId:"empty"}})).authorizationVersion;
  for(const kind of ["expired","stale","revoked"]){const s=await db.session.create({data:{userId:"empty",token:createVersionedSessionToken(kind==="stale"?version+1:version),expiresAt:new Date(kind==="expired"?0:Date.now()+3600_000)}});if(kind==="revoked")await db.session.delete({where:{id:s.id}});setToken(s.token);await denied("",403);if(kind!=="revoked")await db.session.delete({where:{id:s.id}});}
  const directorToken=(await db.session.findFirstOrThrow({where:{userId:"director"}})).token, assignment=createRoleAssignmentService({database:db,readSessionToken:async()=>directorToken});
  await assignment.setAuthorizationStatus({userId:"empty",expectedVersion:version,reason:"Synthetic suspension",accountStatus:"SUSPENDED"},"business");await as("empty");await denied("",403);
  await assignment.setAuthorizationStatus({userId:"empty",expectedVersion:version+1,reason:"Synthetic reactivation",accountStatus:"ACTIVE"},"business");await denied("",403);await db.session.deleteMany({where:{userId:"empty"}});await db.session.create({data:{userId:"empty",token:createVersionedSessionToken(version+2),expiresAt:new Date(Date.now()+3600_000)}});
  await as("designer");for(const q of ["actorId=director","source=all","page=-1","page=1e2","page=1001","watch=urgent","view=messages","view=deadlines&watch=all&start=2026-02-30","view=deadlines&watch=all&start=2026-01-01&end=2027-01-01","view=deadlines&watch=all&start=2026-11-02&end=2026-11-01","after=x","view=deadlines&after=x","status=ACCEPTED","type=UNKNOWN","relationship=director","view=attention&view=deadlines"]){await denied(q,400);}
  for(const raw of [null,[],{page:1},{start:[today]}])assert.throws(()=>parseAttentionQuery(raw));
  for(const dashboard of ['0','1'])for(const search of ['0','1'])for(const calendar of ['0','1'])for(const notifications of ['0','1']){
    Object.assign(process.env,{FLUX_DASHBOARD_V2:dashboard,FLUX_SEARCH_V2:search,FLUX_CALENDAR_V2:calendar,FLUX_NOTIFICATIONS_V2:notifications});const visibility=getSidebarVisibility((await getCurrentUser())!);assert.equal(visibility.notifications,true);assert.equal(visibility.calendar,true);assert.equal(visibility.search,search==='1');assert.equal(visibility.dashboard,dashboard==='1');
    assert.equal((await api()).status,notifications==='1'?200:404);assert.equal((await dashboardApi(new Request('http://local/api/dashboard'))).status,dashboard==='1'?200:404);assert.equal((await searchApi(new Request('http://local/api/search?q=Attention'))).status,search==='1'?200:404);assert.equal((await calendarApi(new Request('http://local/api/calendar'))).status,calendar==='1'?200:404);
  }
  process.env.FLUX_UNIVERSAL_TASKER='0';const disabled=await watch();assert.equal(disabled.taskerEnabled,false);assert.equal(disabled.deadlines.length,0);assert.equal((await live("execution")).attention.length,0);process.env.FLUX_UNIVERSAL_TASKER='1';
  const counts=async()=>({notifications:await db.notification.count(),receipts:await db.eventConsumerReceipt.count(),outbox:await db.eventOutbox.count(),events:await db.businessEvent.count(),decisions:await db.approvalDecision.count(),entries:await db.universalTaskEntry.count(),activity:await db.runtimeActivity.count()});
  const before=await counts(),reads=storageReads();process.env.FLUX_NOTIFICATIONS_CAPTURE='1';queries.length=0;
  for(const who of ["director","spm","jpm","designer","digital"]){await as(who);const r=await api();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const body=await r.text();for(const secret of ['PRIVATE_ATTENTION_BRIEF','HIDDEN_ATTENTION_SENTINEL','PRIVATE_TASK_SENTINEL','readAt','unreadCount','deliveredAt','storageKey','rootTaskId','sourceTaskId'])assert.ok(!body.includes(secret));await watch();}
  assert.ok(!queries.some(q=>/FROM "public"\."(Notification|BusinessEvent|EventOutbox|EventConsumerReceipt)"/.test(q.query)));assert.deepEqual(await counts(),before);assert.equal(storageReads(),reads);assert.equal(external(),0);
  const selected=queries.filter(q=>q.query.includes('FROM "public"."UniversalTask" AS "t0"'));assert.ok(selected.length);const plans=[];
  for(const q of [selected[0],selected[1]]){const params=JSON.parse(q.params) as unknown[];let sql=q.query;params.forEach((v,i)=>{if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2} .* UTC$/.test(v))sql=sql.replace(new RegExp('\\$'+(i+1)+'(?!\\d)','g'),'$'+(i+1)+'::timestamp');});plans.push({query:q.query,replay:sql,parameters:params,plan:await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,...params)});}
  process.env.FLUX_NOTIFICATIONS_CAPTURE='0';writeFileSync(join(artifact,'query-plans.json'),JSON.stringify(plans,null,2));
  const transaction=db.$transaction;db.$transaction=()=>{throw new Error('PRIVATE_SQL_SENTINEL');};try{assert.ok(!(await(await denied('',500)).text()).includes('PRIVATE_SQL_SENTINEL'));}finally{db.$transaction=transaction;}
  writeFileSync(join(root,'browser-fixture.json'),JSON.stringify({...fixture,attention:{today,yesterday,end,reviewId:browserReview.id,finalId,pastId:past.id,midnightId:midnight.id,futureId:future.id,completedId:completed.id}}));
  writeFileSync(join(artifact,'service-result.json'),JSON.stringify({status:'PASS',assertions,expectedDenials,expectedFailures,queryPlans:plans.length,externalRequests:external(),storageReads:storageReads()-reads,deliveryAndBusinessCountsUnchanged:before,flagCombinations:16},null,2));
  console.log(`PASS attention: ${assertions} assertions; ${expectedDenials} expected denials, ${expectedFailures} injected failure; all 16 flag combinations; no delivery/receipt writes, storage or external requests.`);
}

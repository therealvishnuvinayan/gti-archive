import nodeAssert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "../src/lib/auth";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, getCalendarAccessState } from "../src/lib/calendar";
import { getNotificationsForUser, getRecentNotificationsForUser } from "../src/lib/notification-center/service";
import { GET as messagesApi } from "../src/app/api/notifications/route";
import { POST as markRead } from "../src/app/api/notifications/[notificationId]/read/route";
import { POST as markUnread } from "../src/app/api/notifications/[notificationId]/unread/route";
import { POST as markAllRead } from "../src/app/api/notifications/read-all/route";
import { getTaskCalendar } from "../src/lib/calendar-v2/service";
import { getLiveAttention } from "../src/lib/notifications-v2/service";
import { getDashboardSnapshot } from "../src/lib/dashboard";
import { getEligibleProjectOwnerCandidates } from "../src/lib/project-owner-candidates";
import { deleteProject } from "../src/lib/project-management";
import { createVersionedSessionToken } from "../src/lib/authorization/session";

type Fixture = { db: PrismaClient; as: (id: string) => Promise<void>; setToken: (value: string | null) => void; root: string; storageReads: () => number; external: () => number };
export async function runCompatibilityAcceptance({db,as,setToken,root,storageReads,external}:Fixture) {
 let assertions=0,denials=0;
 const initialReads=storageReads();
 const assert: typeof nodeAssert=new Proxy(nodeAssert,{get(target,property){const v=Reflect.get(target,property);return typeof v==='function'&&property!=='AssertionError'?(...args:unknown[])=>{assertions++;return Reflect.apply(v,target,args);}:v;}});
 const reject=async(fn:()=>Promise<unknown>)=>{await assert.rejects(fn);denials++;};
 const actor=async(id:string)=>{await as(id);return (await getCurrentUser())!;};
 const list=()=>messagesApi(new Request('http://local/api/notifications'));
 const toggle=(id:string,read:boolean)=>(read?markRead:markUnread)(new Request('http://local'),{params:Promise.resolve({notificationId:id})});
 const roles=['director','spm','jpm','designer','digital'];
 const date='2026-11-20', manual:Record<string,string>={};
 const eventInput=(title:string,calendar:'Events'|'Reminders'|'Projects'|'Payments'='Events')=>({title,details:'Private manual details',date,start:'09:00',end:'10:00',calendar,tone:'green' as const});
 await actor('director');const taskBefore=await db.universalTask.count();
 // No native records yet: both legacy services have real empty results.
 assert.equal(await db.notification.count(),0);
 for(const id of roles){const user=await actor(id);assert.equal((await getCalendarEvents(user)).length,id==='designer'?1:0);assert.equal((await getNotificationsForUser({userId:id})).total,0);assert.equal((await getCalendarAccessState(user)).canManageCollaborators,false);}
 for(const enabled of ['0','1']) {
  process.env.FLUX_CALENDAR_V2=enabled;process.env.FLUX_NOTIFICATIONS_V2=enabled;
  for(const id of roles){
   const user=await actor(id);
   for(const calendar of ['Events','Reminders'] as const){const result=await createCalendarEvent(user,eventInput(`Manual ${id} ${calendar} ${enabled}`,calendar));assert.ok('event' in result);if('event' in result){assert.equal(result.event.date,date);assert.equal(result.event.start,'09:00');assert.equal(result.event.end,'10:00');assert.ok(result.event.canDelete);manual[id]=result.event.id;}}
   if(id!=='director')for(const calendar of ['Projects','Payments'] as const)await reject(()=>createCalendarEvent(user,eventInput('FORBIDDEN FINANCIAL',calendar)));
  }
  const director=await actor('director');
  for(const calendar of ['Projects','Payments'] as const){const result=await createCalendarEvent(director,eventInput(`Director ${calendar} ${enabled}`,calendar));assert.ok('event' in result);}
  for(const id of roles){const user=await actor(id),events=await getCalendarEvents(user);assert.ok(events.some(e=>e.id===manual[id]));assert.ok(!events.some(e=>e.id===manual[id==='spm'?'designer':'spm']));assert.equal(events.some(e=>e.calendar==='Payments'),id==='director');assert.ok(!JSON.stringify(events).includes('FORBIDDEN FINANCIAL'));}
  const spm=await actor('spm');await reject(()=>deleteCalendarEvent(spm,manual.designer));await reject(()=>deleteCalendarEvent(spm,'missing'));
  await actor('director');await reject(()=>deleteCalendarEvent(director,manual.spm));
  const temporaryPayment=await createCalendarEvent(director,eventInput('Payment deletion fixture','Payments'));assert.ok('event' in temporaryPayment);if(!('event' in temporaryPayment))throw new Error('Missing fixture');const payment=temporaryPayment.event;await reject(()=>deleteCalendarEvent(spm,payment.id));await actor('director');assert.deepEqual(await deleteCalendarEvent(director,payment.id),{success:true,deletedEventId:payment.id});
  const designer=await actor('designer');const own=await createCalendarEvent(designer,eventInput('Delete only own event'));assert.ok('event' in own);if('event' in own)assert.deepEqual(await deleteCalendarEvent(designer,own.event.id),{success:true,deletedEventId:own.event.id});
 }
 assert.equal(await db.universalTask.count(),taskBefore);
 await actor('director');process.env.FLUX_CALENDAR_V2='1';const calendar=JSON.stringify(await getTaskCalendar({view:'agenda',date}));assert.ok(!calendar.includes('Manual '));assert.ok(!calendar.includes('Director Payments'));
 // Persist rows only in the disposable database, without invoking a producer.
 for(const userId of roles)await db.notification.create({data:{id:`recorded-${userId}`,userId,projectId:'native',type:'MENTION',title:`Recorded ${userId} message`,message:`Private recipient ${userId} body`,url:'/projects/native'}});
 await db.notification.createMany({data:[
  {id:'private-recipient',userId:'spm2',projectId:'private',type:'MENTION',title:'PRIVATE_RECIPIENT_SENTINEL',message:'Private other recipient'},
  {id:'private-resource',userId:'spm',projectId:'private',type:'MENTION',title:'PRIVATE_MESSAGE_RESOURCE_SENTINEL',message:'No current project access'},
  {id:'unlinked',userId:'spm',type:'MENTION',title:'UNLINKED_MESSAGE_SENTINEL',message:'No resource provenance'},
 ]});
 for(const enabled of ['0','1']) {
  process.env.FLUX_NOTIFICATIONS_V2=enabled;
  for(const id of roles){
   await actor(id);const r=await list();assert.equal(r.status,200);const data=await r.json();assert.equal(data.total,['director','spm','jpm'].includes(id)?1:0);assert.ok(!JSON.stringify(data).includes('PRIVATE_'));assert.ok(!JSON.stringify(data).includes('UNLINKED_'));
   assert.equal((await toggle('private-recipient',true)).status,404);denials++;
  }
  await actor('spm');assert.equal((await toggle('recorded-spm',true)).status,200);let row=await db.notification.findUniqueOrThrow({where:{id:'recorded-spm'}});assert.equal(row.isRead,true);assert.ok(row.readAt);assert.equal((await getRecentNotificationsForUser('spm')).unreadCount,0);
  assert.equal((await toggle('recorded-spm',false)).status,200);row=await db.notification.findUniqueOrThrow({where:{id:'recorded-spm'}});assert.equal(row.isRead,false);assert.equal(row.readAt,null);assert.equal((await getRecentNotificationsForUser('spm')).unreadCount,1);
  const before=await db.notification.findUniqueOrThrow({where:{id:'recorded-jpm'}});assert.equal((await markAllRead()).status,200);assert.equal((await db.notification.findUniqueOrThrow({where:{id:'recorded-spm'}})).isRead,true);assert.deepEqual(await db.notification.findUniqueOrThrow({where:{id:'recorded-jpm'}}),before);await toggle('recorded-spm',false);
 }
 // New reads never manufacture recorded messages or delivery receipts.
 process.env.FLUX_NOTIFICATIONS_V2='1';const counts=async()=>[await db.notification.count(),await db.eventConsumerReceipt.count(),await db.businessEvent.count(),await db.eventOutbox.count()];const before=await counts();const rows=await db.notification.findMany({orderBy:{id:'asc'}});
 for(const id of roles){await actor(id);await getLiveAttention();await getLiveAttention({view:'deadlines'});await getTaskCalendar({date});}
 assert.deepEqual(await counts(),before);assert.deepEqual(await db.notification.findMany({orderBy:{id:'asc'}}),rows);
 // Genuine current-role candidates replace the historical ADMIN-only assertion.
 for(const id of ['director','spm','jpm']){await actor(id);const candidates=await getEligibleProjectOwnerCandidates();assert.deepEqual(candidates.map(c=>c.id).sort(),['jpm','spm','spm2']);}
 for(const id of ['designer','digital','tech']){await actor(id);await reject(getEligibleProjectOwnerCandidates);}
 for(const id of ['director','spm','jpm','designer','digital','tech']){const user=await actor(id);for(const projectId of ['native','private','missing'])await reject(()=>deleteProject(user,projectId));}
 // Legacy dashboard still returns authorized private projects after copy changes.
 process.env.FLUX_DASHBOARD_V2='0';const spm=await actor('spm');const snapshot=await getDashboardSnapshot(spm);assert.ok(snapshot.flexibleProjects.some(p=>p.id==='flexible'));assert.ok(snapshot.canViewFlexibleProjects);assert.equal(snapshot.flexibleProjectCount,1);
 // All native reads/actions reauthenticate; caller IDs cannot impersonate.
 const tech=await actor('tech');await reject(()=>getCalendarEvents(tech));await reject(()=>createCalendarEvent(tech,eventInput('TECH_DENIED')));assert.equal((await list()).status,403);assert.equal((await toggle('recorded-spm',true)).status,403);
 const user=await actor('spm');await reject(()=>getNotificationsForUser({userId:'director'}));
 for(const invalid of ['anonymous','expired','revoked','wrong-version']) {
  if(invalid==='anonymous')setToken(null);
  else {const token=createVersionedSessionToken(invalid==='wrong-version'?999:1);const session=await db.session.create({data:{userId:'spm',token,expiresAt:new Date(invalid==='expired'?0:Date.now()+60000)}});if(invalid==='revoked')await db.session.delete({where:{id:session.id}});setToken(token);}
  await reject(()=>getCalendarEvents(user));await reject(()=>createCalendarEvent(user,eventInput('SESSION_DENIED')));assert.equal((await list()).status,401);assert.equal((await toggle('recorded-spm',true)).status,401);denials+=2;
 }
 assert.equal(await db.calendarEvent.count({where:{title:{in:['TECH_DENIED','SESSION_DENIED','FORBIDDEN FINANCIAL']}}}),0);
 assert.equal(external(),0);assert.equal(storageReads(),initialReads);
 Object.assign(process.env,{FLUX_DASHBOARD_V2:'1',FLUX_SEARCH_V2:'1',FLUX_CALENDAR_V2:'1',FLUX_NOTIFICATIONS_V2:'1'});
 const fixture=JSON.parse(readFileSync(join(root,'browser-fixture.json'),'utf8'));
 writeFileSync(join(root,'browser-fixture.json'),JSON.stringify({...fixture,compatibility:{date,manual,messageId:'recorded-spm'}}),{mode:0o600});
 writeFileSync(join(process.env.FLUX_COMPATIBILITY_ARTIFACTS!,'compatibility-result.json'),JSON.stringify({status:'PASS',assertions,denials,storedManualEvents:await db.calendarEvent.count(),storedNotifications:await db.notification.count(),liveReadCountsBefore:before,liveReadCountsAfter:await counts(),externalRequests:external()},null,2));
 console.log(`PASS Phase 7.5 compatibility: ${assertions} assertions, ${denials} denials; persisted manual events, recorded messages, sessions, role candidates, deletion and legacy dashboard.`);
}

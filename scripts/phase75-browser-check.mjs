// Extra persisted legacy and combined-shell acceptance, using the same isolated browser.
import assert from 'node:assert/strict';
export async function checkLegacyCompatibility({pageFor,shot,json,pass,start,stop,origin,fixture}) {
 const spm=await pageFor('spm'),designer=await pageFor('designer'),director=await pageFor('director'),tech=await pageFor('tech');
 const f=fixture.compatibility;
 for(const enabled of ['0','1']) {
  await stop();await start(enabled,enabled,enabled,enabled);
  for(const [id,page] of [['spm',spm],['designer',designer],['director',director]]) {
   // Existing event URLs survive activation and focus the same authorized record.
   await page.goto(origin+`/calendar?view=day&date=${f.date}&event=${f.manual[id]}`);
   await page.locator('[data-manual-calendar]').waitFor();assert.equal(new URL(page.url()).pathname,enabled==='1'?'/calendar/manual':'/calendar');
   await page.getByRole('heading',{name:enabled==='1'?'Manual Events':'Calendar',exact:true}).waitFor();
   assert.ok((await page.locator('body').innerText()).includes(`Manual ${id} Reminders 1`));
   assert.ok(!(await page.locator('body').innerText()).includes(`Manual ${id==='spm'?'designer':'spm'} Reminders`));
   assert.equal((await page.locator('body').innerText()).includes('Director Payments'),id==='director');
   await shot(page,`legacy-${id}-calendar-${enabled}`);
  }
  await designer.goto(origin+`/calendar${enabled==='1'?'/manual':''}?view=day&date=${f.date}`);
  const title=`Browser manual event ${enabled}`;
  await designer.getByRole('button',{name:'Create',exact:true}).click();await designer.getByPlaceholder('Design review',{exact:true}).fill(title);
  await designer.getByRole('button',{name:'Save Event',exact:true}).click();await designer.getByPlaceholder('Design review',{exact:true}).waitFor({state:'detached'});
  await designer.reload();await designer.getByText(title,{exact:false}).first().waitFor();await shot(designer,`manual-created-${enabled}`);
  await designer.getByRole('button',{name:`Delete ${title}`,exact:true}).first().click();await designer.getByRole('button',{name:'Delete Event',exact:true}).click();
  await designer.getByRole('dialog',{name:'Delete event?',exact:true}).waitFor({state:'detached'});await designer.reload();assert.equal(await designer.getByText(title,{exact:false}).count(),0);
  // The provider runs globally in the old mode, and only on Recorded Messages in live mode.
  const recent=[];const capture=request=>{if(new URL(request.url()).pathname==='/api/notifications/recent')recent.push(request.url());};spm.on('request',capture);
  await spm.goto(origin+'/tasks');await spm.waitForTimeout(1100);assert.equal(recent.length>0,enabled==='0');spm.off('request',capture);
  const taskTime=spm.locator('main a[href^="/tasks/"] time').first();await taskTime.waitFor();
  assert.equal(await taskTime.innerText(),await taskTime.evaluate(e=>new Date(e.dateTime).toLocaleString()));await shot(spm,`local-task-dates-${enabled}`);
  await spm.goto(origin+'/notifications'+(enabled==='1'?'?view=messages':''));await spm.getByText('Recorded spm message',{exact:true}).waitFor();
  const row=spm.locator('article').filter({hasText:'Recorded spm message'});await row.getByRole('button',{name:'Mark as read',exact:true}).click();await row.getByRole('button',{name:'Mark as unread',exact:true}).waitFor();
  assert.equal((await json(spm,'/api/notifications')).body.notifications.find(n=>n.id===f.messageId).read,true);
  await spm.reload();await row.getByRole('button',{name:'Mark as unread',exact:true}).click();await row.getByRole('button',{name:'Mark as read',exact:true}).waitFor();
  assert.equal((await json(spm,'/api/notifications')).body.notifications.find(n=>n.id===f.messageId).read,false);assert.ok(!(await spm.locator('body').innerText()).includes('PRIVATE_MESSAGE'));
  await shot(spm,`recorded-persisted-${enabled}`);
  await spm.setViewportSize({width:390,height:844});await row.scrollIntoViewIfNeeded();
  assert.ok(await row.getByText('Recorded spm message',{exact:true}).evaluate(e=>e.scrollWidth<=e.clientWidth));
  for(const name of ['Mark as read','View']){const control=await row.getByRole('button',{name,exact:true}).boundingBox();assert.ok(control&&control.x>=0&&control.x+control.width<=390);}
  await row.getByRole('button',{name:'Mark as read',exact:true}).click();await row.getByRole('button',{name:'Mark as unread',exact:true}).waitFor();
  assert.equal((await json(spm,'/api/notifications')).body.notifications.find(n=>n.id===f.messageId).read,true);
  await row.getByRole('button',{name:'Mark as unread',exact:true}).click();await row.getByRole('button',{name:'Mark as read',exact:true}).waitFor();
  await row.scrollIntoViewIfNeeded();await shot(spm,`mobile-recorded-${enabled}`);assert.ok(await spm.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await spm.setViewportSize({width:1536,height:1100});
  await designer.setViewportSize({width:390,height:844});await designer.goto(origin+`/calendar${enabled==='1'?'/manual':''}?view=day&date=${f.date}`);await designer.locator('[data-manual-calendar]').waitFor();await shot(designer,`mobile-manual-${enabled}`);assert.ok(await designer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await designer.setViewportSize({width:1536,height:1100});
  for(const path of ['/calendar','/calendar/manual','/notifications','/notifications?view=messages']){await tech.goto(origin+path);await tech.waitForURL(u=>u.pathname==='/settings');}await shot(tech,`legacy-denial-${enabled}`);
  const empty=await pageFor('empty');await empty.goto(origin+`/calendar${enabled==='1'?'/manual':''}?date=${f.date}`);
  await empty.getByText('No upcoming schedules yet.',{exact:true}).waitFor();await shot(empty,`empty-manual-${enabled}`);
  await empty.goto(origin+'/notifications'+(enabled==='1'?'?view=messages':''));await empty.getByText('No notifications found.',{exact:true}).waitFor();await shot(empty,`empty-recorded-${enabled}`);
 }
 pass('Flag OFF/ON: persisted manual event create/reload/delete and old event links, per-user history/read-unread, provider activation, financial/private isolation, usable mobile read controls and technical denial');
 // Now all four enabled: verify the shell links and actual round trips together.
 await designer.goto(origin+'/');await designer.getByRole('link',{name:'Search',exact:true}).click();await designer.locator('[data-search-v2]').waitFor();
 await designer.getByLabel('Project name, identifier or task title',{exact:true}).fill('Prepare design brief');await designer.getByRole('button',{name:'Search',exact:true}).click();
 await designer.locator(`main a[href^="/tasks/${fixture.taskId}?"]`).click();await designer.getByRole('link',{name:'Back to Search',exact:true}).click();await designer.locator('[data-search-v2]').waitFor();await shot(designer,'combined-search-return');
 await designer.getByRole('link',{name:'Calendar',exact:true}).click();await designer.locator('[data-calendar-v2]').waitFor();await designer.goto(origin+`/calendar?view=agenda&span=day&date=${f.date}`);
 const task=designer.locator('main a[href^="/tasks/"]').first();await task.click();await designer.getByRole('link',{name:'Back to Calendar',exact:true}).click();await designer.locator('[data-calendar-v2]').waitFor();await shot(designer,'combined-calendar-return');
 await designer.getByRole('link',{name:'Manual Events',exact:true}).click();await designer.getByRole('link',{name:'Task Calendar',exact:true}).click();await designer.locator('[data-calendar-v2]').waitFor();
 await designer.getByRole('link',{name:'Notifications',exact:true}).click();await designer.locator('[data-live-attention]').waitFor();await designer.getByRole('link',{name:'Recorded messages',exact:true}).click();await designer.getByRole('link',{name:'Back to live attention',exact:true}).click();await designer.locator('[data-live-attention]').waitFor();
 await designer.getByRole('link',{name:'Dashboard',exact:true}).click();await designer.waitForURL(u=>u.pathname==='/');await shot(designer,'combined-dashboard');
 pass('All four enabled share the shell, authorized Search/Calendar task return links and explicit Manual Events/Recorded Messages navigation');
}

import assert from 'node:assert/strict';
export async function confirmBrowserGrant(page, recipient='Fixture designer2') {
 const dialog=page.getByRole('dialog',{name:'Manage archive access'});await dialog.waitFor();
 await dialog.getByLabel('Find recipient').fill(recipient);await dialog.getByRole('button',{name:'Search',exact:true}).click();
 const row=dialog.getByRole('region',{name:'Eligible recipients'}).locator('div.flex').filter({hasText:recipient}).first();
 await row.getByRole('button',{name:'Select recipient',exact:true}).click();
 assert.equal(await dialog.getByRole('button',{name:'Confirm grant',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Access expires',{exact:true}).selectOption('7');await dialog.getByRole('checkbox').check();
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/archives/access')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Confirm grant',exact:true}).click();assert.equal((await saved).status(),200);await dialog.getByText('Access granted.',{exact:true}).waitFor();
 return dialog;
}
export async function archiveSharingAcceptance({pageFor,db,origin,shot,pass,objects,foldersEnabled}) {
 const object={body:Buffer.from('%PDF-1.4'),type:'application/pdf',etag:'"share-fixture-etag"',version:'share-object-v1'};
 objects.set('/fixture-bucket/fixture/share.pdf',object);
 for(const id of ['shared-file','unshared-file'])await db.manualArchiveFile.create({data:{id,archiveCategoryId:'artwork',fileName:`${id}.pdf`,originalFileName:`${id}.pdf`,mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:id==='shared-file'?'fixture/share.pdf':'fixture/unshared.pdf',status:'READY',uploadedById:'director'}});
 await db.sharedFile.create({data:{id:'share-identity'}});
 await db.sharedFileVersion.create({data:{id:'share-version',fileId:'share-identity',number:1,uploadedById:'director',originalFileName:'shared-file.pdf',mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:'fixture/share.pdf'}});
 await db.sharedFileReference.create({data:{id:'share-reference',versionId:'share-version',role:'SOURCE',manualArchiveFileId:'shared-file'}});
 await db.sharedFileVersion.update({where:{id:'share-version'},data:{status:'READY',objectETag:object.etag,objectVersionId:object.version,observedAt:new Date(),finalizedAt:new Date()}});
 const before=JSON.stringify(await Promise.all([db.sharedFileVersion.findUnique({where:{id:'share-version'}}),db.sharedFileReference.findUnique({where:{id:'share-reference'}})]));
 const director=await pageFor('director');await director.setViewportSize({width:1440,height:1100});await director.goto(origin+'/archives/fixture-artwork'+(foldersEnabled?'':'?view=all'));
 const card=director.locator(foldersEnabled?'article':'[data-archive-record]').filter({has:director.getByText('shared-file.pdf',{exact:true})});
 // Both workspaces expose a file-local action; use the closest containing card.
 const button=director.getByText('shared-file.pdf',{exact:true}).first().locator('xpath=ancestor::*[.//button[text()="Manage access"]][1]').getByRole('button',{name:'Manage access',exact:true});
 void card;await button.click();let dialog=await confirmBrowserGrant(director);
 let grants=await db.userArchiveAssetAccess.findMany({where:{manualArchiveFileId:'shared-file'},include:{archiveScope:{include:{decision:true}}}});
 assert.equal(grants.length,1);assert.equal(grants[0].grantedById,'director');assert.equal(grants[0].archiveScope.decision.versionId,'share-version');assert.ok(grants[0].archiveScope.decision.expiresAt);
 await shot(director,'sharing-confirmed-version-grant');await dialog.getByRole('button',{name:'Close',exact:true}).click();
 const designer=await pageFor('designer2');await designer.goto(origin+'/archives/fixture-artwork?view=all');await designer.getByText('shared-file.pdf',{exact:true}).first().waitFor();
 assert.equal(await designer.getByText('unshared-file.pdf',{exact:true}).count(),0);assert.equal(await designer.getByRole('button',{name:'Manage access',exact:true}).count(),0);
 const download=await designer.evaluate(async()=>{const r=await fetch('/api/archives/files/shared-file/download');return {status:r.status,url:r.url,body:await r.text()};});assert.equal(download.status,200);assert.ok(download.url.includes('/api/file-versions/share-version/'));assert.equal(download.body,'%PDF-1.4');
 const preview=await designer.evaluate(async()=>{const r=await fetch('/api/archives/files/shared-file/preview');return {status:r.status,url:r.url,body:await r.text()};});assert.equal(preview.status,200);assert.ok(preview.url.includes('disposition=inline'));assert.equal(preview.body,'%PDF-1.4');
 assert.ok([403,404].includes(await designer.evaluate(async()=> (await fetch('/api/archives/files/unshared-file/download')).status)));
 assert.equal(await designer.evaluate(async()=> (await fetch('/api/archives/access?fileId=shared-file')).status),403);
 await shot(designer,'sharing-designer-exact-file');pass(`Persisted Director grant via ${foldersEnabled?'folder':'legacy'} UI, bounded expiry, genuine Designer login and conditional exact-version download; ungranted file and recipient list denied.`);
 await director.goto(origin+'/archives/fixture-artwork?view=all');await director.getByText('shared-file.pdf',{exact:true}).first().locator('xpath=ancestor::*[.//button[text()="Manage access"]][1]').getByRole('button',{name:'Manage access',exact:true}).click();
 dialog=director.getByRole('dialog',{name:'Manage archive access'});await dialog.getByRole('button',{name:'Revoke access',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Confirm revocation',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Revocation reason',{exact:true}).fill('Delivery complete; remove this recipient.');await dialog.getByRole('checkbox').check();
 const revoked=director.waitForResponse(r=>r.url().endsWith('/api/archives/access')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Confirm revocation',exact:true}).click();assert.equal((await revoked).status(),200);await dialog.getByText('No individual grants.',{exact:true}).waitFor();
 assert.equal(await db.userArchiveAssetAccess.count({where:{manualArchiveFileId:'shared-file'}}),0);const history=await db.archiveAccessDecision.findMany({where:{sourceId:'shared-file'},orderBy:{sequence:'asc'}});assert.deepEqual(history.map(d=>d.action),['GRANT','REVOKE']);assert.equal(history[1].previousId,history[0].id);assert.equal(history[1].reason,'Delivery complete; remove this recipient.');assert.equal(await db.eventOutbox.count({where:{eventId:{in:history.map(d=>d.eventId)}}}),2);
 await dialog.locator('summary').click();await dialog.getByText('Delivery complete; remove this recipient.',{exact:true}).waitFor();await shot(director,'sharing-revoked-audit');
 assert.ok([403,404].includes(await designer.evaluate(async()=> (await fetch('/api/archives/files/shared-file/download')).status)));
 assert.ok([403,404].includes(await designer.evaluate(async()=> (await fetch('/api/archives/files/shared-file/preview')).status)));
 assert.equal(await designer.evaluate(async()=> (await fetch('/api/file-versions/share-version/download?kind=manual-archive-file&id=shared-file')).status),403);
 await designer.reload();assert.equal(await designer.getByText('shared-file.pdf',{exact:true}).count(),0);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await director.setViewportSize({width:390,height:844});await director.getByText('shared-file.pdf',{exact:true}).first().locator('xpath=ancestor::*[.//button[text()="Manage access"]][1]').getByRole('button',{name:'Manage access',exact:true}).focus();await director.keyboard.press('Enter');await dialog.waitFor();await shot(director,'sharing-mobile-keyboard');await director.keyboard.press('Escape');
 assert.equal(JSON.stringify(await Promise.all([db.sharedFileVersion.findUnique({where:{id:'share-version'}}),db.sharedFileReference.findUnique({where:{id:'share-reference'}})])),before);
 pass('Confirmed reasoned revocation persists native deletion and immutable audit/outbox; subsequent native and version downloads denied, file identity unchanged, mobile keyboard dialog works.');
}

import assert from 'node:assert/strict';
export async function archiveVerificationAcceptance({pageFor,db,origin,shot,pass,objects,foldersEnabled}) {
 const object={body:Buffer.from('%PDF-1.4'),type:'application/pdf',etag:'"review-fixture-etag"',version:'review-object-v1'};
 objects.set('/fixture-bucket/fixture/review.pdf',object);
 await db.manualArchiveFile.create({data:{id:'review-file',archiveCategoryId:'artwork',fileName:'review-exact.pdf',originalFileName:'review-exact.pdf',mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:'fixture/review.pdf',status:'READY',uploadedById:'director'}});
 await db.sharedFile.create({data:{id:'review-identity'}});
 await db.sharedFileVersion.create({data:{id:'review-version',fileId:'review-identity',number:1,uploadedById:'director',originalFileName:'review-exact.pdf',mimeType:'application/pdf',fileSize:8,bucket:'fixture-bucket',storageKey:'fixture/review.pdf'}});
 await db.sharedFileReference.create({data:{id:'review-reference',versionId:'review-version',role:'SOURCE',manualArchiveFileId:'review-file'}});
 await db.sharedFileVersion.update({where:{id:'review-version'},data:{status:'READY',objectETag:object.etag,objectVersionId:object.version,observedAt:new Date(),finalizedAt:new Date()}});
 for(const userId of ['digital','designer'])await db.userArchiveAssetAccess.create({data:{userId,manualArchiveFileId:'review-file',grantedById:'director'}});
 const snapshot=JSON.stringify(await Promise.all([db.sharedFileVersion.findUnique({where:{id:'review-version'}}),db.sharedFileReference.findUnique({where:{id:'review-reference'}}),db.userArchiveAssetAccess.findMany({where:{manualArchiveFileId:'review-file'},orderBy:{userId:'asc'}})]));
 const page=await pageFor('director');await page.goto(origin+'/archives/fixture-artwork');
 const panel=page.locator('[data-verification-for="review-file"]');await panel.scrollIntoViewIfNeeded();await panel.getByText('Not verified',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Verify',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Verify exact file version'});await dialog.waitFor();
 assert.ok((await dialog.innerText()).includes('review-version'));assert.equal(await dialog.getByRole('button',{name:'Confirm verification',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Verification note',{exact:true}).fill('Director reviewed the exact browser fixture.');
 assert.equal(await db.archiveVerificationDecision.count({where:{sourceId:'review-file'}}),0);
 await dialog.getByRole('checkbox').check();const saved=page.waitForResponse(r=>r.url().endsWith('/api/archives/verification')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Confirm verification',exact:true}).click();assert.equal((await saved).status(),200);
 await panel.getByText(/^Verified by Fixture director/).first().waitFor();
 let rows=await db.archiveVerificationDecision.findMany({where:{sourceId:'review-file'},orderBy:{sequence:'asc'}});assert.equal(rows.length,1);assert.equal(rows[0].actorId,'director');assert.equal(rows[0].versionId,'review-version');assert.equal(rows[0].reason,'Director reviewed the exact browser fixture.');
 await page.reload();await panel.scrollIntoViewIfNeeded();await panel.getByText(/^Verified by Fixture director/).first().waitFor();await shot(page,'verification-saved-exact-version');
 pass(`Persisted Director verification through ${foldersEnabled?'folder':'legacy'} view: explicit note/confirmation, exact version, truthful actor, server refresh.`);
 await page.goto(origin+'/archives/fixture-artwork?view=all');await panel.scrollIntoViewIfNeeded();await panel.getByRole('button',{name:'Revoke verification',exact:true}).click();
 const revoke=page.getByRole('dialog',{name:'Revoke exact file verification'});await revoke.getByLabel('Revocation reason',{exact:true}).fill('Director withdrew this review after a second inspection.');
 assert.equal(await db.archiveVerificationDecision.count({where:{sourceId:'review-file'}}),1);await revoke.getByRole('checkbox').check();
 const revoked=page.waitForResponse(r=>r.url().endsWith('/api/archives/verification')&&r.request().method()==='POST');await revoke.getByRole('button',{name:'Confirm revocation',exact:true}).click();assert.equal((await revoked).status(),200);
 await panel.getByText('Verification revoked',{exact:true}).waitFor();await panel.locator('summary').click();await panel.getByText('Director reviewed the exact browser fixture.',{exact:true}).waitFor();
 rows=await db.archiveVerificationDecision.findMany({where:{sourceId:'review-file'},orderBy:{sequence:'asc'}});assert.deepEqual(rows.map(r=>r.action),['VERIFY','REVOKE']);assert.equal(rows[1].previousId,rows[0].id);assert.equal(await db.eventOutbox.count({where:{eventId:{in:rows.map(r=>r.eventId)}}}),2);
 await shot(page,'verification-revoked-retained-history');
 const digital=await pageFor('digital');await digital.goto(origin+'/archives/fixture-artwork');const leadPanel=digital.locator('[data-verification-for="review-file"]');await leadPanel.scrollIntoViewIfNeeded();await leadPanel.getByRole('button',{name:'Verify',exact:true}).click();
 const leadDialog=digital.getByRole('dialog',{name:'Verify exact file version'});await leadDialog.getByLabel('Verification note',{exact:true}).fill('Scoped Digital Lead independently reviewed this version.');await leadDialog.getByRole('checkbox').check();await leadDialog.getByRole('button',{name:'Confirm verification',exact:true}).click();await leadPanel.getByText(/^Verified by Fixture digital/).first().waitFor();assert.equal(await leadPanel.getByRole('button',{name:'Revoke verification',exact:true}).count(),0);
 assert.equal((await db.archiveVerificationDecision.findFirstOrThrow({where:{sourceId:'review-file'},orderBy:{sequence:'desc'}})).actorId,'digital');
 for(const role of ['spm','designer']){const reader=await pageFor(role);await reader.goto(origin+'/archives/fixture-artwork?view=all');const scoped=reader.locator('[data-verification-for="review-file"]');await scoped.scrollIntoViewIfNeeded();await scoped.getByRole('status').getByText('Verified',{exact:true}).waitFor();assert.equal(await scoped.getByRole('button',{name:/Verify|Revoke/}).count(),0);if(role==='designer'){await scoped.locator('summary').click();assert.equal(await scoped.getByText('Scoped Digital Lead independently reviewed this version.',{exact:true}).count(),0);}}
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/archives/fixture-artwork?view=all');await panel.scrollIntoViewIfNeeded();await panel.getByRole('button',{name:'Revoke verification',exact:true}).focus();await page.keyboard.press('Enter');const keyboard=page.getByRole('dialog',{name:'Revoke exact file verification'});await keyboard.waitFor();await keyboard.getByRole('button',{name:'Cancel',exact:true}).click();await shot(page,'verification-mobile-keyboard');
 assert.equal(JSON.stringify(await Promise.all([db.sharedFileVersion.findUnique({where:{id:'review-version'}}),db.sharedFileReference.findUnique({where:{id:'review-reference'}}),db.userArchiveAssetAccess.findMany({where:{manualArchiveFileId:'review-file'},orderBy:{userId:'asc'}})])),snapshot);
 pass('Persisted Director revocation, original history/event/outbox retention, scoped Digital Lead re-verification, SPM/Designer denial, private history and mobile keyboard controls; exact file and grants unchanged.');
}

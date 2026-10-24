import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectWorkflowStageKey } from '@prisma/client';

// A small valid, viewable PDF; no real artwork or employee information.
function samplePDF() {
  const stream = 'BT /F1 18 Tf 50 750 Td (QA SYNTHETIC PROOF - NOT GTI BUSINESS DATA) Tj ET';
  const parts = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text = '%PDF-1.4\n'; const offsets = [0];
  parts.forEach((part, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${part}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

export async function prepareHumanQA({ db, browser, root, origin, storageOrigin, objects, result }) {
  const pass = message => { result.checks.push(message); console.log('PASS: ' + message); };
  const roles = [['director','Director','DIRECTOR'],['spm','SPM','SENIOR_PROJECT_MANAGER'],['spm2','Other SPM','SENIOR_PROJECT_MANAGER'],['jpm','JPM','JUNIOR_PROJECT_MANAGER'],['designer','Designer','DESIGNER'],['outsider','Ungranted Designer','DESIGNER'],['digital','Digital Lead','DIGITAL_LEAD'],['tech','Technical Only',null]];
  const password = randomBytes(20).toString('base64url');
  for (const [id, label] of roles) {
    const salt = randomBytes(16).toString('hex');
    await db.user.create({ data: { id, name: 'QA ' + label, email: `${id}@human-qa.invalid`, role: 'USER', passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` } });
  }
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Disposable human QA accounts',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
    for (const [userId, , businessRole] of roles) await tx.userAuthorization.create({ data: { userId, businessRole, technicalPrivileges: businessRole ? [] : ['TECHNICAL_ADMIN'] } });
  });
  writeFileSync(join(root, 'accounts.txt'), `PRIVATE LOCAL QA ONLY — regenerated on reset\nApplication: ${origin}\n\n${roles.map(([id, label]) => `${label}: ${id}@human-qa.invalid`).join('\n')}\n\nDisposable password (all these QA accounts): ${password}\nNever use these accounts at port 3000. Do not copy this card into issues or Git.\n`, { mode: 0o600 });
  const pdf = samplePDF(); writeFileSync(join(root, 'QA-proof.pdf'), pdf, { mode: 0o600 });
  const pages = new Map();
  async function pageFor(id) {
    if (pages.has(id)) return pages.get(id);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Dubai' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if ([origin, storageOrigin].includes(u.origin) || ['blob:','data:'].includes(u.protocol)) return route.continue();
      result.externalRequests.push(u.origin); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) result.unexpectedResponses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    await page.goto(origin + '/sign-in'); await page.locator('[name=email]').fill(`${id}@human-qa.invalid`); await page.locator('[name=password]').fill(password); await page.locator('button[type=submit]').click();
    await page.waitForURL(u => u.pathname !== '/sign-in'); pages.set(id, page); return page;
  }
  async function request(page, path, data, method = 'POST') {
    return page.evaluate(async ({ path, data, method }) => {
      const response = await fetch(path, data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
    }, { path, data, method });
  }
  async function ok(page, path, data, method) { const r = await request(page, path, data, method); assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.body)}`); return r.body; }
  const director = await pageFor('director'), spm = await pageFor('spm'), designer = await pageFor('designer');
  for (const [id] of roles) await pageFor(id);
  pass('Eight synthetic password logins, including every business role and technical-only');
  const status = await db.projectStatusOption.findUniqueOrThrow({ where: { slug: 'in-progress' } });
  await db.project.create({ data: { id: 'qa-native', name: 'QA Native Artwork', description: 'Synthetic project for navigation and authorized Tasker context.', category: 'Artwork', statusId: status.id, ownerId: 'spm', createdById: 'spm', coOwners: { create: { userId: 'jpm' } }, executors: { create: { userId: 'designer' } }, workflowStages: { create: Object.values(ProjectWorkflowStageKey).map(stageKey => ({ stageKey, status: stageKey === 'PROJECT_INQUIRY' ? 'AVAILABLE' : 'LOCKED', unlockedAt: stageKey === 'PROJECT_INQUIRY' ? new Date() : null })) } } });
  await db.flexibleProject.create({ data: { id: 'qa-flexible', slug: 'qa-flexible', name: 'QA Flexible Campaign', description: 'Synthetic campaign with a sample milestone.', ownerId: 'spm', createdById: 'spm', collaborators: { create: { userId: 'jpm', addedById: 'spm' } }, milestones: { create: { name: 'QA Prepare campaign proof', description: 'Use invented artwork only.', responsibleUserId: 'spm', sortOrder: 0, deadline: new Date(Date.now() + 3 * 86400_000) } } } });
  const definition = { schemaVersion: 1, name: 'QA Practice Workflow', description: 'Synthetic only. Custom QA publication is not GTI standard approval.', intendedProjectType: 'CUSTOM', stages: [{ id: 'proof', title: 'Proof', description: 'Prepare and review a synthetic proof.', position: 0, gates: [], capabilities: [
    { id: 'info', type: 'INFORMATION', title: 'Brief', instructions: 'Use invented content.', fields: [{ id: 'note', type: 'SHORT_TEXT', label: 'Note', help: '', required: false, options: [], defaultValue: null, min: null, max: 200 }] },
    { id: 'files', type: 'FILE_REQUIREMENT', title: 'Output', instructions: 'Upload QA-proof.pdf.', acceptedTypes: ['.pdf','application/pdf'], minFiles: 0, maxFiles: 6, required: false, acceptance: 'REVIEWER', acceptedVersionsGate: false },
    { id: 'check', type: 'CHECKLIST', title: 'Proof checklist', instructions: '', items: [{ id: 'checked', label: 'Proof checked', description: 'Inspect the synthetic proof.', required: false, evidence: 'TEXT' }] },
    { id: 'approval', type: 'APPROVAL', title: 'Director review', instructions: 'Separate review from task completion.', rejection: 'RETURN_FOR_CHANGES', gatesProgression: false, steps: [{ id: 'director-step', label: 'Director decision', approver: 'DIRECTOR', evidence: 'CONFIGURED_INPUTS', decision: 'APPROVE_REQUIRED' }] }
  ] }] };
  const draft = await ok(spm, '/api/workflow-drafts', { commandId: randomUUID(), definition });
  const submission = await ok(spm, `/api/workflow-drafts/${draft.workflowId}/submit`, { commandId: randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: 'Synthetic QA workflow' });
  const published = await ok(director, `/api/workflow-approvals/${submission.id}/decision`, { expected: { ...submission.expected, commandId: randomUUID() }, configurationHash: submission.configurationHash, outcome: 'APPROVE', reason: 'Publish only the synthetic custom workflow', confirmed: true });
  const createInput = (title, ownerId = 'spm') => ({ commandId: randomUUID(), publishedVersionId: published.publishedVersion.id, definitionHash: draft.configurationHash, title, description: 'QA SYNTHETIC — disposable', ownerId, coOwnerIds: ownerId === 'spm2' ? [] : ['jpm'], executorIds: ownerId === 'spm2' ? [] : ['designer','digital'] });
  const project = await ok(spm, '/api/runtime-projects', createInput('QA Task Workspace'));
  const practice = await ok(spm, '/api/runtime-projects', createInput('QA Runtime Practice'));
  const privateProject = await ok(director, '/api/runtime-projects', createInput('QA Restricted Other Project', 'spm2'));
  const finalProject = await ok(spm, '/api/runtime-projects', createInput('QA Final Completion'));
  const archivedProject = await ok(spm, '/api/runtime-projects', createInput('QA Completed for Archives'));
  const pendingDraft = await ok(spm, '/api/workflow-drafts', { commandId: randomUUID(), definition: { ...definition, name: 'QA Editable Draft' } });
  const reviewDraft = await ok(spm, '/api/workflow-drafts', { commandId: randomUUID(), definition: { ...definition, name: 'QA Awaiting Publication' } });
  await ok(spm, `/api/workflow-drafts/${reviewDraft.workflowId}/submit`, { commandId: randomUUID(), expectedRevision: reviewDraft.revision, configurationHash: reviewDraft.configurationHash, changeSummary: 'Ready for human Director review' });
  const jpm = await pageFor('jpm');
  await ok(jpm, '/api/runtime-projects/creation-requests', { creation: { ...createInput('QA JPM Requested Project', 'jpm'), coOwnerIds: ['spm'] }, reason: 'Synthetic governed request for human Director decision' });
  const stage = await db.runtimeStage.findFirstOrThrow({ where: { projectId: project.projectId } });
  const taskCommand = async (page, id, action, extra = {}) => ok(page, `/api/tasker/${id}`, { commandId: randomUUID(), expectedVersion: (await ok(page, `/api/tasker/${id}`)).version, action, text: 'QA synthetic lifecycle', ...extra }, 'PATCH');
  const task = async (title, type, extra = {}) => ok(spm, '/api/tasker', { commandId: randomUUID(), contextTarget: `runtime:${project.projectId}`, title, type, brief: 'Use the supplied synthetic PDF or invented text. Owner reviews independently.', deadline: new Date(Date.now() + 2 * 86400_000).toISOString(), priority: 'NORMAL', executorId: 'designer', spectatorIds: ['digital'], ...extra });
  async function uploadTask(page, id, name = 'QA-proof.pdf') {
    const prepared = await taskCommand(page, id, 'PREPARE_UPLOAD', { fileName: name, mimeType: 'application/pdf', fileSize: pdf.length });
    const ticket = await ok(page, `/api/tasker/${id}/files`, { uploadId: prepared.uploadId });
    assert.equal(new URL(ticket.uploadUrl).origin, storageOrigin);
    assert.equal((await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf })).status, 200);
    await taskCommand(page, id, 'FINALIZE_UPLOAD', { uploadId: prepared.uploadId });
    return db.universalTaskUpload.findUniqueOrThrow({ where: { id: prepared.uploadId } });
  }
  const general = await task('QA General Review', 'GENERAL');
  await taskCommand(designer, general.id, 'SUBMIT'); await taskCommand(designer, general.id, 'REQUEST_COMPLETION');
  const upload = await task('QA File Upload', 'FILE_UPLOAD', { destination: `runtime-file:${stage.id}:files`, inputMode: 'FILE' });
  const dataTask = await task('QA Data Input', 'DATA_INPUT', { destination: `runtime-field:${stage.id}:info:note`, inputMode: 'TEXT' });
  const inspect = await task('QA Inspect File', 'INSPECT_FILE');
  const source = await uploadTask(spm, inspect.id, 'QA-inspection-source.pdf');
  await taskCommand(spm, inspect.id, 'SET_SOURCE', { sourceVersionId: source.versionId });
  const initial = await task('QA Initial Concept', 'INITIAL_CONCEPT');
  const initialSource = await uploadTask(designer, initial.id, 'QA-initial-concept.pdf');
  await taskCommand(designer, initial.id, 'SUBMIT', { fileIds: [initialSource.id] });
  const final = await task('QA Final Concept', 'FINAL_CONCEPT', { inspirationVersionIds: [initialSource.versionId] });
  const sisterSource = await task('QA Sister Source Completed', 'GENERAL');
  await taskCommand(designer, sisterSource.id, 'SUBMIT'); await taskCommand(designer, sisterSource.id, 'REQUEST_COMPLETION'); await taskCommand(spm, sisterSource.id, 'APPROVE');
  const sisterInput = { commandId: randomUUID(), contextTarget: `runtime:${project.projectId}`, title: 'QA Sister Independent Work', type: 'GENERAL', brief: 'Independent follow-up; does not inherit completion.', deadline: new Date(Date.now() + 3 * 86400_000).toISOString(), priority: 'NORMAL', executorId: 'designer', spectatorIds: ['digital'], sister: { sourceTaskId: sisterSource.id, sourceVersion: (await ok(spm, `/api/tasker/${sisterSource.id}`)).version, mode: 'MODIFY', evidenceVersionIds: [], confirmed: true, confirmation: '' } };
  sisterInput.sister.confirmation = (await ok(spm, '/api/tasker/sister-preview', sisterInput)).confirmation;
  const sister = await ok(spm, '/api/tasker', sisterInput);
  await task('QA Digital Lead Assignment', 'GENERAL', { executorId: 'digital', spectatorIds: [], deadline: new Date(Date.now() - 86400_000).toISOString() });
  pass('Real routes created six Tasker types, exact inspection/inspiration files, a pending Owner review and an independent Sister');
  async function stageCommand(page, projectId, action, extra = {}) {
    const s = await db.runtimeStage.findFirstOrThrow({ where: { projectId } });
    return ok(page, `/api/runtime-projects/${projectId}/stages/${s.id}`, { commandId: randomUUID(), expectedRevision: s.revision, action, ...extra });
  }
  async function stageFile(projectId) {
    const s = await db.runtimeStage.findFirstOrThrow({ where: { projectId } });
    const prepared = await stageCommand(spm, projectId, 'UPLOAD_PREPARED', { capabilityId: 'files', fileName: 'QA-stage-output.pdf', mimeType: 'application/pdf', fileSize: pdf.length, supersedesId: null });
    const ticket = await ok(spm, `/api/runtime-projects/${projectId}/stages/${s.id}/uploads/${prepared.submissionId}`, {});
    assert.equal(new URL(ticket.uploadUrl).origin, storageOrigin);
    assert.equal((await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf })).status, 200);
    const finalized = await stageCommand(spm, projectId, 'FILE_SUBMITTED', { submissionId: prepared.submissionId });
    assert.equal(finalized.state, 'SUBMITTED');
    await stageCommand(director, projectId, 'FILE_DECIDED', { submissionId: prepared.submissionId, outcome: 'APPROVE', reason: 'Independent exact synthetic file review' });
  }
  await stageFile(practice.projectId);
  await stageCommand(spm, practice.projectId, 'APPROVAL_SUBMITTED', { capabilityId: 'approval' });
  for (const p of [finalProject, archivedProject]) { await stageFile(p.projectId); await stageCommand(spm, p.projectId, 'COMPLETED', { reason: 'Synthetic stage completed explicitly' }); }
  async function completionCommand(page, projectId, action, extra = {}) {
    const c = await ok(page, `/api/runtime-projects/${projectId}/completion`);
    return ok(page, `/api/runtime-projects/${projectId}/completion`, { commandId: randomUUID(), expectedRevision: c.revision, expectedProjectRevision: c.projectRevision, expectedPolicyRevision: c.policyRevision, action, ...extra });
  }
  await completionCommand(director, archivedProject.projectId, 'POLICY_APPROVED', { settings: { AUTHORITY_APPROVAL_PROOF: 'NOT_APPLICABLE', COPYRIGHT_TRANSFER: 'NOT_APPLICABLE', INVOICE: 'NOT_APPLICABLE' }, reason: 'Explicit synthetic no-document policy', confirmed: true });
  await completionCommand(spm, archivedProject.projectId, 'COMPLETION_REQUESTED', { reason: 'Actual QA Owner requests completion', confirmed: true });
  const pending = (await ok(director, `/api/runtime-projects/${archivedProject.projectId}/completion`)).requests.find(r => r.state === 'PENDING');
  await completionCommand(director, archivedProject.projectId, 'COMPLETION_DECIDED', { requestId: pending.id, requestHash: pending.hash, outcome: 'APPROVE', reason: 'Separate Director final decision', confirmed: true });
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: archivedProject.projectId } })).state, 'COMPLETED');
  pass('Real workflow publication, governed JPM request, stage evidence/review, Owner final request and Director final completion');

  // Exact-version Archive fixture follows archive-verification-browser-acceptance.
  const etag = '"' + createHash('md5').update(pdf).digest('hex') + '"';
  objects.set('/fixture-bucket/qa/archive.pdf', { body: pdf, type: 'application/pdf', etag, version: 'qa-object-v1' });
  await db.archiveCategory.create({ data: { id: 'qa-artwork', name: 'QA Artwork', slug: 'qa-artwork' } });
  await db.manualArchiveFile.create({ data: { id: 'qa-archive-file', archiveCategoryId: 'qa-artwork', fileName: 'QA-archive-proof.pdf', originalFileName: 'QA-archive-proof.pdf', mimeType: 'application/pdf', fileSize: pdf.length, bucket: 'fixture-bucket', storageKey: 'qa/archive.pdf', status: 'READY', uploadedById: 'director' } });
  await db.sharedFile.create({ data: { id: 'qa-archive-identity' } });
  await db.sharedFileVersion.create({ data: { id: 'qa-archive-version', fileId: 'qa-archive-identity', number: 1, uploadedById: 'director', originalFileName: 'QA-archive-proof.pdf', mimeType: 'application/pdf', fileSize: pdf.length, bucket: 'fixture-bucket', storageKey: 'qa/archive.pdf' } });
  await db.sharedFileReference.create({ data: { id: 'qa-archive-reference', versionId: 'qa-archive-version', role: 'SOURCE', manualArchiveFileId: 'qa-archive-file' } });
  await db.sharedFileVersion.update({ where: { id: 'qa-archive-version' }, data: { status: 'READY', objectETag: etag, objectVersionId: 'qa-object-v1', observedAt: new Date(), finalizedAt: new Date() } });
  await ok(director, '/api/archives/organization', { commandId: randomUUID(), categoryId: 'qa-artwork', action: 'create', name: 'QA Proofs', description: 'Synthetic folder', icon: 'folder', parentId: null });
  const access = await ok(director, '/api/archives/access?fileId=qa-archive-file');
  const recipient = access.users.find(u => u.id === 'designer'); assert.ok(recipient);
  await ok(director, '/api/archives/access', { commandId: randomUUID(), sourceKind: access.sourceKind, sourceId: access.sourceId, categoryId: access.categoryId, referenceId: access.referenceId, versionId: access.versionId, recipientId: 'designer', expectedRevision: recipient.revision, expectedDecisionId: recipient.decisionId, expectedGrantId: null, action: 'GRANT', expiresAt: null, reason: 'Synthetic human QA download grant', confirmed: true });
  // Recorded fixtures deliberately do not invoke any delivery producer or worker.
  const now = new Date(), end = new Date(now.getTime() + 3600_000);
  await db.calendarEvent.create({ data: { title: 'QA Personal Review', details: 'Synthetic manual event for QA SPM.', startAt: now, endAt: end, type: 'EVENTS', tone: 'BLUE', createdById: 'spm' } });
  await db.calendarEvent.create({ data: { title: 'QA Shared Project Review', details: 'Synthetic Director shared project event.', startAt: now, endAt: end, type: 'PROJECTS', tone: 'GREEN', createdById: 'director' } });
  for (const userId of ['director','spm','jpm']) await db.notification.create({ data: { userId, type: 'PROJECT_UPDATED', title: 'QA Recorded Message', message: 'Synthetic recorded history for read/unread testing; no external delivery occurred.', projectId: 'qa-native', url: '/projects/qa-native' } });
  const fixtures = { projectId: project.projectId, practiceId: practice.projectId, privateId: privateProject.projectId, finalProjectId: finalProject.projectId, archiveProjectId: archivedProject.projectId, draftId: pendingDraft.workflowId, generalId: general.id, uploadId: upload.id, dataId: dataTask.id, inspectId: inspect.id, initialId: initial.id, finalId: final.id, sisterId: sister.id };
  writeFileSync(join(root, 'fixture.json'), JSON.stringify(fixtures, null, 2), { mode: 0o600 });
  const links = [['Dashboard','/'],['Tasks','/tasks'],['QA General Review',`/tasks/${general.id}`],['QA File Upload',`/tasks/${upload.id}`],['QA Data Input',`/tasks/${dataTask.id}`],['QA Inspect File',`/tasks/${inspect.id}`],['QA Initial Concept',`/tasks/${initial.id}`],['QA Final Concept',`/tasks/${final.id}`],['QA Sister Independent Work',`/tasks/${sister.id}`],['QA Native Artwork','/projects/qa-native'],['QA Flexible Campaign','/projects/flexible/qa-flexible'],['QA Editable Draft',`/projects/workflow-drafts/${pendingDraft.workflowId}`],['QA Runtime Practice',`/projects/runtime/${practice.projectId}`],['QA Final Completion',`/projects/runtime/${finalProject.projectId}/completion`],['QA Completed for Archives',`/projects/runtime/${archivedProject.projectId}/archive`],['QA Restricted Other Project (denial check)',`/projects/runtime/${privateProject.projectId}`],['QA Artwork','/archives/qa-artwork?view=all'],['Task Calendar','/calendar'],['Manual Events','/calendar/manual'],['Attention','/notifications'],['Recorded Messages','/notifications?view=messages']];
  writeFileSync(join(root, 'fixture-links.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Local QA links</title><style>body{font:18px system-ui;max-width:700px;margin:40px auto}li{margin:10px}</style><h1>Local QA fixtures</h1><p>Sign in at port 3117 with the separate private account card. Everything here is synthetic. These links expire on reset.</p><ul>${links.map(([name,path])=>`<li><a href="${origin}${path}">${name}</a></li>`).join('')}</ul></html>`, { mode: 0o600 });
  assert.deepEqual(result.pageErrors, []); assert.deepEqual(result.externalRequests, []); assert.deepEqual(result.unexpectedResponses, []);
  pass('Archive exact version, folder and genuine grant; synthetic manual events and recorded messages; no external requests');
  return { pageFor, request, ok, pass, fixtures, pdf, taskCommand, stageCommand, completionCommand };
}

export async function smokeHumanQA({ db, origin, root, artifacts, result, pageFor, request, ok, pass, fixtures, pdf }) {
  const spm = await pageFor('spm'), director = await pageFor('director'), designer = await pageFor('designer'), digital = await pageFor('digital');
  const shot = async (page, name) => page.screenshot({ path: join(artifacts, name + '.png'), fullPage: true, animations: 'disabled' });
  for (const id of ['director','spm','jpm','designer','digital']) {
    const p = await pageFor(id); await p.goto(origin + '/'); await p.getByRole('heading', { name: 'My Work', exact: true }).waitFor(); assert.equal((await request(p, '/api/dashboard')).status, 200);
  }
  const tech = await pageFor('tech'); await tech.goto(origin + '/'); await tech.waitForURL(u => u.pathname === '/settings');
  assert.equal((await request(tech, '/api/dashboard')).status, 403);
  assert.equal((await request(designer, `/api/runtime-projects/${fixtures.privateId}`)).status, 403);
  await spm.goto(origin + '/projects/qa-native'); await spm.getByRole('heading', { name: 'Project - QA Native Artwork', exact: true }).waitFor();
  await spm.goto(origin + '/projects/flexible/qa-flexible'); await spm.getByText('QA Prepare campaign proof', { exact: true }).first().waitFor();
  pass('Browser role dashboards and technical-only/business permission denials');
  await shot(spm, 'dashboard');
  await spm.goto(origin + '/tasks'); await spm.getByRole('button', { name: 'New Task', exact: true }).click();
  await spm.locator('[name=contextTarget]').selectOption(`runtime:${fixtures.projectId}`);
  await spm.getByLabel('Task type', { exact: true }).selectOption('GENERAL');
  await spm.locator('[name=title]').fill('QA Smoke Created Task'); await spm.locator('[name=brief]').fill('Synthetic browser-created work');
  await spm.locator('[name=deadline]').fill(new Date(Date.now() + 86400_000).toISOString().slice(0,16)); await spm.locator('[name=executorId]').selectOption('designer');
  await spm.getByRole('button', { name: 'Create General Task', exact: true }).click(); await spm.getByRole('heading', { name: 'QA Smoke Created Task', exact: true }).waitFor();
  const created = await db.universalTask.findFirstOrThrow({ where: { title: 'QA Smoke Created Task' } });
  async function taskAction(page, reason, button) {
    await page.getByLabel('Message or decision reason').fill(reason);
    const saved = page.waitForResponse(r => r.url().includes('/api/tasker/') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: button, exact: true }).click(); assert.equal((await saved).status(), 200);
    await page.waitForFunction(() => { const el = document.querySelector('textarea[aria-label="Message or decision reason"]'); return !el || el.value === ''; });
  }
  await designer.goto(origin + `/tasks/${created.id}`); await designer.waitForLoadState('networkidle');
  await designer.getByLabel('Supporting file', { exact: true }).setInputFiles(join(root, 'QA-proof.pdf'));
  await designer.getByLabel('QA-proof.pdf · v1', { exact: true }).waitFor();
  await taskAction(designer, 'QA response with exact PDF', 'Submit response'); await taskAction(designer, 'QA Owner review requested', 'Request completion');
  await spm.goto(origin + `/tasks/${created.id}`); await taskAction(spm, 'QA needs clearer response', 'Request changes');
  await designer.reload(); await taskAction(designer, 'QA clarified response', 'Submit response'); await taskAction(designer, 'QA review again', 'Request completion');
  await spm.reload(); await taskAction(spm, 'QA independent Owner accepted', 'Approve completion');
  assert.equal((await db.universalTask.findUniqueOrThrow({ where: { id: created.id } })).status, 'COMPLETED');
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: fixtures.projectId } })).state, 'ACTIVE');
  await digital.goto(origin + `/tasks/${fixtures.generalId}`); assert.equal(await digital.getByRole('button', { name: 'Approve completion', exact: true }).count(), 0);
  await shot(spm, 'task-owner-accepted'); pass('Browser task creation, real fake-S3 upload, request, rejection, resubmission and Owner acceptance; spectator read-only');
  await spm.goto(origin + '/projects/workflow-drafts'); await spm.getByRole('button', { name: 'Create New Workflow Draft', exact: true }).click();
  await spm.getByLabel('Workflow name', { exact: true }).fill('QA Smoke Draft'); await spm.getByLabel('Intended project type', { exact: true }).selectOption('CUSTOM');
  await spm.getByRole('button', { name: 'Add Stage', exact: true }).first().click(); await spm.getByLabel('Stage title', { exact: true }).fill('QA Smoke Stage');
  await spm.getByRole('button', { name: /^Information Instructions/ }).click(); await spm.getByRole('button', { name: 'Add field', exact: true }).click();
  await spm.getByLabel('Field label', { exact: true }).fill('QA Audience'); await spm.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await spm.getByRole('status').filter({ hasText: 'Saved revision' }).waitFor(); await spm.reload(); assert.equal(await spm.getByLabel('Workflow name', { exact: true }).inputValue(), 'QA Smoke Draft');
  await spm.getByRole('button', { name: 'Preview Workflow', exact: true }).click(); await spm.getByRole('region', { name: 'Workflow preview', exact: true }).waitFor(); await shot(spm, 'stage-builder');
  pass('Browser Stage Builder create, typed field, save, reload and preview');
  for (const [label, name] of [['Packaging','Packaging / Artwork'],['POSM','POSM & Promotional Materials'],['Retail Display','Retail Display'],['Exhibition Stand','Exhibition Stand'],['Digital','Digital']]) {
    await spm.goto(origin + '/projects/workflow-drafts');
    const card = spm.getByRole('region', { name: `${label} blueprint`, exact: true });
    await card.getByRole('checkbox').check(); await card.getByRole('button', { name: `Load ${label} draft`, exact: true }).click();
    await spm.getByLabel('Workflow name', { exact: true }).waitFor(); assert.equal(await spm.getByLabel('Workflow name', { exact: true }).inputValue(), `${name} · internal candidate v1`);
    await spm.getByRole('button', { name: 'Preview Workflow', exact: true }).click(); await spm.getByRole('region', { name: 'Workflow preview', exact: true }).waitFor();
  }
  pass('All five unchanged internal template candidates load and preview through real controls');
  await director.goto(origin + `/projects/runtime/${fixtures.practiceId}`);
  await director.getByLabel('Stage approval reason', { exact: true }).fill('QA independent stage decision');
  await director.getByLabel('I reviewed this exact submitted evidence and confirm my decision.').check();
  const decided = director.waitForResponse(r => r.url().includes('/stages/') && r.request().method() === 'POST');
  await director.getByRole('button', { name: 'Approve current step', exact: true }).click(); assert.equal((await decided).status(), 200);
  await director.getByText(/APPROVED · Evidence revision/).waitFor();
  await director.goto(origin + `/projects/runtime/${fixtures.archiveProjectId}/archive`);
  await director.getByRole('checkbox', { name: 'Publish qa-stage-output.pdf', exact: true }).waitFor();
  pass('Runtime-stage independent approval works; completed runtime output is eligible for explicit Archive publication');
  await designer.goto(origin + '/archives/qa-artwork?view=all'); await designer.getByRole('link', { name: 'Download', exact: true }).waitFor();
  const bytes = await designer.evaluate(async () => { const r = await fetch('/api/archives/files/qa-archive-file/download'); return { status: r.status, text: await r.text() }; });
  assert.equal(bytes.status, 200); assert.equal(bytes.text, pdf.toString());
  assert.ok([403,404].includes((await request(await pageFor('outsider'), '/api/archives/files/qa-archive-file/download')).status));
  await director.goto(origin + '/archives/qa-artwork?view=all'); const panel = director.locator('[data-verification-for="qa-archive-file"]');
  await panel.getByRole('button', { name: 'Verify', exact: true }).click(); const dialog = director.getByRole('dialog', { name: 'Verify exact file version' });
  await dialog.getByLabel('Verification note', { exact: true }).fill('QA smoke exact version inspected'); await dialog.getByRole('checkbox').check();
  const verified = director.waitForResponse(r => r.url().endsWith('/api/archives/verification') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirm verification', exact: true }).click(); assert.equal((await verified).status(), 200);
  const verification = await db.archiveVerificationDecision.findFirstOrThrow({ where: { sourceId: 'qa-archive-file' }, orderBy: { sequence: 'desc' } });
  assert.ok(Math.abs(Date.now() - verification.createdAt.getTime()) < 60_000, 'Database default timestamps must represent the current instant');
  await director.reload(); await panel.getByText(/^Verified by QA Director/).first().waitFor(); await shot(director, 'archive-verified');
  pass('Browser granted Archive download matches exact bytes, ungranted user denied and Director verification persists');
  await spm.goto(origin + '/search?q=QA'); await spm.locator('[data-search-v2]').waitFor();
  await spm.locator('[data-search-v2]').getByText('QA Task Workspace', { exact: true }).waitFor();
  await shot(spm, 'search');
  for (const view of ['month','week','agenda']) { await spm.goto(origin + `/calendar?view=${view}`); await spm.locator('[data-calendar-v2]').waitFor(); }
  await shot(spm, 'task-calendar');
  await spm.goto(origin + '/calendar/manual'); await spm.getByText('QA Personal Review', { exact: false }).first().waitFor(); await shot(spm, 'manual-calendar');
  await spm.goto(origin + '/notifications'); await spm.getByRole('link', { name: 'Recorded messages', exact: true }).first().waitFor(); await shot(spm, 'attention');
  await spm.getByRole('link', { name: 'Recorded messages', exact: true }).first().click(); await spm.getByText('QA Recorded Message', { exact: true }).first().waitFor();
  await spm.getByRole('button', { name: 'Mark as read', exact: true }).first().click(); await spm.getByRole('button', { name: 'Mark as unread', exact: true }).first().waitFor();
  await spm.getByRole('button', { name: 'Mark as unread', exact: true }).first().click(); await spm.getByRole('button', { name: 'Mark as read', exact: true }).first().waitFor(); await shot(spm, 'recorded-messages');
  pass('Browser Search, month/week/agenda Calendar, Manual Events, Attention and actual recorded read/unread controls');
  // Fresh persisted route checks complement UI smoke without running historical suites.
  assert.equal((await ok(spm, `/api/tasker/${fixtures.generalId}`)).status, 'COMPLETION_REQUESTED');
  assert.equal((await ok(spm, `/api/tasker/${fixtures.sisterId}`)).status, 'OPEN');
  const version = (await ok(spm, `/api/tasker/${fixtures.generalId}`)).version;
  assert.equal((await request(designer, `/api/tasker/${fixtures.generalId}`, { commandId: randomUUID(), expectedVersion: version, action: 'APPROVE', text: 'QA executor self-review denial' }, 'PATCH')).status, 403);
  assert.deepEqual(result.pageErrors, []); assert.deepEqual(result.externalRequests, []); assert.deepEqual(result.unexpectedResponses, []);
}

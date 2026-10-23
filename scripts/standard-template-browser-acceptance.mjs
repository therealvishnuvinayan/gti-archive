// Runs only inside the disposable runtime browser harness, after its regressions.
export async function packagingAcceptance({ assert, db, origin, pageFor, request, shot, pass }) {
  const owner = await pageFor('spm'), manager = await pageFor('jpm'), director = await pageFor('director');
  for (const page of [owner, manager, director]) await page.setViewportSize({ width: 1440, height: 1100 });
  await owner.goto(origin + '/projects/workflow-drafts');
  const card = owner.getByRole('region', { name: 'Packaging blueprint' });
  assert.equal(await card.getByRole('button', { name: 'Load Packaging draft' }).isDisabled(), true);
  await card.getByText('Stage coverage and outstanding requirements', { exact: true }).click();
  await shot(owner, '51-packaging-source-and-gaps', card);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Load Packaging draft' }).click();
  await owner.waitForURL(u => /\/projects\/workflow-drafts\/.+/.test(u.pathname));
  const workflowId = owner.url().split('/').at(-1);
  await owner.getByLabel('Workflow name', { exact: true }).waitFor();
  assert.equal(await owner.getByLabel('Workflow name', { exact: true }).inputValue(), 'Packaging / Artwork · internal candidate v1');
  await shot(owner, '52-packaging-populated-builder');
  await owner.getByLabel('Stage title', { exact: true }).scrollIntoViewIfNeeded();
  await shot(owner, '52a-packaging-stage-sequence-and-fields');
  await owner.getByRole('button', { name: '3. Final Artwork specification', exact: true }).click();
  assert.equal(await owner.getByLabel('Stage title', { exact: true }).inputValue(), 'Final Artwork specification');
  await owner.getByLabel('Stage title', { exact: true }).scrollIntoViewIfNeeded();
  await shot(owner, '52b-packaging-artwork-editor');
  await owner.getByLabel('Workflow name', { exact: true }).fill('Packaging isolated browser candidate');
  await owner.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await owner.getByRole('status').filter({ hasText: 'Saved revision 2' }).waitFor();
  await owner.getByRole('button', { name: 'Preview Workflow', exact: true }).click();
  await owner.getByRole('region', { name: 'Workflow preview' }).waitFor();
  await owner.getByRole('heading', { name: '1. Project Inquiry / Brief', exact: true }).scrollIntoViewIfNeeded();
  await shot(owner, '53-packaging-full-preview');
  await owner.setViewportSize({ width: 390, height: 844 });
  assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await owner.getByRole('heading', { name: '1. Project Inquiry / Brief', exact: true }).scrollIntoViewIfNeeded();
  await shot(owner, '54-packaging-mobile-preview');
  await owner.setViewportSize({ width: 1440, height: 1100 });
  const draft = (await request(owner, `/api/workflow-drafts/${workflowId}`)).body;
  assert.equal(draft.createdById, 'spm'); assert.equal(draft.definition.stages.length, 6); assert.equal(draft.validationStatus, 'VALID');
  for (const id of ['jpm', 'designer', 'digital', 'tech', 'tech2']) assert.equal((await request(await pageFor(id), '/api/workflow-blueprints/packaging/draft', { commandId: crypto.randomUUID(), blueprintRevision: 1, scopeAcknowledged: true }, 'POST')).status, 403);
  const sub = await request(owner, `/api/workflow-drafts/${workflowId}/submit`, { commandId: crypto.randomUUID(), expectedRevision: draft.revision, configurationHash: draft.configurationHash, changeSummary: 'Internal evidence pilot only; official rollout gaps retained.' }, 'POST');
  assert.equal(sub.status, 200);
  const decision = { expected: { ...sub.body.expected, commandId: crypto.randomUUID() }, configurationHash: sub.body.configurationHash, confirmed: true, outcome: 'APPROVE', reason: 'Synthetic Director reviewed internal scope and exclusions.' };
  assert.equal((await request(owner, `/api/workflow-approvals/${sub.body.id}/decision`, decision, 'POST')).status, 403);
  await director.goto(origin + `/projects/workflow-approvals/${sub.body.id}`);
  await shot(director, '55-packaging-director-review');
  const approved = await request(director, `/api/workflow-approvals/${sub.body.id}/decision`, decision, 'POST'); assert.equal(approved.status, 200);
  const version = approved.body.publishedVersion;
  assert.equal((await db.publishedWorkflowVersion.findUniqueOrThrow({ where: { id: version.id } })).configurationHash, draft.configurationHash);
  const created = await request(owner, '/api/runtime-projects', { commandId: crypto.randomUUID(), publishedVersionId: version.id, definitionHash: draft.configurationHash, title: 'Packaging browser internal pilot', description: 'Disposable only', ownerId: 'spm', coOwnerIds: ['jpm'], executorIds: ['designer'] }, 'POST');
  assert.equal(created.status, 200);
  const projectId = created.body.projectId, api = `/api/runtime-projects/${projectId}`;
  const project = (await request(owner, api)).body;
  assert.equal(project.workflow.versionId, version.id);
  const current = async (page, stage) => { const r = await request(page, `${api}?stage=${stage.id}`); assert.equal(r.status, 200); return r.body; };
  const cmd = async (page, stage, payload) => { const view = await current(page, stage); return request(page, `${api}/stages/${stage.id}`, { commandId: crypto.randomUUID(), expectedRevision: view.stage.revision, ...payload }, 'POST'); };
  for (let index = 0; index < project.stages.length; index++) {
    const stage = project.stages[index], definition = (await current(manager, stage)).stage.definition;
    const url = origin + `/projects/runtime/${projectId}?stage=${stage.id}`;
    await manager.goto(url);
    assert.equal(await manager.getByRole('button', { name: 'Complete stage explicitly' }).isDisabled(), true);
    assert.equal((await cmd(manager, stage, { action: 'COMPLETED', reason: 'Incomplete requirements' })).status, 409);
    for (const block of definition.capabilities) {
      if (block.type === 'INFORMATION') {
        const values = Object.fromEntries(block.fields.filter(f => f.type !== 'READ_ONLY').map(f => [f.id, f.type === 'NUMBER' ? 1 : f.type === 'DATE' ? '2026-11-01' : f.type === 'SELECT' ? f.options[0] : `Synthetic ${f.label}`]));
        if (index === 0) {
          for (const field of block.fields.filter(f => f.type !== 'READ_ONLY')) {
            const input = manager.getByLabel(`${field.label}${field.required ? ' *' : ' (optional)'}`, { exact: true });
            if (field.type === 'SELECT') await input.selectOption(String(values[field.id])); else await input.fill(String(values[field.id]));
          }
          const saved = manager.waitForResponse(r => r.url().endsWith(`/stages/${stage.id}`) && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'FIELDS');
          await manager.getByRole('button', { name: `Save ${block.title}`, exact: true }).click(); assert.equal((await saved).status(), 200); await manager.reload();
        } else assert.equal((await cmd(manager, stage, { action: 'FIELDS', values })).status, 200);
      }
      if (block.type === 'FILE_REQUIREMENT') {
        const prepared = await cmd(manager, stage, { action: 'UPLOAD_PREPARED', capabilityId: block.id, fileName: 'evidence.pdf', mimeType: 'application/pdf', fileSize: 6, supersedesId: null }); assert.equal(prepared.status, 200);
        const id = prepared.body.submissionId;
        const ticket = await request(manager, `${api}/stages/${stage.id}/uploads/${id}`, {}, 'POST'); assert.equal(ticket.status, 200);
        assert.equal(await manager.evaluate(async ticket => (await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-x' })).status, ticket.body), 200);
        assert.equal((await cmd(manager, stage, { action: 'FILE_SUBMITTED', submissionId: id })).status, 200);
        assert.equal((await cmd(manager, stage, { action: 'FILE_DECIDED', submissionId: id, outcome: 'APPROVE', reason: 'Self review attempt' })).status, 403);
        assert.equal((await cmd(owner, stage, { action: 'FILE_DECIDED', submissionId: id, outcome: 'APPROVE', reason: 'Independent exact evidence review' })).status, 200);
      }
      if (block.type === 'CHECKLIST') for (const item of block.items) assert.equal((await cmd(manager, stage, { action: 'CHECKLIST', itemId: item.id, complete: true, text: 'Synthetic manual evidence review; no automated content validation.', versionId: null })).status, 200);
    }
    for (const block of definition.capabilities.filter(b => b.type === 'APPROVAL')) {
      const submitted = await cmd(manager, stage, { action: 'APPROVAL_SUBMITTED', capabilityId: block.id }); assert.equal(submitted.status, 200);
      const view = await current(manager, stage), approval = view.stage.approvals.find(a => a.requestId === submitted.body.requestId);
      const data = { action: 'APPROVAL_DECIDED', expected: { requestId: approval.requestId, stepId: approval.steps[0].id, revision: approval.revision, evidenceHash: approval.evidenceHash, commandId: crypto.randomUUID() }, confirmed: true, outcome: 'APPROVE', reason: 'Independent supported internal decision' };
      assert.equal((await cmd(manager, stage, data)).status, 403);
      const reviewer = block.steps[0].approver === 'PROJECT_OWNER' ? owner : director;
      assert.equal((await cmd(reviewer, stage, data)).status, 200);
    }
    await manager.goto(url); await shot(manager, `56-packaging-stage-${index + 1}`);
    assert.equal(await manager.getByRole('button', { name: 'Complete stage explicitly' }).isDisabled(), false);
    await manager.getByLabel('Stage completion reason').fill('Supported internal evidence gates satisfied');
    await manager.getByRole('button', { name: 'Complete stage explicitly' }).click();
    await manager.getByText('COMPLETED STAGE · IMMUTABLE EVIDENCE', { exact: true }).waitFor();
    assert.equal((await current(manager, stage)).stage.state, 'COMPLETED');
  }
  assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: projectId } })).state, 'ACTIVE');
  await owner.goto(origin + `/projects/runtime/${projectId}/completion`);
  assert.equal(await owner.getByRole('button', { name: 'Request final completion', exact: true }).isDisabled(), true);
  assert.equal((await request(owner, api + '/completion')).body.configured, false);
  await shot(owner, '57-packaging-director-policy-boundary');
  for (const id of ['designer', 'digital', 'tech', 'spm2']) assert.equal((await request(await pageFor(id), api)).status, 403);
  pass('Packaging: populated SPM import/edit/desktop/mobile preview, explicit Director publication, pinned SPM runtime, six real form/checklist/file/approval stages and unconfigured-policy final completion boundary. External/official requirements remain excluded.');
}

import "server-only";
import type { Prisma } from "@prisma/client";
import { runtimeAuthorization } from "../authorization/runtime";
import { approvalHash, type ApprovalOutcome } from "../approvals/contracts";
import { openRuntimeApproval, decideRuntimeApproval } from "../approvals/runtime-stage";
import { ensure, identifier, parseDefinition, type StageDefinition } from "../stage-builder/contracts";
import { configurationHash } from "../stage-builder/hash";
import { publicationIssues } from "../stage-builder/publication-contracts";
import { requireRuntime } from "./activation";
import { capability, defaults, parseCommand, parseCreate, text, validateField, acceptedFile, type Checks, type Values } from "./contracts";
import { evidenceSnapshot, history, json, runtimeActor, stageData, supersedePending } from "./data";
import { finalizeRuntimeFile, prepareRuntimeFile, verifyRuntimeFiles } from "./files";

export async function listRuntimeProjects(search = "", page = 0) {
  requireRuntime(); text(search, 160); ensure(Number.isSafeInteger(page) && page >= 0 && page <= 10000, "INVALID_PAGE");
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeList", targetId: "runtime-projects" }, async tx => {
    const actor = await runtimeActor(tx);
    const where: Prisma.RuntimeProjectWhereInput = { title: { contains: search, mode: "insensitive" }, ...(actor.businessRole === "DIRECTOR" ? {} : { OR: [{ ownerId: actor.userId }, { participants: { some: { userId: actor.userId, role: "CO_OWNER" } } }] }) };
    const [count, projects] = await Promise.all([tx.runtimeProject.count({ where }), tx.runtimeProject.findMany({ where, take: 30, skip: page * 30, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true, versionNumber: true, state: true, owner: { select: { name: true } }, publishedVersion: { select: { definition: true } }, stages: { select: { state: true } } } })]);
    return { count, page, canCreate: actor.businessRole === "DIRECTOR", projects: projects.map(p => ({ id: p.id, title: p.title, version: p.versionNumber, owner: p.owner.name, stageCount: p.stages.length, completed: p.stages.filter(s => s.state === "COMPLETED").length, workflowName: (p.publishedVersion.definition as unknown as { name: string }).name })) };
  });
}
export async function runtimeCreationOptions() {
  requireRuntime();
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeCreate", targetId: "runtime-projects" }, async tx => {
    const users = await tx.userAuthorization.findMany({ where: { accountStatus: "ACTIVE", businessRole: { not: null } }, select: { userId: true, businessRole: true, user: { select: { name: true } } }, orderBy: { userId: "asc" } });
    const versions = await tx.publishedWorkflowVersion.findMany({ take: 100, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, workflowId: true, number: true, configurationHash: true, definition: true } });
    return { users: users.map(u => ({ id: u.userId, name: u.user.name, role: u.businessRole })), versions: versions.map(v => ({ id: v.id, workflowId: v.workflowId, number: v.number, hash: v.configurationHash, name: parseDefinition(v.definition).name })) };
  });
}
export async function createRuntimeProject(raw: unknown) {
  requireRuntime(); const input = parseCreate(raw);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeCreate", targetId: "runtime-projects" }, async tx => {
    const actor = await runtimeActor(tx); ensure(actor.businessRole === "DIRECTOR", "ACCESS_DENIED", 403);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime:${actor.userId}:${input.commandId}`}, 0))::text`;
    const previous = await tx.runtimeActivity.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: input.commandId } } });
    if (previous) { ensure(previous.action === "CREATED" && previous.commandHash === approvalHash(input), "COMMAND_REUSED", 409); return previous.result as { projectId: string }; }
    const version = await tx.publishedWorkflowVersion.findUnique({ where: { id: input.publishedVersionId } }); ensure(version, "PUBLISHED_VERSION_NOT_FOUND", 404);
    const definition = parseDefinition(version.definition);
    ensure(version.validationStatus === "VALID" && publicationIssues(definition).length === 0 && configurationHash(definition) === input.definitionHash && version.configurationHash === input.definitionHash, "PUBLISHED_DEFINITION_CHANGED", 409);
    const ids = [input.ownerId, ...input.coOwnerIds, ...input.executorIds];
    const assignments = await tx.userAuthorization.findMany({ where: { userId: { in: ids }, accountStatus: "ACTIVE" } });
    ensure(assignments.length === ids.length && assignments.every(a => input.executorIds.includes(a.userId) ? !!a.businessRole : ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(a.businessRole ?? "")), "INELIGIBLE_PARTICIPANT", 403);
    const at = new Date();
    const project = await tx.runtimeProject.create({ data: { title: input.title, description: input.description, ownerId: input.ownerId, createdById: actor.userId, publishedVersionId: version.id, workflowId: version.workflowId, versionNumber: version.number, definitionHash: version.configurationHash, createdAt: at,
      participants: { create: [...input.coOwnerIds.map(userId => ({ userId, role: "CO_OWNER" })), ...input.executorIds.map(userId => ({ userId, role: "EXECUTOR" }))].map(p => ({ ...p, addedById: actor.userId, createdAt: at })) },
      stages: { create: definition.stages.map(s => ({ definitionStageId: s.id, position: s.position, configuration: json(s), values: json(defaults(s)), checklist: {} })) } } });
    const result = { projectId: project.id }; await history(tx, project.id, null, "CREATED", input, result, { ...input, createdById: actor.userId, createdAt: at.toISOString() }); return result;
  });
}
export async function getRuntimeProject(id: string, selectedStageId?: string) {
  requireRuntime(); identifier(id); if (selectedStageId) identifier(selectedStageId);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeRead", targetId: `runtime-project:${id}` }, async tx => {
    const actor = await runtimeActor(tx);
    const p = await tx.runtimeProject.findUniqueOrThrow({ where: { id }, include: { owner: { select: { name: true } }, createdBy: { select: { name: true } }, participants: { include: { user: { select: { name: true } } } }, publishedVersion: { select: { definition: true } }, stages: { orderBy: { position: "asc" } } } });
    const definition = parseDefinition(p.publishedVersion.definition), selected = selectedStageId ?? p.stages[0].id;
    const data = await stageData(tx, id, selected), s = data.stage;
    const activity = await tx.runtimeActivity.findMany({ where: { projectId: id, OR: [{ stageId: selected }, { stageId: null }] }, orderBy: { sequence: "desc" }, take: 100, select: { id: true, action: true, actorId: true, actor: { select: { name: true } }, sequence: true, createdAt: true, snapshot: true } });
    const completed = p.stages.filter(s => s.state === "COMPLETED").map(s => s.definitionStageId);
    return { id, title: p.title, description: p.description, ownerId: p.ownerId, owner: p.owner.name, createdBy: p.createdBy.name, workflow: { name: definition.name, id: p.workflowId, versionId: p.publishedVersionId, number: p.versionNumber, hash: p.definitionHash },
      participants: p.participants.map(r => ({ id: r.userId, name: r.user.name, role: r.role })), actor: { id: actor.userId, role: actor.businessRole }, finalClosureAvailable: false as const,
      stages: p.stages.map(s => { const c = s.configuration as unknown as StageDefinition; return { id: s.id, title: c.title, position: s.position, state: s.state === "COMPLETED" ? "COMPLETED" : c.gates.some(g => g.type === "PRECEDING_STAGE" && !completed.includes(g.stageId)) ? "UNAVAILABLE" : s.state }; }),
      stage: { id: s.id, definition: data.definition, values: s.values as Values, checklist: s.checklist as Checks, revision: s.revision, evidenceRevision: s.evidenceRevision, state: s.state === "COMPLETED" ? "COMPLETED" : data.blocked ? "BLOCKED" : data.unavailable ? "UNAVAILABLE" : data.gates().ready ? "READY_FOR_COMPLETION" : s.state, gates: data.gates(), completedById: s.completedById, completedAt: s.completedAt?.toISOString() ?? null,
        files: data.files.map(f => ({ id: f.id, capabilityId: f.capabilityId, versionId: f.versionId, number: f.version.number, name: f.version.originalFileName, size: f.version.fileSize, mimeType: f.version.mimeType, state: f.state, replaced: f.replaced, submittedById: f.submittedById, reviewedById: f.reviewedById, reason: f.reason, failureCode: f.failureCode, checksumEvidence: f.version.checksumEvidence })),
        approvals: s.approvals.map(a => ({ id: a.id, capabilityId: a.capabilityId, evidenceRevision: a.evidenceRevision, requestedById: a.requestedById, snapshot: a.snapshot, requestId: a.request.id, state: a.request.state, revision: a.request.revision, currentStep: a.request.currentStep, evidenceHash: a.request.evidenceHash, steps: a.request.steps.map(st => ({ id: st.id, position: st.position })), decisions: a.request.decisions.map(d => ({ actorId: d.actorId, stepId: d.stepId, outcome: d.outcome, reason: d.reason, at: d.decidedAt.toISOString() })) })) },
      activity: activity.map(a => ({ ...a, actor: a.actor.name, createdAt: a.createdAt.toISOString() })) };
  });
}
export async function runtimeStageCommand(projectId: string, stageId: string, raw: unknown) {
  requireRuntime(); identifier(projectId); identifier(stageId); const input = parseCommand(raw);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeManage", targetId: `runtime-project:${projectId}` }, async tx => {
    const actor = await runtimeActor(tx);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime:${actor.userId}:${input.commandId}`}, 0))::text`;
    const data = await stageData(tx, projectId, stageId), s = data.stage;
    const previous = await tx.runtimeActivity.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: input.commandId } } });
    if (previous) {
      ensure(previous.projectId === projectId && previous.stageId === stageId && previous.commandHash === approvalHash(input), "COMMAND_REUSED", 409);
      if (input.action === "APPROVAL_DECIDED") await decideRuntimeApproval(tx, data, { expected: input.expected, outcome: input.outcome as ApprovalOutcome, reason: input.reason as string });
      return previous.result;
    }
    ensure(s.state !== "COMPLETED" && !data.blocked && !data.unavailable, "STAGE_UNAVAILABLE", 409);
    ensure(s.revision === input.expectedRevision, "STALE_REVISION", 409);
    const at = new Date(); let result: unknown = { stageId, revision: s.revision + 1 };
    let patch: Prisma.RuntimeStageUpdateInput = { state: "IN_PROGRESS", revision: { increment: 1 } };
    const changesEvidence = ["FIELDS", "CHECKLIST", "UPLOAD_PREPARED", "FILE_SUBMITTED", "UPLOAD_FAILED", "FILE_DECIDED"].includes(input.action);
    if (input.action === "FIELDS") {
      ensure(input.values && typeof input.values === "object" && !Array.isArray(input.values) && Object.keys(input.values).length > 0 && Object.keys(input.values).length <= 480, "INVALID_FIELDS");
      const values = structuredClone(s.values) as Values;
      for (const [id, value] of Object.entries(input.values)) { const field = data.definition.capabilities.flatMap(c => c.type === "INFORMATION" ? c.fields : []).find(f => f.id === id); ensure(field, "FIELD_NOT_FOUND"); values[id] = { value: validateField(field, value), actorId: actor.userId, at: at.toISOString() }; }
      patch.values = json(values);
    } else if (input.action === "CHECKLIST") {
      identifier(input.itemId); ensure(typeof input.complete === "boolean", "INVALID_CHECKLIST"); text(input.text, 2000);
      const item = data.definition.capabilities.flatMap(c => c.type === "CHECKLIST" ? c.items : []).find(i => i.id === input.itemId); ensure(item, "CHECKLIST_ITEM_NOT_FOUND");
      ensure(input.versionId === null || typeof input.versionId === "string", "INVALID_EVIDENCE");
      ensure(item.evidence === "TEXT" || input.text === "", "UNSUPPORTED_EVIDENCE"); ensure(item.evidence === "SHARED_FILE_VERSION" || input.versionId === null, "UNSUPPORTED_EVIDENCE");
      if (input.complete) {
        if (item.evidence === "TEXT") ensure(input.text.trim(), "CHECKLIST_TEXT_REQUIRED");
        if (item.evidence === "SHARED_FILE_VERSION") ensure(data.files.some(f => f.versionId === input.versionId && !f.replaced && acceptedFile(data.definition, f)), "CHECKLIST_FILE_REQUIRED");
      }
      patch.checklist = json({ ...(s.checklist as Checks), [input.itemId]: { complete: input.complete, text: input.text, versionId: input.versionId, actorId: actor.userId, at: at.toISOString() } });
    } else if (input.action === "UPLOAD_PREPARED") result = await prepareRuntimeFile(tx, data, input);
    else if (input.action === "FILE_SUBMITTED" || input.action === "UPLOAD_FAILED") result = await finalizeRuntimeFile(tx, data, input.submissionId, input.action === "UPLOAD_FAILED");
    else if (input.action === "FILE_DECIDED") {
      identifier(input.submissionId); text(input.reason, 2000, true); ensure(["APPROVE", "REJECT"].includes(String(input.outcome)), "INVALID_DECISION");
      const f = data.files.find(f => f.id === input.submissionId); ensure(f && !f.replaced && f.state === "SUBMITTED", "FILE_NOT_PENDING", 409);
      const c = capability(data.definition, f.capabilityId, "FILE_REQUIREMENT"), p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId } });
      ensure(c.acceptance !== "NONE" && actor.userId !== f.submittedById && (c.acceptance !== "OWNER" || actor.userId === p.ownerId), "INDEPENDENT_FILE_REVIEWER_REQUIRED", 403);
      await verifyRuntimeFiles(data, [f]);
      await tx.runtimeFileSubmission.update({ where: { id: f.id }, data: { state: input.outcome === "APPROVE" ? "ACCEPTED" : "REJECTED", reviewedById: actor.userId, reviewedAt: at, reason: input.reason.trim() } });
    } else if (input.action === "APPROVAL_SUBMITTED") { await verifyRuntimeFiles(data); result = await openRuntimeApproval(tx, data, input.capabilityId); }
    else if (input.action === "APPROVAL_DECIDED") { text(input.reason, 2000, true); ensure(input.confirmed === true && ["APPROVE", "REJECT"].includes(String(input.outcome)), "CONFIRM_DECISION"); await verifyRuntimeFiles(data); result = await decideRuntimeApproval(tx, data, { expected: input.expected, outcome: input.outcome as ApprovalOutcome, reason: input.reason }); }
    else if (input.action === "COMPLETED") {
      text(input.reason, 2000, true); ensure(data.gates().ready, "STAGE_GATES_UNMET", 409); await verifyRuntimeFiles(data);
      patch = { ...patch, state: "COMPLETED", completedBy: { connect: { id: actor.userId } }, completedAt: at, completionSnapshot: json({ ...evidenceSnapshot(data), reason: input.reason.trim(), approvals: s.approvals.filter(a => a.evidenceRevision === s.evidenceRevision && a.request.state === "APPROVED").map(a => ({ requestId: a.approvalRequestId, evidenceHash: a.request.evidenceHash, decisionIds: a.request.decisions.map(d => d.id) })) }) };
    }
    if (changesEvidence) { patch.evidenceRevision = { increment: 1 }; await supersedePending(tx, stageId, actor.userId, at); }
    await tx.runtimeStage.update({ where: { id: stageId }, data: patch });
    await tx.runtimeProject.update({ where: { id: projectId }, data: { revision: { increment: 1 } } });
    const after = await stageData(tx, projectId, stageId);
    await history(tx, projectId, stageId, input.action, input, result, { ...evidenceSnapshot(after), revision: after.stage.revision, state: after.stage.state, command: input, completion: after.stage.completionSnapshot });
    return json(result);
  }, { timeout: 30_000 });
}
export type RuntimeWorkspace = Awaited<ReturnType<typeof getRuntimeProject>>;
export type RuntimeCreationOptions = Awaited<ReturnType<typeof runtimeCreationOptions>>;

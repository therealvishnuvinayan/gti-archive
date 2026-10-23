import "server-only";
import type { Prisma } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { resolveAuthenticatedSession } from "../authorization/session";
import { ensure, type StageDefinition } from "../stage-builder/contracts";
import { approvalHash } from "../approvals/contracts";
import { evaluateGates, type Checks, type Values, type RuntimeAction } from "./contracts";
export type Tx = Prisma.TransactionClient;
export const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
export async function runtimeActor(tx: Tx) {
  const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
  ensure(session && ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(session.principal.businessRole ?? ""), "ACCESS_DENIED", 403);
  const actor = session.principal;
  await tx.$queryRaw`SELECT set_config('flux.runtime_actor', ${actor.userId}, true), set_config('flux.runtime_session', ${actor.session.id}, true)`;
  return actor;
}
export async function stageData(tx: Tx, projectId: string, stageId: string) {
  const stage = await tx.runtimeStage.findFirst({ where: { id: stageId, projectId }, include: {
    submissions: { include: { version: true, replacement: { select: { id: true } } }, orderBy: { createdAt: "asc" } },
    approvals: { include: { request: { include: { steps: { orderBy: { position: "asc" } }, decisions: { orderBy: { decidedAt: "asc" } } } } }, orderBy: { requestedAt: "desc" } },
  } });
  ensure(stage, "STAGE_NOT_FOUND", 404);
  const definition = stage.configuration as unknown as StageDefinition;
  const completed = (await tx.runtimeStage.findMany({ where: { projectId, state: "COMPLETED" }, select: { definitionStageId: true } })).map(s => s.definitionStageId);
  const files = stage.submissions.map(s => ({ ...s, replaced: !!s.replacement }));
  const approvals = stage.approvals.map(a => ({ capabilityId: a.capabilityId, evidenceRevision: a.evidenceRevision, state: a.request.state }));
  const gates = (skip = false) => evaluateGates(definition, stage.values as Values, stage.checklist as Checks, files, approvals, stage.evidenceRevision, completed, skip);
  const blocked = stage.approvals.some(a => a.request.state === "REJECTED" && definition.capabilities.some(c => c.id === a.capabilityId && c.type === "APPROVAL" && c.rejection === "BLOCK_STAGE"));
  const unavailable = definition.gates.some(g => g.type === "PRECEDING_STAGE" && !completed.includes(g.stageId));
  return { stage, definition, files, completed, gates, blocked, unavailable };
}
export type StageData = Awaited<ReturnType<typeof stageData>>;
export function evidenceSnapshot(data: StageData) {
  const s = data.stage;
  return { stageId: s.id, projectId: s.projectId, definitionStageId: s.definitionStageId, evidenceRevision: s.evidenceRevision,
    values: s.values, checklist: s.checklist, files: data.files.filter(f => !f.replaced).map(f => ({ submissionId: f.id, capabilityId: f.capabilityId, versionId: f.versionId, state: f.state, submittedById: f.submittedById, reviewedById: f.reviewedById })), completedDependencies: data.definition.gates.flatMap(g => g.type === "PRECEDING_STAGE" && data.completed.includes(g.stageId) ? [g.stageId] : []) };
}
export async function supersedePending(tx: Tx, stageId: string, actorId: string, at: Date) {
  const requests = await tx.runtimeApprovalSubmission.findMany({ where: { stageId, request: { state: "PENDING" } } });
  for (const sub of requests) {
    await tx.approvalRequest.update({ where: { id: sub.approvalRequestId }, data: { state: "SUPERSEDED", revision: { increment: 1 }, supersededAt: at, supersessionReason: "Runtime evidence changed; submit a fresh review." } });
    await tx.approvalEvent.create({ data: { requestId: sub.approvalRequestId, action: "SUPERSEDED", actorId, createdAt: at, details: { stageId } } });
  }
}
export async function history(tx: Tx, projectId: string, stageId: string | null, action: RuntimeAction, command: { commandId: string }, result: unknown, snapshot: unknown) {
  const actor = await runtimeActor(tx), p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId } });
  const id = `ra_${crypto.randomUUID().replaceAll("-", "")}`, createdAt = new Date();
  await tx.runtimeActivity.create({ data: { id, projectId, stageId, sequence: p.revision, action, commandId: command.commandId, commandHash: approvalHash(command), actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, snapshot: json(snapshot), result: json(result), createdAt, eventId: `runtime:${id}` } });
  ensure(Date.parse(actor.session.expiresAt) > Date.now(), "SESSION_EXPIRED", 403);
}

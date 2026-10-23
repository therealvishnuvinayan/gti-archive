import "server-only";
import { runtimeAuthorization } from "../authorization/runtime";
import { approvalHash } from "../approvals/contracts";
import { ensure, parseDefinition } from "../stage-builder/contracts";
import { publicationIssues } from "../stage-builder/publication-contracts";
import { configurationHash } from "../stage-builder/hash";
import { parseCreate } from "../stage-runtime/contracts";
import { json, runtimeActor, type Tx } from "../stage-runtime/data";
import { requireRuntimeIntegration } from "./activation";
import { parseCreationDecision, parseCreationRequest } from "./creation-contracts";
import { instantiateRuntimeProject } from "./instantiate";

async function validate(tx: Tx, requesterId: string, creation: ReturnType<typeof parseCreate>) {
  const ids = [requesterId, creation.ownerId, ...creation.coOwnerIds, ...creation.executorIds];
  await tx.$queryRaw`SELECT "userId" FROM "UserAuthorization" WHERE "userId" IN (${(await import("@prisma/client")).Prisma.join(ids)}) ORDER BY "userId" FOR SHARE`;
  const users = await tx.userAuthorization.findMany({ where: { userId: { in: ids }, accountStatus: "ACTIVE" } });
  ensure(users.find(u => u.userId === requesterId)?.businessRole === "JUNIOR_PROJECT_MANAGER" && creation.ownerId === requesterId, "GENUINE_JPM_OWNER_REQUIRED", 403);
  ensure(creation.coOwnerIds.some(id => users.find(u => u.userId === id)?.businessRole === "SENIOR_PROJECT_MANAGER"), "SPM_CO_OWNER_REQUIRED", 403);
  ensure(users.length === new Set(ids).size && users.every(u => creation.executorIds.includes(u.userId) ? !!u.businessRole : ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(u.businessRole ?? "")), "INELIGIBLE_PARTICIPANT", 403);
  const v = await tx.publishedWorkflowVersion.findUnique({ where: { id: creation.publishedVersionId } });
  ensure(v && v.validationStatus === "VALID", "PUBLISHED_VERSION_REQUIRED", 409);
  const definition = parseDefinition(v.definition);
  ensure(!publicationIssues(definition).length && v.configurationHash === creation.definitionHash && configurationHash(definition) === creation.definitionHash, "PUBLISHED_VERSION_CHANGED", 409);
}
export async function requestRuntimeCreation(raw: unknown) {
  requireRuntimeIntegration(); const input = parseCreationRequest(raw), hash = approvalHash(input);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeRequestCreation", targetId: "runtime-projects" }, async tx => {
    const actor = await runtimeActor(tx);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-creation:${actor.userId}:${input.creation.commandId}`},0))::text`;
    const old = await tx.runtimeCreationRequest.findUnique({ where: { requesterId_commandId: { requesterId: actor.userId, commandId: input.creation.commandId } } });
    if (old) { ensure(old.commandHash === hash, "COMMAND_REUSED", 409); return { requestId: old.id }; }
    await validate(tx, actor.userId, input.creation);
    const id = `rcr_${crypto.randomUUID().replaceAll("-", "")}`;
    await tx.runtimeCreationRequest.create({ data: { id, requesterId: actor.userId, publishedVersionId: input.creation.publishedVersionId, snapshot: json(input.creation), snapshotHash: approvalHash(input.creation), reason: input.reason,
      commandId: input.creation.commandId, commandHash: hash, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, eventId: `runtime-creation:${id}` } });
    return { requestId: id };
  });
}
export async function decideRuntimeCreation(raw: unknown) {
  requireRuntimeIntegration(); const input = parseCreationDecision(raw), hash = approvalHash(input);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeDecideCreation", targetId: "runtime-projects", reason: input.reason }, async tx => {
    const actor = await runtimeActor(tx);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`runtime-creation-decision:${actor.userId}:${input.commandId}`},0))::text`;
    await tx.$queryRaw`SELECT id FROM "RuntimeCreationRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.runtimeCreationRequest.findUnique({ where: { id: input.requestId }, include: { decision: true } });
    ensure(request && request.snapshotHash === input.snapshotHash && approvalHash(request.snapshot) === request.snapshotHash, "STALE_CREATION_REQUEST", 409);
    const old = await tx.runtimeCreationDecision.findUnique({ where: { reviewerId_commandId: { reviewerId: actor.userId, commandId: input.commandId } } });
    if (old) { ensure(old.commandHash === hash && old.requestId === request.id, "COMMAND_REUSED", 409); return { projectId: old.projectId, outcome: old.outcome }; }
    ensure(!request.decision && actor.userId !== request.requesterId, "REQUEST_ALREADY_DECIDED", 409);
    const creation = parseCreate(request.snapshot);
    if (input.outcome === "APPROVE") await validate(tx, request.requesterId, creation);
    const id = `rcd_${crypto.randomUUID().replaceAll("-", "")}`, projectId = input.outcome === "APPROVE" ? `rp_${crypto.randomUUID().replaceAll("-", "")}` : null;
    await tx.runtimeCreationDecision.create({ data: { id, requestId: request.id, reviewerId: actor.userId, outcome: input.outcome, reason: input.reason, snapshotHash: request.snapshotHash, commandId: input.commandId, commandHash: hash,
      actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, projectId, eventId: `runtime-creation:${id}` } });
    if (projectId) await instantiateRuntimeProject(tx, { ...creation, commandId: input.commandId }, request.requesterId, projectId);
    return { projectId, outcome: input.outcome };
  });
}
export async function runtimeCreationRequests() {
  requireRuntimeIntegration();
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeGovernance", targetId: "runtime-projects" }, async tx => {
    const actor = await runtimeActor(tx);
    const rows = await tx.runtimeCreationRequest.findMany({ where: actor.businessRole === "DIRECTOR" ? {} : { requesterId: actor.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      include: { requester: { select: { name: true } }, decision: { select: { outcome: true, reason: true, projectId: true, reviewer: { select: { name: true } } } } } });
    return { canDecide: actor.businessRole === "DIRECTOR", requests: rows.map(r => ({ id: r.id, requester: r.requester.name, creation: parseCreate(r.snapshot), snapshotHash: r.snapshotHash, reason: r.reason, createdAt: r.createdAt.toISOString(), decision: r.decision })) };
  });
}

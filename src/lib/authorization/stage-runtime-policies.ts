import "server-only";
import type { ResourcePolicies, AuthorizationContext } from "./policy";
import { runtimeEnabled } from "../stage-runtime/activation";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
const load: NonNullable<ResourcePolicies["project.runtimeRead"]> = async ({ tx, actor, request }) => {
  if (!runtimeEnabled() || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) return null;
  const integrity = { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true };
  if (request.targetId === "runtime-projects") return ["project.runtimeList", "project.runtimeCreate"].includes(request.capability) && (request.capability !== "project.runtimeCreate" || actor.businessRole === "DIRECTOR") ? { resource: { id: request.targetId, kind: "projectCreation" }, resourcePermission: true, integrity } : null;
  const match = /^runtime-project:([a-zA-Z][a-zA-Z0-9_-]{0,79})$/.exec(request.targetId);
  if (!match || !["project.runtimeRead", "project.runtimeManage", "project.runtimeCompletion"].includes(request.capability)) return null;
  await tx.$queryRaw`SELECT id FROM "RuntimeProject" WHERE id = ${match[1]} FOR UPDATE`;
  const p = await tx.runtimeProject.findUnique({ where: { id: match[1] }, include: { participants: true } });
  if (!p || (p.state !== "ACTIVE" && !(runtimeIntegrationEnabled() && p.state === "COMPLETED" && request.capability !== "project.runtimeManage")) || (request.capability === "project.runtimeCompletion" && !runtimeIntegrationEnabled())) return null;
  const managers = [p.ownerId, ...p.participants.filter(r => r.role === "CO_OWNER").map(r => r.userId)];
  if (actor.businessRole !== "DIRECTOR" && !managers.includes(actor.userId)) return null;
  return { resource: { id: request.targetId, kind: "project", projectId: p.id }, project: { id: p.id, participantUserIds: managers }, resourcePermission: managers.includes(actor.userId), integrity } satisfies AuthorizationContext;
};


const governance: NonNullable<ResourcePolicies["project.runtimeGovernance"]> = async ({ actor, request }) => {
  if (!runtimeIntegrationEnabled() || request.targetId !== "runtime-projects") return null;
  const allowed = request.capability === "project.runtimeDecideCreation" ? actor.businessRole === "DIRECTOR"
    : request.capability === "project.runtimeRequestCreation" ? actor.businessRole === "JUNIOR_PROJECT_MANAGER"
    : request.capability === "project.runtimeCreateApproved" ? ["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")
    : ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "");
  return allowed ? { resource: { id: request.targetId, kind: "projectCreation" }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } } : null;
};

export const stageRuntimePolicies: ResourcePolicies = { "project.runtimeCreate": load, "project.runtimeList": load, "project.runtimeRead": load, "project.runtimeManage": load, "project.runtimeCompletion": load, "project.runtimeCreateApproved": governance, "project.runtimeRequestCreation": governance, "project.runtimeDecideCreation": governance, "project.runtimeGovernance": governance };

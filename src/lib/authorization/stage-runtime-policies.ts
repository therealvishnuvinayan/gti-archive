import "server-only";
import type { ResourcePolicies, AuthorizationContext } from "./policy";
import { runtimeEnabled } from "../stage-runtime/activation";
const load: NonNullable<ResourcePolicies["project.runtimeRead"]> = async ({ tx, actor, request }) => {
  if (!runtimeEnabled() || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) return null;
  const integrity = { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true };
  if (request.targetId === "runtime-projects") return ["project.runtimeList", "project.runtimeCreate"].includes(request.capability) && (request.capability !== "project.runtimeCreate" || actor.businessRole === "DIRECTOR") ? { resource: { id: request.targetId, kind: "projectCreation" }, resourcePermission: true, integrity } : null;
  const match = /^runtime-project:([a-zA-Z][a-zA-Z0-9_-]{0,79})$/.exec(request.targetId);
  if (!match || !["project.runtimeRead", "project.runtimeManage"].includes(request.capability)) return null;
  await tx.$queryRaw`SELECT id FROM "RuntimeProject" WHERE id = ${match[1]} FOR UPDATE`;
  const p = await tx.runtimeProject.findUnique({ where: { id: match[1] }, include: { participants: true } });
  if (!p || p.state !== "ACTIVE") return null;
  const managers = [p.ownerId, ...p.participants.filter(r => r.role === "CO_OWNER").map(r => r.userId)];
  if (actor.businessRole !== "DIRECTOR" && !managers.includes(actor.userId)) return null;
  return { resource: { id: request.targetId, kind: "project", projectId: p.id }, project: { id: p.id, participantUserIds: managers }, resourcePermission: managers.includes(actor.userId), integrity } satisfies AuthorizationContext;
};
export const stageRuntimePolicies: ResourcePolicies = { "project.runtimeCreate": load, "project.runtimeList": load, "project.runtimeRead": load, "project.runtimeManage": load };

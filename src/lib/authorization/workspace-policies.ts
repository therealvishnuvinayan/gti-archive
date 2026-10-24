import "server-only";
import { dashboardV2Enabled } from "../dashboard-v2/activation";
import type { AuthorizationContext, ResourcePolicies } from "./policy";

async function loadWorkspaceContext({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["workspace.dashboard"]>>[0]): Promise<AuthorizationContext | null> {
  const cap = request.capability, target = request.targetId;
  if (cap === "workspace.dashboard" && !dashboardV2Enabled() &&
    !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) return null;
  let allowed = target === "root" && ["workspace.dashboard", "workspace.businessUsers", "workspace.contacts", "workspace.masterData", "workspace.calendar.view"].includes(cap);
  if (cap === "workspace.calendar.create") {
    allowed = ["EVENTS", "REMINDERS"].includes(target) ||
      (actor.businessRole === "DIRECTOR" && ["PROJECTS", "PAYMENTS"].includes(target));
  }
  if (cap === "workspace.calendar.delete") {
    await tx.$queryRaw`SELECT id FROM "CalendarEvent" WHERE id = ${target} FOR UPDATE`;
    const event = await tx.calendarEvent.findUnique({ where: { id: target }, select: { createdById: true, type: true } });
    allowed = !!event && (["EVENTS", "REMINDERS"].includes(event.type)
      ? event.createdById === actor.userId : actor.businessRole === "DIRECTOR");
  }
  if (!allowed) return null;
  return { resource: { kind: "workspace", id: target }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
}
export const workspacePolicies: ResourcePolicies = Object.freeze({
  "workspace.dashboard": loadWorkspaceContext, "workspace.businessUsers": loadWorkspaceContext,
  "workspace.contacts": loadWorkspaceContext, "workspace.masterData": loadWorkspaceContext,
  "workspace.calendar.view": loadWorkspaceContext, "workspace.calendar.create": loadWorkspaceContext,
  "workspace.calendar.delete": loadWorkspaceContext,
});

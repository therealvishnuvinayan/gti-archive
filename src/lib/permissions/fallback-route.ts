import { projectReadActor } from "@/lib/authorization/project-read-rules";
import { dashboardV2Enabled } from "@/lib/dashboard-v2/activation";
import type { PermissionUser } from "./resolver";

export function getAuthenticatedDefaultRoute(user: PermissionUser) {
  const actor = projectReadActor(user);
  if (!actor) return "/no-access";
  if (actor.businessRole && dashboardV2Enabled()) return "/";
  if (actor.businessRole === "DESIGNER" || actor.businessRole === "DIGITAL_LEAD") return "/tasks";
  if (actor.businessRole) return "/";
  return "/settings";
}
export function getRestrictedAreaFallbackRoute(user: PermissionUser) {
  return getAuthenticatedDefaultRoute(user);
}

import type { AuthenticatedPrincipal } from "../authorization/session";

// Shared by the original decision service and its read-only attention projection.
export function isConfiguredRuntimeReviewer(actor: AuthenticatedPrincipal, approver: string,
  project: { ownerId: string; participants: { role: string; userId: string }[] }, contributors: readonly (string | null)[]) {
  const eligible = approver === "DIRECTOR" ? actor.businessRole === "DIRECTOR"
    : approver === "SENIOR_PROJECT_MANAGER" ? actor.businessRole === "SENIOR_PROJECT_MANAGER"
    : approver === "PROJECT_OWNER" ? actor.userId === project.ownerId
    : project.participants.some(p => p.role === "CO_OWNER" && p.userId === actor.userId);
  return eligible && !contributors.includes(actor.userId);
}

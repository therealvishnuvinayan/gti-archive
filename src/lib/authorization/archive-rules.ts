import type { Prisma } from "@prisma/client";
import type { BusinessCapability } from "./definitions";
import { getBusinessRoleEligibility } from "./eligibility";
import { projectReadActor } from "./project-read-rules";
import type { AuthenticatedPrincipal } from "./session";

export type ArchiveCapability = Extract<BusinessCapability, `archive.${string}`>;
export type ArchiveScope = { actor: Pick<AuthenticatedPrincipal, "userId" | "businessRole">; level: "NONE" | "FULL" | "PARTIAL" };
export function archiveScopeForUser(user: object): ArchiveScope | null {
  const actor = projectReadActor(user);
  if (!actor) return null;
  return archiveScopeForActor(actor);
}
export function canArchive(user: object, capability: ArchiveCapability): boolean {
  const scope = archiveScopeForUser(user);
  return !!scope && scope.level !== "NONE" && getBusinessRoleEligibility(scope.actor.businessRole, capability).decision === "REQUIRES_AUTHORIZATION";
}
export function archiveAccessLevel(user: object): "NONE" | "FULL" | "PARTIAL" {
  return canArchive(user, "archive.view") ? archiveScopeForUser(user)!.level : "NONE";
}
export function archiveScopeForActor(actor: ArchiveScope["actor"]): ArchiveScope {
  // Confirmed Phase 1.5F scope: Director/SPM global; restricted roles use file
  // and category grants. Legacy global FULL profiles never establish V2 scope.
  return { actor, level: getBusinessRoleEligibility(actor.businessRole, "archive.view").decision === "DENY" ? "NONE" :
    actor.businessRole === "DIRECTOR" || actor.businessRole === "SENIOR_PROJECT_MANAGER" ? "FULL" : "PARTIAL" };
}
export function archiveCategoryWhere(scope: ArchiveScope | null, activeOnly = true): Prisma.ArchiveCategoryWhereInput {
  if (!scope || scope.level === "NONE" || getBusinessRoleEligibility(scope.actor.businessRole, "archive.view").decision === "DENY") return { id: { in: [] } };
  const active = activeOnly ? { isActive: true } : {};
  if (scope.level === "FULL") return active;
  return { ...active, OR: [{ allowedUsers: { none: {} } }, { allowedUsers: { some: { userId: scope.actor.userId } } }] };
}
export function archivedFileWhere(scope: ArchiveScope | null): Prisma.ArchivedProjectFileWhereInput {
  if (!scope || scope.level === "NONE" || getBusinessRoleEligibility(scope.actor.businessRole, "archive.view").decision === "DENY") return { id: { in: [] } };
  return { archive: { is: { archiveCategory: { is: archiveCategoryWhere(scope) } } },
    ...(scope.level === "PARTIAL" ? { userArchiveAccesses: { some: { userId: scope.actor.userId } } } : {}) };
}
export function manualArchiveFileWhere(scope: ArchiveScope | null): Prisma.ManualArchiveFileWhereInput {
  if (!scope || scope.level === "NONE" || getBusinessRoleEligibility(scope.actor.businessRole, "archive.view").decision === "DENY") return { id: { in: [] } };
  return { status: "READY", archiveCategory: { is: archiveCategoryWhere(scope) },
    ...(scope.level === "PARTIAL" ? { userArchiveAccesses: { some: { userId: scope.actor.userId } } } : {}) };
}

import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "./session";

// Object identity is established only by server authentication. Serialized or
// caller-created User objects do not acquire V2 read authority.
const identities = new WeakMap<object, AuthenticatedPrincipal>();
export function bindProjectReadIdentity<T extends object>(user: T, actor: AuthenticatedPrincipal): T {
  identities.set(user, actor);
  return user;
}
export function projectReadActor(user: object | null | undefined) {
  const actor = user ? identities.get(user) : undefined;
  return actor && actor.accountStatus === "ACTIVE" && Date.parse(actor.session.expiresAt) > Date.now() ? actor : null;
}
export function hasProjectBusinessIdentity(user: object | null | undefined) {
  return !!projectReadActor(user)?.businessRole;
}
export function isDirectorReader(user: object | null | undefined) {
  return projectReadActor(user)?.businessRole === "DIRECTOR";
}
export function isProjectManagerReader(user: object | null | undefined) {
  return ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(projectReadActor(user)?.businessRole ?? "");
}
type Relationships = { ownerId: string | null; coOwners?: readonly { userId: string }[];
  executors?: readonly { userId: string }[]; collaborators?: readonly { userId: string }[] };
export function canReadFullProject(user: object, project: Relationships) {
  const actor = projectReadActor(user);
  return !!actor && (actor.businessRole === "DIRECTOR" || (isProjectManagerReader(user) &&
    (project.ownerId === actor.userId || project.coOwners?.some((row) => row.userId === actor.userId) === true)));
}
export function structuredProjectReadWhere(actor: AuthenticatedPrincipal | null, full = false): Prisma.ProjectWhereInput {
  if (!actor?.businessRole) return { id: { in: [] } };
  if (actor.businessRole === "DIRECTOR") return {};
  if (full && !["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole)) return { id: { in: [] } };
  return { OR: [ { ownerId: actor.userId }, { coOwners: { some: { userId: actor.userId } } },
    ...(!full ? [ { executors: { some: { userId: actor.userId } } },
      { collaborators: { some: { userId: actor.userId } } },
      { conceptFolders: { some: { assignedExecutorId: actor.userId } } } ] : []) ] };
}
export function flexibleProjectReadWhere(actor: AuthenticatedPrincipal | null, full = false): Prisma.FlexibleProjectWhereInput {
  if (!actor?.businessRole) return { id: { in: [] } };
  if (actor.businessRole === "DIRECTOR") return {};
  if (full && !["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole)) return { id: { in: [] } };
  return { OR: [ { ownerId: actor.userId }, { collaborators: { some: { userId: actor.userId } } },
    ...(!full ? [{ milestones: { some: { responsibleUserId: actor.userId } } }] : []) ] };
}

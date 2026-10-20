import type { Prisma } from "@prisma/client";
import type { BusinessCapability } from "./definitions";
import { getBusinessRoleEligibility } from "./eligibility";
import { projectReadActor } from "./project-read-rules";
import type { AuthenticatedPrincipal } from "./session";

export type LibraryCapability = Extract<BusinessCapability, `library.${string}`>;
export const libraryAssetTypes = ["GENERAL_PROJECT_ASSET", "COMMENT_ATTACHMENT", "STAGE_SUBMISSION", "REVISION_ORIGINAL", "STAGE_INVOICE"] as const;

/** UI eligibility only. Services additionally resolve resources in the V2 engine. */
export function canLibrary(user: object, capability: LibraryCapability) {
  const actor = projectReadActor(user);
  return !!actor && getBusinessRoleEligibility(actor.businessRole, capability).decision === "REQUIRES_AUTHORIZATION";
}

export function manualLibraryWhere(actor: AuthenticatedPrincipal | null): Prisma.ManualLibraryAssetWhereInput {
  if (actor?.businessRole === "DIRECTOR") return { status: "READY" };
  if (actor && ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) {
    return { status: "READY", uploadedById: actor.userId };
  }
  // No manual Library grant/reference model exists. Archive ACLs never substitute.
  return { id: { in: [] } };
}

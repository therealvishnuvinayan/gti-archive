import type { User } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { runtimeAuthorization } from "@/lib/authorization/runtime";
import { runWorkspaceOperation } from "@/lib/authorization/workspace";
import { denyLegacyAdministration } from "@/lib/authorization/deferred-administration";
import { prisma } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
export const COLLABORATORS_CACHE_TAG = "collaborators";
export const CALENDAR_COLLABORATORS_CACHE_TAG = "calendar-collaborators";
export const COLLABORATION_REVALIDATE_TAGS = [COLLABORATORS_CACHE_TAG, CALENDAR_COLLABORATORS_CACHE_TAG, PROJECTS_CACHE_TAG];

export type CollaboratorRecord = {
  id: string;
  name: string;
  email: string;
};

export type CollaboratorInput = {
  name: string;
  email: string;
};

export type InviteRegistrationRecord =
  | {
      status: "valid";
      token: string;
      email: string;
      name: string;
    }
  | {
      status: "invalid" | "expired";
    };

type CollaboratorResult =
  | { error: string }
  | {
      collaborator: CollaboratorRecord;
      inviteEmailSent?: boolean;
      warning?: string;
      reusedExistingUser?: boolean;
    };

type DeleteCollaboratorResult =
  | { error: string }
  | { success: true };

function mapCollaborator(user: Pick<User, "id" | "email" | "name">): CollaboratorRecord {
  return { id: user.id, email: user.email, name: user.name?.trim() || user.email.split("@")[0] };
}
export async function getCollaborators(projectId?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  const query = async () => (await prisma.user.findMany({
    where: { authorization: { is: { accountStatus: "ACTIVE", businessRole: { not: null } } } },
    orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true },
  })).map(mapCollaborator);
  if (projectId) return runtimeAuthorization.runAuthorized({ capability: "project.view", targetId: `structured:${projectId}` }, async tx =>
    (await tx.user.findMany({ where: { authorization: { is: { accountStatus: "ACTIVE", businessRole: { not: null } } } },
      orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true } })).map(mapCollaborator));
  return runWorkspaceOperation(user, "workspace.businessUsers", "root", query);
}

export async function getCalendarCollaborators(): Promise<CollaboratorRecord[]> { return denyLegacyAdministration(); }
export async function updateCalendarCollaborators(collaboratorIds: string[], addedById: string): Promise<CollaboratorRecord[]> {
  void collaboratorIds; void addedById; return denyLegacyAdministration();
}
export async function removeCalendarCollaborator(collaboratorId: string): Promise<{ error: string; collaborators?: never } | { collaborators: CollaboratorRecord[]; error?: never }> {
  void collaboratorId; return denyLegacyAdministration();
}
export async function createCollaborator(inviterName: string, input: CollaboratorInput, options: { allowExistingUser?: boolean } = {}): Promise<CollaboratorResult> {
  void inviterName; void input; void options; return denyLegacyAdministration();
}
export async function updateCollaborator(collaboratorId: string, input: CollaboratorInput): Promise<CollaboratorResult> {
  void collaboratorId; void input; return denyLegacyAdministration();
}
export async function deleteCollaborator(collaboratorId: string): Promise<DeleteCollaboratorResult> {
  void collaboratorId; return denyLegacyAdministration();
}
export async function getInviteRegistration(token: string): Promise<InviteRegistrationRecord> {
  void token; return { status: "invalid" };
}
export async function acceptCollaboratorInvite(token: string, password: string, confirmPassword: string): Promise<{ error: string } | { email: string }> {
  void token; void password; void confirmPassword; return denyLegacyAdministration();
}

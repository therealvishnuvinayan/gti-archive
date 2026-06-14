import { CollaboratorType, UserRole } from "@prisma/client";

import type {
  CollaboratorTypeValue,
  PermissionRole,
} from "@/lib/permissions/definitions";
import {
  isProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export type ManagedUserStatus = "ACTIVE" | "INVITED" | "INVITE_EXPIRED";

export type ManagedUserRecord = {
  id: string;
  name: string;
  email: string;
  role: PermissionRole;
  collaboratorType: CollaboratorTypeValue;
  status: ManagedUserStatus;
};

export type ManagedUserUpdateInput = {
  userId: string;
  role: PermissionRole;
  collaboratorType: CollaboratorTypeValue;
};

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getManagedUserStatus(user: {
  inviteToken: string | null;
  inviteExpiresAt: Date | null;
  inviteAcceptedAt: Date | null;
}) {
  if (user.inviteAcceptedAt || !user.inviteToken) {
    return "ACTIVE" satisfies ManagedUserStatus;
  }

  if (user.inviteExpiresAt && user.inviteExpiresAt.getTime() < Date.now()) {
    return "INVITE_EXPIRED" satisfies ManagedUserStatus;
  }

  return "INVITED" satisfies ManagedUserStatus;
}

function mapManagedUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  collaboratorType: CollaboratorType;
  inviteToken: string | null;
  inviteExpiresAt: Date | null;
  inviteAcceptedAt: Date | null;
}): ManagedUserRecord {
  return {
    id: user.id,
    name: user.name?.trim() || getFallbackName(user.email),
    email: user.email,
    role: user.role,
    collaboratorType: user.collaboratorType,
    status: getManagedUserStatus(user),
  };
}

export async function listUsersForPermissionManagement() {
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      orderBy: [
        { role: "asc" },
        { name: "asc" },
        { email: "asc" },
      ],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        collaboratorType: true,
        inviteToken: true,
        inviteExpiresAt: true,
        inviteAcceptedAt: true,
      },
    }),
  );

  return users.map(mapManagedUser);
}

export async function getManagedUserPermissionRecord(userId: string) {
  const user = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        collaboratorType: true,
        inviteToken: true,
        inviteExpiresAt: true,
        inviteAcceptedAt: true,
      },
    }),
  );

  return user ? mapManagedUser(user) : null;
}

export async function countSuperAdmins() {
  return withPrismaRetry(() =>
    prisma.user.count({
      where: {
        role: UserRole.SUPER_ADMIN,
      },
    }),
  );
}

export async function updateManagedUserPermissions(
  input: ManagedUserUpdateInput,
) {
  if (!isProjectCollaboratorParticipantType(input.collaboratorType)) {
    throw new Error("Choose a valid collaborator type.");
  }

  const updatedUser = await withPrismaRetry(() =>
    prisma.user.update({
      where: {
        id: input.userId,
      },
      data: {
        role: input.role,
        collaboratorType: input.collaboratorType as CollaboratorType,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        collaboratorType: true,
        inviteToken: true,
        inviteExpiresAt: true,
        inviteAcceptedAt: true,
      },
    }),
  );

  return mapManagedUser(updatedUser);
}

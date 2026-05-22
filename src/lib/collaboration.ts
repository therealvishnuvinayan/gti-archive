import { randomUUID } from "node:crypto";

import {
  CollaboratorAccess as PrismaCollaboratorAccess,
  CollaboratorType as PrismaCollaboratorType,
  UserRole,
  type User,
} from "@prisma/client";

import { hashAuthPassword, normalizeAuthEmail } from "@/lib/auth";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export type AccessArea = "project" | "calendar" | "library" | "archive";
export type PermissionLevel = "full" | "limited" | "none";
export type CollaboratorType = "Internal" | "External";

export type CollaboratorRecord = {
  id: string;
  name: string;
  email: string;
  type: CollaboratorType;
  permissions: Record<AccessArea, PermissionLevel>;
};

export type CollaboratorInput = {
  name: string;
  email: string;
  type: CollaboratorType;
  permissions: Record<AccessArea, PermissionLevel>;
};

type CollaboratorResult = { error: string } | { collaborator: CollaboratorRecord };
type CollaboratorValidationResult =
  | { error: string }
  | {
      data: {
        name: string;
        email: string;
        type: PrismaCollaboratorType;
        projectAccess: PrismaCollaboratorAccess;
        calendarAccess: PrismaCollaboratorAccess;
        libraryAccess: PrismaCollaboratorAccess;
        archiveAccess: PrismaCollaboratorAccess;
      };
    };

const permissionMap: Record<PermissionLevel, PrismaCollaboratorAccess> = {
  full: "FULL",
  limited: "LIMITED",
  none: "NONE",
};

const reversePermissionMap: Record<PrismaCollaboratorAccess, PermissionLevel> = {
  FULL: "full",
  LIMITED: "limited",
  NONE: "none",
};

const collaboratorTypeMap: Record<CollaboratorType, PrismaCollaboratorType> = {
  Internal: "INTERNAL",
  External: "EXTERNAL",
};

const reverseCollaboratorTypeMap: Record<PrismaCollaboratorType, CollaboratorType> = {
  INTERNAL: "Internal",
  EXTERNAL: "External",
};

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function mapCollaborator(user: Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "collaboratorType"
  | "projectAccess"
  | "calendarAccess"
  | "libraryAccess"
  | "archiveAccess"
>): CollaboratorRecord {
  return {
    id: user.id,
    name: user.name?.trim() || getFallbackName(user.email),
    email: user.email,
    type: reverseCollaboratorTypeMap[user.collaboratorType],
    permissions: {
      project: reversePermissionMap[user.projectAccess],
      calendar: reversePermissionMap[user.calendarAccess],
      library: reversePermissionMap[user.libraryAccess],
      archive: reversePermissionMap[user.archiveAccess],
    },
  };
}

function validateCollaboratorInput(
  input: CollaboratorInput,
): CollaboratorValidationResult {
  const name = input.name.trim();
  const email = normalizeAuthEmail(input.email);

  if (!name) {
    return { error: "Enter the collaborator name." };
  }

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid collaborator email." };
  }

  if (!(input.type in collaboratorTypeMap)) {
    return { error: "Choose a valid collaborator type." };
  }

  return {
    data: {
      name,
      email,
      type: collaboratorTypeMap[input.type],
      projectAccess: permissionMap[input.permissions.project],
      calendarAccess: permissionMap[input.permissions.calendar],
      libraryAccess: permissionMap[input.permissions.library],
      archiveAccess: permissionMap[input.permissions.archive],
    },
  };
}

export async function getCollaborators() {
  const collaborators = await withPrismaRetry(() =>
    prisma.user.findMany({
      where: {
        role: UserRole.COLLABORATOR,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        email: true,
        name: true,
        collaboratorType: true,
        projectAccess: true,
        calendarAccess: true,
        libraryAccess: true,
        archiveAccess: true,
      },
    }),
  );

  return collaborators.map(mapCollaborator);
}

export async function createCollaborator(
  input: CollaboratorInput,
): Promise<CollaboratorResult> {
  const parsed = validateCollaboratorInput(input);

  if ("error" in parsed) {
    return parsed;
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsed.data.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return { error: "A user with this email already exists." };
  }

  const collaborator = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: UserRole.COLLABORATOR,
      collaboratorType: parsed.data.type,
      projectAccess: parsed.data.projectAccess,
      calendarAccess: parsed.data.calendarAccess,
      libraryAccess: parsed.data.libraryAccess,
      archiveAccess: parsed.data.archiveAccess,
      passwordHash: hashAuthPassword(randomUUID()),
    },
    select: {
      id: true,
      email: true,
      name: true,
      collaboratorType: true,
      projectAccess: true,
      calendarAccess: true,
      libraryAccess: true,
      archiveAccess: true,
    },
  });

  return { collaborator: mapCollaborator(collaborator) };
}

export async function updateCollaborator(
  collaboratorId: string,
  input: CollaboratorInput,
): Promise<CollaboratorResult> {
  const parsed = validateCollaboratorInput(input);

  if ("error" in parsed) {
    return parsed;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      NOT: {
        id: collaboratorId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return { error: "A user with this email already exists." };
  }

  const collaborator = await prisma.user.findUnique({
    where: {
      id: collaboratorId,
    },
    select: {
      id: true,
    },
  });

  if (!collaborator) {
    return { error: "This collaborator could not be found." };
  }

  const updatedCollaborator = await prisma.user.update({
    where: {
      id: collaboratorId,
    },
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: UserRole.COLLABORATOR,
      collaboratorType: parsed.data.type,
      projectAccess: parsed.data.projectAccess,
      calendarAccess: parsed.data.calendarAccess,
      libraryAccess: parsed.data.libraryAccess,
      archiveAccess: parsed.data.archiveAccess,
    },
    select: {
      id: true,
      email: true,
      name: true,
      collaboratorType: true,
      projectAccess: true,
      calendarAccess: true,
      libraryAccess: true,
      archiveAccess: true,
    },
  });

  return { collaborator: mapCollaborator(updatedCollaborator) };
}

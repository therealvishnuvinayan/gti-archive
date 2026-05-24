import { unstable_cache } from "next/cache";
import { randomBytes, randomUUID } from "node:crypto";

import {
  CollaboratorAccess as PrismaCollaboratorAccess,
  CollaboratorType as PrismaCollaboratorType,
  UserRole,
  type User,
} from "@prisma/client";

import { hashAuthPassword, normalizeAuthEmail } from "@/lib/auth";
import { buildCollaboratorInviteEmail } from "@/lib/email/collaborator-invite";
import { sendResendEmail } from "@/lib/email/resend";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const COLLABORATORS_CACHE_TAG = "collaborators";
export const CALENDAR_COLLABORATORS_CACHE_TAG = "calendar-collaborators";

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
  | { collaborator: CollaboratorRecord; inviteEmailSent?: boolean; warning?: string };

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

const INVITE_EXPIRY_DAYS = 7;
const MIN_PASSWORD_LENGTH = 8;

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

function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function buildInviteUrl(token: string) {
  return `${getAppUrl()}/register/${token}`;
}

function getInviteExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
  return expiresAt;
}

function createInviteToken() {
  return randomBytes(32).toString("hex");
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
  const collaborators = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
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
      ),
    ["collaborators"],
    { revalidate: 20, tags: [COLLABORATORS_CACHE_TAG] },
  )();

  return collaborators.map(mapCollaborator);
}

export async function getCalendarCollaborators() {
  const collaborators = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.calendarCollaborator.findMany({
          orderBy: {
            createdAt: "asc",
          },
          select: {
            user: {
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
            },
          },
        }),
      ),
    ["calendar-collaborators"],
    { revalidate: 20, tags: [CALENDAR_COLLABORATORS_CACHE_TAG] },
  )();

  return collaborators.map((item) => mapCollaborator(item.user));
}

export async function updateCalendarCollaborators(
  collaboratorIds: string[],
  addedById: string,
) {
  const normalizedIds = [...new Set(collaboratorIds.filter(Boolean))];

  const validCollaborators = normalizedIds.length
    ? await withPrismaRetry(() =>
        prisma.user.findMany({
          where: {
            id: {
              in: normalizedIds,
            },
            role: UserRole.COLLABORATOR,
          },
          select: {
            id: true,
          },
        }),
      )
    : [];

  const validIds = validCollaborators.map((collaborator) => collaborator.id);

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.calendarCollaborator.deleteMany({
        where: {
          userId: {
            notIn: validIds,
          },
        },
      }),
      ...(validIds.length > 0
        ? [
            prisma.calendarCollaborator.createMany({
              data: validIds.map((userId) => ({
                userId,
                addedById,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]),
  );

  return getCalendarCollaborators();
}

export async function createCollaborator(
  inviterName: string,
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

  const inviteToken = createInviteToken();
  const inviteExpiresAt = getInviteExpiryDate();

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
      inviteToken,
      inviteExpiresAt,
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

  const inviteEmail = buildCollaboratorInviteEmail({
    collaboratorName: collaborator.name?.trim() || getFallbackName(collaborator.email),
    collaboratorEmail: collaborator.email,
    inviterName,
    inviteUrl: buildInviteUrl(inviteToken),
    collaboratorType: input.type,
    permissions: input.permissions,
  });

  const emailResult = await sendResendEmail({
    to: collaborator.email,
    subject: inviteEmail.subject,
    html: inviteEmail.html,
    text: inviteEmail.text,
  });

  if (!emailResult.ok) {
    return {
      collaborator: mapCollaborator(collaborator),
      inviteEmailSent: false,
      warning: emailResult.error,
    };
  }

  return {
    collaborator: mapCollaborator(collaborator),
    inviteEmailSent: true,
  };
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

export async function getInviteRegistration(
  token: string,
): Promise<InviteRegistrationRecord> {
  const inviteToken = token.trim();

  if (!inviteToken) {
    return { status: "invalid" };
  }

  const collaborator = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: {
        inviteToken,
      },
      select: {
        email: true,
        name: true,
        inviteExpiresAt: true,
      },
    }),
  );

  if (!collaborator) {
    return { status: "invalid" };
  }

  if (!collaborator.inviteExpiresAt || collaborator.inviteExpiresAt < new Date()) {
    return { status: "expired" };
  }

  return {
    status: "valid",
    token: inviteToken,
    email: collaborator.email,
    name: collaborator.name?.trim() || getFallbackName(collaborator.email),
  };
}

export async function acceptCollaboratorInvite(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<{ error: string } | { email: string }> {
  const invite = await getInviteRegistration(token);

  if (invite.status !== "valid") {
    return invite.status === "expired"
      ? {
          error: "This invitation link has expired. Ask your administrator for a new invite.",
        }
      : { error: "This invitation link is invalid." };
  }

  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  if (password !== confirmPassword) {
    return { error: "Password and confirmation password must match." };
  }

  const updatedUser = await prisma.user.update({
    where: {
      inviteToken: invite.token,
    },
    data: {
      passwordHash: hashAuthPassword(password),
      inviteAcceptedAt: new Date(),
      inviteToken: null,
      inviteExpiresAt: null,
    },
    select: {
      email: true,
    },
  });

  return { email: updatedUser.email };
}

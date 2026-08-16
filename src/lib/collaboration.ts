import { unstable_cache } from "next/cache";
import { randomBytes, randomUUID } from "node:crypto";

import { UserRole, type User } from "@prisma/client";

import { hashAuthPassword, normalizeAuthEmail } from "@/lib/auth";
import { buildCollaboratorInviteEmail } from "@/lib/email/collaborator-invite";
import { sendResendEmail } from "@/lib/email/resend";
import { getPasswordValidationMessage } from "@/lib/password-rules";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export const COLLABORATORS_CACHE_TAG = "collaborators";
export const CALENDAR_COLLABORATORS_CACHE_TAG = "calendar-collaborators";

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

type CollaboratorValidationResult =
  | { error: string }
  | {
      data: {
        name: string;
        email: string;
      };
    };

const INVITE_EXPIRY_DAYS = 7;

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
>): CollaboratorRecord {
  return {
    id: user.id,
    name: user.name?.trim() || getFallbackName(user.email),
    email: user.email,
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

  return {
    data: {
      name,
      email,
    },
  };
}

export async function getCollaborators() {
  const collaborators = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.user.findMany({
          where: {
            role: UserRole.USER,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            email: true,
            name: true,
          },
        }),
      ),
    ["collaborators"],
    { revalidate: 20, tags: [COLLABORATORS_CACHE_TAG] },
  )();

  return collaborators.map(mapCollaborator);
}

async function listCalendarCollaborators() {
  const collaborators = await withPrismaRetry(() =>
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
          },
        },
      },
    }),
  );

  return collaborators.map((item) => mapCollaborator(item.user));
}

export async function getCalendarCollaborators() {
  const collaborators = await unstable_cache(
    async () => listCalendarCollaborators(),
    ["calendar-collaborators"],
    { revalidate: 20, tags: [CALENDAR_COLLABORATORS_CACHE_TAG] },
  )();

  return collaborators;
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
            role: UserRole.USER,
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

  return listCalendarCollaborators();
}

export async function removeCalendarCollaborator(collaboratorId: string) {
  const normalizedId = collaboratorId.trim();

  if (!normalizedId) {
    return { error: "Collaborator id is missing." } as const;
  }

  await withPrismaRetry(() =>
    prisma.calendarCollaborator.deleteMany({
      where: {
        userId: normalizedId,
      },
    }),
  );

  return { collaborators: await listCalendarCollaborators() } as const;
}

export async function createCollaborator(
  inviterName: string,
  input: CollaboratorInput,
  options: { allowExistingUser?: boolean } = {},
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
      email: true,
      name: true,
    },
  });

  if (existingUser) {
    if (options.allowExistingUser) {
      return {
        collaborator: mapCollaborator(existingUser),
        reusedExistingUser: true,
      };
    }

    return { error: "A user with this email already exists." };
  }

  const inviteToken = createInviteToken();
  const inviteExpiresAt = getInviteExpiryDate();

  const collaborator = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: UserRole.USER,
      passwordHash: hashAuthPassword(randomUUID()),
      inviteToken,
      inviteExpiresAt,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  const inviteEmail = buildCollaboratorInviteEmail({
    collaboratorName: collaborator.name?.trim() || getFallbackName(collaborator.email),
    collaboratorEmail: collaborator.email,
    inviterName,
    inviteUrl: buildInviteUrl(inviteToken),
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
      role: true,
    },
  });

  if (!collaborator || collaborator.role !== UserRole.USER) {
    return { error: "This collaborator could not be found." };
  }

  const updatedCollaborator = await prisma.user.update({
    where: {
      id: collaboratorId,
    },
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: UserRole.USER,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return { collaborator: mapCollaborator(updatedCollaborator) };
}

export async function deleteCollaborator(
  collaboratorId: string,
): Promise<DeleteCollaboratorResult> {
  const normalizedId = collaboratorId.trim();

  if (!normalizedId) {
    return { error: "Collaborator id is missing." };
  }

  return withPrismaRetry(async () => {
    const collaborator = await prisma.user.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        role: true,
        _count: {
          select: {
            projects: true,
            revisions: true,
            comments: true,
            comparisonComments: true,
            attachments: true,
            activityLogs: true,
            createdCollaboratorVisibilityPauses: true,
          },
        },
      },
    });

    if (!collaborator || collaborator.role !== UserRole.USER) {
      return { error: "Collaborator not found." };
    }

    const hasBlockingReferences =
      collaborator._count.projects > 0 ||
      collaborator._count.revisions > 0 ||
      collaborator._count.comments > 0 ||
      collaborator._count.comparisonComments > 0 ||
      collaborator._count.attachments > 0 ||
      collaborator._count.activityLogs > 0 ||
      collaborator._count.createdCollaboratorVisibilityPauses > 0;

    if (hasBlockingReferences) {
      return {
        error:
          "This collaborator cannot be deleted because they are referenced by existing project history. Remove their access instead.",
      };
    }

    await prisma.user.delete({
      where: { id: normalizedId },
    });

    return { success: true };
  });
}

export const COLLABORATION_REVALIDATE_TAGS = [
  COLLABORATORS_CACHE_TAG,
  CALENDAR_COLLABORATORS_CACHE_TAG,
  PROJECTS_CACHE_TAG,
] as const;

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

  const passwordValidationMessage = getPasswordValidationMessage(password);

  if (passwordValidationMessage) {
    return { error: passwordValidationMessage };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
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

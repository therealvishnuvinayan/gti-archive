"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";

import {
  hashAuthPassword,
  requireUser,
  SESSION_COOKIE_NAME,
  verifyAuthPassword,
} from "@/lib/auth";
import { getPasswordValidationMessage } from "@/lib/password-rules";
import { requirePermission } from "@/lib/permissions/require";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { buildUserAvatarPrefix, deleteObjectIfNeeded } from "@/lib/storage/s3";

type UpdateProfileInput = {
  name: string;
  department?: string;
  phoneNumber?: string;
  jobTitle?: string;
  bio?: string;
  avatarUrl?: string | null;
};

export type UpdateProfileResult = {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    name?: string;
    bio?: string;
  };
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type ChangePasswordResult = {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  };
};

function normalizeProfileInput(input: UpdateProfileInput) {
  return {
    name: input.name.trim(),
    department: input.department?.trim() || null,
    phoneNumber: input.phoneNumber?.trim() || null,
    jobTitle: input.jobTitle?.trim() || null,
    bio: input.bio?.trim() || null,
    avatarUrl: input.avatarUrl?.trim() || null,
  };
}

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const user = await requireUser();
  requirePermission(user, "settings.updateOwnProfile", "You do not have permission to update your profile.");
  const parsed = normalizeProfileInput(input);

  if (!parsed.name) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        name: "Full name is required.",
      },
    };
  }

  if (parsed.bio && parsed.bio.length > 300) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        bio: "Short bio must be 300 characters or fewer.",
      },
    };
  }

  const hasSubmittedNewAvatar =
    Boolean(parsed.avatarUrl) && parsed.avatarUrl !== user.avatarUrl;

  if (hasSubmittedNewAvatar) {
    const allowedAvatarPrefix = buildUserAvatarPrefix(user.id);

    if (
      !parsed.avatarUrl?.startsWith(allowedAvatarPrefix) ||
      parsed.avatarUrl.length <= allowedAvatarPrefix.length
    ) {
      return {
        error: "Invalid profile photo. Please upload the photo again.",
      };
    }
  }

  await withPrismaRetry(() =>
    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        name: parsed.name,
        department: parsed.department,
        phoneNumber: parsed.phoneNumber,
        jobTitle: parsed.jobTitle,
        bio: parsed.bio,
        avatarUrl: parsed.avatarUrl ?? user.avatarUrl ?? null,
      },
    }),
  );

  if (parsed.avatarUrl && user.avatarUrl && parsed.avatarUrl !== user.avatarUrl) {
    await deleteObjectIfNeeded(user.avatarUrl).catch(() => undefined);
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    revalidateTag(`session:${sessionToken}`, "max");
  }

  revalidatePath("/settings");

  return {
    success: true,
  };
}

function normalizePasswordInput(input: ChangePasswordInput) {
  return {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    confirmNewPassword: input.confirmNewPassword,
  };
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const sessionUser = await requireUser();
  requirePermission(
    sessionUser,
    "settings.changeOwnPassword",
    "You do not have permission to change your password.",
  );
  const parsed = normalizePasswordInput(input);

  const fieldErrors: ChangePasswordResult["fieldErrors"] = {};

  if (!parsed.currentPassword.trim()) {
    fieldErrors.currentPassword = "Current password is required.";
  }

  if (!parsed.newPassword.trim()) {
    fieldErrors.newPassword = "New password is required.";
  }

  if (!parsed.confirmNewPassword.trim()) {
    fieldErrors.confirmNewPassword = "Confirm new password is required.";
  }

  if (fieldErrors.currentPassword || fieldErrors.newPassword || fieldErrors.confirmNewPassword) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  if (parsed.newPassword !== parsed.confirmNewPassword) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        confirmNewPassword: "Passwords do not match.",
      },
    };
  }

  if (parsed.currentPassword === parsed.newPassword) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        newPassword: "New password must be different from current password.",
      },
    };
  }

  const passwordValidationMessage = getPasswordValidationMessage(parsed.newPassword);

  if (passwordValidationMessage) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        newPassword: passwordValidationMessage,
      },
    };
  }

  const user = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: {
        id: sessionUser.id,
      },
      select: {
        id: true,
        passwordHash: true,
      },
    }),
  );

  if (!user) {
    return {
      error: "Unauthorized.",
    };
  }

  if (!verifyAuthPassword(parsed.currentPassword, user.passwordHash)) {
    return {
      error: "Current password is incorrect.",
      fieldErrors: {
        currentPassword: "Current password is incorrect.",
      },
    };
  }

  await withPrismaRetry(() =>
    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: hashAuthPassword(parsed.newPassword),
        passwordChangedAt: new Date(),
      },
    }),
  );

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    revalidateTag(`session:${sessionToken}`, "max");
  }

  revalidatePath("/settings");

  return {
    success: true,
  };
}

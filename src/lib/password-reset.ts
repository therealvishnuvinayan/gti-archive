import { createHash, randomBytes } from "node:crypto";

import { hashAuthPassword, normalizeAuthEmail } from "@/lib/auth";
import { buildPasswordResetEmail } from "@/lib/email/password-reset";
import { sendResendEmail } from "@/lib/email/resend";
import { getPasswordValidationMessage } from "@/lib/password-rules";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MINUTES = 60;

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "If this email exists, a reset link has been sent.";

export type ResetPasswordResult = {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    password?: string;
    confirmPassword?: string;
  };
};

function getAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function createResetToken() {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getResetTokenExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);
  return expiresAt;
}

function buildResetUrl(token: string) {
  return `${getAppUrl()}/reset-password/${token}`;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { success: true, message: PASSWORD_RESET_SUCCESS_MESSAGE };
  }

  const user = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    }),
  );

  if (!user) {
    return { success: true, message: PASSWORD_RESET_SUCCESS_MESSAGE };
  }

  const token = createResetToken();
  const tokenHash = hashResetToken(token);

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: getResetTokenExpiryDate(),
        },
      }),
    ]),
  );

  const emailPayload = buildPasswordResetEmail({
    userName: user.name?.trim() || user.email,
    resetUrl: buildResetUrl(token),
  });

  await sendResendEmail({
    to: user.email,
    subject: emailPayload.subject,
    html: emailPayload.html,
    text: emailPayload.text,
  }).catch(() => undefined);

  return { success: true, message: PASSWORD_RESET_SUCCESS_MESSAGE };
}

export async function isPasswordResetTokenValid(token: string) {
  const tokenHash = hashResetToken(token.trim());

  if (!tokenHash) {
    return false;
  }

  const resetToken = await withPrismaRetry(() =>
    prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    }),
  );

  return Boolean(resetToken);
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<ResetPasswordResult> {
  const fieldErrors: ResetPasswordResult["fieldErrors"] = {};

  if (!password.trim()) {
    fieldErrors.password = "Password is required.";
  }

  if (!confirmPassword.trim()) {
    fieldErrors.confirmPassword = "Confirm password is required.";
  }

  if (fieldErrors.password || fieldErrors.confirmPassword) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  if (password !== confirmPassword) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        confirmPassword: "Passwords do not match.",
      },
    };
  }

  const passwordValidationMessage = getPasswordValidationMessage(password);

  if (passwordValidationMessage) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        password: passwordValidationMessage,
      },
    };
  }

  const tokenHash = hashResetToken(token.trim());
  const now = new Date();

  const resetToken = await withPrismaRetry(() =>
    prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    }),
  );

  if (!resetToken) {
    return {
      error: "This password reset link is invalid or has expired.",
    };
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          passwordHash: hashAuthPassword(password),
          passwordChangedAt: now,
        },
      }),
      prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: now,
        },
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          id: {
            not: resetToken.id,
          },
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      }),
    ]),
  );

  return { success: true };
}

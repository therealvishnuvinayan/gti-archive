"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";

import { requireUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { deleteObjectIfNeeded } from "@/lib/storage/s3";

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

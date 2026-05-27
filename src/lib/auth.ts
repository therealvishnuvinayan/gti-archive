import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { revalidateTag, unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "gti_session";

const DEFAULT_SESSION_DAYS = 1;
const REMEMBER_ME_SESSION_DAYS = 30;
const SESSION_CACHE_TTL_SECONDS = 10;

function getSessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeAuthEmail(email: string) {
  return normalizeEmail(email);
}

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function hashAuthPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const storedBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, 64);

  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedBuffer);
}

export function verifyAuthPassword(password: string, storedHash: string) {
  return verifyPassword(password, storedHash);
}

function validateCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new AuthError("Enter a valid email address.");
  }

  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  return normalizedEmail;
}

async function createSession(userId: string, rememberMe: boolean) {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() +
      (rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS),
  );

  const session = await withPrismaRetry(() =>
    prisma.session.create({
      data: {
        token: `${randomUUID()}-${randomBytes(16).toString("hex")}`,
        userId,
        expiresAt,
      },
    }),
  );

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    session.token,
    getSessionCookieOptions(session.expiresAt),
  );
}

function getSessionCacheTag(token: string) {
  return `session:${token}`;
}

async function getCachedSessionUser(sessionToken: string) {
  const getCachedSession = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.session.findUnique({
          where: {
            token: sessionToken,
          },
          include: {
            user: true,
          },
        }),
      ),
    ["session-user", sessionToken],
    {
      revalidate: SESSION_CACHE_TTL_SECONDS,
      tags: [getSessionCacheTag(sessionToken)],
    },
  );

  return getCachedSession();
}

export async function signInUser(options: {
  email: string;
  password: string;
  rememberMe: boolean;
}) {
  const normalizedEmail = validateCredentials(options.email, options.password);
  const user = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: { email: normalizedEmail },
    }),
  );

  if (!user || !verifyAuthPassword(options.password, user.passwordHash)) {
    throw new AuthError("Invalid email or password.");
  }

  await withPrismaRetry(() =>
    prisma.session.deleteMany({
      where: {
        userId: user.id,
        expiresAt: {
          lt: new Date(),
        },
      },
    }),
  );

  await createSession(user.id, options.rememberMe);

  return user;
}

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await getCachedSessionUser(sessionToken);

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session.user;
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

export async function signOutCurrentSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await withPrismaRetry(() =>
      prisma.session.deleteMany({
        where: {
          token: sessionToken,
        },
      }),
    );
    revalidateTag(getSessionCacheTag(sessionToken), "max");
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export function getExpiredSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: {
      ...getSessionCookieOptions(new Date(0)),
      maxAge: 0,
    },
  };
}

export function getUserDisplayName(user: Pick<User, "name" | "email">) {
  return user.name?.trim() || getFallbackName(user.email);
}

export function getUserInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "GU";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

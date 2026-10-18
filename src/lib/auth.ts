import "server-only";

import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  normalizeAuthEmail,
  verifyAuthPassword,
} from "@/lib/auth-password";
import { bindProjectReadIdentity } from "@/lib/authorization/project-read-rules";
import { createVersionedSessionToken, resolveAuthenticatedSession } from "@/lib/authorization/session";
import { getPermissionProfileSnapshotForUser } from "@/lib/permissions/profiles";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export {
hashAuthPassword,
normalizeAuthEmail,
verifyAuthPassword
} from "@/lib/auth-password";

export const SESSION_COOKIE_NAME = "gti_session";

const DEFAULT_SESSION_DAYS = 1;
const REMEMBER_ME_SESSION_DAYS = 30;

function logAuthTiming(label: string, startedAt: number) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[projects:list] ${label}`, {
    ms: Math.round(performance.now() - startedAt),
  });
}

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

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function validateCredentials(email: string, password: string) {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new AuthError("Enter a valid email address.");
  }

  if (!password.trim()) {
    throw new AuthError("Password is required.");
  }

  return normalizedEmail;
}

async function createSession(userId: string, rememberMe: boolean) {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() +
      (rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS),
  );

  const session = await prisma.$transaction(async (tx) => {
    // Serialize issuance with V2 assignment writes, including first assignment.
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`LOCK TABLE "UserAuthorization" IN SHARE MODE`;
    const authorization = await tx.userAuthorization.findUnique({ where: { userId } });
    if (authorization && authorization.accountStatus !== "ACTIVE") {
      throw new AuthError("This account is unavailable. Contact an administrator.");
    }
    return tx.session.create({ data: {
      token: createVersionedSessionToken(authorization?.authorizationVersion ?? null),
      userId, expiresAt,
    } });
  });

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    session.token,
    getSessionCookieOptions(session.expiresAt),
  );
}

export async function readCurrentSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

async function getCurrentSession() {
  const token = await readCurrentSessionToken();
  return withPrismaRetry(() => resolveAuthenticatedSession(prisma, token));
}

/** Server-only V2 identity. Do not serialize the principal into client props. */
export async function getCurrentActor() {
  return (await getCurrentSession())?.principal ?? null;
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

export async function getCurrentUser() {
  const startedAt = performance.now();
  const sessionStartedAt = performance.now();
  const session = await getCurrentSession();
  logAuthTiming("auth/session lookup", sessionStartedAt);

  if (!session) {
    return null;
  }

  const permissionSnapshotStartedAt = performance.now();
  const permissionProfileSnapshot = await getPermissionProfileSnapshotForUser(
    session.user,
  );
  logAuthTiming("permission snapshot", permissionSnapshotStartedAt);
  logAuthTiming("auth total", startedAt);

  return bindProjectReadIdentity({
    ...session.user,
    permissionProfileSnapshot,
  }, session.principal);
}

export async function requireUser(returnTo?: string) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in");
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

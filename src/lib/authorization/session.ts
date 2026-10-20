import "server-only";

import { randomBytes } from "node:crypto";
import type { PrismaClient, UserAuthorization } from "@prisma/client";
import { isBusinessRole, isTechnicalPrivilege, type BusinessRole, type TechnicalPrivilege } from "./definitions";

export type AuthenticatedPrincipal = Readonly<{
  userId: string;
  identity: Readonly<{ email: string; name: string | null }>;
  businessRole: BusinessRole | null;
  technicalPrivileges: readonly TechnicalPrivilege[];
  accountStatus: "ACTIVE" | "UNASSIGNED";
  authorizationVersion: number | null;
  session: Readonly<{ id: string; expiresAt: string }>;
}>;

/** Persist the issuance version inside the existing opaque Session.token column.
 * Only an exact DB token match can authenticate it; the browser cannot choose a
 * version or supply authority. The random suffix supplies 256 bits of entropy.
 * Unversioned sessions deliberately require login again, never a silent upgrade.
 */
export function createVersionedSessionToken(version: number | null): string {
  if (version !== null && (!Number.isInteger(version) || version < 1 || version > 2_147_483_647)) {
    throw new Error("INVALID_AUTHORIZATION_VERSION");
  }
  return `v2.${version ?? "unassigned"}.${randomBytes(32).toString("hex")}`;
}

export function sessionMatchesAuthorization(
  storedToken: string,
  authorization: Pick<UserAuthorization, "accountStatus" | "authorizationVersion"> | null,
): boolean {
  if (authorization && authorization.accountStatus !== "ACTIVE") return false;
  const match = /^v2\.(unassigned|[1-9][0-9]{0,9})\.[a-f0-9]{64}$/.exec(storedToken);
  return !!match && match[1] === String(authorization?.authorizationVersion ?? "unassigned");
}

/** No React/Next cache: revocation, status and version are checked on every call.
 * A single joined query prevents mixing session and assignment snapshots.
 * This is server composition, never a server action accepting a token argument.
 */
export async function resolveAuthenticatedSession(
  database: Pick<PrismaClient, "session">,
  token: string | null,
) {
  if (!token || token.length > 256) return null;
  const session = await database.session.findUnique({
    relationLoadStrategy: "join",
    where: { token },
    include: { user: { include: { authorization: true }, omit: { passwordHash: true, inviteToken: true } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const { authorization, ...user } = session.user;
  if (!sessionMatchesAuthorization(session.token, authorization)) return null;
  if (authorization && (
    (authorization.businessRole !== null && !isBusinessRole(authorization.businessRole)) ||
    !authorization.technicalPrivileges.every(isTechnicalPrivilege)
  )) return null;

  const principal: AuthenticatedPrincipal = Object.freeze({
    userId: user.id,
    identity: Object.freeze({ email: user.email, name: user.name }),
    businessRole: authorization?.businessRole ?? null,
    technicalPrivileges: Object.freeze([...(authorization?.technicalPrivileges ?? [])]),
    accountStatus: authorization ? "ACTIVE" : "UNASSIGNED",
    authorizationVersion: authorization?.authorizationVersion ?? null,
    session: Object.freeze({ id: session.id, expiresAt: session.expiresAt.toISOString() }),
  });
  return { principal, user };
}

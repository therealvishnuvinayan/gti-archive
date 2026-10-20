import "server-only";

import { createPublicKey, verify } from "node:crypto";
import {
  AuthorizationMutationError, changeReason, expectedVersion, identifier, inputRecord, requireCondition,
  runAssignmentTransaction, type AssignmentDatabase,
} from "./assignment-transaction";

type SetupOptions = {
  database: AssignmentDatabase;
  trustedPublicKeyPem: string;
  audience: string;
};

export function createDirectorBootstrapInvoker(options: SetupOptions) {
  return createSetupInvoker(options, "BOOTSTRAP_DIRECTOR");
}

// Initial independent technical provisioning must also have an explicit trust
// path. Never usable for recovery: ANY prior technical grant closes this path.
export function createInitialTechnicalAdministratorInvoker(options: SetupOptions) {
  return createSetupInvoker(options, "INITIAL_TECHNICAL_ADMIN");
}

/**
 * Controlled invocation mechanism, deliberately separate from session services.
 * The independently authorized setup system signs the EXACT UTF-8 payload with
 * Ed25519 after authenticating the operator and approving this target/database.
 * This module has no signing key, default trust configuration or public endpoint.
 */
function createSetupInvoker(options: SetupOptions, operation: "BOOTSTRAP_DIRECTOR" | "INITIAL_TECHNICAL_ADMIN") {
  const publicKey = createPublicKey(options.trustedPublicKeyPem);
  requireCondition(publicKey.asymmetricKeyType === "ed25519", "INVALID_SETUP_KEY");
  const audience = identifier(options.audience);
  const database = options.database;

  return async function invokeSetup(raw: unknown) {
    const envelope = inputRecord(raw, ["payload", "signature"]);
    requireCondition(typeof envelope.payload === "string" && envelope.payload.length <= 8192 &&
      typeof envelope.signature === "string" && /^[A-Za-z0-9_-]{86}$/.test(envelope.signature), "INVALID_SETUP_APPROVAL");
    const payload = envelope.payload, signature = Buffer.from(envelope.signature, "base64url");
    requireCondition(verify(null, Buffer.from(payload, "utf8"), publicKey, signature), "INVALID_SETUP_SIGNATURE");
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { throw new AuthorizationMutationError("INVALID_SETUP_APPROVAL"); }
    const approval = inputRecord(parsed, ["operation", "audience", "actorUserId", "targetUserId",
      "expectedVersion", "reason", "changeId", "issuedAt", "expiresAt"]);
    requireCondition(approval.operation === operation && approval.audience === audience, "INVALID_SETUP_SCOPE");
    const actorUserId = identifier(approval.actorUserId), userId = identifier(approval.targetUserId);
    const version = expectedVersion(approval.expectedVersion), reason = changeReason(approval.reason);
    const changeId = identifier(approval.changeId);
    const issuedAt = approval.issuedAt, expiresAt = approval.expiresAt;
    requireCondition(typeof issuedAt === "number" && Number.isSafeInteger(issuedAt) &&
      typeof expiresAt === "number" && Number.isSafeInteger(expiresAt) &&
      expiresAt > issuedAt && expiresAt - issuedAt <= 600_000, "INVALID_SETUP_LIFETIME");

    return runAssignmentTransaction(database, async (tx, state) => {
      // Recheck time after waiting for locks and on every transaction retry.
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      requireCondition(issuedAt <= clock.now.getTime() && expiresAt > clock.now.getTime(), "SETUP_APPROVAL_EXPIRED");
      const actor = state.find((row) => row.userId === actorUserId);
      requireCondition(!actor || actor.accountStatus === "ACTIVE", "ACTOR_NOT_ACTIVE");
      requireCondition(!await tx.userAuthorizationChange.findFirst({
        where: { changeId }, select: { userId: true },
      }), "SETUP_APPROVAL_USED");
      // The signature proves separately authorized technical setup; legacy roles
      // and ordinary TECHNICAL_ADMIN sessions cannot supply this authority.
      const attribution = { actorUserId, reason, changeId };
      if (operation === "INITIAL_TECHNICAL_ADMIN") {
        requireCondition(!state.some((row) => row.technicalPrivileges.includes("TECHNICAL_ADMIN")), "TECHNICAL_SETUP_CLOSED");
        const previousGrant = await tx.userAuthorizationChange.findFirst({
          where: { after: { path: ["technicalPrivileges"], array_contains: ["TECHNICAL_ADMIN"] } },
          select: { userId: true },
        });
        requireCondition(!previousGrant, "TECHNICAL_SETUP_CLOSED");
        const target = state.find((row) => row.userId === userId);
        requireCondition(!target || target.accountStatus === "ACTIVE", "SUSPENDED_SETUP_TARGET");
        return {
          command: { kind: "SET_ASSIGNMENT", userId, expectedVersion: version,
            assignment: { businessRole: target?.businessRole ?? null, accountStatus: "ACTIVE", technicalPrivileges: ["TECHNICAL_ADMIN"] } },
          attribution,
        };
      }
      return {
        command: { kind: "BOOTSTRAP_DIRECTOR", userId, expectedVersion: version },
        attribution,
      };
    });
  };
}

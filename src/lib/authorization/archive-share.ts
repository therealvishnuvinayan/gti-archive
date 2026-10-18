import "server-only";
import { prisma } from "../prisma";
import { hashSecureExternalToken } from "../secure-external-token";
import { archiveScopeForActor } from "./archive-rules";
import { getBusinessRoleEligibility } from "./eligibility";
import { resolveArchiveFile } from "./archive-policies";
import { archiveTransactions } from "./archive-transaction";

/** Existing one-file bearer authority, not an impersonated application session.
 * Recheck the real issuer's current authority before consuming any legacy link. */
export async function withArchiveShare<T>(token: string, consume: () => Promise<T>): Promise<T | { state: "invalid" | "expired" | "unavailable" }> {
  const tokenHash = hashSecureExternalToken(token);
  if (!tokenHash) return { state: "invalid" };
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "UserAuthorization", "ArchiveCategory", "ArchiveCategoryAccess", "UserArchiveAssetAccess" IN SHARE MODE`;
    await tx.$queryRaw`SELECT id FROM "ArchiveFileShareLink" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const share = await tx.archiveFileShareLink.findUnique({ where: { tokenHash }, include: { createdBy: { include: { authorization: true } } } });
    if (!share) return { state: "invalid" };
    if (share.revokedAt || share.expiresAt <= new Date()) return { state: "expired" };
    const identity = share.createdBy.authorization;
    if (!identity || identity.accountStatus !== "ACTIVE" || getBusinessRoleEligibility(identity.businessRole, "archive.shareExternal").decision === "DENY" ||
      (!!share.archivedProjectFileId === !!share.manualArchiveFileId)) return { state: "unavailable" };
    const fileId = share.archivedProjectFileId ?? share.manualArchiveFileId!;
    await tx.$queryRaw`SELECT id FROM "ArchivedProjectFile" WHERE id = ${fileId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "ManualArchiveFile" WHERE id = ${fileId} FOR SHARE`;
    const scope = archiveScopeForActor({ userId: share.createdById, businessRole: identity.businessRole });
    const file = await resolveArchiveFile(tx, fileId, scope);
    if (!file || (file.kind === "project") !== !!share.archivedProjectFileId) return { state: "unavailable" };
    return archiveTransactions.run({ tx, actorId: share.createdById, capability: "archive.shareExternal", targetId: `file:${fileId}`, afterCommit: [] }, consume);
  }, { isolationLevel: "Serializable" });
}

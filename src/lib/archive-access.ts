import "server-only";
import { archiveSharingEnabled } from "./archive-sharing/activation";
import { prisma } from "./prisma";
import { runArchiveOperation } from "./authorization/archive";
import { activeArchiveOperation } from "./authorization/archive-transaction";

/** The legacy checkbox UI cannot represent scoped/expired or audited grants.
 * Leave untouched files on the native workflow; audited files require the new UI. */
async function requireUnmanagedNativeAccess(fileId: string) {
  const [schema] = await prisma.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."ArchiveAccessDecision"') IS NOT NULL AS available`;
  if (schema.available && await prisma.archiveAccessDecision.findFirst({ where: { sourceId: fileId }, select: { id: true } })) {
    throw new Error("This file requires the confirmed Manage access workflow.");
  }
}

export async function getArchiveFileAccess(user: { id: string }, fileId: string) {
  return runArchiveOperation(user, "archive.manageAccess", `file:${fileId}`, async () => {
    await requireUnmanagedNativeAccess(fileId);
    const users = await prisma.user.findMany({ where: { authorization: { is: {
      accountStatus: "ACTIVE", businessRole: { in: ["DESIGNER", "DIGITAL_LEAD"] },
    } } }, select: { id: true, name: true, email: true }, orderBy: { email: "asc" } });
    const grants = await prisma.userArchiveAssetAccess.findMany({ where: { OR: [{ archivedProjectFileId: fileId }, { manualArchiveFileId: fileId }] }, select: { userId: true } });
    return { users, grantedUserIds: grants.map(row => row.userId) };
  });
}

export async function setArchiveFileAccess(user: { id: string }, fileId: string, userId: string, granted: boolean) {
  return runArchiveOperation(user, "archive.manageAccess", `file:${fileId}`, async actor => {
    if (archiveSharingEnabled()) throw new Error("Use Manage access to confirm a grant or revoke with a reason.");
    await requireUnmanagedNativeAccess(fileId);
    const recipient = await prisma.userAuthorization.findUnique({ where: { userId } });
    if (granted && (!recipient || recipient.accountStatus !== "ACTIVE" || !["DESIGNER", "DIGITAL_LEAD"].includes(recipient.businessRole ?? ""))) {
      throw new Error("File grants are for active Designer and Digital Lead accounts.");
    }
    const projectFile = await prisma.archivedProjectFile.findUnique({ where: { id: fileId }, select: { id: true } });
    const target = projectFile ? { archivedProjectFileId: fileId } : { manualArchiveFileId: fileId };
    const existing = await prisma.userArchiveAssetAccess.findFirst({ where: { userId, ...target } });
    if (granted && !existing) await prisma.userArchiveAssetAccess.create({ data: { userId, ...target, grantedById: actor.id } });
    if (!granted && existing) await prisma.userArchiveAssetAccess.delete({ where: { id: existing.id } });
    activeArchiveOperation()!.afterCommit.push(async () => console.info("[archive-access]", JSON.stringify({ actorUserId: actor.id, fileId, recipientUserId: userId, granted })));
    return { success: true };
  });
}

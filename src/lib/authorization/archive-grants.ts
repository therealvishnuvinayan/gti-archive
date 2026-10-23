import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import type { ArchiveScope } from "./archive-rules";

export const archiveReadScopes = new AsyncLocalStorage<ArchiveScope>();
/** Catalog detection preserves flag-off reads against the original 116 schema.
 * Scope restrictions stay enforced after migration even if the UI flag is off. */
export async function prepareArchiveScope(tx: Prisma.TransactionClient, scope: ArchiveScope, purpose = "download"): Promise<ArchiveScope> {
  if (scope.level !== "PARTIAL") return scope;
  const [catalog] = await tx.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."ArchiveGrantScope"') IS NOT NULL AS available`;
  const grants = catalog.available
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "UserArchiveAssetAccess" WHERE "userId"=${scope.actor.userId} AND flux_archive_grant_effective(id,${purpose})`
    : await tx.userArchiveAssetAccess.findMany({ where: { userId: scope.actor.userId }, select: { id: true } });
  return { ...scope, grantIds: grants.map(g => g.id) };
}
export async function hasArchiveVerificationGrant(tx: Prisma.TransactionClient, scope: ArchiveScope, fileId: string) {
  if (scope.level === "FULL") return true;
  const effective = await prepareArchiveScope(tx, scope, "verify");
  return !!await tx.userArchiveAssetAccess.findFirst({ where: { id: { in: effective.grantIds ?? [] }, userId: scope.actor.userId, OR: [{ manualArchiveFileId: fileId }, { archivedProjectFileId: fileId }] }, select: { id: true } });
}

/** New version-specific grants use the existing conditional version endpoint.
 * No nested authorization transaction is opened while source locks are held. */
export async function scopedArchiveDownloadPath(tx: Prisma.TransactionClient, userId: string, fileId: string, inline = false) {
  const [catalog] = await tx.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."ArchiveGrantScope"') IS NOT NULL AS available`;
  if (!catalog.available) return null;
  const grant = await tx.archiveGrantScope.findFirst({ where: { grant: { userId, OR: [{ manualArchiveFileId: fileId }, { archivedProjectFileId: fileId }] } }, include: { decision: true } });
  const d = grant?.decision;
  return d?.versionId ? `/api/file-versions/${encodeURIComponent(d.versionId)}/download?kind=${d.sourceKind === "manual" ? "manual-archive-file" : "archived-project-file"}&id=${encodeURIComponent(fileId)}${inline ? "&disposition=inline" : ""}` : null;
}

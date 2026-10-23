import "server-only";
import { Prisma } from "@prisma/client";
import type { ArchiveScope } from "../authorization/archive-rules";
import { archiveCategoryWhere } from "../authorization/archive-rules";
import { archiveRuntimeEnabled } from "./activation";

export function runtimeArchiveWhere(scope: ArchiveScope | null): Prisma.RuntimeArchiveFileWhereInput {
  if (!archiveRuntimeEnabled() || !scope || scope.level === "NONE") return { id: { in: [] } };
  // Exact scopes remain the authority; the nullable native grant columns never
  // stand in for a legacy Project or ManualArchiveFile.
  return { category: { is: archiveCategoryWhere(scope) }, ...(scope.level === "PARTIAL" ? {
    id: { in: [] as string[] },
  } : {}) };
}
export async function runtimeArchiveFiles(tx: Prisma.TransactionClient, scope: ArchiveScope | null, categoryId?: string, fileId?: string) {
  if (!archiveRuntimeEnabled() || !scope || scope.level === "NONE") return [];
  const ids = scope.level === "PARTIAL" ? (await tx.archiveGrantScope.findMany({ where: {
    grantId: { in: scope.grantIds ?? [] }, decision: { sourceKind: "runtime", recipientId: scope.actor.userId },
  }, select: { decision: { select: { sourceId: true } } } })).map(g => g.decision.sourceId) : null;
  const files = await tx.runtimeArchiveFile.findMany({ where: { ...runtimeArchiveWhere(scope), ...(ids ? { id: { in: ids } } : {}),
    ...(categoryId ? { categoryId } : {}), ...(fileId ? { AND: [{ id: fileId }] } : {}) }, include: {
    version: true, reference: true, category: true, submission: { include: { submittedBy: { select: { id: true, name: true } }, stage: { select: { id: true, configuration: true } } } },
    publication: { include: { project: { select: { id: true, title: true } }, actor: { select: { name: true } } } },
  }, orderBy: { id: "asc" } });
  if (!files.length) return [];
  const valid = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "RuntimeArchiveFile" WHERE id IN (${Prisma.join(files.map(f => f.id))}) AND flux_archive_runtime_source(id) IS NOT NULL`);
  return files.filter(f => valid.some(v => v.id === f.id));
}
export function runtimeArchiveDownloadPath(file: { id: string; versionId: string }, inline = false) {
  return `/api/file-versions/${encodeURIComponent(file.versionId)}/download?kind=runtime-archive-file&id=${encodeURIComponent(file.id)}${inline ? "&disposition=inline" : ""}`;
}

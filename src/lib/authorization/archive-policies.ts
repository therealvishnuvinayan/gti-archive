import { archiveRuntimeEnabled } from "../archive-runtime/activation";
import { runtimeArchiveFiles } from "../archive-runtime/sources";
import "server-only";
import { prepareArchiveScope, hasArchiveVerificationGrant } from "./archive-grants";
import type { Prisma } from "@prisma/client";
import type { ResourcePolicies, AuthorizationContext } from "./policy";
import { archiveCategoryWhere, archivedFileWhere, manualArchiveFileWhere, archiveScopeForActor, type ArchiveScope } from "./archive-rules";

/** Check the stored source association even for Director and bearer links. */
export async function resolveArchiveFile(tx: Prisma.TransactionClient, id: string, scope: ArchiveScope) {
  scope = await prepareArchiveScope(tx, scope);
  const file = await tx.archivedProjectFile.findFirst({ where: { AND: [{ id }, archivedFileWhere(scope)] }, include: {
    archive: true, sourceAttachment: true,
  } });
  if (file) {
    await tx.$queryRaw`SELECT id FROM "ProjectAttachment" WHERE id = ${file.sourceAttachmentId} FOR SHARE`;
    const source = file.sourceAttachment;
    if (file.projectId !== file.archive.projectId || source.projectId !== file.projectId ||
      source.status !== "READY" || file.bucket !== source.bucket || file.storageKey !== source.storageKey ||
      file.sourceRevisionId !== source.revisionId) return null;
    return { kind: "project" as const, file };
  }
  const manual = await tx.manualArchiveFile.findFirst({ where: { AND: [{ id }, manualArchiveFileWhere(scope)] } });
  if (manual) return { kind: "manual" as const, file: manual };
  const [runtime] = await runtimeArchiveFiles(tx, scope, undefined, id);
  return runtime ? { kind: "runtime" as const, file: runtime } : null;
}

async function loadArchiveContext({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["archive.view"]>>[0]): Promise<AuthorizationContext | null> {
  const scope = archiveScopeForActor(actor);
  const cap = request.capability;
  if (["archive.verify", "archive.revokeVerification"].includes(cap) && process.env.FLUX_ARCHIVE_VERIFICATION !== "1") return null;
  const [kind, ...parts] = request.targetId.split(":");
  const id = parts.join(":");
  // ACL changes cannot race an authorized read or signed URL issuance. Domain
  // writers use Serializable isolation, including checks for absent grants.
  await tx.$executeRaw`LOCK TABLE "ArchiveCategory", "ArchiveCategoryAccess", "UserArchiveAssetAccess" IN SHARE MODE`;
  let allowed = false;
  if (request.targetId === "root") allowed = ["archive.view", "archive.category.create"].includes(cap);
  if (kind === "category" && id && ["archive.view", "archive.upload", "archive.category.update", "archive.category.delete", "archive.manageAccess"].includes(cap)) {
    allowed = !!await tx.archiveCategory.findFirst({ where: { AND: [{ id }, archiveCategoryWhere(scope, cap === "archive.view" || cap === "archive.upload")] } });
  }
  if (kind === "file" && id && ["archive.verify", "archive.revokeVerification", "archive.view", "archive.download", "archive.editMetadata", "archive.share", "archive.shareExternal", "archive.delete", "archive.manageAccess"].includes(cap)) {
    await tx.$queryRaw`SELECT id FROM "ArchivedProjectFile" WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ManualArchiveFile" WHERE id = ${id} FOR UPDATE`;
    if (archiveRuntimeEnabled()) await tx.$queryRaw`SELECT id FROM "RuntimeArchiveFile" WHERE id = ${id} FOR UPDATE`;
    const resolved = await resolveArchiveFile(tx, id, scope);
    allowed = !!resolved && !(resolved.kind === "runtime" && ["archive.shareExternal", "archive.share"].includes(cap));
    if (allowed && cap === "archive.verify") allowed = await hasArchiveVerificationGrant(tx, scope, id);
  }
  if (kind === "upload" && id && cap === "archive.upload") {
    await tx.$queryRaw`SELECT id FROM "ManualArchiveFile" WHERE id = ${id} FOR UPDATE`;
    allowed = !!await tx.manualArchiveFile.findFirst({ where: { id, uploadedById: actor.userId,
      status: { in: ["UPLOADING", "READY"] }, archiveCategory: { is: archiveCategoryWhere(scope) } } });
  }
  if (kind === "publish-runtime" && id && cap === "archive.publishFromProject" && archiveRuntimeEnabled() && actor.businessRole === "DIRECTOR") {
    await tx.$queryRaw`SELECT id FROM "RuntimeProject" WHERE id=${id} FOR UPDATE`;
    const [row] = await tx.$queryRaw<Array<{ eligible: boolean }>>`SELECT flux_archive_runtime_completion(${id}) IS NOT NULL AS eligible`;
    allowed = row.eligible;
  }
  if (kind === "publish" && id && cap === "archive.publishFromProject") {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id }, select: { ownerId: true, coOwners: { select: { userId: true } }, completedAt: true, archivedAt: true } });
    allowed = !!project && !project.completedAt && !project.archivedAt && (actor.businessRole === "DIRECTOR" ||
      project.ownerId === actor.userId || project.coOwners.some(row => row.userId === actor.userId));
  }
  if (!allowed) return null;
  return { resource: { id: request.targetId, kind: "archive" }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
}

export const archivePolicies: ResourcePolicies = Object.freeze({
  "archive.view": loadArchiveContext, "archive.download": loadArchiveContext,
  "archive.upload": loadArchiveContext, "archive.editMetadata": loadArchiveContext,
  "archive.share": loadArchiveContext, "archive.shareExternal": loadArchiveContext,
  "archive.category.create": loadArchiveContext, "archive.category.update": loadArchiveContext,
  "archive.category.delete": loadArchiveContext, "archive.manageAccess": loadArchiveContext,
  "archive.delete": loadArchiveContext, "archive.publishFromProject": loadArchiveContext,
  "archive.verify": loadArchiveContext, "archive.revokeVerification": loadArchiveContext,
});

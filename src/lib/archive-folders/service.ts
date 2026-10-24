import { archiveRuntimeEnabled } from "../archive-runtime/activation";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runArchiveOperation } from "@/lib/authorization/archive";
import { archiveScopeForUser, canArchive } from "@/lib/authorization/archive-rules";
import { resolveArchiveFile } from "@/lib/authorization/archive-policies";
import { activeArchiveOperation } from "@/lib/authorization/archive-transaction";
import { archiveFoldersEnabled } from "./activation";
import { ArchiveOrganizationError, parseOrganizationCommand, type FolderRecord, type OrganizationResult } from "./contracts";

function enabled() { if (!archiveFoldersEnabled()) throw new ArchiveOrganizationError("Archive folders are not enabled.", 404); }
const unavailable = () => new ArchiveOrganizationError("Archive resource unavailable.", 404);
const stale = () => new ArchiveOrganizationError("This item changed. Refresh before trying again.", 409);
const folderSelect = { id: true, categoryId: true, parentId: true, name: true, description: true, icon: true, revision: true } as const;

/** Uses only existing category.update/delete and exact file editMetadata policies.
 * A category grant never grants a file edit, download or version transition. */
export async function organizeArchive(expected: { id: string }, input: unknown): Promise<OrganizationResult> {
  enabled();
  const command = parseOrganizationCommand(input);
  const capability = command.action === "delete-folder" ? "archive.category.delete" : "archive.category.update";
  return runArchiveOperation(expected, capability, `category:${command.categoryId}`, async user => {
    const tx = activeArchiveOperation()!.tx;
    if (!await tx.archiveCategory.findFirst({ where: { id: command.categoryId, isActive: true } })) throw unavailable();
    // Serialize organization writers. Serializable isolation additionally detects
    // stale snapshots taken during authentication and concurrent legacy ACL writes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(61010001)::text`;
    if (command.action === "move-file") {
      await runArchiveOperation(user, "archive.editMetadata", `file:${command.fileId}`, async () => {
        const resolved = await resolveArchiveFile(tx, command.fileId, archiveScopeForUser(user)!);
        const categoryId = resolved?.kind === "runtime" ? resolved.file.categoryId : resolved?.kind === "project" ? resolved.file.archive.archiveCategoryId : resolved?.file.archiveCategoryId;
        if (!resolved || resolved.kind !== command.fileKind || categoryId !== command.categoryId) throw unavailable();
      });
    }
    const requestHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const previous = await tx.archiveOrganizationCommand.findUnique({ where: { id: command.commandId } });
    if (previous) {
      if (previous.actorUserId !== user.id || previous.requestHash !== requestHash) throw new ArchiveOrganizationError("Command ID already used for a different operation.", 409);
      return previous.result as OrganizationResult;
    }
    const getFolder = async (id: string) => {
      const folder = await tx.archiveFolder.findFirst({ where: { id, categoryId: command.categoryId }, select: folderSelect });
      if (!folder) throw unavailable();
      return folder;
    };
    let before: Prisma.InputJsonValue = {};
    let result: OrganizationResult;
    if (command.action === "move-file") {
      if (command.folderId) await getFolder(command.folderId);
      const id = `${command.fileKind}:${command.fileId}`;
      const placement = await tx.archiveFilePlacement.findUnique({ where: { id } });
      if ((placement?.revision ?? 0) !== command.expectedRevision) throw stale();
      if (placement && placement.categoryId !== command.categoryId) throw unavailable();
      before = placement ? { folderId: placement.folderId, revision: placement.revision } : { folderId: null, revision: 0 };
      const saved = placement ? await tx.archiveFilePlacement.update({ where: { id }, data: { folderId: command.folderId, revision: { increment: 1 } } }) :
        await tx.archiveFilePlacement.create({ data: { id, categoryId: command.categoryId, folderId: command.folderId,
          ...(command.fileKind === "runtime" ? { runtimeArchiveFileId: command.fileId } : command.fileKind === "project" ? { archivedProjectFileId: command.fileId } : { manualArchiveFileId: command.fileId }) } });
      result = { id: saved.id, revision: saved.revision };
    } else if (command.action === "create") {
      if (command.parentId) await getFolder(command.parentId);
      const folder = await tx.archiveFolder.create({ data: { id: randomUUID(), categoryId: command.categoryId, parentId: command.parentId, name: command.name, description: command.description, icon: command.icon } });
      result = { id: folder.id, revision: folder.revision };
    } else {
      const folder = await getFolder(command.folderId);
      if (folder.revision !== command.expectedRevision) throw stale();
      before = folder;
      if (command.action === "delete-folder") {
        if (await tx.archiveFolder.count({ where: { parentId: folder.id } }) || await tx.archiveFilePlacement.count({ where: { folderId: folder.id } })) {
          throw new ArchiveOrganizationError("Move the contents out before deleting this folder.", 409);
        }
        await tx.archiveFolder.delete({ where: { id: folder.id } });
        result = { id: folder.id, revision: folder.revision };
      } else {
        if (command.action === "move-folder") {
          let parentId = command.parentId;
          const seen = new Set([folder.id]);
          while (parentId) {
            if (seen.has(parentId)) throw new ArchiveOrganizationError("A folder cannot be moved into itself or its descendants.", 409);
            seen.add(parentId);
            if (seen.size > 64) throw new ArchiveOrganizationError("Folder nesting is too deep.", 409);
            parentId = (await getFolder(parentId)).parentId;
          }
        }
        const saved = await tx.archiveFolder.update({ where: { id: folder.id }, data: {
          ...(command.action === "rename" ? { name: command.name, description: command.description, icon: command.icon } : { parentId: command.parentId }), revision: { increment: 1 },
        } });
        result = { id: saved.id, revision: saved.revision };
      }
    }
    await tx.archiveOrganizationCommand.create({ data: { id: command.commandId, actorUserId: user.id, categoryId: command.categoryId,
      action: command.action, requestHash, request: command, before, result } });
    return result;
  });
}

export type FolderFile = { id: string; key: string; kind: "project" | "manual" | "runtime"; name: string; originalName: string;
  projectName: string | null; mimeType: string; fileSize: number; revision: number; sourceRevision: number | null; folderId: string | null };
export type FolderWorkspace = {
  category: { id: string; name: string; slug: string }; folders: FolderRecord[]; breadcrumbs: FolderRecord[];
  files: FolderFile[]; total: number; nextCursor: string | null; folderId: string | null;
  canManageAccess: boolean; canManage: boolean; canMoveFiles: boolean; canDeleteFolders: boolean;
};

/** Minimal file-locating DTOs; no artwork detail, raw keys, grants or provenance.
 * The union enforces the Phase 1.5F file grants and stored-source consistency
 * before counts, folder paths, search and pagination. Download routes recheck. */
export async function readArchiveFolder(expected: { id: string }, input: { categoryId: string; folderId?: string | null; search?: string; cursor?: string | null }): Promise<FolderWorkspace> {
  enabled();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.categoryId) || (input.folderId && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.folderId)) ||
    (input.search?.length ?? 0) > 120 || (input.cursor?.length ?? 0) > 260) throw new ArchiveOrganizationError("Invalid folder query.");
  return runArchiveOperation(expected, "archive.view", `category:${input.categoryId}`, async user => {
    const category = await prisma.archiveCategory.findUniqueOrThrow({ where: { id: input.categoryId }, select: { id: true, name: true, slug: true } });
    const scope = archiveScopeForUser(user)!;
    const canManage = canArchive(user, "archive.category.update");
    const grantIds = Prisma.join(scope.grantIds?.length ? scope.grantIds : [""]);
    const projectGrant = scope.level === "FULL" ? Prisma.sql`TRUE` : Prisma.sql`EXISTS (SELECT 1 FROM "UserArchiveAssetAccess" g WHERE g."archivedProjectFileId" = f.id AND g."userId" = ${user.id} AND g.id IN (${grantIds}))`;
    const manualGrant = scope.level === "FULL" ? Prisma.sql`TRUE` : Prisma.sql`EXISTS (SELECT 1 FROM "UserArchiveAssetAccess" g WHERE g."manualArchiveFileId" = f.id AND g."userId" = ${user.id} AND g.id IN (${grantIds}))`;
    const runtimeFiles = archiveRuntimeEnabled() ? Prisma.sql`UNION ALL
      SELECT f.id, 'runtime:' || f.id, 'runtime', v."originalFileName", v."originalFileName", r.title, v."mimeType", v."fileSize", COALESCE(p.revision,0), v.number, p."folderId"
      FROM "RuntimeArchiveFile" f JOIN "RuntimeArchivePublication" a ON a.id=f."publicationId" JOIN "RuntimeProject" r ON r.id=a."projectId"
      JOIN "SharedFileVersion" v ON v.id=f."versionId" LEFT JOIN "ArchiveFilePlacement" p ON p."runtimeArchiveFileId"=f.id
      WHERE f."categoryId"=${category.id} AND flux_archive_runtime_source(f.id) IS NOT NULL AND (${scope.level === "FULL"} OR EXISTS(
        SELECT 1 FROM "ArchiveGrantScope" gs JOIN "ArchiveAccessDecision" d ON d.id=gs."decisionId" WHERE gs."grantId" IN (${grantIds}) AND d."sourceKind"='runtime' AND d."sourceId"=f.id AND d."recipientId"=${user.id}))` : Prisma.empty;
    const accessible = Prisma.sql`
      SELECT f.id, 'project:' || f.id AS key, 'project' AS kind, f."finalArchiveFileName" AS name, f."originalFileName" AS "originalName",
        a."projectName", f."mimeType", f."fileSize", COALESCE(p.revision, 0) AS revision, r."revisionNumber" AS "sourceRevision", p."folderId"
      FROM "ArchivedProjectFile" f JOIN "ProjectArchive" a ON a.id = f."archiveId"
      JOIN "ProjectAttachment" s ON s.id = f."sourceAttachmentId" LEFT JOIN "ProjectRevision" r ON r.id = f."sourceRevisionId"
      LEFT JOIN "ArchiveFilePlacement" p ON p."archivedProjectFileId" = f.id AND p."categoryId" = a."archiveCategoryId"
      WHERE a."archiveCategoryId" = ${category.id} AND ${projectGrant} AND f."projectId" = a."projectId" AND s."projectId" = f."projectId"
        AND s.status = 'READY' AND s.bucket = f.bucket AND s."storageKey" = f."storageKey" AND s."revisionId" IS NOT DISTINCT FROM f."sourceRevisionId"
      UNION ALL
      SELECT f.id, 'manual:' || f.id, 'manual', f."fileName", f."originalFileName", f."projectName", f."mimeType", f."fileSize", COALESCE(p.revision, 0), NULL::integer, p."folderId"
      FROM "ManualArchiveFile" f LEFT JOIN "ArchiveFilePlacement" p ON p."manualArchiveFileId" = f.id AND p."categoryId" = f."archiveCategoryId"
      WHERE f."archiveCategoryId" = ${category.id} AND f.status = 'READY' AND ${manualGrant} ${runtimeFiles}`;
    // Management sees empty permitted folders. Download-only readers see just the
    // ancestor paths of their individually granted files, never unrelated siblings.
    const folders = await prisma.$queryRaw<FolderRecord[]>(Prisma.sql`WITH RECURSIVE accessible AS (${accessible}), visible AS (
      SELECT f.id, f."parentId" FROM "ArchiveFolder" f WHERE f."categoryId" = ${category.id}
        AND (${canManage} OR EXISTS (SELECT 1 FROM accessible a WHERE a."folderId" = f.id))
      UNION SELECT p.id, p."parentId" FROM "ArchiveFolder" p JOIN visible c ON c."parentId" = p.id WHERE p."categoryId" = ${category.id}
    ) SELECT f.id, f."categoryId", f."parentId", f.name, f.description, f.icon, f.revision FROM "ArchiveFolder" f
      JOIN visible v ON v.id = f.id ORDER BY lower(f.name), f.id`);
    const folderId = input.folderId || null;
    const byId = new Map(folders.map(f => [f.id, f]));
    if (folderId && !byId.has(folderId)) throw unavailable();
    const breadcrumbs: FolderRecord[] = [];
    let current = folderId;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) throw unavailable();
      seen.add(current);
      const folder = byId.get(current);
      if (!folder) throw unavailable();
      breadcrumbs.unshift(folder); current = folder.parentId;
    }
    const search = input.search?.trim() ?? "";
    // strpos treats user input literally (including SQL wildcard characters).
    const filter = Prisma.sql`"folderId" IS NOT DISTINCT FROM ${folderId} AND (${search} = '' OR strpos(lower(name), lower(${search})) > 0)`;
    const counts = await prisma.$queryRaw<Array<{ total: number; categoryTotal: number }>>(Prisma.sql`WITH accessible AS (${accessible}) SELECT
      (SELECT count(*)::integer FROM accessible WHERE ${filter}) AS total, count(*)::integer AS "categoryTotal" FROM accessible`);
    if (!canManage && !counts[0].categoryTotal) throw unavailable();
    const rows = await prisma.$queryRaw<FolderFile[]>(Prisma.sql`WITH accessible AS (${accessible}) SELECT * FROM accessible
      WHERE ${filter} AND (${input.cursor || ""} = '' OR key COLLATE "C" > ${input.cursor || ""}) ORDER BY key COLLATE "C" LIMIT 51`);
    const files = rows.slice(0, 50);
    return { category, folders, breadcrumbs, files, total: counts[0].total, folderId,
      nextCursor: rows.length > 50 ? files.at(-1)!.key : null, canManage,
      canManageAccess: canArchive(user, "archive.manageAccess"), canMoveFiles: canManage && canArchive(user, "archive.editMetadata"), canDeleteFolders: canArchive(user, "archive.category.delete") };
  });
}

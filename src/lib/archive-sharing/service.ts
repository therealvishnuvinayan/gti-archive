import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runArchiveOperation } from "@/lib/authorization/archive";
import { activeArchiveOperation } from "@/lib/authorization/archive-transaction";
import { projectReadActor } from "@/lib/authorization/project-read-rules";
import { resolveArchiveFile } from "@/lib/authorization/archive-policies";
import { archiveScopeForUser } from "@/lib/authorization/archive-rules";
import { archiveSharingEnabled } from "./activation";
import { ArchiveSharingError, parseAccessCommand, type AccessView } from "./contracts";

const unavailable = () => new ArchiveSharingError("Archive sharing is unavailable.", 404);
const stale = () => new ArchiveSharingError("Access changed. Refresh before confirming again.", 409);
const userSelect = { id: true, name: true, email: true } as const;
type Source = { sourceKind: "manual" | "project"; sourceId: string; categoryId: string; referenceId: string | null; versionId: string | null };
async function source(tx: Prisma.TransactionClient, user: object, fileId: string) {
  const native = await resolveArchiveFile(tx, fileId, archiveScopeForUser(user)!);
  if (!native) throw unavailable();
  const [row] = await tx.$queryRaw<Array<{ binding: (Source & Prisma.JsonObject) | null }>>`SELECT flux_archive_access_source(${native.kind},${fileId}) AS binding`;
  if (!row.binding) throw unavailable();
  return row.binding;
}
function enabled() { if (!archiveSharingEnabled()) throw unavailable(); }
function fileInput(fileId: string) { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(fileId)) throw new ArchiveSharingError("Invalid Archive file."); }
export async function readArchiveAccess(expected: { id: string }, fileId: string, search = "", before: string | null = null): Promise<AccessView> {
  enabled(); fileInput(fileId);
  if (search.length > 120 || before !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(before)) throw new ArchiveSharingError("Invalid access query.");
  return runArchiveOperation(expected, "archive.manageAccess", `file:${fileId}`, async user => {
    const tx = activeArchiveOperation()!.tx, binding = await source(tx, user, fileId);
    const { sourceKind, sourceId, categoryId, referenceId, versionId } = binding;
    const target = sourceKind === "manual" ? { manualArchiveFileId: fileId } : { archivedProjectFileId: fileId };
    const categoryUsers = await tx.archiveCategoryAccess.findMany({ where: { archiveCategoryId: categoryId }, select: { userId: true } });
    const users = await tx.user.findMany({ where: { authorization: { is: { accountStatus: "ACTIVE", businessRole: { in: ["DESIGNER", "DIGITAL_LEAD"] } } },
      ...(categoryUsers.length ? { id: { in: categoryUsers.map(r => r.userId) } } : {}),
      ...(search.trim() ? { OR: [{ name: { contains: search.trim(), mode: "insensitive" } }, { email: { contains: search.trim(), mode: "insensitive" } }] } : {}) }, select: userSelect, orderBy: [{ email: "asc" }, { id: "asc" }], take: 51 });
    const grants = await tx.userArchiveAssetAccess.findMany({ where: target, include: { user: { select: { ...userSelect, authorization: true } }, grantedBy: { select: { name: true } }, archiveScope: { include: { decision: true } } }, orderBy: { createdAt: "asc" } });
    const decisions = await tx.archiveAccessDecision.findMany({ where: { sourceKind, sourceId, recipientId: { in: [...users.map(u => u.id), ...grants.map(g => g.userId)] } }, distinct: ["recipientId"], orderBy: { sequence: "desc" } });
    const revision = (id: string) => { const d = decisions.find(d => d.recipientId === id); return { revision: d?.sequence ?? 0, decisionId: d?.id ?? null }; };
    if (before && !await tx.archiveAccessDecision.findFirst({ where: { id: before, sourceKind, sourceId }, select: { id: true } })) throw new ArchiveSharingError("Invalid history cursor.");
    const history = await tx.archiveAccessDecision.findMany({ where: { sourceKind, sourceId }, ...(before ? { cursor: { id: before }, skip: 1 } : {}), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, include: { actor: { select: { name: true } }, recipient: { select: { name: true } } } });
    const effective = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "UserArchiveAssetAccess" WHERE ("manualArchiveFileId"=${fileId} OR "archivedProjectFileId"=${fileId}) AND flux_archive_grant_effective(id)`;
    return { sourceKind, sourceId, categoryId, referenceId, versionId, users: users.slice(0,50).map(u => ({ ...u, ...revision(u.id) })), moreUsers: users.length > 50,
      grants: grants.map(g => ({ id: g.userId, name: g.user.name, email: g.user.email, ...revision(g.userId), grantId: g.id, createdAt: g.createdAt.toISOString(), grantedBy: g.grantedBy?.name ?? null,
        scope: g.archiveScope ? g.archiveScope.decision.versionId ? "VERSION" : "LEGACY_NATIVE" : "NATIVE", expiresAt: g.archiveScope?.decision.expiresAt?.toISOString() ?? null,
        effective: effective.some(e => e.id === g.id) && g.user.authorization?.accountStatus === "ACTIVE" && ["DESIGNER", "DIGITAL_LEAD"].includes(g.user.authorization?.businessRole ?? "") && (!categoryUsers.length || categoryUsers.some(u => u.userId === g.userId)) })),
      history: history.slice(0,50).map(d => ({ id: d.id, action: d.action, actor: d.actor.name, recipient: d.recipient.name, reason: d.reason, createdAt: d.createdAt.toISOString(), versionId: d.versionId, expiresAt: d.expiresAt?.toISOString() ?? null })), nextHistoryBefore: history.length > 50 ? history[49].id : null };
  });
}
export async function decideArchiveAccess(expected: { id: string }, raw: unknown) {
  enabled(); const command = parseAccessCommand(raw);
  return runArchiveOperation(expected, "archive.manageAccess", `file:${command.sourceId}`, async user => {
    const tx = activeArchiveOperation()!.tx, actor = projectReadActor(user)!;
    const binding = await source(tx, user, command.sourceId);
    if (binding.sourceKind !== command.sourceKind || binding.categoryId !== command.categoryId || binding.referenceId !== command.referenceId || binding.versionId !== command.versionId) throw stale();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`archive-access:${binding.sourceKind}:${binding.sourceId}`},0))::text`;
    const commandHash = createHash("sha256").update(JSON.stringify(command, Object.keys(command).sort())).digest("hex");
    const replay = await tx.archiveAccessDecision.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: command.commandId } } });
    const result = (d: { id: string; sequence: number; action: string }) => ({ decisionId: d.id, revision: d.sequence, action: d.action });
    if (replay) { if (replay.commandHash !== commandHash) throw stale(); return result(replay); }
    const previous = await tx.archiveAccessDecision.findFirst({ where: { sourceKind: binding.sourceKind, sourceId: binding.sourceId, recipientId: command.recipientId }, orderBy: { sequence: "desc" } });
    const existing = await tx.userArchiveAssetAccess.findFirst({ where: { userId: command.recipientId, ...(binding.sourceKind === "manual" ? { manualArchiveFileId: binding.sourceId } : { archivedProjectFileId: binding.sourceId }) }, select: { id: true } });
    if ((previous?.sequence ?? 0) !== command.expectedRevision || (previous?.id ?? null) !== command.expectedDecisionId || (existing?.id ?? null) !== command.expectedGrantId ||
      (command.action === "GRANT" ? !!existing : !existing)) throw stale();
    if (command.action === "GRANT") {
      const recipient = await tx.userAuthorization.findUnique({ where: { userId: command.recipientId } });
      const restrictions = await tx.archiveCategoryAccess.findMany({ where: { archiveCategoryId: binding.categoryId }, select: { userId: true } });
      if (recipient?.accountStatus !== "ACTIVE" || !["DESIGNER", "DIGITAL_LEAD"].includes(recipient.businessRole ?? "") || restrictions.length && !restrictions.some(r => r.userId === command.recipientId)) throw new ArchiveSharingError("The recipient is not eligible in this category.", 403);
      if (command.expiresAt && (Date.parse(command.expiresAt) <= Date.now() || Date.parse(command.expiresAt) > Date.now() + 90 * 86400000)) throw new ArchiveSharingError("Expiry must be in the future and within 90 days.");
    }
    await tx.$queryRaw`SELECT set_config('flux.archive_access_actor',${actor.userId},true), set_config('flux.archive_access_session',${actor.session.id},true), set_config('flux.archive_access_confirmed','true',true)`;
    const id = randomUUID();
    return result(await tx.archiveAccessDecision.create({ data: { id, sourceKind: binding.sourceKind, sourceId: binding.sourceId, categoryId: binding.categoryId, referenceId: binding.referenceId, versionId: binding.versionId, sourceSnapshot: binding,
      recipientId: command.recipientId, grantId: existing?.id ?? randomUUID(), action: command.action, capability: "PREVIEW_DOWNLOAD", expiresAt: command.expiresAt ? new Date(command.expiresAt) : null,
      sequence: command.expectedRevision + 1, previousId: previous?.id, actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id,
      reason: command.reason, commandId: command.commandId, commandHash, eventId: `archive-access:${id}` } }));
  });
}

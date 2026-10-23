import { hasArchiveVerificationGrant } from "@/lib/authorization/archive-grants";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runArchiveOperation } from "@/lib/authorization/archive";
import { activeArchiveOperation } from "@/lib/authorization/archive-transaction";
import { projectReadActor } from "@/lib/authorization/project-read-rules";
import { resolveArchiveFile } from "@/lib/authorization/archive-policies";
import { canArchive, archiveScopeForUser } from "@/lib/authorization/archive-rules";
import { observePinnedStoredObject } from "@/lib/storage/s3";
import { captureFileIntegrity } from "@/lib/files/contracts";
import { archiveVerificationEnabled } from "./activation";
import { ArchiveVerificationError, parseVerificationCommand, type VerificationView } from "./contracts";

type Source = { sourceKind: "manual" | "project"; sourceId: string; categoryId: string };
type Binding = Source & { projectId: string | null; sourceRevisionId: string | null };
function enabled() { if (!archiveVerificationEnabled()) throw new ArchiveVerificationError("Archive verification is unavailable.", 404); }
function sourceInput(input: Source) {
  if (!["manual", "project"].includes(input.sourceKind) || ![input.sourceId, input.categoryId].every(v => /^[a-zA-Z0-9_-]{1,128}$/.test(v))) throw new ArchiveVerificationError("Invalid Archive source.");
}
async function identity(tx: Prisma.TransactionClient, source: Source, user: object) {
  const native = await resolveArchiveFile(tx, source.sourceId, archiveScopeForUser(user)!);
  if (!native || native.kind !== source.sourceKind || (native.kind === "manual" ? native.file.archiveCategoryId : native.file.archive.archiveCategoryId) !== source.categoryId) throw new ArchiveVerificationError("Archive access denied.", 403);
  const reference = await tx.sharedFileReference.findUnique({ where: source.sourceKind === "manual" ? { manualArchiveFileId: source.sourceId } : { archivedProjectFileId: source.sourceId }, include: { version: true } });
  if (!reference) return null;
  const [row] = await tx.$queryRaw<Array<{ binding: Binding | null }>>`SELECT flux_archive_review_source(${reference.id}) AS binding`;
  if (!row.binding || row.binding.sourceKind !== source.sourceKind || row.binding.sourceId !== source.sourceId || row.binding.categoryId !== source.categoryId) return null;
  return { reference, version: reference.version, binding: row.binding };
}
async function observe(version: NonNullable<Awaited<ReturnType<typeof identity>>>["version"]) {
  try {
    const observation = await observePinnedStoredObject({ bucket: version.bucket, storageKey: version.storageKey, objectETag: version.objectETag!, objectVersionId: version.objectVersionId, checksumSha256: version.checksumSha256 });
    const actual = captureFileIntegrity(observation, version);
    if (actual.objectETag !== version.objectETag || actual.objectVersionId !== version.objectVersionId || actual.checksumSha256 !== version.checksumSha256 || actual.checksumEvidence !== version.checksumEvidence) throw new Error("Changed storage identity");
    return { bucket: version.bucket, storageKey: version.storageKey, fileSize: version.fileSize, mimeType: version.mimeType, ...actual, observedAt: new Date().toISOString() };
  } catch { throw new ArchiveVerificationError("Verification unavailable: the stored object is missing, changed, or could not be checked. Refresh before reviewing.", 409); }
}
export async function readArchiveVerification(expected: { id: string }, source: Source, beforeSequence: number | null = null): Promise<VerificationView> {
  enabled(); sourceInput(source);
  if (beforeSequence !== null && (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1 || beforeSequence > 2147483647)) throw new ArchiveVerificationError("Invalid history cursor.");
  return runArchiveOperation(expected, "archive.view", `file:${source.sourceId}`, async user => {
    const tx = activeArchiveOperation()!.tx;
    const current = await identity(tx, source, user);
    const empty: VerificationView = { status: "UNAVAILABLE", explanation: "This file has no supported immutable version in this category. Existing download access is unchanged.", versionId: null, versionNumber: null, revision: 0, decisionId: null, canVerify: false, canRevoke: false, integrity: null, nextHistoryBefore: null, history: [] };
    if (!current) return empty;
    const { reference, version } = current;
    const latest = await tx.archiveVerificationDecision.findFirst({ where: { referenceId: reference.id, versionId: version.id }, orderBy: { sequence: "desc" } });
    const role = projectReadActor(user)!.businessRole;
    const history = role !== "DESIGNER" ? await tx.archiveVerificationDecision.findMany({ where: { referenceId: reference.id, versionId: version.id, ...(beforeSequence === null ? {} : { sequence: { lt: beforeSequence } }) }, orderBy: { sequence: "desc" }, take: 51, include: { actor: { select: { name: true } } } }) : [];
    let explanation: string | null = null;
    try { await observe(version); } catch (error) { explanation = (error as Error).message; }
    return { ...empty, status: explanation ? "UNAVAILABLE" : latest?.action === "VERIFY" ? "VERIFIED" : latest ? "REVOKED" : "NOT VERIFIED", explanation,
      versionId: version.id, versionNumber: version.number, revision: latest?.sequence ?? 0, decisionId: latest?.id ?? null,
      canVerify: !explanation && latest?.action !== "VERIFY" && canArchive(user, "archive.verify") && await hasArchiveVerificationGrant(tx, archiveScopeForUser(user)!, source.sourceId),
      canRevoke: latest?.action === "VERIFY" && canArchive(user, "archive.revokeVerification"),
      integrity: { objectVersionPinned: !!version.objectVersionId, applicationSealed: version.applicationSealed, checksumEvidence: version.checksumEvidence },
      nextHistoryBefore: history.length > 50 ? history[49].sequence : null,
      history: history.slice(0, 50).map(row => ({ id: row.id, action: row.action, reviewer: row.actor.name ?? "GTI reviewer", createdAt: row.createdAt.toISOString(), reason: row.reason, versionId: row.versionId })) };
  });
}
export async function decideArchiveVerification(expected: { id: string }, raw: unknown) {
  enabled(); const command = parseVerificationCommand(raw);
  return runArchiveOperation(expected, command.action === "VERIFY" ? "archive.verify" : "archive.revokeVerification", `file:${command.sourceId}`, async user => {
    const tx = activeArchiveOperation()!.tx, actor = projectReadActor(user)!;
    const current = await identity(tx, command, user);
    if (!current || current.version.id !== command.versionId) throw new ArchiveVerificationError("This exact file version is unavailable for review. Refresh the file details.", 409);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`archive-review:${current.reference.id}`},0))::text`;
    const commandHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const replay = await tx.archiveVerificationDecision.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: command.commandId } } });
    const result = (row: { id: string; sequence: number; action: string }) => ({ decisionId: row.id, revision: row.sequence, action: row.action });
    if (replay) {
      if (replay.commandHash !== commandHash) throw new ArchiveVerificationError("This command was already used for a different review.", 409);
      return result(replay);
    }
    const previous = await tx.archiveVerificationDecision.findFirst({ where: { referenceId: current.reference.id }, orderBy: { sequence: "desc" } });
    if (command.expectedRevision !== (previous?.sequence ?? 0) || command.expectedDecisionId !== (previous?.id ?? null) ||
      (command.action === "VERIFY" ? previous?.action === "VERIFY" : previous?.action !== "VERIFY")) throw new ArchiveVerificationError("The review changed. Refresh the file details before continuing.", 409);
    const storageEvidence = command.action === "VERIFY" ? await observe(current.version) : previous!.storageEvidence;
    await tx.$queryRaw`SELECT set_config('flux.archive_review_actor',${actor.userId},true), set_config('flux.archive_review_session',${actor.session.id},true), set_config('flux.archive_review_confirmed','true',true)`;
    const id = randomUUID();
    return result(await tx.archiveVerificationDecision.create({ data: { id, ...current.binding, referenceId: current.reference.id, versionId: current.version.id, action: command.action, sequence: command.expectedRevision + 1, previousId: previous?.id,
      actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, reason: command.reason, commandId: command.commandId, commandHash, storageEvidence: storageEvidence as Prisma.InputJsonValue, eventId: `archive-review:${id}` } }));
  });
}

/** Runs inside the unchanged Director-only delete operation. Catalog detection
 * preserves 116-schema compatibility; retention remains active when flags are off. */
export async function prepareArchiveSourceDeletion(user: object, sourceId: string) {
  const context = activeArchiveOperation();
  if (!context || context.capability !== "archive.delete") throw new Error("Authorized Archive deletion required");
  const actor = projectReadActor(user)!;
  const [row] = await context.tx.$queryRaw<Array<{ available: boolean }>>`SELECT to_regclass('public."RetainedArchiveSource"') IS NOT NULL AS available`;
  if (row.available) await context.tx.$queryRaw`SELECT set_config('flux.archive_delete_actor',${actor.userId},true), set_config('flux.archive_delete_session',${actor.session.id},true), set_config('flux.archive_delete_id',${sourceId},true)`;
}

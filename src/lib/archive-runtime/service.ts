import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { runArchiveOperation } from "../authorization/archive";
import { activeArchiveOperation } from "../authorization/archive-transaction";
import { archiveCategoryWhere, archiveScopeForUser } from "../authorization/archive-rules";
import { projectReadActor } from "../authorization/project-read-rules";
import { archiveFoldersEnabled } from "../archive-folders/activation";
import { observePinnedStoredObject } from "../storage/s3";
import { captureFileIntegrity } from "../files/contracts";
import { archiveRuntimeEnabled } from "./activation";
import { ArchiveRuntimeError, parseRuntimeArchiveCommand, type RuntimeArchiveEvidence } from "./contracts";

function enabled() { if (!archiveRuntimeEnabled()) throw new ArchiveRuntimeError("Runtime Archive publication is unavailable.",404); }
const stale = () => new ArchiveRuntimeError("The source, destination or publication changed. Review a fresh manifest.",409);
export async function readRuntimeArchivePublication(expected: { id: string }, projectId: string) {
  enabled();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) throw new ArchiveRuntimeError("Invalid runtime project.");
  return runArchiveOperation(expected,"archive.publishFromProject",`publish-runtime:${projectId}`, async user => {
    const tx = activeArchiveOperation()!.tx;
    const p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, title: true, publishedVersionId: true, versionNumber: true } });
    const d = await tx.runtimeCompletionDecision.findFirstOrThrow({ where: { projectId, outcome: "APPROVE" }, select: { id: true, requestId: true, activity: { select: { createdAt: true, actor: { select: { name: true } } } } } });
    const categories = await tx.archiveCategory.findMany({ where: archiveCategoryWhere(archiveScopeForUser(user)), select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } });
    const folders = archiveFoldersEnabled() ? await tx.archiveFolder.findMany({ where: { categoryId: { in: categories.map(c => c.id) } }, select: { id: true, categoryId: true, name: true, parentId: true }, orderBy: { name: "asc" } }) : [];
    // Only this authorized publication view contains excluded source filenames.
    const evidence = await tx.runtimeFileSubmission.findMany({ where: { stage: { projectId } }, include: { version: true, sharedReference: true, archiveFile: { select: { id: true } }, submittedBy: { select: { name: true } }, stage: { select: { id: true, configuration: true } } }, orderBy: { id: "asc" }, take: 501 });
    if (evidence.length > 500) throw new ArchiveRuntimeError("This project exceeds the 500-item publication review limit.",409);
    const eligible = await tx.$queryRaw<Array<{ id: string; binding: RuntimeArchiveEvidence | null; retired: boolean }>>`SELECT s.id,flux_archive_runtime_evidence(s.id) AS binding,EXISTS(SELECT 1 FROM "RetainedArchiveSource" r JOIN "SharedFileReference" f ON f.id=r.id WHERE f."runtimeSubmissionId"=s.id) AS retired FROM "RuntimeFileSubmission" s JOIN "RuntimeStage" st ON st.id=s."stageId" WHERE st."projectId"=${projectId}`;
    const files = evidence.map(s => { const e = eligible.find(e => e.id === s.id); return { submissionId: s.id, referenceId: s.sharedReference?.id ?? null, versionId: s.versionId, name: s.version.originalFileName, versionNumber: s.version.number, stageId: s.stage.id, stage: (s.stage.configuration as { title: string }).title, submitter: s.submittedBy.name, state: s.state,
      eligible: !!e?.binding && !e.retired && !s.archiveFile, exclusion: s.archiveFile ? "Already published." : e?.retired ? "Previously published and deleted; retained history prevents republication." : !e?.binding ? "Not current eligible stage evidence, or derived from restricted Tasker material." : null }; });
    const publications = await tx.runtimeArchivePublication.findMany({ where: { projectId }, select: { id: true, createdAt: true, category: { select: { slug: true, name: true } }, files: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
    return { project: p, finalDecision: { id: d.id, requestId: d.requestId, director: d.activity.actor.name, at: d.activity.createdAt.toISOString() }, categories, folders, files,
      exclusions: ["Completion documents, including invoices, financial records, legal agreements and authority proofs, remain in protected completion access.","Tasker attachments, deliverables, concepts, private conversations and Tasker-derived stage files are excluded.","Forms, checklist values, historical versions and full completion snapshots are not published."],
      publications: publications.map(x => ({ id: x.id, at: x.createdAt.toISOString(), category: x.category.name, href: `/archives/${x.category.slug}`, remainingFiles: x.files.length })) };
  });
}
export type RuntimeArchivePublicationView = Awaited<ReturnType<typeof readRuntimeArchivePublication>>;
export async function publishRuntimeArchive(expected: { id: string }, raw: unknown) {
  enabled(); const c = parseRuntimeArchiveCommand(raw), m = c.manifest;
  return runArchiveOperation(expected,"archive.publishFromProject",`publish-runtime:${m.projectId}`, async user => {
    const tx = activeArchiveOperation()!.tx, actor = projectReadActor(user)!;
    const category = await tx.archiveCategory.findFirst({ where: { AND: [{ id: m.categoryId }, archiveCategoryWhere(archiveScopeForUser(user))] }, select: { slug: true } });
    if (!category || m.folderId && (!archiveFoldersEnabled() || !await tx.archiveFolder.findFirst({ where: { id: m.folderId, categoryId: m.categoryId } }))) throw stale();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`archive-runtime:${m.projectId}`},0))::text`;
    const commandHash = createHash("sha256").update(JSON.stringify(c)).digest("hex");
    const replay = await tx.runtimeArchivePublication.findUnique({ where: { actorId_commandId: { actorId: actor.userId, commandId: c.commandId } } });
    const result = (id: string) => ({ publicationId: id, href: `/archives/${category.slug}${m.folderId ? `?folder=${encodeURIComponent(m.folderId)}` : ""}` });
    if (replay) { if (replay.commandHash !== commandHash) throw stale(); return result(replay.id); }
    // Observe exactly the reviewed versions, never copy or replace their objects.
    for (const item of m.files) {
      const [row] = await tx.$queryRaw<Array<{ binding: RuntimeArchiveEvidence | null }>>`SELECT flux_archive_runtime_evidence(${item.submissionId}) AS binding`;
      if (!row.binding || row.binding.referenceId !== item.referenceId || row.binding.versionId !== item.versionId || !await tx.runtimeFileSubmission.findFirst({ where: { id: item.submissionId, stage: { projectId: m.projectId } }, select: { id: true } })) throw stale();
      const v = await tx.sharedFileVersion.findUniqueOrThrow({ where: { id: item.versionId } });
      try {
        const observation = captureFileIntegrity(await observePinnedStoredObject({ bucket: v.bucket, storageKey: v.storageKey, objectETag: v.objectETag!, objectVersionId: v.objectVersionId, checksumSha256: v.checksumSha256 }),v);
        if (observation.objectETag !== v.objectETag || observation.objectVersionId !== v.objectVersionId || observation.checksumSha256 !== v.checksumSha256 || observation.checksumEvidence !== v.checksumEvidence) throw stale();
      } catch { throw new ArchiveRuntimeError("A selected exact file could not be checked. Refresh before publishing.",409); }
    }
    const manifest = JSON.stringify(m);
    const [hash] = await tx.$queryRaw<Array<{ value: string }>>`SELECT encode(sha256(convert_to(${manifest}::jsonb::text,'UTF8')),'hex') AS value`;
    await tx.$queryRaw`SELECT set_config('flux.archive_runtime_actor',${actor.userId},true),set_config('flux.archive_runtime_session',${actor.session.id},true),set_config('flux.archive_runtime_confirmed','true',true)`;
    const id = randomUUID();
    await tx.runtimeArchivePublication.create({ data: { id, projectId: m.projectId, finalDecisionId: m.finalDecisionId, publishedVersionId: m.publishedVersionId, categoryId: m.categoryId, destinationFolderId: m.folderId, manifest: m, manifestHash: hash.value, actorId: actor.userId, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id, reason: c.reason, commandId: c.commandId, commandHash, eventId: `archive-runtime:${id}` } });
    return result(id);
  });
}

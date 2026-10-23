import "server-only";
import type { Prisma, UniversalTask } from "@prisma/client";
import { approvalHash } from "../approvals/contracts";
import { availableTaskType, enabledTaskTypes, ensure, id, ids, sistersEnabled } from "./contracts";
import { submissionState } from "./concepts";

import { confirmationHash, sisterCommand } from "./sister-contracts";
export { confirmationHash, sisterCommand } from "./sister-contracts";

import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { nativeContext, runtimeTaskVisible, contextIdentity, sameTaskContext, type TaskContext } from "./runtime-context";

type Tx = Prisma.TransactionClient;
const person = { id: true, name: true } as const;
export async function sourceTask(tx: Tx, actorId: string, sourceId: string) {
  ensure(sistersEnabled(), "SISTERS_DISABLED", 404);
  await tx.$queryRaw`SELECT id FROM "UniversalTask" WHERE id=${id(sourceId)} FOR SHARE`;
  const source = await tx.universalTask.findUnique({ where: { id: sourceId }, include: { spectators: true } });
  const actor = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: actorId } });
  ensure(actor.accountStatus === "ACTIVE" && actor.businessRole && source && !source.deletedAt && source.status === "COMPLETED" && runtimeTaskVisible(source) && availableTaskType(source.type) &&
    (actor.businessRole === "DIRECTOR" || source.ownerId === actorId || source.executorId === actorId), "SISTER_SOURCE_UNAVAILABLE", 403);
  return source;
}
export async function reusableValues(tx: Tx, source: UniversalTask & { spectators: { userId: string }[] }) {
  const target = await tx.universalTaskTarget.findUnique({ where: { taskId: source.id } });
  const refs = await tx.universalTaskReference.findMany({ where: { taskId: source.id }, orderBy: { versionId: "asc" } });
  return { type: source.type, title: source.title, brief: source.brief, context: source.context ?? "", deadline: source.deadline.toISOString(),
    priority: source.priority, executorId: source.executorId, spectatorIds: source.spectators.map(s => s.userId).sort(),
    contextTarget: await contextIdentity(tx, source),
    ...(target ? { destination: `${target.kind}:${target.nativeId}`, inputMode: target.inputMode } : {}),
    ...(source.type === "INSPECT_FILE" && refs.length ? { sourceVersionId: refs[0].versionId } : {}),
    ...(source.type === "FINAL_CONCEPT" ? { inspirationVersionIds: refs.map(r => r.versionId).sort() } : {}) };
}
export async function sourceEvidence(tx: Tx, taskId: string) {
  const entries = await tx.universalTaskEntry.findMany({ where: { taskId }, include: { actor: { select: person } }, orderBy: { version: "asc" } });
  const uploads = await tx.universalTaskUpload.findMany({ where: { taskId, submittedEntryId: { not: null }, version: { status: "READY" } },
    include: { version: { include: { uploadedBy: { select: person } } } }, orderBy: { createdAt: "asc" } });
  return uploads.flatMap(u => {
    const entry = entries.find(e => e.id === u.submittedEntryId);
    if (!entry || !["SUBMIT", "MESSAGE"].includes(entry.action) || !u.version.objectETag || !(u.version.applicationSealed || u.version.objectVersionId)) return [];
    const result = entry.action === "MESSAGE" ? { state: "SUPPORTING", review: undefined } : submissionState(entry, entries);
    const review = result.review ? entries.find(e => e.id === result.review!.id)! : null;
    return [{ id: u.id, versionId: u.versionId, fileId: u.version.fileId, name: u.version.originalFileName, number: u.version.number,
      size: u.version.fileSize, mimeType: u.version.mimeType, uploader: u.version.uploadedBy, sourceState: result.state,
      submission: { id: entry.id, actor: entry.actor, createdAt: entry.createdAt.toISOString() },
      review: review ? { id: review.id, actor: review.actor, createdAt: review.createdAt.toISOString(), action: review.action } : null }];
  });
}
export async function validateSister(tx: Tx, actorId: string, proposal: Record<string, unknown>, context: TaskContext) {
  const command = sisterCommand(proposal.sister), source = await sourceTask(tx, actorId, command.sourceTaskId);
  ensure(command.confirmed && command.confirmation === confirmationHash(actorId, proposal), "SISTER_CONFIRMATION_REQUIRED", 409);
  ensure(source.version === command.sourceVersion, "STALE_SISTER_SOURCE", 409);
  ensure(await sameTaskContext(tx, source, context), "CROSS_PROJECT_FAMILY", 403);
  if (command.mode === "KEEP") {
    const values = await reusableValues(tx, source);
    for (const [key, value] of Object.entries(values)) {
      if (key === "contextTarget") continue; // equivalent authorized task context is permitted
      const actual = key === "deadline" ? new Date(String(proposal[key])).toISOString() : key === "spectatorIds" || key === "inspirationVersionIds" ? ids(proposal[key]) : key === "context" ? proposal[key] ?? "" : proposal[key];
      ensure(approvalHash(actual) === approvalHash(value), "KEEP_VALUES_CHANGED");
    }
  }
  const selected = await sourceEvidence(tx, source.id);
  ensure(command.evidenceVersionIds.every(versionId => selected.some(e => e.versionId === versionId)), "SOURCE_EVIDENCE_UNAVAILABLE", 403);
  const rootTaskId = (await tx.universalTaskFamilyLink.findUnique({ where: { taskId: source.id } }))?.rootTaskId ?? source.id;
  return { ...command, rootTaskId, evidence: selected.filter(e => command.evidenceVersionIds.includes(e.versionId)) };
}
export async function saveSister(tx: Tx, taskId: string, createdEntryId: string, sister: Awaited<ReturnType<typeof validateSister>>) {
  await tx.universalTaskFamilyLink.create({ data: { taskId, sourceTaskId: sister.sourceTaskId, rootTaskId: sister.rootTaskId, sourceVersion: sister.sourceVersion, mode: sister.mode, createdEntryId } });
  for (const e of sister.evidence) {
    await tx.universalTaskInheritedEvidence.create({ data: { taskId, versionId: e.versionId, sourceUploadId: e.id, sourceEntryId: e.submission.id, sourceReviewId: e.review?.id, sourceState: e.sourceState } });
    await tx.sharedFileProvenance.create({ data: { versionId: e.versionId, taskEntryId: createdEntryId } });
  }
}
export function taskAccess(actorId: string, director: boolean): Prisma.UniversalTaskWhereInput {
  const relation: Prisma.UniversalTaskWhereInput = director ? {} : { OR: [{ ownerId: actorId }, { deletedAt: null, OR: [{ executorId: actorId }, { spectators: { some: { userId: actorId } } }] }] };
  return { type: { in: enabledTaskTypes() }, AND: [relation, runtimeIntegrationEnabled() ? {} : nativeContext] };
}
export async function familyInfo(tx: Tx, taskId: string, actorId: string, director: boolean) {
  const link = await tx.universalTaskFamilyLink.findUnique({ where: { taskId } });
  const rootId = link?.rootTaskId ?? taskId;
  const where: Prisma.UniversalTaskWhereInput = { AND: [taskAccess(actorId, director), { OR: [{ id: rootId }, { sisterLink: { rootTaskId: rootId } }] }] };
  const [count, root, source, latest] = await Promise.all([tx.universalTask.count({ where }),
    tx.universalTask.findFirst({ where: { id: rootId, AND: taskAccess(actorId, director) }, select: { id: true, title: true } }),
    link ? tx.universalTask.findFirst({ where: { id: link.sourceTaskId, AND: taskAccess(actorId, director) }, select: { id: true, title: true } }) : null,
    tx.universalTask.findFirst({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { updatedAt: true } })]);
  // The group identifier is always an independently accessible member. Hidden
  // roots/sources and their metadata never become client-visible traversal keys.
  const anchor = root ?? await tx.universalTask.findFirstOrThrow({ where, orderBy: { id: "asc" }, select: { id: true, title: true } });
  return { anchorId: anchor.id, root, source, isSister: !!link, count, latestActivity: latest!.updatedAt.toISOString() };
}
export async function inheritedEvidence(tx: Tx, taskId: string) {
  return (await tx.universalTaskInheritedEvidence.findMany({ where: { taskId }, include: {
    version: { include: { uploadedBy: { select: person } } }, sourceEntry: { include: { actor: { select: person } } }, sourceReview: { include: { actor: { select: person } } },
  }, orderBy: { id: "asc" } })).map(e => ({ id: e.id, versionId: e.versionId, fileId: e.version.fileId, name: e.version.originalFileName,
    number: e.version.number, size: e.version.fileSize, mimeType: e.version.mimeType, uploader: e.version.uploadedBy, sourceState: e.sourceState,
    submission: { id: e.sourceEntry.id, actor: e.sourceEntry.actor, createdAt: e.sourceEntry.createdAt.toISOString() },
    review: e.sourceReview ? { id: e.sourceReview.id, actor: e.sourceReview.actor, createdAt: e.sourceReview.createdAt.toISOString(), action: e.sourceReview.action } : null }));
}

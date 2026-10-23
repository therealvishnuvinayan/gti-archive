import "server-only";
import type { Prisma } from "@prisma/client";
import type { StageDefinition } from "../stage-builder/contracts";
import { acceptedFile } from "../stage-runtime/contracts";
import { ensure } from "./contracts";
import { contextIdentity, runtimeCreationScope, type TaskContext } from "./runtime-context";

type Tx = Prisma.TransactionClient;
export async function runtimeSourceAuthority(tx: Tx, userId: string, projectId: string) {
  const actor = await tx.userAuthorization.findUnique({ where: { userId } });
  ensure(actor?.accountStatus === "ACTIVE", "SOURCE_DELEGATION_DENIED", 403);
  await tx.$queryRaw`SELECT id FROM "RuntimeProject" WHERE id=${projectId} FOR SHARE`;
  ensure(await tx.runtimeProject.findFirst({ where: { id: projectId, AND: runtimeCreationScope(userId, actor.businessRole, true) }, select: { id: true } }), "SOURCE_DELEGATION_DENIED", 403);
}

export async function runtimeStageSource(tx: Tx, actorId: string, context: TaskContext, versionId: string) {
  const identity = await contextIdentity(tx, context);
  ensure(identity.startsWith("runtime:"), "SOURCE_UNAVAILABLE", 403);
  const projectId = identity.slice(8);
  await runtimeSourceAuthority(tx, actorId, projectId);
  const source = await tx.runtimeFileSubmission.findUnique({ where: { versionId }, include: {
    stage: true, replacement: { select: { id: true } }, version: { include: { file: true } },
  } });
  ensure(source?.stage.projectId === projectId, "SOURCE_UNAVAILABLE", 403);
  await tx.$queryRaw`SELECT id FROM "RuntimeStage" WHERE id=${source.stageId} FOR SHARE`;
  const v = source.version;
  ensure(!source.replacement && acceptedFile(source.stage.configuration as unknown as StageDefinition, { ...source, replaced: !!source.replacement }) &&
    v.status === "READY" && v.objectETag && (v.applicationSealed || v.objectVersionId) &&
    v.file.runtimeStageId === source.stageId && v.uploadedById === source.submittedById, "SOURCE_INELIGIBLE", 403);
  return { version: v, sourceUploadId: null, sourceAttachmentId: null, sourceSubmissionId: null, sourceReviewId: null,
    sourceState: "SEALED", runtimeSource: { projectId, submissionId: source.id } };
}

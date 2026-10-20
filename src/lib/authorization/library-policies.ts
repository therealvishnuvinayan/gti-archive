import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { projectWritePolicies, projectMutationTarget } from "./project-write-policies";
import { readableStructuredFileProject } from "./project-read-policies";
import { libraryAssetTypes, manualLibraryWhere } from "./library-rules";
import type { AuthenticatedPrincipal } from "./session";

export async function readableLibraryAttachment(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, id: string) {
  const candidate = await tx.projectAttachment.findFirst({ where: {
    id, status: "READY", assetType: { in: [...libraryAssetTypes] }, archivedFiles: { none: {} },
  }, select: { id: true, projectId: true, stageId: true,
    stage: { select: { conceptFolder: { select: { projectId: true } } } },
    revision: { select: { projectId: true, stageId: true } },
    comment: { select: { projectId: true, stageId: true, deletedAt: true } },
  } });
  if (!candidate || (candidate.stage?.conceptFolder && candidate.stage.conceptFolder.projectId !== candidate.projectId) ||
    (candidate.revision && (candidate.revision.projectId !== candidate.projectId || candidate.revision.stageId !== candidate.stageId)) ||
    (candidate.comment && (candidate.comment.projectId !== candidate.projectId || candidate.comment.stageId !== candidate.stageId || candidate.comment.deletedAt))) return false;
  return !!await readableStructuredFileProject(tx, actor, id);
}

/** History/reference and lifecycle restrictions also apply to Director deletion. */
export const deletableLibraryAttachmentWhere: Prisma.ProjectAttachmentWhereInput = {
  status: "READY", project: { is: { completedAt: null, archivedAt: null } },
  OR: [{ stageId: null }, { stage: { is: { status: { not: "COMPLETED" } } } }],
  revisionId: null, commentId: null, privateFolderId: null, checklistResponseRequestId: null,
  archivedFiles: { none: {} }, archiveArtworkMetadata: { none: {} },
  approvedConceptFolder: { is: null }, conceptStartingReference: { is: null },
  stageFileHandoffs: { none: {} }, sourceProductionUnits: { none: {} },
  productionUnitFile: { is: null }, sampleRoundEvidence: { is: null },
  fileChecklistItems: { none: {} }, sourceFileChecklists: { none: {} },
  inquiryAssociations: { none: {} }, researchFolderFile: { is: null },
  baseComparisonComments: { none: {} }, compareComparisonComments: { none: {} }, captionComparisonComments: { none: {} },
};

async function loadLibraryContext({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["library.view"]>>[0]): Promise<AuthorizationContext | null> {
  const cap = request.capability;
  const [kind, ...parts] = request.targetId.split(":");
  const id = parts.join(":");
  let allowed = false;
  // Upload metadata/tags are set only when the upload intent is created.
  if (request.targetId === "root") allowed = ["library.view", "library.upload", "library.editMetadata", "library.manageTags"].includes(cap);
  if (kind === "manual" && id && ["library.view", "library.download", "library.favorite", "library.delete"].includes(cap)) {
    await tx.$queryRaw`SELECT id FROM "ManualLibraryAsset" WHERE id = ${id} FOR UPDATE`;
    allowed = !!await tx.manualLibraryAsset.findFirst({ where: { AND: [{ id }, manualLibraryWhere(actor)] } });
  }
  if (kind === "upload" && id && cap === "library.upload") {
    await tx.$queryRaw`SELECT id FROM "ManualLibraryAsset" WHERE id = ${id} FOR UPDATE`;
    allowed = !!await tx.manualLibraryAsset.findFirst({ where: { id, uploadedById: actor.userId, status: { in: ["UPLOADING", "READY"] } } });
  }
  if (kind === "attachment" && id && ["library.view", "library.download", "library.favorite", "library.accessProjectFile", "library.delete"].includes(cap)) {
    await tx.$queryRaw`SELECT id FROM "ProjectAttachment" WHERE id = ${id} FOR UPDATE`;
    allowed = await readableLibraryAttachment(tx, actor, id);
    if (allowed && cap === "library.delete") {
      const writePolicy = projectWritePolicies["project.writeFile"];
      if (!writePolicy || !await writePolicy({ tx, actor, request: { capability: "project.writeFile",
        targetId: projectMutationTarget("deleteAttachmentForUser", { kind: "file", id }) } })) return null;
      allowed = !!await tx.projectAttachment.findFirst({ where: { AND: [{ id }, deletableLibraryAttachmentWhere] } });
    }
  }
  if (!allowed) return null;
  return { resource: { id: request.targetId, kind: "library" }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
}

export const libraryPolicies: ResourcePolicies = Object.freeze({
  "library.view": loadLibraryContext, "library.download": loadLibraryContext,
  "library.upload": loadLibraryContext, "library.editMetadata": loadLibraryContext,
  "library.manageTags": loadLibraryContext, "library.favorite": loadLibraryContext,
  "library.delete": loadLibraryContext, "library.accessProjectFile": loadLibraryContext,
  // No Library share/token/grant workflow exists. Keep runtime sharing closed.
});

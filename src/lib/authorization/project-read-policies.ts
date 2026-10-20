import type { Prisma } from "@prisma/client";
import "server-only";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { flexibleProjectReadWhere, structuredProjectReadWhere } from "./project-read-rules";
import type { AuthenticatedPrincipal } from "./session";

type DB = Prisma.TransactionClient;
export type ProjectReadCapability = "project.view" | "project.viewContext" | "project.viewStage" | "project.viewFile" | "project.viewFolder";
export type ProjectReadTarget = "structured" | "flexible" | "stage" | "file" | "flexible-file" | "research-folder" | "private-folder" | "concept";
export const projectReadTarget = (kind: ProjectReadTarget, id: string) => `${kind}:${id}`;

async function visible(db: DB, actor: AuthenticatedPrincipal, id: string, full: boolean) {
  return !!await db.project.findFirst({ where: { AND: [{ id }, structuredProjectReadWhere(actor, full)] }, select: { id: true } });
}

async function folderProject(db: DB, actor: AuthenticatedPrincipal, kind: string, id: string): Promise<string | null> {
  if (kind === "private-folder") {
    const folder = await db.projectPrivateFolder.findUnique({ where: { id }, select: { projectId: true, ownerUserId: true } });
    return folder && await visible(db, actor, folder.projectId, false) &&
      (actor.businessRole === "DIRECTOR" || folder.ownerUserId === actor.userId) ? folder.projectId : null;
  }
  if (kind === "concept") {
    const folder = await db.projectConceptFolder.findUnique({ where: { id }, select: { projectId: true, assignedExecutorId: true } });
    return folder && (await visible(db, actor, folder.projectId, true) ||
      (actor.businessRole !== null && folder.assignedExecutorId === actor.userId)) ? folder.projectId : null;
  }
  const folder = await db.projectResearchFolder.findUnique({ where: { id }, select: {
    workspaceId: true, parentFolderId: true, systemKey: true,
    workspace: { select: { projectId: true, ownerUserId: true, project: { select: { ownerId: true } } } },
  } });
  if (!folder || !await visible(db, actor, folder.workspace.projectId, false)) return null;
  if (actor.businessRole === "DIRECTOR") return folder.workspace.projectId;
  // Noncanonical workspaces do not become shared through project participation.
  if (folder.workspace.ownerUserId !== folder.workspace.project.ownerId) return null;
  if (await visible(db, actor, folder.workspace.projectId, true)) return folder.workspace.projectId;
  let root = { parentFolderId: folder.parentFolderId, systemKey: folder.systemKey };
  const visited = new Set([id]);
  while (root.parentFolderId) {
    if (visited.has(root.parentFolderId)) return null;
    visited.add(root.parentFolderId);
    const parent = await db.projectResearchFolder.findFirst({ where: { id: root.parentFolderId, workspaceId: folder.workspaceId },
      select: { parentFolderId: true, systemKey: true } });
    if (!parent) return null;
    root = parent;
  }
  // Existing canonical Brief/Tech sharing is retained for assigned executors.
  const assigned = await db.projectExecutor.findUnique({ where: { projectId_userId: { projectId: folder.workspace.projectId, userId: actor.userId } }, select: { userId: true } });
  return assigned && (root.systemKey === "BRIEF" || root.systemKey === "TECH") ? folder.workspace.projectId : null;
}

export async function readableStructuredFileProject(db: DB, actor: AuthenticatedPrincipal, id: string): Promise<string | null> {
  if (!actor.businessRole) return null;
  const file = await db.projectAttachment.findUnique({ where: { id }, select: {
    projectId: true, stageId: true, assetType: true, status: true, privateFolderId: true,
    researchFolderFile: { select: { folderId: true } },
    stage: { select: { projectId: true, conceptFolder: { select: { assignedExecutorId: true } } } },
    conceptStartingReference: { select: { assignedExecutorId: true, projectId: true } },
  } });
  if (!file || file.status !== "READY" || !await visible(db, actor, file.projectId, false)) return null;
  if (file.stage && file.stage.projectId !== file.projectId) return null;
  if (file.privateFolderId) return await folderProject(db, actor, "private-folder", file.privateFolderId) === file.projectId ? file.projectId : null;
  if (file.researchFolderFile) return await folderProject(db, actor, "research-folder", file.researchFolderFile.folderId) === file.projectId ? file.projectId : null;
  // Unlinked private/research assets are not general project files.
  if (["PROJECT_PRIVATE_FILE", "PROJECT_RESEARCH_FILE"].includes(file.assetType)) return null;
  if (actor.businessRole === "DIRECTOR") return file.projectId;
  if (await visible(db, actor, file.projectId, true)) return file.projectId;
  if (!["STAGE_SUBMISSION", "GENERAL_PROJECT_ASSET", "REVISION_ORIGINAL", "COMMENT_ATTACHMENT"].includes(file.assetType)) return null;
  return (file.stage?.projectId === file.projectId && file.stage?.conceptFolder?.assignedExecutorId === actor.userId) ||
    (file.conceptStartingReference?.projectId === file.projectId && file.conceptStartingReference.assignedExecutorId === actor.userId)
    ? file.projectId : null;
}

async function loadProjectReadContext({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["project.view"]>>[0]): Promise<AuthorizationContext | null> {
  if (!actor.businessRole) return null;
  const separator = request.targetId.indexOf(":");
  const kind = request.targetId.slice(0, separator), id = request.targetId.slice(separator + 1);
  if (separator < 1 || !id) return null;
  let projectId: string | null = null;
  if ((request.capability === "project.view" || request.capability === "project.viewContext") && (kind === "structured" || kind === "flexible")) {
    const full = request.capability === "project.view";
    const found = kind === "structured"
      ? await tx.project.findFirst({ where: { AND: [{ id }, structuredProjectReadWhere(actor, full)] }, select: { id: true } })
      : await tx.flexibleProject.findFirst({ where: { AND: [{ id }, flexibleProjectReadWhere(actor, full)] }, select: { id: true } });
    projectId = found?.id ?? null;
  } else if (request.capability === "project.viewStage" && kind === "stage") {
    const stage = await tx.projectStage.findUnique({ where: { id }, select: { projectId: true } });
    if (stage && await visible(tx, actor, stage.projectId, true)) projectId = stage.projectId;
  } else if (request.capability === "project.viewFile" && kind === "file") {
    projectId = await readableStructuredFileProject(tx, actor, id);
  } else if (request.capability === "project.viewFile" && kind === "flexible-file") {
    const file = await tx.flexibleProjectAttachment.findUnique({ where: { id }, select: {
      projectId: true, status: true, milestone: { select: { responsibleUserId: true, projectId: true } } } });
    if (file?.status === "READY" && (!file.milestone || file.milestone.projectId === file.projectId)) {
      const full = await tx.flexibleProject.findFirst({ where: { AND: [{ id: file.projectId }, flexibleProjectReadWhere(actor, true)] }, select: { id: true } });
      if (full || (file.milestone?.projectId === file.projectId && file.milestone.responsibleUserId === actor.userId)) projectId = file.projectId;
    }
  } else if (request.capability === "project.viewFolder" && ["research-folder", "private-folder", "concept"].includes(kind)) {
    projectId = await folderProject(tx, actor, kind, id);
  }
  if (!projectId) return null;
  // The namespaced target is the policy resource identity. All underlying
  // project/resource associations above are resolved from the same transaction.
  const flexible = kind === "flexible" || kind === "flexible-file";
  const participants = flexible
    ? await tx.flexibleProject.findUnique({ where: { id: projectId }, select: { ownerId: true,
        collaborators: { select: { userId: true } }, milestones: { select: { responsibleUserId: true } } } })
    : await tx.project.findUnique({ where: { id: projectId }, select: { ownerId: true,
        coOwners: { select: { userId: true } }, collaborators: { select: { userId: true } }, executors: { select: { userId: true } } } });
  if (!participants) return null;
  const participantUserIds = [participants.ownerId, ...participants.collaborators.map((row) => row.userId),
    ...("coOwners" in participants ? participants.coOwners.map((row) => row.userId) : []),
    ...("executors" in participants ? participants.executors.map((row) => row.userId) : []),
    ...("milestones" in participants ? participants.milestones.map((row) => row.responsibleUserId) : [])]
    .filter((value): value is string => !!value);
  return { resource: { id: request.targetId, kind: "project", projectId },
    project: { id: projectId, participantUserIds }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
}

export const projectReadPolicies: ResourcePolicies = Object.freeze({
  "project.view": loadProjectReadContext,
  "project.viewContext": loadProjectReadContext,
  "project.viewStage": loadProjectReadContext,
  "project.viewFile": loadProjectReadContext,
  "project.viewFolder": loadProjectReadContext,
});

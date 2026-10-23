import "server-only";
import { Prisma, type ProjectWorkflowStageKey } from "@prisma/client";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { projectWriteOperations, type ProjectWriteOperation } from "./project-write-operations";


export type ProjectWriteTargetKind = "structured" | "flexible" | "workflow" | "stage" | "concept" | "file" | "comment" | "private-folder" | "research-folder" | "milestone" | "flexible-file" | "checklist-request" | "approval";
export type ProjectWriteTarget = { kind: ProjectWriteTargetKind; id: string };
export type ResolvedProjectWriteTarget = {
  projectId: string; projectKind: "structured" | "flexible";
  stageKey?: string; stageId?: string; executorId?: string | null;
  privateOwnerId?: string; recipientId?: string | null;
};

type DB = Prisma.TransactionClient;
/** Resolve actual associations. IDs in request bodies are never ownership evidence. */
export async function resolveProjectWriteTarget(tx: DB, target: ProjectWriteTarget): Promise<ResolvedProjectWriteTarget | null> {
  const { kind, id } = target;
  if (!id || typeof id !== "string") return null;
  if (kind === "structured" || kind === "flexible") return { projectId: id, projectKind: kind };
  if (kind === "workflow") {
    const [projectId, stageKey, extra] = id.split("~");
    return projectId && stageKey && !extra ? { projectId, projectKind: "structured", stageKey } : null;
  }
  if (kind === "stage") {
    const row = await tx.projectStage.findUnique({ where: { id }, select: { id: true, projectId: true,
      conceptFolder: { select: { projectId: true, workflowStageKey: true, assignedExecutorId: true } } } });
    if (!row || (row.conceptFolder && row.conceptFolder.projectId !== row.projectId)) return null;
    return { projectId: row.projectId, projectKind: "structured", stageId: row.id,
      stageKey: row.conceptFolder?.workflowStageKey, executorId: row.conceptFolder?.assignedExecutorId };
  }
  if (kind === "concept") {
    const row = await tx.projectConceptFolder.findUnique({ where: { id }, select: { projectId: true, taskerStageId: true } });
    if (!row) return null;
    const stage = await resolveProjectWriteTarget(tx, { kind: "stage", id: row.taskerStageId });
    return stage?.projectId === row.projectId ? stage : null;
  }
  if (kind === "comment") {
    const row = await tx.projectComment.findUnique({ where: { id }, select: { projectId: true, stageId: true } });
    if (!row) return null;
    const stage = await resolveProjectWriteTarget(tx, { kind: "stage", id: row.stageId });
    return stage?.projectId === row.projectId ? stage : null;
  }
  if (kind === "private-folder") {
    const row = await tx.projectPrivateFolder.findUnique({ where: { id }, select: { projectId: true, ownerUserId: true } });
    return row ? { projectId: row.projectId, projectKind: "structured", privateOwnerId: row.ownerUserId } : null;
  }
  if (kind === "research-folder") {
    const row = await tx.projectResearchFolder.findUnique({ where: { id }, select: { workspace: { select: { projectId: true, ownerUserId: true, project: { select: { ownerId: true } } } } } });
    if (!row) return null;
    // Workspaces not belonging to the actual project owner remain Director-only.
    return { projectId: row.workspace.projectId, projectKind: "structured", stageKey: "PROJECT_RESEARCH_AND_PLANNING",
      ...(row.workspace.ownerUserId !== row.workspace.project.ownerId ? { privateOwnerId: "director-only" } : {}) };
  }
  if (kind === "file") {
    const row = await tx.projectAttachment.findUnique({ where: { id }, select: { projectId: true, stageId: true, privateFolderId: true, assetType: true, status: true, storageKey: true,
      researchFolderFile: { select: { folderId: true } } } });
    if (!row || row.status === "DELETED") return null;
    const pendingResearchFolder = row.assetType === "PROJECT_RESEARCH_FILE" && row.status === "UPLOADING" ? /^projects\/[^/]+\/research\/([^/]+)\//.exec(row.storageKey)?.[1] : undefined;
    const reference = row.privateFolderId ? { kind: "private-folder" as const, id: row.privateFolderId }
      : row.researchFolderFile ? { kind: "research-folder" as const, id: row.researchFolderFile.folderId }
      : pendingResearchFolder ? { kind: "research-folder" as const, id: pendingResearchFolder } : row.stageId ? { kind: "stage" as const, id: row.stageId } : null;
    if (!reference) return ["PROJECT_PRIVATE_FILE", "PROJECT_RESEARCH_FILE"].includes(row.assetType) ? null : { projectId: row.projectId, projectKind: "structured" };
    const resolved = await resolveProjectWriteTarget(tx, reference);
    if (resolved?.projectId !== row.projectId) return null;
    if (row.stageId) {
      const stage = await tx.projectStage.findUnique({ where: { id: row.stageId }, select: { projectId: true } });
      if (stage?.projectId !== row.projectId) return null;
    }
    return resolved;
  }
  if (kind === "milestone") {
    const row = await tx.flexibleMilestone.findUnique({ where: { id }, select: { projectId: true, responsibleUserId: true } });
    return row ? { projectId: row.projectId, projectKind: "flexible", executorId: row.responsibleUserId } : null;
  }
  if (kind === "flexible-file") {
    const row = await tx.flexibleProjectAttachment.findUnique({ where: { id }, select: { projectId: true, milestoneId: true, status: true } });
    if (!row || !row.milestoneId || row.status === "DELETED") return null;
    const milestone = await resolveProjectWriteTarget(tx, { kind: "milestone", id: row.milestoneId });
    return milestone?.projectId === row.projectId ? milestone : null;
  }
  if (kind === "checklist-request") {
    const row = await tx.projectFileChecklistRequest.findUnique({ where: { id }, select: { projectId: true, recipientUserId: true } });
    return row ? { projectId: row.projectId, projectKind: "structured", recipientId: row.recipientUserId, stageKey: "FINAL_LAYOUT" } : null;
  }
  if (kind === "approval") {
    const row = await tx.productionApprovalStep.findUnique({ where: { id }, select: { productionUnit: { select: { projectId: true } }, recipientUserId: true } });
    return row ? { projectId: row.productionUnit.projectId, projectKind: "structured", recipientId: row.recipientUserId, stageKey: "PRODUCTION_AND_HANDOVER" } : null;
  }
  return null;
}

export function projectMutationTarget(operation: ProjectWriteOperation, target: ProjectWriteTarget) {
  return `${operation}/${target.kind}:${target.id}`;
}

type WritePolicyInput = Parameters<NonNullable<ResourcePolicies["project.edit"]>>[0];
// Also used to recheck the recorded Task Owner from current persisted V2 identity;
// no session, membership, grant or authenticated principal is fabricated.
export async function projectWriteContext(tx: DB, actor: Pick<WritePolicyInput["actor"], "userId" | "businessRole">, request: WritePolicyInput["request"]): Promise<AuthorizationContext | null> {
  const match = /^([^/]+)\/([^:]+):(.+)$/.exec(request.targetId);
  if (!match || !Object.hasOwn(projectWriteOperations, match[1]) || !actor.businessRole) return null;
  const operation = match[1] as ProjectWriteOperation;
  const spec: { capability: string; mode: string; kind: string; stage?: string } = projectWriteOperations[operation];
  if (request.capability !== spec.capability || spec.mode === "blocked") return null;
  const target = { kind: match[2] as ProjectWriteTargetKind, id: match[3] };
  if (spec.kind !== target.kind && spec.kind !== "dynamic-file" && spec.kind !== "dynamic-folder") return null;
  if (spec.kind === "dynamic-file" && !["structured", "stage", "private-folder", "research-folder"].includes(target.kind)) return null;
  if (spec.kind === "dynamic-folder" && !["private-folder", "research-folder"].includes(target.kind)) return null;
  let resource = await resolveProjectWriteTarget(tx, target);
  if (!resource) return null;
  // Every integrated participant/task/stage writer locks the same root first.
  // Serializable isolation rejects a transaction whose pre-lock snapshot changed.
  if (resource.projectKind === "structured") await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${resource.projectId} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "FlexibleProject" WHERE id = ${resource.projectId} FOR UPDATE`;
  const current = await resolveProjectWriteTarget(tx, target);
  if (!current || current.projectId !== resource.projectId || current.projectKind !== resource.projectKind) return null;
  resource = current;
  const director = actor.businessRole === "DIRECTOR";
  const managerRole = ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole);
  let managed = false;
  let participants: string[] = [];
  if (resource.projectKind === "structured") {
    const project = await tx.project.findUnique({ where: { id: resource.projectId }, select: {
      ownerId: true, coOwners: { select: { userId: true } }, executors: { select: { userId: true } },
      completedAt: true, archivedAt: true, closure: { select: { id: true } },
      status: { select: { slug: true, name: true, group: { select: { slug: true, name: true } } } },
      workflowStages: { select: { stageKey: true, status: true } },
    } });
    if (!project || project.completedAt || project.archivedAt || project.closure) return null;
    if ([project.status?.slug, project.status?.name, project.status?.group?.slug, project.status?.group?.name]
      .some(value => value && /^(completed|complete|closed|archived)$/i.test(value))) return null;
    participants = [project.ownerId, ...project.coOwners.map(row => row.userId), ...project.executors.map(row => row.userId)].filter((id): id is string => !!id);
    managed = director || (managerRole && (project.ownerId === actor.userId || project.coOwners.some(row => row.userId === actor.userId)));
    const stageKey = resource.stageKey ?? spec.stage;
    if (stageKey) {
      const stage = project.workflowStages.find(row => row.stageKey === stageKey as ProjectWorkflowStageKey);
      if (!stage || (spec.mode !== "intervene" && stage.status !== "AVAILABLE")) return null;
    }
    if (resource.stageId && spec.mode !== "intervene") {
      const stage = await tx.projectStage.findUnique({ where: { id: resource.stageId }, select: { status: true, order: true, isTasker: true } });
      if (!stage || stage.status === "COMPLETED") return null;
      if (!stage.isTasker && await tx.projectStage.count({ where: {
        projectId: resource.projectId, isTasker: false,
        order: { lt: stage.order }, status: { not: "COMPLETED" },
      } })) return null;
    }
  } else {
    const project = await tx.flexibleProject.findUnique({ where: { id: resource.projectId }, select: { ownerId: true, status: true, completedAt: true } });
    if (!project || project.status === "COMPLETED" || project.completedAt) return null;
    if (["milestone", "flexible-file"].includes(target.kind)) {
      const milestoneId = target.kind === "milestone" ? target.id : (await tx.flexibleProjectAttachment.findUnique({where:{id:target.id},select:{milestoneId:true}}))?.milestoneId;
      const milestone = milestoneId ? await tx.flexibleMilestone.findUnique({where:{id:milestoneId},select:{status:true}}) : null;
      if (!milestone || milestone.status === "COMPLETED") return null;
    }
    // Existing collaborator records remain readable compatibility data, not co-ownership.
    participants = [project.ownerId, ...(resource.executorId ? [resource.executorId] : [])];
    managed = director || (managerRole && project.ownerId === actor.userId);
  }
  let allowed = managed;
  if (spec.mode === "execute") allowed = director || resource.executorId === actor.userId || (resource.projectKind === "flexible" && managed);
  if (spec.mode === "comment" || spec.mode === "file") allowed = managed || resource.executorId === actor.userId;
  if (resource.privateOwnerId) allowed = director || (participants.includes(actor.userId) && resource.privateOwnerId === actor.userId);
  if (spec.mode === "private") allowed = director || (participants.includes(actor.userId) && resource.privateOwnerId === actor.userId);
  if (spec.mode === "respond") allowed = managed && resource.recipientId === actor.userId;
  if (spec.mode === "complete") allowed = director;
  // Native reopening methods enforce downstream/version integrity themselves.
  // They already persist STAGE_SKIP_REVOKED or versioned approval evidence.
  if (spec.mode === "intervene") allowed = director && !!request.reason?.trim();
  if (!allowed) return null; // Director also cannot bypass recipient or integrity checks.
  return { resource: { id: request.targetId, kind: "project", projectId: resource.projectId },
    project: { id: resource.projectId, participantUserIds: participants }, resourcePermission: true,
    integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
}

const loadWriteContext = ({ tx, actor, request }: WritePolicyInput) => projectWriteContext(tx, actor, request);
export const projectWritePolicies: ResourcePolicies = Object.freeze({
  "project.edit": loadWriteContext,
  "project.manageParticipants": loadWriteContext,
  "project.manageStage": loadWriteContext,
  "project.executeTask": loadWriteContext,
  "project.writeFile": loadWriteContext,
  "project.comment": loadWriteContext,
  "project.respond": loadWriteContext,
  "project.approveCompletion": loadWriteContext,
  "project.directorIntervention": loadWriteContext,
});

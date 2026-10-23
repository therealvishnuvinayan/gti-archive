import "server-only";
import type { Prisma, ProjectPrivateFolder, ProjectResearchFolder, ProjectResearchWorkspace, UniversalTask, UniversalTaskTarget } from "@prisma/client";
import { approvalHash } from "../approvals/contracts";
import { projectWriteContext } from "../authorization/project-write-policies";
import { getStageFiveFieldDefinition } from "../stage-five-fields";
import { validateChecklistValue } from "../stage-five";
import { ensure, id, text, taskInputFields } from "./contracts";

import { authorizedRuntimeTarget, runtimeProposedValue } from "./runtime-targets";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { runtimeCreationScope, runtimeContext, isRuntimeTask } from "./runtime-context";

type Tx = Prisma.TransactionClient;
export type TargetChoice = { target: string; label: string; modes: string[]; projectId: string };
export function parseDeliverableTarget(raw: unknown) {
  const value = text(raw, 160), [kind, nativeId, extra] = value.split(":");
  ensure(["private-folder", "research-folder", "checklist"].includes(kind) && !extra, "UNSUPPORTED_TARGET");
  return { kind, nativeId: id(nativeId) };
}
export async function resolveDeliverableTarget(tx: Tx, raw: unknown) {
  const { kind, nativeId } = parseDeliverableTarget(raw);
  if (kind === "checklist") {
    const [fieldToken] = await tx.$queryRaw<Array<{ token: string }>>`SELECT i.xmin::text AS token FROM "ProjectFileChecklistItem" i JOIN "ProjectFileChecklist" c ON c.id=i."checklistId" JOIN "ProjectStageFileHandoff" h ON h.id=c."handoffId" WHERE i.id=${nativeId} FOR UPDATE OF i,c,h`;
    const item = await tx.projectFileChecklistItem.findUnique({ where: { id: nativeId }, include: { attachments: true, checklist: { include: { handoff: true, sourceAttachment: true } } } });
    ensure(item, "TARGET_UNAVAILABLE", 409);
    const c = item.checklist, stage = await tx.projectWorkflowStage.findUnique({ where: { projectId_stageKey: { projectId: c.projectId, stageKey: "FINAL_LAYOUT" } } });
    ensure(stage?.status === "AVAILABLE" && c.handoff.projectId === c.projectId && c.handoff.targetWorkflowStageKey === "FINAL_LAYOUT" && c.sourceAttachment.projectId === c.projectId && c.sourceAttachment.status === "READY" && c.handoff.sourceAttachmentId === c.sourceAttachmentId, "TARGET_UNAVAILABLE", 409);
    ensure(taskInputFields.includes(item.fieldKey), "UNSUPPORTED_FIELD");
    const field = getStageFiveFieldDefinition(item.fieldKey);
    const modes = field?.control === "text" ? ["TEXT"] : ["file", "multi-file"].includes(field?.control ?? "") ? ["FILE"] : field?.control === "text-attachment" ? ["TEXT", "FILE", "TEXT_FILE"] : [];
    ensure(modes.length, "UNSUPPORTED_FIELD");
    const identity = { projectId: c.projectId, stageId: stage.id, stageKey: stage.stageKey, checklistId: c.id, handoffId: c.handoffId, sourceAttachmentId: c.sourceAttachmentId, fieldKey: item.fieldKey, fieldType: field!.control, nativeId };
    const state = { version: fieldToken.token, value: item.value, attachmentIds: item.attachments.map(a => a.attachmentId).sort(), status: item.status, updatedAt: item.updatedAt.toISOString() };
    return { kind, nativeId, projectId: c.projectId, label: `Final Layout · ${c.sourceAttachment.originalFileName} · ${field!.title}`, modes, identity, state,
      capability: "project.manageStage", permissionTarget: `saveStageFiveChecklist/structured:${c.projectId}` };
  }
  // Native writers lock Project first; these table locks also serialize ancestor
  // moves/deletions that would otherwise invalidate a captured destination.
  await tx.$executeRaw`LOCK TABLE "ProjectPrivateFolder", "ProjectResearchFolder", "ProjectResearchWorkspace" IN SHARE MODE`;
  const path: { id: string; parentId: string | null }[] = [];
  let projectId = "", workspace = "", ownerId = "", label = "", cursor: string | null = nativeId;
  while (cursor) {
    ensure(path.length < 100 && !path.some(p => p.id === cursor), "INVALID_FOLDER_HIERARCHY", 409);
    if (kind === "private-folder") {
      const f: ProjectPrivateFolder | null = await tx.projectPrivateFolder.findUnique({ where: { id: cursor } }); ensure(f, "TARGET_UNAVAILABLE", 409);
      if (!path.length) { projectId = f.projectId; ownerId = f.ownerUserId; label = `Private folder · ${f.name}`; }
      ensure(f.projectId === projectId && f.ownerUserId === ownerId, "INVALID_FOLDER_HIERARCHY");
      path.push({ id: f.id, parentId: f.parentFolderId }); cursor = f.parentFolderId;
    } else {
      const f: (ProjectResearchFolder & { workspace: ProjectResearchWorkspace }) | null = await tx.projectResearchFolder.findUnique({ where: { id: cursor }, include: { workspace: true } }); ensure(f, "TARGET_UNAVAILABLE", 409);
      if (!path.length) { projectId = f.workspace.projectId; workspace = f.workspaceId; ownerId = f.workspace.ownerUserId; label = `Research folder · ${f.name}`; }
      ensure(f.workspaceId === workspace, "INVALID_FOLDER_HIERARCHY");
      path.push({ id: f.id, parentId: f.parentFolderId }); cursor = f.parentFolderId;
    }
  }
  return { kind, nativeId, projectId, label, modes: ["FILE"], identity: { projectId, kind, nativeId, workspace, ownerId, path }, state: {}, capability: "project.writeFile",
    permissionTarget: `${kind === "private-folder" ? "requestProjectPrivateFileUpload" : "requestProjectResearchFileUpload"}/${kind}:${nativeId}` };
}
export async function authorizedTarget(tx: Tx, userId: string, raw: unknown) {
  if (typeof raw === "string" && raw.startsWith("runtime-")) return authorizedRuntimeTarget(tx, userId, raw);
  const auth = await tx.userAuthorization.findUnique({ where: { userId } });
  ensure(auth?.accountStatus === "ACTIVE" && auth.businessRole, "TARGET_ACCESS_REVOKED", 403);
  const parsed = parseDeliverableTarget(raw);
  if (parsed.kind === "checklist") ensure(["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(auth.businessRole), "DATA_INPUT_ROLE_DENIED", 403);
  // Resolve once to identify the project, lock its native root, then re-resolve.
  const projectId = parsed.kind === "checklist" ? (await tx.projectFileChecklistItem.findUnique({ where: { id: parsed.nativeId }, select: { checklist: { select: { projectId: true } } } }))?.checklist.projectId
    : parsed.kind === "private-folder" ? (await tx.projectPrivateFolder.findUnique({ where: { id: parsed.nativeId }, select: { projectId: true } }))?.projectId
    : (await tx.projectResearchFolder.findUnique({ where: { id: parsed.nativeId }, select: { workspace: { select: { projectId: true } } } }))?.workspace.projectId;
  ensure(projectId, "TARGET_UNAVAILABLE", 409);
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
  const target = await resolveDeliverableTarget(tx, raw);
  const permission = await projectWriteContext(tx, { userId, businessRole: auth.businessRole }, { capability: target.capability, targetId: target.permissionTarget });
  ensure(target.projectId === projectId && permission, "TARGET_ACCESS_REVOKED", 403);
  return { ...target, participantUserIds: permission.project?.participantUserIds ?? [] };
}
export async function recheckTarget(tx: Tx, task: UniversalTask, reviewerId: string, compareState = true) {
  const stored = await tx.universalTaskTarget.findUniqueOrThrow({ where: { taskId: task.id } });
  const raw = `${stored.kind}:${stored.nativeId}`;
  const current = await authorizedTarget(tx, task.ownerId, raw);
  if (reviewerId !== task.ownerId) await authorizedTarget(tx, reviewerId, raw);
  ensure(current.projectId === (isRuntimeTask(task) ? (await runtimeContext(tx, task.id)).projectId : task.projectId) && approvalHash(current.identity) === stored.identityHash, "TARGET_MOVED_OR_REPLACED", 409);
  if (compareState) ensure(approvalHash(current.state) === stored.expectedHash, "FIELD_CONFLICT_REFRESH_AND_RESUBMIT", 409);
  return { stored, current };
}
export async function targetChoices(tx: Tx, actorId: string, projectIds: string[], runtimeProjectIds: string[] = []): Promise<TargetChoice[]> {
  const [privateFolders, researchFolders, fields] = await Promise.all([
    tx.projectPrivateFolder.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } }),
    tx.projectResearchFolder.findMany({ where: { workspace: { projectId: { in: projectIds } } }, select: { id: true } }),
    tx.projectFileChecklistItem.findMany({ where: { checklist: { projectId: { in: projectIds } } }, select: { id: true } }),
  ]);
  const result: TargetChoice[] = [];
  for (const raw of [...privateFolders.map(f => `private-folder:${f.id}`), ...researchFolders.map(f => `research-folder:${f.id}`), ...fields.map(f => `checklist:${f.id}`)]) {
    try { const t = await authorizedTarget(tx, actorId, raw); result.push({ target: raw, label: t.label, modes: t.modes, projectId: t.projectId }); }
    catch (error) { if (!(error instanceof Error) || error.name !== "TaskerError") throw error; }
  }
  if (runtimeIntegrationEnabled() && runtimeProjectIds.length) {
    const auth = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: actorId } });
    const stages = await tx.runtimeStage.findMany({ where: { projectId: { in: runtimeProjectIds }, project: runtimeCreationScope(actorId, auth.businessRole), state: { not: "COMPLETED" } } });
    for (const stage of stages) {
      const definition = stage.configuration as unknown as import("../stage-builder/contracts").StageDefinition;
      for (const c of definition.capabilities) for (const raw of c.type === "FILE_REQUIREMENT" ? [`runtime-file:${stage.id}:${c.id}`] : c.type === "INFORMATION" ? c.fields.filter(f => f.type !== "READ_ONLY").map(f => `runtime-field:${stage.id}:${c.id}:${f.id}`) : []) {
        try { const t = await authorizedTarget(tx, actorId, raw); result.push({ target: raw, label: t.label, modes: t.modes, projectId: t.projectId }); }
        catch (error) { if (!(error instanceof Error) || error.name !== "TaskerError") throw error; }
      }
    }
  }
  return result;
}
export function proposedValue(target: UniversalTaskTarget, proposedText: unknown, fileCount: number) {
  const mode = target.inputMode, needsText = ["TEXT", "TEXT_FILE"].includes(mode), needsFiles = ["FILE", "TEXT_FILE"].includes(mode);
  const value = text(proposedText, 20000, !needsText);
  ensure(needsFiles ? fileCount > 0 : fileCount === 0, "INPUT_MODE_FILES_REQUIRED");
  ensure(needsText || !value, "INPUT_MODE_TEXT_DENIED");
  if (target.kind === "runtime-field") return runtimeProposedValue(target.identity, value);
  if (target.kind !== "checklist") return {};
  const identity = target.identity as { fieldKey: Parameters<typeof validateChecklistValue>[0]; fieldType: string };
  ensure(identity.fieldType !== "file" || fileCount === 1, "SINGLE_FILE_REQUIRED");
  const checked = validateChecklistValue(identity.fieldKey, { text: value });
  ensure(!("error" in checked), "INVALID_FIELD_VALUE");
  ensure(!needsText || checked.value.text?.trim(), "PROPOSED_TEXT_REQUIRED");
  return checked.value as Prisma.InputJsonObject;
}

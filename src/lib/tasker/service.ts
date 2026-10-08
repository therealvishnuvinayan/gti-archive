import { createHash } from "node:crypto";
import { Prisma, type ProjectFileChecklistField, type TaskerTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canUseTasks, getAccessibleProjectsWhere, type PermissionUser } from "@/lib/permissions/resolver";
import { deriveUserTaskDisplayState } from "@/lib/user-projects";
import { getTaskProjectAdapter, assertTaskParticipant, assertTaskDestination, publicTaskField, validateTaskFieldValue, type ProjectTaskContext, type AdapterField, type TaskDb, type PublishedTaskFile } from "./adapters";
import { TaskerError, taskAssert } from "./errors";
import { lockTaskerProject } from "./field-changes";
import type { TaskCreateInput, TaskCreateOptions, TaskDetail, TaskField, TaskListItem, TaskMutation, TaskProjectRef, TaskStatus, TaskValue } from "./types";

export const terminalTaskStatuses: TaskStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];
const personSelect = { id: true, name: true, email: true } as const;
const taskInclude = { owner: { select: personSelect }, assignee: { select: personSelect }, coOwner: { select: personSelect }, participants: { select: { userId: true } }, project: { select: { name: true, ownerId: true, coOwners: { select: { userId: true } } } }, flexibleProject: { select: { name: true, ownerId: true } } } satisfies Prisma.TaskerTaskInclude;
type TaskRecord = Prisma.TaskerTaskGetPayload<{ include: typeof taskInclude }>;
const option = (u: { id: string; name: string | null; email: string }) => ({ id: u.id, label: u.name || u.email });
export const taskProjectRef = (task: Pick<TaskerTask, "projectId" | "flexibleProjectId">): TaskProjectRef => task.projectId ? { projectType: "STRUCTURED", projectId: task.projectId } : { projectType: "FLEXIBLE", projectId: task.flexibleProjectId! };
const isManager = (task: TaskerTask, userId: string) => task.ownerId === userId || task.coOwnerId === userId;
const fieldSnapshot = (field: AdapterField) => ({ value: field.value, revision: field.revision });
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const fieldToken = (field: AdapterField) => createHash("sha256").update(stableJson(fieldSnapshot(field))).digest("hex");
function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull { return value === null || value === undefined ? Prisma.JsonNull : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function text(value: unknown, label: string, max: number, required = false): string {
  taskAssert(typeof value === "string" && value.length <= max, `${label} must be text, up to ${max} characters.`);
  const result = value.trim();
  if (required) taskAssert(result, `${label} is required.`);
  return result;
}
function dueDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  taskAssert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Enter a valid deadline.");
  return new Date(`${value}T23:59:59.999Z`);
}
function participantIds(value: unknown, context: ProjectTaskContext): string[] {
  taskAssert(Array.isArray(value) && value.length <= 100 && value.every((id) => typeof id === "string"), "Invalid task participants.");
  const ids = [...new Set(value as string[])];
  ids.forEach((id) => assertTaskParticipant(context, id));
  return ids;
}
export function taskAccessWhere(user: PermissionUser): Prisma.TaskerTaskWhereInput {
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  const eligible: Prisma.TaskerTaskWhereInput = { OR: [
    { project: { OR: [{ ownerId: user.id }, { coOwners: { some: { userId: user.id } } }, { executors: { some: { userId: user.id } } }] } },
    { flexibleProject: { OR: [{ ownerId: user.id }, { collaborators: { some: { userId: user.id } } }] } },
  ] };
  return { deletedAt: null, AND: [eligible, { OR: [{ ownerId: user.id }, { assigneeId: user.id }, { coOwnerId: user.id }, { participants: { some: { userId: user.id } } }, { project: { ownerId: user.id } }, { flexibleProject: { ownerId: user.id } }] }] };
}

function conceptTaskAccessWhere(user: PermissionUser, projectId?: string): Prisma.ProjectConceptFolderWhereInput {
  return {
    projectId,
    workflowStageKey: { in: ["CONCEPT_CREATION", "PROJECT_DEVELOPMENT"] },
    assignedExecutorId: { not: null },
    assignedById: { not: null },
    project: getAccessibleProjectsWhere(user),
    OR: [
      { project: { ownerId: user.id } },
      { assignedExecutorId: user.id },
      { assignedById: user.id },
    ],
  };
}

// Concept tasks remain part of the active Stage 3/4 workflow. Their status comes
// from that workflow so the common task list never invents a second review state.
async function listConceptTasks(user: PermissionUser, projectId?: string): Promise<TaskListItem[]> {
  const concepts = await prisma.projectConceptFolder.findMany({
    where: conceptTaskAccessWhere(user, projectId),
    include: {
      assignedExecutor: { include: { user: { select: personSelect } } },
      assignedBy: { select: personSelect },
      taskerStage: { select: {
        status: true, plannedDueAt: true, actualStartedAt: true, completedAt: true, updatedAt: true,
        revisions: { orderBy: [{ updatedAt: "desc" }, { revisionNumber: "desc" }], take: 1, select: { status: true, updatedAt: true } },
      } },
      project: { select: { name: true, ownerId: true, coOwners: { select: { userId: true } } } },
    },
  });
  return concepts.map((concept) => {
    const owner = concept.assignedBy!;
    const assignee = concept.assignedExecutor!.user;
    const stage = concept.workflowStageKey === "CONCEPT_CREATION" ? 3 : 4;
    const display = deriveUserTaskDisplayState(concept);
    const statuses = { COMPLETED: "COMPLETED", WAITING_FOR_REVIEW: "IN_REVIEW", NEEDS_ATTENTION: "CORRECTIONS_REQUESTED", IN_PROGRESS: "IN_PROGRESS", NOT_STARTED: "ASSIGNED" } as const;
    const updatedAt = [concept.updatedAt, concept.taskerStage.updatedAt, concept.taskerStage.revisions[0]?.updatedAt]
      .reduce<Date>((latest, date) => date && date > latest ? date : latest, concept.updatedAt);
    const showStage = concept.project.ownerId === user.id || concept.project.coOwners.some((person) => person.userId === user.id);
    return {
      id: concept.id, title: concept.name, kind: "CONCEPT", status: statuses[display.status],
      project: { projectId: concept.projectId, projectType: "STRUCTURED", name: concept.project.name },
      ...(showStage ? { stageLabel: `Stage ${stage}` } : {}),
      owner: option(owner), assignee: option(assignee), coOwner: null,
      dueAt: concept.taskerStage.plannedDueAt?.toISOString() ?? null, updatedAt: updatedAt.toISOString(),
      href: `/projects/${encodeURIComponent(concept.projectId)}/stages/${stage}/concepts/${encodeURIComponent(concept.id)}?returnTo=%2Ftasks`,
      viewOnly: owner.id !== user.id && assignee.id !== user.id,
    };
  });
}

export async function countTasks(user: PermissionUser): Promise<number> {
  if (!canUseTasks(user)) return 0;
  const counts = await Promise.all([
    prisma.taskerTask.count({ where: taskAccessWhere(user) }),
    prisma.projectConceptFolder.count({ where: conceptTaskAccessWhere(user) }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export async function taskTransaction<T>(run: (tx: TaskDb) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TaskerError("An active request already exists for that field, or the selected name is already in use.", 409);
      throw error;
    }
  }
}

export async function loadTaskForUser(db: TaskDb, user: PermissionUser, taskId: string) {
  const task = await db.taskerTask.findFirst({ where: { id: taskId, ...taskAccessWhere(user) }, include: taskInclude });
  taskAssert(task, "Task not found or no longer available.", 404);
  const ref = taskProjectRef(task);
  const context = await getTaskProjectAdapter(ref.projectType).load(db, ref.projectId);
  assertTaskParticipant(context, user.id);
  return { task, context };
}

function listItem(task: TaskRecord, userId: string): TaskListItem {
  const ref = taskProjectRef(task);
  const showStage = task.project?.ownerId === userId || task.project?.coOwners.some((c) => c.userId === userId) || task.flexibleProject?.ownerId === userId;
  return { id: task.id, title: task.title, kind: task.kind, status: task.status, project: { ...ref, name: task.project?.name ?? task.flexibleProject?.name ?? "Project" }, ...(showStage && task.stageRef ? { stageLabel: ref.projectType === "STRUCTURED" ? `Stage ${task.stageRef}` : "Milestone task" } : {}), owner: option(task.owner), assignee: option(task.assignee), coOwner: task.coOwner ? option(task.coOwner) : null, dueAt: task.dueAt?.toISOString() ?? null, updatedAt: task.updatedAt.toISOString(), href: `/tasks/${task.id}`, viewOnly: !isManager(task, userId) && task.assigneeId !== userId };
}

export async function listTasks(user: PermissionUser, ref?: TaskProjectRef): Promise<TaskListItem[]> {
  const where = taskAccessWhere(user);
  if (ref) {
    const context = await getTaskProjectAdapter(ref.projectType).load(prisma, ref.projectId);
    assertTaskParticipant(context, user.id);
    Object.assign(where, ref.projectType === "STRUCTURED" ? { projectId: ref.projectId } : { flexibleProjectId: ref.projectId });
  }
  const [tasks, concepts] = await Promise.all([
    prisma.taskerTask.findMany({ where, include: taskInclude }),
    ref?.projectType === "FLEXIBLE" ? Promise.resolve([]) : listConceptTasks(user, ref?.projectId),
  ]);
  return [...tasks.map((task) => listItem(task, user.id)), ...concepts]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export async function getTaskCreateOptions(user: PermissionUser, ref: TaskProjectRef): Promise<TaskCreateOptions> {
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  const context = await getTaskProjectAdapter(ref.projectType).load(prisma, ref.projectId);
  assertTaskParticipant(context, user.id);
  const showStages = context.ownerId === user.id || context.coOwnerIds.includes(user.id);
  return { ...ref, name: context.name, people: context.people, stages: showStages ? context.stages : [], fields: context.fields.map((f) => publicTaskField(f, showStages)), destinations: context.destinations, showStages };
}

export async function listTaskProjects(user: PermissionUser) {
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  const [structured, flexible] = await Promise.all([
    prisma.project.findMany({ where: { OR: [{ ownerId: user.id }, { coOwners: { some: { userId: user.id } } }, { executors: { some: { userId: user.id } } }] }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
    prisma.flexibleProject.findMany({ where: { OR: [{ ownerId: user.id }, { collaborators: { some: { userId: user.id } } }] }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return [...structured.map((p) => ({ projectType: "STRUCTURED" as const, projectId: p.id, name: p.name })), ...flexible.map((p) => ({ projectType: "FLEXIBLE" as const, projectId: p.id, name: p.name }))];
}

async function event(db: TaskDb, task: TaskerTask, context: ProjectTaskContext, actorId: string, action: string, note = "", detail?: unknown, extraRecipients: string[] = []) {
  const entry = await db.taskerEvent.create({ data: { taskId: task.id, actorId, action, note, detail: json(detail) } });
  const added = await db.taskerParticipant.findMany({ where: { taskId: task.id }, select: { userId: true } });
  const ids = [...new Set([task.ownerId, task.assigneeId, task.coOwnerId, context.ownerId, ...added.map((p) => p.userId), ...extraRecipients])].filter((id): id is string => Boolean(id && id !== actorId && context.people.some((p) => p.id === id)));
  const subject = `Task ${action.toLowerCase().replaceAll("_", " ")}: ${task.title}`;
  // Sensitive field responses, project stages, and chat content never appear in email previews.
  const message = `A task in ${context.name} has been updated. Open the task to see the details.`;
  for (const userId of ids) {
    const dedupeKey = `tasker:${entry.id}:${userId}`;
    await db.notification.create({ data: { userId, type: "TASKER_UPDATED", entityType: "TASKER_TASK", entityId: task.id, title: subject, message, projectId: task.projectId, url: `/tasks/${task.id}`, dedupeKey } });
    await db.taskerDelivery.create({ data: { taskId: task.id, userId, dedupeKey, subject, message } });
  }
}

export async function createTask(user: PermissionUser, input: TaskCreateInput) {
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  taskAssert(typeof input.projectId === "string" && input.projectId.length > 0 && input.projectId.length <= 200, "Choose a valid project.");
  const title = text(input.title, "Task title", 160, true), brief = text(input.brief, "Task brief", 20000, true);
  taskAssert(["FIELD_INPUT", "FILE_REQUEST", "GENERAL"].includes(input.kind), "Select a task type.");
  return taskTransaction(async (db) => {
    await lockTaskerProject(db, input.projectId);
    const adapter = getTaskProjectAdapter(input.projectType);
    const context = await adapter.load(db, input.projectId);
    assertTaskParticipant(context, user.id);
    assertTaskParticipant(context, input.assigneeId);
    if (input.coOwnerId) assertTaskParticipant(context, input.coOwnerId);
    const observers = participantIds(input.participantIds ?? [], context);
    const target = input.kind === "FIELD_INPUT" ? context.fields.find((f) => f.id === input.targetId) : null;
    if (input.kind === "FIELD_INPUT") taskAssert(target, "Choose an available editable field.");
    if (input.kind === "FILE_REQUEST") assertTaskDestination(context, input.destinationId ?? "", user.id, input.assigneeId);
    const stageRef = target?.stageRef ?? input.stageRef ?? null;
    if (stageRef) taskAssert(context.stages.some((s) => s.id === stageRef), "Choose a valid stage or milestone.");
    if (target?.scope === "checklist") {
      const pendingChecklistRequests = await db.projectFileChecklistRequest.count({ where: { checklistId: target.recordId, fieldKey: target.key as ProjectFileChecklistField, workflowStatus: { in: ["REQUESTED", "ACCEPTED"] } } });
      taskAssert(!pendingChecklistRequests, "This field already has a pending checklist information request.", 409);
    }
    const task = await db.taskerTask.create({ data: {
      ...(input.projectType === "STRUCTURED" ? { projectId: input.projectId } : { flexibleProjectId: input.projectId }),
      title, brief, kind: input.kind, ownerId: user.id, assigneeId: input.assigneeId, coOwnerId: input.coOwnerId || null,
      stageRef, targetId: target?.id, targetDefinition: target ? json(publicTaskField(target)) : Prisma.DbNull,
      targetSnapshot: target ? json(fieldSnapshot(target)) : Prisma.DbNull, activeTargetKey: target ? `${input.projectType}:${input.projectId}:${target.id}` : null,
      destinationId: input.kind === "FILE_REQUEST" ? input.destinationId : null, dueAt: dueDate(input.dueAt), participants: { create: observers.map((userId) => ({ userId })) },
    } });
    await event(db, task, context, user.id, "ASSIGNED");
    return task.id;
  });
}

export async function getTaskDetail(user: PermissionUser, taskId: string): Promise<TaskDetail> {
  const { task, context } = await loadTaskForUser(prisma, user, taskId);
  const [submissions, history, pendingFiles] = await Promise.all([
    prisma.taskerSubmission.findMany({ where: { taskId }, include: { submittedBy: { select: personSelect }, files: true }, orderBy: { createdAt: "desc" } }),
    prisma.taskerEvent.findMany({ where: { taskId }, include: { actor: { select: personSelect } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.taskerFile.findMany({ where: { taskId, submissionId: null, uploadedById: user.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const target = context.fields.find((f) => f.id === task.targetId);
  const token = target ? fieldToken(target) : null;
  const hasConflict = Boolean(target && stableJson(fieldSnapshot(target)) !== stableJson(task.targetSnapshot));
  const active = !terminalTaskStatuses.includes(task.status);
  const fileRecord = (f: { id: string; originalFileName: string; fileSize: number; status: string; submissionId: string | null }) => ({ id: f.id, name: f.originalFileName, size: f.fileSize, status: f.status, submissionId: f.submissionId });
  const showStage = context.ownerId === user.id || context.coOwnerIds.includes(user.id);
  const canReview = isManager(task, user.id) && task.status === "IN_REVIEW";
  return { ...listItem(task, user.id), version: task.version, brief: task.brief,
    projectBrief: context.projectBrief, deliverables: context.deliverables, referenceFolders: context.referenceFolders,
    field: target ? publicTaskField(target, showStage) : task.targetDefinition ? publicTaskField(task.targetDefinition as unknown as TaskField, showStage) : null,
    currentValue: canReview && target ? target.draftValues?.length ? { saved: target.value, unsaved: target.draftValues } : target.value : null, conflictToken: canReview ? token : null, hasConflict: canReview && hasConflict,
    destination: context.destinations.find((d) => d.id === task.destinationId)?.label ?? null,
    canManage: isManager(task, user.id) && active, canReview, canSubmit: task.assigneeId === user.id && active && task.status !== "IN_REVIEW",
    canCancel: active && (isManager(task, user.id) || context.ownerId === user.id), canDelete: context.ownerId === user.id,
    people: isManager(task, user.id) ? context.people : [], participantIds: isManager(task, user.id) ? task.participants.map((p) => p.userId) : [],
    submissions: submissions.map((s) => ({ id: s.id, note: s.note, value: s.value as TaskValue, createdAt: s.createdAt.toISOString(), submittedBy: option(s.submittedBy), files: s.files.map(fileRecord) })),
    pendingFiles: pendingFiles.map(fileRecord), history: history.map((e) => ({ id: e.id, action: e.action, note: e.note, createdAt: e.createdAt.toISOString(), actor: option(e.actor) })),
  };
}

// File copies are prepared outside the transaction; acceptance still rechecks access,
// versions and field conflicts inside it before linking any files or applying data.
export async function mutateTask(user: PermissionUser, taskId: string, input: TaskMutation, preparedFiles: PublishedTaskFile[] = []) {
  taskAssert(Number.isSafeInteger(input.version) && input.version > 0, "Refresh the task before continuing.", 409);
  const note = text(input.note ?? "", "Message", 20000);
  return taskTransaction(async (db) => {
    const existing = await db.taskerTask.findUnique({ where: { id: taskId }, select: { projectId: true, flexibleProjectId: true } });
    taskAssert(existing, "Task not found.", 404);
    await lockTaskerProject(db, taskProjectRef(existing).projectId);
    const { task, context } = await loadTaskForUser(db, user, taskId);
    taskAssert(task.version === input.version, "This task changed. Refresh it and review the latest information.", 409);
    const manager = isManager(task, user.id), active = !terminalTaskStatuses.includes(task.status);
    let data: Prisma.TaskerTaskUpdateInput = { version: { increment: 1 } };
    let detail: unknown;
    let extraRecipients: string[] = [];
    if (input.action === "COMMENT") { taskAssert(note, "Write a message."); }
    else if (input.action === "DELETE") {
      taskAssert(context.ownerId === user.id, "Only the project owner can delete this task.", 403);
      data = { ...data, deletedAt: new Date(), activeTargetKey: null };
    } else {
      taskAssert(active, "This task has ended. Its submissions and history are preserved.", 409);
      if (["START", "DECLINE", "SUBMIT"].includes(input.action)) {
        taskAssert(task.assigneeId === user.id, "Only the current recipient can respond to this task.", 403);
        taskAssert(task.status !== "IN_REVIEW", "The submission is awaiting review.", 409);
      }
      if (input.action === "START") { taskAssert(task.status === "ASSIGNED", "This task has already started.", 409); data.status = "IN_PROGRESS"; }
      else if (input.action === "DECLINE") { taskAssert(note, "Explain why the task is declined."); data = { ...data, status: "REJECTED", activeTargetKey: null }; }
      else if (input.action === "SUBMIT") {
        taskAssert(Array.isArray(input.fileIds ?? []) && (input.fileIds?.length ?? 0) <= 20 && (input.fileIds ?? []).every((id) => typeof id === "string" && id.length <= 200), "Select up to 20 files.");
        const fileIds = [...new Set(input.fileIds ?? [])];
        const files = await db.taskerFile.findMany({ where: { id: { in: fileIds }, taskId, uploadedById: user.id, submissionId: null, status: "READY" } });
        taskAssert(files.length === fileIds.length, "Some files are not ready or do not belong to this submission.");
        let value: TaskValue = null;
        if (task.kind === "FIELD_INPUT") {
          const target = context.fields.find((f) => f.id === task.targetId);
          taskAssert(target, "This field no longer exists. Ask the task owner to cancel the request.", 409);
          value = validateTaskFieldValue(target, input.value, fileIds);
        } else if (task.kind === "FILE_REQUEST") {
          assertTaskDestination(context, task.destinationId!, task.ownerId, task.assigneeId);
          taskAssert(files.length, "Upload the requested files.");
        } else taskAssert(note || files.length, "Add a response or attach your work.");
        const submission = await db.taskerSubmission.create({ data: { taskId, submittedById: user.id, value: json(value), note } });
        await db.taskerFile.updateMany({ where: { id: { in: fileIds }, submissionId: null }, data: { submissionId: submission.id } });
        data.status = "IN_REVIEW";
        detail = { submissionId: submission.id };
      } else if (["ACCEPT", "REJECT", "CORRECTIONS"].includes(input.action)) {
        taskAssert(manager, "Only the task owner or task co-owner can review submissions.", 403);
        taskAssert(task.status === "IN_REVIEW", "There is no submission awaiting review.", 409);
        const submission = await db.taskerSubmission.findFirst({ where: { taskId }, include: { files: true }, orderBy: { createdAt: "desc" } });
        taskAssert(submission, "Submission not found.");
        detail = { submissionId: submission.id };
        if (input.action === "ACCEPT") {
          if (task.kind === "FIELD_INPUT") {
            const target = context.fields.find((f) => f.id === task.targetId);
            taskAssert(target, "The requested field no longer exists.", 409);
            const changed = stableJson(fieldSnapshot(target)) !== stableJson(task.targetSnapshot);
            if (changed) taskAssert(input.conflictToken === fieldToken(target), "The field changed while this task was pending. Review the current value and explicitly confirm replacement.", 409);
            const value = validateTaskFieldValue(target, submission.value, submission.files.map((f) => f.id));
            await publishFiles(db, task, context, submission.files, preparedFiles, target);
            await getTaskProjectAdapter(context.projectType).apply(db, context, target, value, preparedFiles, user.id, taskId);
            detail = { submissionId: submission.id, previous: fieldSnapshot(target), conflictReviewed: changed };
          } else if (task.kind === "FILE_REQUEST") {
            assertTaskDestination(context, task.destinationId!, task.ownerId, task.assigneeId);
            await publishFiles(db, task, context, submission.files, preparedFiles);
          }
          data = { ...data, status: "COMPLETED", completedAt: new Date(), activeTargetKey: null };
        } else {
          taskAssert(note, "Explain the requested corrections or rejection.");
          data = { ...data, status: input.action === "REJECT" ? "REJECTED" : "CORRECTIONS_REQUESTED", ...(input.action === "REJECT" ? { activeTargetKey: null } : {}) };
        }
      } else if (input.action === "CANCEL") {
        taskAssert(manager || context.ownerId === user.id, "You cannot cancel this task.", 403);
        taskAssert(note, "Give a reason for cancellation.");
        data = { ...data, status: "CANCELLED", activeTargetKey: null };
      } else if (input.action === "REASSIGN") {
        taskAssert(manager, "Only the task owner or co-owner can reassign it.", 403);
        taskAssert(task.status !== "IN_REVIEW", "Review the current submission before reassigning the task.", 409);
        assertTaskParticipant(context, input.assigneeId ?? "");
        taskAssert(input.assigneeId !== task.assigneeId, "Choose a different recipient.");
        if (task.destinationId) assertTaskDestination(context, task.destinationId, task.ownerId, input.assigneeId!);
        data = { ...data, assignee: { connect: { id: input.assigneeId! } }, status: "ASSIGNED" };
        detail = { previousAssigneeId: task.assigneeId, assigneeId: input.assigneeId };
        // Reassignment is an explicit addition: the old recipient retains their own task history.
        await db.taskerParticipant.upsert({ where: { taskId_userId: { taskId, userId: task.assigneeId } }, create: { taskId, userId: task.assigneeId }, update: {} });
        extraRecipients = [task.assigneeId];
      } else if (input.action === "MANAGE") {
        taskAssert(manager, "Only the task owner or co-owner can manage it.", 403);
        const ids = participantIds(input.participantIds ?? task.participants.map((p) => p.userId), context);
        if (input.coOwnerId) assertTaskParticipant(context, input.coOwnerId);
        await db.taskerParticipant.deleteMany({ where: { taskId } });
        await db.taskerParticipant.createMany({ data: ids.map((userId) => ({ taskId, userId })) });
        if (input.coOwnerId !== undefined) data.coOwner = input.coOwnerId ? { connect: { id: input.coOwnerId } } : { disconnect: true };
        if (input.dueAt !== undefined) data.dueAt = dueDate(input.dueAt);
        detail = { participantIds: ids, coOwnerId: input.coOwnerId === undefined ? task.coOwnerId : input.coOwnerId, dueAt: input.dueAt };
      } else taskAssert(false, "Unknown task action.");
    }
    const updated = await db.taskerTask.update({ where: { id: task.id }, data });
    await event(db, updated, context, user.id, input.action, note, detail, extraRecipients);
    return { id: taskId, version: updated.version, deleted: input.action === "DELETE" };
  });
}

async function publishFiles(db: TaskDb, task: TaskerTask, context: ProjectTaskContext, files: Array<{ id: string; storageKey: string; bucket: string; originalFileName: string; mimeType: string; fileSize: number; uploadedById: string }>, prepared: PublishedTaskFile[], field?: AdapterField) {
  taskAssert(files.length === prepared.length && files.every((f) => prepared.some((p) => p.id === `${f.id}-published`)), "Files must be prepared before acceptance.", 409);
  for (const file of files) {
    const id = `${file.id}-published`, storageKey = `tasker/published/${task.id}/${file.id}`;
    const common = { id, uploadedById: file.uploadedById, fileName: file.originalFileName, originalFileName: file.originalFileName, mimeType: file.mimeType, fileSize: file.fileSize, bucket: file.bucket, storageKey, status: "READY" as const };
    if (context.projectType === "FLEXIBLE") {
      await db.flexibleProjectAttachment.create({ data: { ...common, projectId: context.projectId, milestoneId: task.destinationId } });
    } else {
      await db.projectAttachment.create({ data: { ...common, projectId: context.projectId, assetType: field?.scope === "checklist" ? "FILE_CHECKLIST_ATTACHMENT" : field?.scope === "inquiry" ? "GENERAL_PROJECT_ASSET" : "PROJECT_RESEARCH_FILE" } });
      if (task.destinationId) await db.projectResearchFolderFile.create({ data: { folderId: task.destinationId, attachmentId: id, addedById: file.uploadedById } });
    }
    await db.taskerFile.update({ where: { id: file.id }, data: { publishedId: id } });
  }
}

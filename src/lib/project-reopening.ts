import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PermissionUser } from "@/lib/permissions/resolver";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS, getProjectWorkflowSequenceState } from "@/lib/project-workflow";
import { isProjectStatusCompleted } from "@/lib/project-statuses";
import { lockTaskerProject } from "@/lib/tasker/field-changes";
import { taskAssert } from "@/lib/tasker/errors";
import type { TaskProjectRef } from "@/lib/tasker/types";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const historySelect = { id: true, targetLabel: true, reason: true, createdAt: true, snapshot: true, actor: { select: { name: true, email: true } } } satisfies Prisma.ProjectReopeningSelect;
const refWhere = (ref: TaskProjectRef) => ref.projectType === "STRUCTURED" ? { projectId: ref.projectId } : { flexibleProjectId: ref.projectId };

function validateRef(ref: TaskProjectRef) {
  taskAssert(ref && ["STRUCTURED", "FLEXIBLE"].includes(ref.projectType) && typeof ref.projectId === "string" && ref.projectId.length > 0, "Choose a project.");
}

export async function getProjectReopening(user: PermissionUser, ref: TaskProjectRef) {
  validateRef(ref);
  return prisma.$transaction(async (db) => {
    const project = ref.projectType === "STRUCTURED"
      ? await db.project.findUnique({ where: { id: ref.projectId }, include: { coOwners: { select: { userId: true } }, workflowStages: true } })
      : await db.flexibleProject.findUnique({ where: { id: ref.projectId }, include: { milestones: { orderBy: { sortOrder: "asc" } } } });
    taskAssert(project, "Project not found.", 404);
    taskAssert(project.ownerId === user.id || ("coOwners" in project && project.coOwners.some((p) => p.userId === user.id)), "Only the project owner and co-owners can view reopening history.", 403);
    const completed = "workflowStages" in project ? getProjectWorkflowSequenceState(project.workflowStages).kind === "COMPLETED" : project.status === "COMPLETED";
    const history = await db.projectReopening.findMany({ where: refWhere(ref), select: historySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return {
      ...ref, name: project.name, canReopen: project.ownerId === user.id && completed,
      expectedUpdatedAt: project.updatedAt.toISOString(),
      targets: "workflowStages" in project ? PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((s) => ({ id: String(s.number), label: `${s.number}. ${s.name}` })) : project.milestones.map((m) => ({ id: m.id, label: m.name })),
      history: history.map((h) => {
        // Project co-ownership must not reveal unrelated task/revision content.
        const full = h.snapshot as Record<string, Prisma.JsonValue>;
        const snapshot = project.ownerId === user.id ? h.snapshot : json({ completedAt: full.completedAt, stages: full.stages, milestones: full.milestones }) as Prisma.JsonValue;
        return { ...h, snapshot, createdAt: h.createdAt.toISOString(), actor: h.actor.name || h.actor.email };
      }),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export type ProjectReopeningView = Awaited<ReturnType<typeof getProjectReopening>>;
export type ReopenProjectInput = TaskProjectRef & { targetRef: string; reason: string; expectedUpdatedAt: string };

export async function reopenProject(user: PermissionUser, input: ReopenProjectInput) {
  validateRef(input);
  taskAssert(typeof input.reason === "string" && input.reason.trim().length > 0 && input.reason.trim().length <= 4000, "Enter a reopening reason up to 4000 characters.");
  taskAssert(typeof input.targetRef === "string" && typeof input.expectedUpdatedAt === "string", "Choose where to resume and refresh the project.");
  // Native form/task actions share the advisory lock; flexible ordering shares the row lock.
  return prisma.$transaction(async (db) => {
    await lockTaskerProject(db, input.projectId);
    const rows = input.projectType === "STRUCTURED"
      ? await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`
      : await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FlexibleProject" WHERE "id" = ${input.projectId} FOR UPDATE`;
    taskAssert(rows.length, "Project not found.", 404);
    const now = new Date();
    let targetLabel: string, snapshot: unknown, href: string, recipients: string[];
    let protectedFileIds: string[] = [];
    if (input.projectType === "STRUCTURED") {
      const project = await db.project.findUniqueOrThrow({ where: { id: input.projectId }, include: {
        workflowStages: true, closures: true, coOwners: { select: { userId: true } }, status: { include: { group: true } },
        inquiry: { include: { parties: true, targetMarkets: true, deliverables: true, attachments: true } },
        fileChecklists: { include: { items: { include: { attachments: true } } } },
        conceptFolders: { include: { taskerStage: { include: { revisions: true } } } },
        archive: { include: { files: true } }, productionUnits: { where: { retiredAt: null }, include: {
          sourceAttachment: { select: { originalFileName: true } }, supervision: { include: { sampleRounds: { select: { id: true, sequence: true, name: true, status: true, decidedAt: true } } } },
          approvalSteps: { select: { id: true, sequence: true, status: true, decidedAt: true, sharedSnapshot: true, decisionComment: true, recipientName: true } },
          handover: { select: { id: true, sentAt: true, recipientName: true, contentSnapshot: true } },
        } },
      } });
      taskAssert(project.ownerId === user.id, "Only the project owner can reopen this project.", 403);
      taskAssert(project.updatedAt.toISOString() === input.expectedUpdatedAt, "The project changed. Refresh before reopening.", 409);
      taskAssert(getProjectWorkflowSequenceState(project.workflowStages).kind === "COMPLETED", "Only a completed seven-stage project can be reopened.", 409);
      const target = PROJECT_WORKFLOW_STAGE_DEFINITIONS.find((s) => String(s.number) === input.targetRef);
      taskAssert(target, "Choose a valid stage.");
      targetLabel = `Stage ${target.number} · ${target.name}`;
      snapshot = { name: project.name, description: project.description, completedAt: project.completedAt, archivedAt: project.archivedAt, workflowCycle: project.workflowCycle, stages: project.workflowStages, inquiry: project.inquiry, checklists: project.fileChecklists, concepts: project.conceptFolders, closures: project.closures, productionUnits: project.productionUnits, archive: project.archive };
      // Protect immutable issued files even if a later archive snapshot replaces the current archive listing.
      protectedFileIds = (await db.projectAttachment.findMany({ where: { projectId: project.id, status: "READY" }, select: { id: true } })).map((f) => f.id);
      const cycle = project.workflowCycle + 1;
      if (target.number <= 6) {
        await db.projectProductionUnit.updateMany({ where: { projectId: project.id, retiredAt: null }, data: { retiredAt: now } });
        if (target.number === 6) {
          for (const previous of project.productionUnits) {
            await db.projectProductionUnit.create({ data: {
              projectId: project.id, sourceHandoffId: previous.sourceHandoffId, sourceChecklistId: previous.sourceChecklistId, sourceAttachmentId: previous.sourceAttachmentId,
              createdById: user.id, cycle, approvalSteps: { create: { sequence: 1, isMarketingDirectorRequired: true } },
            } });
          }
        }
      } else {
        // Preserve accepted rounds. The snapshot retains the prior sign-off while a new round is required.
        for (const unit of project.productionUnits) {
          if (unit.supervision) await db.projectProductionSupervision.update({ where: { id: unit.supervision.id }, data: {
            status: "NOT_STARTED", signedOffAt: null, signedOffById: null,
            resumeAfterSequence: Math.max(0, ...unit.supervision.sampleRounds.map((r) => r.sequence)),
          } });
        }
      }
      await db.projectClosure.updateMany({ where: { projectId: project.id, reopenedAt: null }, data: { reopenedAt: now } });
      for (const stage of PROJECT_WORKFLOW_STAGE_DEFINITIONS.filter((s) => s.number >= target.number)) {
        await db.projectWorkflowStage.update({ where: { projectId_stageKey: { projectId: project.id, stageKey: stage.key } }, data: {
          status: stage.number === target.number ? "AVAILABLE" : "LOCKED", unlockedAt: stage.number === target.number ? now : null, completedAt: null,
        } });
      }
      await db.project.update({ where: { id: project.id }, data: {
        completedAt: null, archivedAt: null, workflowCycle: cycle, currentStageName: target.name,
        ...(isProjectStatusCompleted(project.status) ? { statusId: null } : {}),
      } });
      href = `/projects/${project.id}/stages/${target.number}`;
      recipients = project.coOwners.map((p) => p.userId);
    } else {
      const project = await db.flexibleProject.findUniqueOrThrow({ where: { id: input.projectId }, include: { milestones: { orderBy: { sortOrder: "asc" } } } });
      taskAssert(project.ownerId === user.id, "Only the project owner can reopen this project.", 403);
      taskAssert(project.updatedAt.toISOString() === input.expectedUpdatedAt, "The project changed. Refresh before reopening.", 409);
      taskAssert(project.status === "COMPLETED", "Only a completed project can be reopened.", 409);
      const target = project.milestones.find((m) => m.id === input.targetRef);
      taskAssert(target, "Choose a milestone in this project.");
      targetLabel = target.name;
      snapshot = { completedAt: project.completedAt, milestones: project.milestones };
      // Flexible milestones are independent: only the explicitly selected milestone resumes.
      await db.flexibleMilestone.update({ where: { id: target.id }, data: { status: "PENDING", completedAt: null, completedById: null } });
      await db.flexibleProject.update({ where: { id: project.id }, data: { status: "ACTIVE", completedAt: null } });
      href = `/projects/flexible/${project.slug}/milestones/${target.id}`;
      recipients = [];
    }
    const reopening = await db.projectReopening.create({ data: {
      ...refWhere(input), actorId: user.id, targetRef: input.targetRef, targetLabel, reason: input.reason.trim(), snapshot: json(snapshot),
      files: { create: protectedFileIds.map((attachmentId) => ({ attachmentId })) },
    } });
    await db.notification.createMany({ data: recipients.filter((id) => id !== user.id).map((userId) => ({ userId, type: "PROJECT_UPDATED", title: "Project reopened", message: `The project owner resumed ${targetLabel}.`, projectId: input.projectId, url: href, dedupeKey: `project-reopened:${reopening.id}:${userId}` })) });
    return { reopeningId: reopening.id, href };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

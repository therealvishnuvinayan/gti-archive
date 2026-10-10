import type { TaskerDelivery } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermissionProfileSnapshotForUser } from "@/lib/permissions/profiles";
import { canUseTasks } from "@/lib/permissions/resolver";
import { publishNotificationChanges } from "@/lib/realtime/server";
import { dependencyState } from "./dependency-runtime";
import { lockTaskerProject } from "./field-changes";
import { reminderRecipients, taskReminderActive } from "./reminder-schedule";
import type { TaskDb } from "./adapters";

const membershipInclude = {
  project: { select: { ownerId: true, coOwners: { select: { userId: true } }, executors: { select: { userId: true } } } },
  flexibleProject: { select: { ownerId: true, collaborators: { select: { userId: true } } } },
} as const;

async function liveReminder(db: TaskDb, taskId: string, now: Date) {
  const task = await db.taskerTask.findUnique({ where: { id: taskId }, include: membershipInclude });
  if (!task || !taskReminderActive(task) || task.dueAt! >= now || (await dependencyState(db, { type: "TASK", id: taskId })).paused) return null;
  const members = task.project
    ? [task.project.ownerId, ...task.project.coOwners.map((p) => p.userId), ...task.project.executors.map((p) => p.userId)]
    : [task.flexibleProject!.ownerId, ...task.flexibleProject!.collaborators.map((p) => p.userId)];
  return { task, recipients: reminderRecipients(task).filter((id) => members.includes(id)) };
}

// The outbox can outlive a task state or a deadline. Recheck immediately before
// sending, including current membership and approved holds. Old cycles expire.
export async function taskReminderDeliveryCurrent(delivery: Pick<TaskerDelivery, "taskId" | "userId" | "reminderGeneration" | "reminderExpiresAt">, now = new Date()) {
  if (delivery.reminderGeneration === null) return true;
  if (!delivery.taskId || !delivery.reminderExpiresAt || delivery.reminderExpiresAt <= now) return false;
  const live = await liveReminder(prisma, delivery.taskId, now);
  return !!live && live.task.reminderGeneration === delivery.reminderGeneration && live.recipients.includes(delivery.userId);
}

export async function processTaskDeadlineReminders(options: { now?: Date; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 50)));
  // Excluding holds here prevents a backlog of paused tasks starving active tasks.
  // Project completion deliberately does not end independently active Tasker work.
  const candidates = await prisma.$queryRaw<Array<{ id: string; projectId: string }>>`
    SELECT t."id", COALESCE(t."projectId", t."flexibleProjectId") AS "projectId"
    FROM "TaskerTask" t
    WHERE t."reminderNextAt" <= ${now} AND t."dueAt" < ${now}
      AND t."reminderIntervalHours" IN (24, 48, 72) AND t."deletedAt" IS NULL
      AND t."status" NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')
      AND NOT EXISTS (SELECT 1 FROM "TaskerDependency" d WHERE d."mainType" = 'TASK'
        AND d."mainId" = t."id" AND d."resolvedAt" IS NULL AND d."pauseStatus" = 'APPROVED')
    ORDER BY t."reminderNextAt", t."id" LIMIT ${limit}`;
  const recipients = new Set<string>();
  let queued = 0, processed = 0, failed = 0;
  for (const candidate of candidates) {
    try {
      const notified = await prisma.$transaction(async (db) => {
        await lockTaskerProject(db, candidate.projectId);
        const live = await liveReminder(db, candidate.id, now);
        if (!live || !live.task.reminderNextAt || live.task.reminderNextAt > now) return [];
        const { task } = live;
        const nextAt = new Date(now.getTime() + task.reminderIntervalHours! * 3600000);
        const userIds: string[] = [];
        for (const userId of live.recipients) {
          const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
          if (!canUseTasks({ ...user, permissionProfileSnapshot: await getPermissionProfileSnapshotForUser(user) })) continue;
          const dedupeKey = `tasker-reminder:${task.id}:${task.reminderGeneration}:${task.reminderNextAt!.getTime()}:${userId}`;
          const subject = task.status === "IN_REVIEW" ? `Overdue task awaiting your review: ${task.title}` : `Task overdue: ${task.title}`;
          // No field values, stage details, briefs or submission content in previews.
          const message = `This task's deadline was ${task.dueAt!.toISOString().slice(0, 10)}. ${task.status === "IN_REVIEW" ? "Please review the submission." : "Please open the task and provide your response."}`;
          await db.notification.create({ data: { userId, type: "TASKER_UPDATED", entityType: "TASKER_TASK", entityId: task.id, projectId: task.projectId, title: subject, message, url: `/tasks/${task.id}`, dedupeKey } });
          await db.taskerDelivery.create({ data: { taskId: task.id, userId, dedupeKey, subject, message, reminderGeneration: task.reminderGeneration, reminderExpiresAt: nextAt, availableAt: now } });
          userIds.push(userId);
        }
        // Advance from this run, never replay missed intervals after an outage.
        // Preserve task.version/updatedAt: a reminder must not invalidate user edits.
        await db.taskerTask.update({ where: { id: task.id }, data: { reminderNextAt: nextAt, ...(userIds.length ? { reminderLastAt: now } : {}), updatedAt: task.updatedAt } });
        return userIds;
      }, { maxWait: 10000, timeout: 30000 });
      processed++;
      queued += notified.length;
      notified.forEach((id) => recipients.add(id));
    } catch (error) {
      failed++;
      console.error("Tasker reminder processing failed", candidate.id, error instanceof Error ? error.name : "Unknown error");
    }
  }
  if (recipients.size) {
    try { await publishNotificationChanges({ recipientUserIds: [...recipients], reason: "created" }); }
    catch { console.error("Tasker reminder realtime update deferred; notifications are saved."); }
  }
  return { processed, queued, failed };
}

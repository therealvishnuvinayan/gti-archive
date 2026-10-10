import type { TaskerTask } from "@prisma/client";
import { isRequestReminderInterval } from "@/lib/request-reminder-shared";
import { taskAssert } from "./errors";

export function reminderInterval(value: unknown, dueAt: Date | null) {
  if (value === undefined || value === null) return null;
  taskAssert(isRequestReminderInterval(value), "Choose reminders every 24, 48, or 72 hours, or turn them off.");
  taskAssert(dueAt, "Set a deadline before enabling reminders.");
  return value;
}

export function taskReminderActive(task: Pick<TaskerTask, "deletedAt" | "status" | "dueAt" | "reminderIntervalHours">) {
  return !task.deletedAt && !["COMPLETED", "CANCELLED", "REJECTED"].includes(task.status)
    && !!task.dueAt && isRequestReminderInterval(task.reminderIntervalHours);
}

export function reminderRecipients(task: Pick<TaskerTask, "status" | "ownerId" | "coOwnerId" | "assigneeId">) {
  return [...new Set(task.status === "IN_REVIEW" ? [task.ownerId, task.coOwnerId].filter((id): id is string => !!id) : [task.assigneeId])];
}

export function firstReminderAt(dueAt: Date, now: Date) {
  return new Date(Math.max(dueAt.getTime() + 1, now.getTime()));
}

// Called inside the task mutation transaction. Comments and accepting an assignment
// do not reset the clock. Changing who needs to act invalidates queued reminders.
export function reminderScheduleChange(previous: TaskerTask, current: TaskerTask, now: Date) {
  const scheduleChanged = previous.dueAt?.getTime() !== current.dueAt?.getTime()
    || previous.reminderIntervalHours !== current.reminderIntervalHours;
  const actionChanged = (previous.status === "IN_REVIEW") !== (current.status === "IN_REVIEW")
    || reminderRecipients(previous).join(":") !== reminderRecipients(current).join(":");
  if (!scheduleChanged && !actionChanged && taskReminderActive(previous) === taskReminderActive(current)) return null;
  const earliest = actionChanged && !scheduleChanged
    ? new Date(now.getTime() + (current.reminderIntervalHours ?? 24) * 3600000) : now;
  return {
    reminderGeneration: { increment: 1 },
    reminderNextAt: taskReminderActive(current) ? firstReminderAt(current.dueAt!, earliest) : null,
  };
}

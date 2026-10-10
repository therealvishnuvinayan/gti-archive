import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createTask, getTaskDetail, mutateTask } from "@/lib/tasker/service";
import { processTaskDeadlineReminders, taskReminderDeliveryCurrent } from "@/lib/tasker/reminders";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
import { getTaskDependencies, mutateTaskDependency } from "@/lib/tasker/dependencies";
import type { PermissionUser } from "@/lib/permissions/resolver";
import type { TaskCreateInput, TaskMutation } from "@/lib/tasker/types";

async function main() {
  const [owner, coOwner, assignee, other, observer, outsider] = await Promise.all(["owner", "co-owner", "assignee", "other", "observer", "outsider"].map((name) => prisma.user.create({ data: { name, email: `${name}@reminders.example.test`, passwordHash: "test-only", role: "USER" } })));
  const project = await prisma.project.create({ data: { name: "Deadline reminders", ownerId: owner.id, createdById: owner.id, coOwners: { create: { userId: coOwner.id } }, executors: { create: [assignee, other, observer].map((u) => ({ userId: u.id })) } } });
  const base: TaskCreateInput = { projectType: "STRUCTURED", projectId: project.id, kind: "GENERAL", title: "Supply artwork", brief: "Private task brief", assigneeId: assignee.id, coOwnerId: coOwner.id, participantIds: [observer.id], dueAt: "2020-01-01", reminderIntervalHours: 24 };
  const create = (extra: Partial<TaskCreateInput> = {}) => createTask(owner, { ...base, ...extra });
  const taskRow = (id: string) => prisma.taskerTask.findUniqueOrThrow({ where: { id } });
  const deliveries = (id: string) => prisma.taskerDelivery.findMany({ where: { taskId: id, reminderGeneration: { not: null } }, orderBy: { createdAt: "asc" } });
  async function act(user: PermissionUser, id: string, action: TaskMutation["action"], extra: Partial<TaskMutation> = {}) {
    return mutateTask(user, id, { action, version: (await getTaskDetail(user, id)).version, ...extra });
  }
  const cancel = (id: string) => act(owner, id, "CANCEL", { note: "Test finished" });
  const tick = (now = new Date(), limit = 100) => processTaskDeadlineReminders({ now, limit });

  await assert.rejects(create({ reminderIntervalHours: 12 }), /24, 48, or 72/);
  await assert.rejects(create({ dueAt: null }), /Set a deadline/);
  const off = await create({ reminderIntervalHours: null });
  const future = await create({ dueAt: "2099-01-01" });
  const id = await create();
  await assert.rejects(act(assignee, id, "MANAGE", { reminderIntervalHours: 48 }), /Only the task owner/);
  await assert.rejects(act(outsider, id, "MANAGE", { reminderIntervalHours: 48 }), /not found/);
  const before = await taskRow(id);
  const race = await Promise.all([tick(), tick()]);
  assert.equal(race.reduce((n, r) => n + r.failed, 0), 0);
  assert.equal(race.reduce((n, r) => n + r.queued, 0), 1, "Concurrent workers queue one reminder");
  let rows = await deliveries(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, assignee.id, "Only the person currently responsible gets reminded");
  assert(!rows[0].message.includes(base.brief) && !rows[0].subject.includes("Stage"));
  assert.equal(await prisma.notification.count({ where: { dedupeKey: rows[0].dedupeKey } }), 1);
  assert.equal((await taskRow(id)).version, before.version, "Reminders do not invalidate open forms");
  assert.equal((await taskRow(id)).updatedAt.getTime(), before.updatedAt.getTime());
  assert.equal((await tick()).queued, 0);
  assert.equal((await deliveries(off)).length, 0);
  assert.equal((await deliveries(future)).length, 0);
  await cancel(off); await cancel(future);

  const firstNext = (await taskRow(id)).reminderNextAt!;
  assert.equal((await tick(new Date(firstNext.getTime() - 1))).queued, 0);
  assert.equal((await tick(firstNext)).queued, 1, "Interval boundary is inclusive");
  const delayed = new Date(firstNext.getTime() + 10 * 86400000);
  assert.equal((await tick(delayed)).queued, 1, "Downtime emits one reminder, not a backlog");
  assert.equal((await taskRow(id)).reminderNextAt!.getTime(), delayed.getTime() + 86400000);
  await act(coOwner, id, "MANAGE", { reminderIntervalHours: 48 });
  assert.equal((await getTaskDetail(owner, id)).reminder.intervalHours, 48);
  assert((await getTaskDetail(owner, id)).history.some((e) => e.action === "REMINDER_SETTINGS_CHANGED"));
  assert.equal(await taskReminderDeliveryCurrent(rows[0]), false, "Changing cadence invalidates queued reminders");
  await tick();
  const beforeStart = await taskRow(id);
  await act(assignee, id, "START");
  await act(owner, id, "COMMENT", { note: "Keep the schedule" });
  assert.equal((await taskRow(id)).reminderGeneration, beforeStart.reminderGeneration);
  assert.equal((await taskRow(id)).reminderNextAt!.getTime(), beforeStart.reminderNextAt!.getTime());
  await act(assignee, id, "SUBMIT", { note: "Ready for review" });
  const reviewNext = (await taskRow(id)).reminderNextAt!;
  assert.equal((await tick(new Date(reviewNext.getTime() - 1))).queued, 0);
  assert.equal((await tick(reviewNext)).queued, 2, "Review reminders go to the task owner and task co-owner");
  rows = await deliveries(id);
  assert.deepEqual(new Set(rows.slice(-2).map((r) => r.userId)), new Set([owner.id, coOwner.id]));
  await act(owner, id, "CORRECTIONS", { note: "Add dimensions" });
  assert.equal(await taskReminderDeliveryCurrent(rows.at(-1)!), false);
  await tick((await taskRow(id)).reminderNextAt!);
  assert.equal((await deliveries(id)).at(-1)!.userId, assignee.id);
  await act(owner, id, "REASSIGN", { assigneeId: other.id });
  assert.equal(await taskReminderDeliveryCurrent((await deliveries(id)).at(-1)!), false, "Old assignee remains a viewer but receives no further deadline reminders");
  await tick((await taskRow(id)).reminderNextAt!);
  assert.equal((await deliveries(id)).at(-1)!.userId, other.id);
  await act(owner, id, "MANAGE", { dueAt: "2099-01-01" });
  assert.equal((await taskRow(id)).reminderNextAt!.toISOString(), "2099-01-02T00:00:00.000Z");
  assert.equal(await taskReminderDeliveryCurrent((await deliveries(id)).at(-1)!), false);
  await act(owner, id, "MANAGE", { dueAt: null });
  assert.equal((await taskRow(id)).reminderIntervalHours, null);
  assert.equal((await taskRow(id)).reminderNextAt, null);
  await cancel(id);

  // An unapproved pause still permits reminders; approved holds suspend them and
  // are excluded before limiting the batch so they cannot starve unrelated work.
  const paused = await create();
  const required = await create({ reminderIntervalHours: null });
  const source = { type: "TASK" as const, id: paused };
  const link = await mutateTaskDependency(assignee, source, { action: "LINK", required: { type: "TASK", id: required }, requestPause: true, reason: "Need source files" });
  assert.equal((await tick()).queued, 1);
  const edge = (await getTaskDependencies(owner, source)).links.find((e) => e.id === link.id)!;
  await mutateTaskDependency(owner, source, { action: "APPROVE_PAUSE", dependencyId: edge.id, version: edge.version, note: "Wait for the files" });
  assert.equal(await taskReminderDeliveryCurrent((await deliveries(paused))[0]), false);
  await prisma.taskerTask.update({ where: { id: paused }, data: { reminderNextAt: new Date("2020-01-01") } });
  const unblocked = await create();
  assert.equal((await tick(new Date(), 1)).queued, 1);
  assert.equal((await deliveries(unblocked)).length, 1);
  assert.equal((await deliveries(paused)).length, 1);
  await act(assignee, required, "DECLINE", { note: "Cannot provide" });
  assert.equal((await tick()).queued, 1, "Reminders resume after the blocking dependency resolves");
  await cancel(paused); await cancel(unblocked);

  // Existing task permission and membership rules apply to both channels.
  const removed = await create();
  await prisma.projectExecutor.delete({ where: { projectId_userId: { projectId: project.id, userId: assignee.id } } });
  assert.equal((await tick()).queued, 0);
  await prisma.projectExecutor.create({ data: { projectId: project.id, userId: assignee.id } });
  await cancel(removed);

  const completedProject = await create();
  await prisma.project.update({ where: { id: project.id }, data: { completedAt: new Date(), archivedAt: new Date() } });
  assert.equal((await tick()).queued, 1, "Independent active tasks still remind after project completion");
  await cancel(completedProject);
  const flexible = await prisma.flexibleProject.create({ data: { name: "Flexible reminders", slug: "flexible-reminders", ownerId: owner.id, createdById: owner.id, status: "COMPLETED", completedAt: new Date(), collaborators: { create: { userId: assignee.id } } } });
  const flexibleId = await create({ projectType: "FLEXIBLE", projectId: flexible.id, coOwnerId: null, participantIds: [], reminderIntervalHours: 72 });
  assert.equal((await tick()).queued, 1);
  assert.equal((await taskRow(flexibleId)).reminderNextAt!.getTime() - (await taskRow(flexibleId)).reminderLastAt!.getTime(), 72 * 3600000);
  await act(assignee, flexibleId, "SUBMIT", { note: "Ready" });
  await act(owner, flexibleId, "ACCEPT");
  assert.equal((await taskRow(flexibleId)).reminderNextAt, null);
  const sister = await create({ sisterOf: { type: "TASK", id: completedProject } });
  assert.equal((await tick()).queued, 1, "Sister Tasks have their own schedule");
  await act(owner, sister, "DELETE");
  assert.equal((await taskRow(sister)).reminderNextAt, null);

  // Retry the same outbox entry, suppress stale entries and never duplicate in-app.
  const retryId = await create(); await tick();
  const reminder = (await deliveries(retryId))[0];
  await prisma.taskerDelivery.updateMany({ where: { taskId: retryId, reminderGeneration: null }, data: { sentAt: new Date() } });
  const keys: string[] = [];
  await deliverTaskerEmails({ taskId: retryId, send: async (input) => { keys.push(input.idempotencyKey!); return { ok: false, error: "Simulated provider outage" }; } });
  assert.equal((await prisma.taskerDelivery.findUniqueOrThrow({ where: { id: reminder.id } })).sentAt, null);
  await prisma.taskerDelivery.update({ where: { id: reminder.id }, data: { availableAt: new Date(0) } });
  await Promise.all([1, 2].map(() => deliverTaskerEmails({ taskId: retryId, send: async (input) => { keys.push(input.idempotencyKey!); return { ok: true }; } })));
  assert.deepEqual(keys, [reminder.dedupeKey, reminder.dedupeKey], "Provider retry keeps its idempotency key; parallel workers claim once");
  assert.equal(await prisma.notification.count({ where: { dedupeKey: reminder.dedupeKey } }), 1);
  assert.equal(await taskReminderDeliveryCurrent(reminder, reminder.reminderExpiresAt!), false, "A missed reminder expires before the next cycle");
  await prisma.taskerTask.update({ where: { id: retryId }, data: { reminderNextAt: new Date(0) } });
  await tick();
  await act(owner, retryId, "MANAGE", { reminderIntervalHours: null });
  const staleKeys: string[] = [];
  await deliverTaskerEmails({ taskId: retryId, send: async (input) => { if (input.idempotencyKey!.startsWith("tasker-reminder:")) staleKeys.push(input.idempotencyKey!); return { ok: true }; } });
  assert.deepEqual(staleKeys, [], "Turning reminders off suppresses pending emails");
  await cancel(retryId);
  assert.equal((await tick(new Date(Date.now() + 100 * 86400000))).queued, 0, "Ended and deleted tasks stay stopped");
  console.log("Tasker deadline reminders passed: opt-in, intervals, concurrent scheduling, review routing, pauses, membership, completed projects, sisters, flexible tasks, durable delivery and stale suppression.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

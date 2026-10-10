import { Prisma } from "@prisma/client";
import type { TaskValue } from "./types";
import { applyFieldPatches } from "./patches";
export { applyFieldPatches } from "./patches";

export async function recordFieldChange(tx: Prisma.TransactionClient, projectId: string, formKey: string, path: string[], value: TaskValue, taskId: string) {
  // Serialize with every native form save for this project, including autosaves.
  await lockTaskerProject(tx, projectId);
  const change = await tx.taskerFieldChange.create({ data: { projectId, formKey, path, value: value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue, taskId } });
  const drafts = await tx.projectFormDraft.findMany({ where: { projectId, formKey } });
  for (const draft of drafts) await tx.projectFormDraft.update({ where: { id: draft.id }, data: { payload: applyFieldPatches(draft.payload as Record<string, unknown>, [change]) as Prisma.InputJsonValue } });
  return change;
}

export async function lockTaskerProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`tasker:${projectId}`}, 0))`;
}

export async function checkTaskerFormRevision(tx: Prisma.TransactionClient, projectId: string, formKey: string, revision = 0) {
  await lockTaskerProject(tx, projectId);
  const latest = await tx.taskerFieldChange.findFirst({ where: { projectId, formKey }, orderBy: { id: "desc" }, select: { id: true } });
  return !latest || latest.id <= revision;
}

export async function consumeTaskerFormChanges(tx: Prisma.TransactionClient, projectId: string, formKey: string) {
  await tx.taskerFieldChange.updateMany({ where: { projectId, formKey, consumedAt: null }, data: { consumedAt: new Date() } });
}

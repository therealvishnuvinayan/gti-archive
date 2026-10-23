import "server-only";
import type { Prisma } from "@prisma/client";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { ensure } from "./contracts";

export const nativeContext = { OR: [{ projectId: { not: null } }, { flexibleProjectId: { not: null } }] } satisfies Prisma.UniversalTaskWhereInput;
export function isRuntimeTask(task: { projectId: string | null; flexibleProjectId: string | null }) {
  return task.projectId === null && task.flexibleProjectId === null;
}
export function runtimeTaskVisible(task: { projectId: string | null; flexibleProjectId: string | null; type: string }) {
  return !isRuntimeTask(task) || (runtimeIntegrationEnabled() && ["GENERAL", "FILE_UPLOAD", "DATA_INPUT", "INSPECT_FILE", "INITIAL_CONCEPT", "FINAL_CONCEPT"].includes(task.type));
}
export function runtimeCreationScope(userId: string, businessRole: string | null, historical = false): Prisma.RuntimeProjectWhereInput {
  return { state: historical ? { in: ["ACTIVE", "COMPLETED"] } : "ACTIVE", ...(businessRole === "DIRECTOR" ? {} :
    ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(businessRole ?? "") ?
      { OR: [{ ownerId: userId }, { participants: { some: { userId, role: "CO_OWNER" } } }] } : { id: { in: [] } }) };
}
export async function runtimeContext(tx: Prisma.TransactionClient, taskId: string) {
  ensure(runtimeIntegrationEnabled(), "RUNTIME_INTEGRATION_DISABLED", 404);
  const context = await tx.runtimeTaskContext.findUnique({ where: { taskId }, select: { projectId: true, project: { select: { id: true, title: true, state: true } } } });
  ensure(context, "INVALID_RUNTIME_CONTEXT", 403);
  return context;
}

// Native nulls are never a project identity. Resolve genuine runtime associations.
export type TaskContext = { projectId: string | null; flexibleProjectId: string | null; runtimeProjectId?: string | null; id?: string };
export async function contextIdentity(tx: Prisma.TransactionClient, context: TaskContext) {
  if (context.projectId) return `structured:${context.projectId}`;
  if (context.flexibleProjectId) return `flexible:${context.flexibleProjectId}`;
  const projectId = context.runtimeProjectId ?? (context.id ? (await runtimeContext(tx, context.id)).projectId : null);
  ensure(projectId && runtimeIntegrationEnabled(), "INVALID_RUNTIME_CONTEXT", 403);
  return `runtime:${projectId}`;
}
export async function sameTaskContext(tx: Prisma.TransactionClient, a: TaskContext, b: TaskContext) {
  return await contextIdentity(tx, a) === await contextIdentity(tx, b);
}

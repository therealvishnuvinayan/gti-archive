import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { runtimeAuthorization } from "../authorization/runtime";
import { taskAccess } from "./families";
import { sistersEnabled, taskEnabled } from "./contracts";
import { pageSize, type DashboardQuery } from "../dashboard-v2/contracts";

const person = { id: true, name: true } as const;
// These projections use the same Tasker relation/feature boundary as listTasks.
// No project-manager permission is substituted for a Tasker relationship.
export function dashboardTaskScope(actor: AuthenticatedPrincipal): Prisma.UniversalTaskWhereInput {
  return { deletedAt: null, AND: taskAccess(actor.userId, actor.businessRole === "DIRECTOR") };
}
export const writableTaskContext: Prisma.UniversalTaskWhereInput = { OR: [{ runtimeContext: { is: null } }, { runtimeContext: { project: { state: "ACTIVE" } } }] };
export function executionWork(actor: AuthenticatedPrincipal): Prisma.UniversalTaskWhereInput {
  return { AND: [dashboardTaskScope(actor), writableTaskContext], status: { in: ["OPEN", "IN_PROGRESS"] }, executorId: actor.userId,
    OR: [{ type: { not: "INSPECT_FILE" } }, { taskReferences: { some: { kind: "INSPECTION" } } }] };
}
export async function dashboardWork(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, query: DashboardQuery) {
  if (!taskEnabled()) return { enabled: false, items: [], total: 0, actionable: 0, hasMore: false };
  return runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
    const filter: Prisma.UniversalTaskWhereInput = query.work === "action" ? executionWork(actor) : {
      AND: dashboardTaskScope(actor), ...(query.work === "owned" ? { ownerId: actor.userId } : query.work === "assigned" ? { executorId: actor.userId } : { OR: [{ ownerId: actor.userId }, { executorId: actor.userId }] }),
      status: query.work === "completed" ? "COMPLETED" : { notIn: ["COMPLETED", "CLOSED"] },
    };
    const [total, actionable, rows] = await Promise.all([
      tx.universalTask.count({ where: filter }), tx.universalTask.count({ where: executionWork(actor) }),
      tx.universalTask.findMany({ where: filter, take: pageSize, skip: query.workPage * pageSize, orderBy: [{ deadline: "asc" }, { id: "asc" }],
        select: { id: true, title: true, type: true, status: true, deadline: true, owner: { select: person }, executor: { select: person },
          project: { select: { id: true, name: true } }, flexibleProject: { select: { id: true, name: true } }, runtimeContext: { select: { project: { select: { id: true, title: true, state: true } } } },
          sisterLink: sistersEnabled() ? { select: { taskId: true } } : false } }),
    ]);
    return { enabled: true, total, actionable, hasMore: total > (query.workPage + 1) * pageSize, items: rows.map(t => ({
      id: t.id, title: t.title, type: t.type, status: t.status, dueAt: t.deadline.toISOString(), href: `/tasks/${t.id}`, owner: t.owner, executor: t.executor,
      relationship: t.owner.id === actor.userId ? "Task Owner" : "Executor", isSister: !!t.sisterLink,
      project: t.runtimeContext ? { id: t.runtimeContext.project.id, name: t.runtimeContext.project.title, family: "RuntimeProject" } : t.project ? { ...t.project, family: "Native Project" } : { ...t.flexibleProject!, family: "Flexible Project" },
      readOnly: t.runtimeContext ? t.runtimeContext.project.state !== "ACTIVE" : false,
    })) };
  });
}

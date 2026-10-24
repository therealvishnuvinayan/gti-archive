import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { structuredProjectReadWhere, flexibleProjectReadWhere } from "../authorization/project-read-rules";
import { runtimeCreationScope } from "../tasker/runtime-context";
import { runtimeEnabled } from "../stage-runtime/activation";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { buildProjectListStatusWhere, deriveProjectListWorkflowState } from "../project-list-workflow";
import { pageSize, type DashboardProject, type DashboardQuery } from "./contracts";

// Native lifecycle evidence is independent of workflow-stage completion.
export const nativeCompleted: Prisma.ProjectWhereInput = { OR: [{ completedAt: { not: null } }, { closure: { isNot: null } }, { status: { group: { slug: "completed" } } }] };
export const nativeActive: Prisma.ProjectWhereInput = { archivedAt: null, NOT: nativeCompleted,
  OR: [{ status: { group: { slug: "active" } } }, { statusId: null, AND: buildProjectListStatusWhere("ACTIVE") }] };
const person = { name: true } as const;
export async function dashboardProjects(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, query: DashboardQuery) {
  const manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "");
  const native = structuredProjectReadWhere(actor, true), flexible = flexibleProjectReadWhere(actor, true);
  const runtime = runtimeEnabled() ? runtimeCreationScope(actor.userId, actor.businessRole, runtimeIntegrationEnabled()) : { id: { in: [] } };
  const counts = manager ? await Promise.all([
    tx.project.count({ where: { AND: [native, nativeActive] } }), tx.project.count({ where: { AND: [native, nativeCompleted] } }),
    tx.flexibleProject.count({ where: { AND: [flexible, { status: "ACTIVE" }] } }), tx.flexibleProject.count({ where: { AND: [flexible, { status: "COMPLETED" }] } }),
    tx.runtimeProject.count({ where: { AND: [runtime, { state: "ACTIVE" }] } }), tx.runtimeProject.count({ where: { AND: [runtime, { state: "COMPLETED" }] } }),
  ]) : null;
  const summaries: DashboardProject[] = [];
  const pagination = { take: pageSize, skip: query.projectPage * pageSize, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] };
  let total = 0;
  if (query.family === "runtime" && manager) {
    const where: Prisma.RuntimeProjectWhereInput = { AND: [runtime, query.projectStatus === "all" ? {} : { state: query.projectStatus.toUpperCase() }] };
    total = await tx.runtimeProject.count({ where });
    const rows = await tx.runtimeProject.findMany({ where, ...pagination, select: { id: true, title: true, state: true, createdAt: true,
      owner: { select: person }, participants: { where: { role: "CO_OWNER" }, take: 30, orderBy: { userId: "asc" }, select: { user: { select: person } } },
      publishedVersion: { select: { intendedProjectType: true } } } });
    summaries.push(...rows.map(p => ({ id: p.id, name: p.title, href: `/projects/runtime/${p.id}`, family: "RuntimeProject", category: p.publishedVersion.intendedProjectType,
      status: p.state, owner: p.owner.name ?? "Unnamed user", coOwners: p.participants.map(r => r.user.name ?? "Unnamed user"), date: p.createdAt.toISOString(), dateLabel: "Created" })));
  } else if (query.family === "native") {
    const where: Prisma.ProjectWhereInput = { AND: [manager ? native : structuredProjectReadWhere(actor),
      !manager || query.projectStatus === "all" ? {} : query.projectStatus === "active" ? nativeActive : nativeCompleted] };
    total = await tx.project.count({ where });
    if (manager) {
      const rows = await tx.project.findMany({ where, ...pagination, select: { id: true, name: true, category: true, completedAt: true, archivedAt: true,
        workflowStages: { take: 8, orderBy: { stageKey: "asc" }, select: { stageKey: true, status: true, unlockedAt: true, completedAt: true } },
        closure: { select: { id: true } }, status: { select: { name: true, group: { select: { slug: true } } } }, owner: { select: person },
        coOwners: { take: 30, orderBy: { userId: "asc" }, select: { user: { select: person } } }, createdAt: true } });
      summaries.push(...rows.map(p => ({ id: p.id, name: p.name, href: `/projects/${p.id}`, family: "Native Project", category: p.category,
        status: p.completedAt || p.closure || p.status?.group?.slug === "completed" ? "COMPLETED" : p.archivedAt ? "ARCHIVED" : p.status?.name ??
          (deriveProjectListWorkflowState(p).businessStatus === "ACTIVE" ? "ACTIVE" : deriveProjectListWorkflowState(p).businessStatus === "COMPLETED" ? "Awaiting project completion" : "Status not set"),
        owner: p.owner ? p.owner.name ?? "Unnamed user" : null, coOwners: p.coOwners.map(r => r.user.name ?? "Unnamed user"), date: p.createdAt.toISOString(), dateLabel: "Created" })));
    } else {
      // Context-only users receive no status, dates, participant roster or stage data.
      const rows = await tx.project.findMany({ where, take: pageSize, skip: pagination.skip, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
      summaries.push(...rows.map(p => ({ ...p, href: `/projects/${p.id}`, family: "Native project context", category: null, status: null, owner: null, coOwners: [], date: null, dateLabel: null })));
    }
  } else if (query.family === "flexible") {
    const where: Prisma.FlexibleProjectWhereInput = { AND: [manager ? flexible : flexibleProjectReadWhere(actor),
      !manager || query.projectStatus === "all" ? {} : { status: query.projectStatus === "active" ? "ACTIVE" : "COMPLETED" }] };
    total = await tx.flexibleProject.count({ where });
    if (manager) {
      const rows = await tx.flexibleProject.findMany({ where, ...pagination, select: { id: true, slug: true, name: true, status: true, scope: true, deadline: true, owner: { select: person } } });
      summaries.push(...rows.map(p => ({ id: p.id, name: p.name, href: `/projects/flexible/${p.slug}`, family: "Flexible Project", category: p.scope, status: p.status,
        owner: p.owner.name ?? "Unnamed user", coOwners: [], date: p.deadline?.toISOString() ?? null, dateLabel: p.deadline ? "Due" : null })));
    } else {
      const rows = await tx.flexibleProject.findMany({ where, take: pageSize, skip: pagination.skip, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, slug: true, name: true } });
      summaries.push(...rows.map(p => ({ id: p.id, name: p.name, href: `/projects/flexible/${p.slug}`, family: "Flexible project context", category: null, status: null, owner: null, coOwners: [], date: null, dateLabel: null })));
    }
  }
  return { manager, items: summaries, total, page: query.projectPage, hasMore: total > (query.projectPage + 1) * pageSize,
    counts: counts ? { active: counts[0] + counts[2] + counts[4], completed: counts[1] + counts[3] + counts[5], native: { active: counts[0], completed: counts[1] }, flexible: { active: counts[2], completed: counts[3] }, runtime: { active: counts[4], completed: counts[5] } } : null };
}

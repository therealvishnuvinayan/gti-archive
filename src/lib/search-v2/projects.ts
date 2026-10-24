import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { flexibleProjectReadWhere, structuredProjectReadWhere } from "../authorization/project-read-rules";
import { runtimeCreationScope } from "../tasker/runtime-context";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { literalContains, searchPage, searchPageSize, type SearchQuery, type SearchProject, type SearchFamily, type SearchGroup } from "./contracts";

const person = { name: true } as const;
export async function searchProjects(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, query: SearchQuery, families: SearchFamily[]) {
  const result: Partial<Record<SearchFamily, SearchGroup<SearchProject>>> = {};
  if (query.kind === "tasks" || !query.q) return result;
  const match = literalContains(query.q), pagination = { take: searchPageSize + 1, skip: query.page * searchPageSize };
  if (families.includes("native") && ["all", "native"].includes(query.family)) {
    // Page only authorized identities, then enrich just those with full-workspace
    // authority. A manager may also have context-only assignments on other projects.
    const page = searchPage(await tx.project.findMany({ where: { AND: [structuredProjectReadWhere(actor), { OR: [{ name: match }, { id: match }] }] },
      ...pagination, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }));
    const full = await tx.project.findMany({ where: { id: { in: page.items.map(p => p.id) }, AND: structuredProjectReadWhere(actor, true) }, select: {
      id: true, category: true, completedAt: true, archivedAt: true, closure: { select: { id: true } }, status: { select: { name: true, group: { select: { slug: true } } } },
      owner: { select: person }, coOwners: { take: 31, orderBy: { userId: "asc" }, select: { user: { select: person } } } } });
    result.native = { hasMore: page.hasMore, items: page.items.map(p => {
      const f = full.find(r => r.id === p.id);
      return { ...p, family: "native", href: `/projects/${encodeURIComponent(p.id)}`, contextOnly: !f, ...(f ? {
        category: f.category, status: f.completedAt || f.closure || f.status?.group?.slug === "completed" ? "COMPLETED" : f.archivedAt ? "ARCHIVED" : f.status?.name ?? "Status not set",
        owner: f.owner?.name ?? null, coOwners: f.coOwners.slice(0, 30).map(r => r.user.name ?? "Unnamed user"), moreCoOwners: f.coOwners.length > 30,
      } : {}) };
    }) };
  }
  if (families.includes("flexible") && ["all", "flexible"].includes(query.family)) {
    const page = searchPage(await tx.flexibleProject.findMany({ where: { AND: [flexibleProjectReadWhere(actor), { OR: [{ name: match }, { id: match }, { slug: match }] }] },
      ...pagination, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, slug: true, name: true } }));
    const full = await tx.flexibleProject.findMany({ where: { id: { in: page.items.map(p => p.id) }, AND: flexibleProjectReadWhere(actor, true) },
      select: { id: true, status: true, scope: true, owner: { select: person } } });
    result.flexible = { hasMore: page.hasMore, items: page.items.map(p => {
      const f = full.find(r => r.id === p.id);
      return { id: p.id, name: p.name, family: "flexible", href: `/projects/flexible/${encodeURIComponent(p.slug)}`, contextOnly: !f,
        ...(f ? { status: f.status, category: f.scope, owner: f.owner.name, coOwners: [] } : {}) };
    }) };
  }
  if (families.includes("runtime") && ["all", "runtime"].includes(query.family)) {
    const page = searchPage(await tx.runtimeProject.findMany({ where: { AND: [runtimeCreationScope(actor.userId, actor.businessRole, runtimeIntegrationEnabled()), { OR: [{ title: match }, { id: match }] }] },
      ...pagination, orderBy: [{ title: "asc" }, { id: "asc" }], select: { id: true, title: true, state: true, owner: { select: person },
        participants: { where: { role: "CO_OWNER" }, take: 31, orderBy: { userId: "asc" }, select: { user: { select: person } } }, publishedVersion: { select: { intendedProjectType: true } } } }));
    result.runtime = { hasMore: page.hasMore, items: page.items.map(p => ({ id: p.id, name: p.title, family: "runtime", href: `/projects/runtime/${encodeURIComponent(p.id)}`,
      contextOnly: false, status: p.state, category: p.publishedVersion.intendedProjectType, owner: p.owner.name, coOwners: p.participants.slice(0, 30).map(r => r.user.name ?? "Unnamed user"), moreCoOwners: p.participants.length > 30 })) };
  }
  return result;
}

import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { runtimeAuthorization } from "../authorization/runtime";
import { taskEnabled, sistersEnabled } from "../tasker/contracts";
import { dashboardTaskScope } from "../tasker/dashboard";
import { literalContains, searchPage, searchPageSize, type SearchQuery, type SearchTask, type SearchGroup } from "./contracts";

export async function searchTasks(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, query: SearchQuery): Promise<SearchGroup<SearchTask> | null> {
  if (!taskEnabled() || query.kind === "projects" || !query.q) return null;
  return runtimeAuthorization.runAuthorizedInTransaction(tx, { capability: "task.list", targetId: "root" }, async () => {
    const scope = dashboardTaskScope(actor);
    const page = searchPage(await tx.universalTask.findMany({ where: { AND: scope, title: literalContains(query.q), ...(query.type === "all" ? {} : { type: query.type }) },
      take: searchPageSize + 1, skip: query.page * searchPageSize, orderBy: [{ title: "asc" }, { id: "asc" }], select: {
        id: true, title: true, type: true, status: true, deadline: true, ownerId: true, executorId: true,
        spectators: { where: { userId: actor.userId }, take: 1, select: { userId: true } },
        sisterLink: sistersEnabled() ? { select: { sourceTaskId: true, rootTaskId: true } } : false,
      } }));
    const ids = page.items.flatMap(t => t.sisterLink ? [t.sisterLink.sourceTaskId, t.sisterLink.rootTaskId] : []);
    // Never return a hidden parent's ID, title or traversal key, even for an
    // otherwise authorized Sister. Only independently discoverable lineage links.
    const relatives = ids.length ? await tx.universalTask.findMany({ where: { id: { in: ids }, AND: scope }, select: { id: true, title: true } }) : [];
    const relative = (id?: string) => { const t = relatives.find(r => r.id === id); return t ? { ...t, href: `/tasks/${encodeURIComponent(t.id)}` } : null; };
    return { hasMore: page.hasMore, items: page.items.map(t => {
      const relationships = [t.ownerId === actor.userId ? "Task Owner" : null, t.executorId === actor.userId ? "Executor" : null, t.spectators.length ? "Spectator" : null].filter((r): r is string => !!r);
      return { id: t.id, title: t.title, type: t.type, status: t.status, deadline: t.deadline.toISOString(), href: `/tasks/${encodeURIComponent(t.id)}`,
        relationships: relationships.length ? relationships : ["Director oversight"], isSister: !!t.sisterLink, source: relative(t.sisterLink?.sourceTaskId), root: relative(t.sisterLink?.rootTaskId) };
    }) };
  });
}

import "server-only";
import { readCurrentSessionToken } from "../auth";
import { resolveAuthenticatedSession } from "../authorization/session";
import { runtimeAuthorization } from "../authorization/runtime";
import { runtimeEnabled } from "../stage-runtime/activation";
import { enabledTaskTypes, taskEnabled } from "../tasker/contracts";
import { searchV2Enabled } from "./activation";
import { parseSearchQuery, SearchError, searchLastPage, type SearchFamily } from "./contracts";
import { searchProjects } from "./projects";
import { searchTasks } from "./tasks";

export async function unifiedSearch(raw: unknown = {}) {
  if (!searchV2Enabled()) throw new SearchError("SEARCH_DISABLED", 404);
  const query = parseSearchQuery(raw);
  return runtimeAuthorization.runAuthorized({ capability: "workspace.search", targetId: "root" }, async (tx, grant) => {
    // This transaction performs SELECTs only. PostgreSQL also enforces a bounded
    // per-statement budget; no unbounded counts or evidence/content scans.
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
    const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
    if (!session?.principal.businessRole || session.principal.userId !== grant.actorUserId) throw new SearchError("ACCESS_DENIED", 403);
    const actor = session.principal;
    const manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole!);
    const families: SearchFamily[] = ["native", "flexible", ...(manager && runtimeEnabled() ? ["runtime" as const] : [])];
    const types = taskEnabled() ? enabledTaskTypes() : [];
    if ((query.family !== "all" && !families.includes(query.family)) || (query.type !== "all" && !types.includes(query.type))) throw new SearchError("INVALID_SEARCH");
    const projects = await searchProjects(tx, actor, query, families), tasks = await searchTasks(tx, actor, query);
    if (Date.parse(actor.session.expiresAt) <= Date.now()) throw new SearchError("ACCESS_DENIED", 403);
    const more = Object.values(projects).some(g => g.hasMore) || !!tasks?.hasMore;
    return { query, options: { families, types }, projects, tasks, hasMore: more && query.page < searchLastPage, refine: more && query.page === searchLastPage };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
export type UnifiedSearch = Awaited<ReturnType<typeof unifiedSearch>>;

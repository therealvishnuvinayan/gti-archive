import "server-only";
import { readCurrentSessionToken } from "../auth";
import { runtimeAuthorization } from "../authorization/runtime";
import { resolveAuthenticatedSession } from "../authorization/session";
import { bindProjectReadIdentity } from "../authorization/project-read-rules";
import { canArchive } from "../authorization/archive-rules";
import { canLibrary } from "../authorization/library-rules";
import { taskEnabled, TaskerError } from "../tasker/contracts";
import { draftsEnabled } from "../stage-builder/service";
import { publicationEnabled } from "../stage-builder/publication-activation";
import { runtimeEnabled } from "../stage-runtime/activation";
import { runtimeIntegrationEnabled } from "../runtime-integration/activation";
import { dashboardV2Enabled } from "./activation";
import { parseDashboardQuery, roleLabels } from "./contracts";
import { dashboardProjects } from "./projects";
import { dashboardWork } from "../tasker/dashboard";
import { dashboardAttention } from "./attention";

export async function getRoleDashboard(raw: unknown = {}) {
  if (!dashboardV2Enabled()) throw new TaskerError("DASHBOARD_DISABLED", 404);
  const query = parseDashboardQuery(raw);
  return runtimeAuthorization.runAuthorized({ capability: "workspace.dashboard", targetId: "root" }, async (tx, grant) => {
    const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
    if (!session?.principal.businessRole || session.principal.userId !== grant.actorUserId) throw new TaskerError("ACCESS_DENIED", 403);
    const actor = session.principal, user = bindProjectReadIdentity(session.user, actor), role = actor.businessRole!;
    const manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(role);
    const author = role === "DIRECTOR" || role === "SENIOR_PROJECT_MANAGER";
    if (!manager) { query.family = query.family === "runtime" ? "native" : query.family; query.projectStatus = "all"; }
    const [projects, work, attention] = await Promise.all([dashboardProjects(tx, actor, query), dashboardWork(tx, actor, query), dashboardAttention(tx, actor, query)]);
    const links = [{ label: "Projects", href: "/projects" }];
    if (taskEnabled()) links.push({ label: "My Tasks", href: "/tasks" });
    if (manager && runtimeEnabled()) links.push({ label: "Runtime projects", href: "/projects/runtime" });
    if (author && draftsEnabled()) links.push({ label: "Workflow drafts", href: "/projects/workflow-drafts" });
    if (author && publicationEnabled()) links.push({ label: "Executable workflows", href: "/projects/published-workflows" }, { label: role === "DIRECTOR" ? "Workflow approvals" : "My workflow submissions", href: "/projects/workflow-approvals" });
    if (manager) links.push({ label: "Native project requests", href: "/projects/approvals" });
    if (manager && runtimeIntegrationEnabled()) links.push({ label: role === "DIRECTOR" ? "Runtime creation requests" : "My creation requests", href: "/projects/runtime/requests" });
    if (canArchive(user, "archive.view")) links.push({ label: "Archives", href: "/archives" });
    if (canLibrary(user, "library.view")) links.push({ label: "Library", href: "/library" });
    const requests = role === "JUNIOR_PROJECT_MANAGER" && runtimeIntegrationEnabled() ? await tx.runtimeCreationRequest.findMany({ where: { requesterId: actor.userId }, take: 12, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, snapshot: true, decision: { select: { outcome: true } } } }) : [];
    if (Date.parse(actor.session.expiresAt) <= Date.now()) throw new TaskerError("ACCESS_DENIED", 403);
    return { query, role, roleLabel: roleLabels[role], name: actor.identity.name, projects, work, attention, links,
      create: manager && runtimeIntegrationEnabled() ? { href: "/projects/runtime/new", label: role === "JUNIOR_PROJECT_MANAGER" ? "Request a project" : "New runtime project" } : null,
      requests: requests.map(r => ({ id: r.id, title: String((r.snapshot as { title: string }).title), state: r.decision?.outcome ?? "PENDING", at: r.createdAt.toISOString(), href: "/projects/runtime/requests" })) };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
export type RoleDashboard = Awaited<ReturnType<typeof getRoleDashboard>>;

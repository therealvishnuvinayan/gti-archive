import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, WorkflowDraftRevision } from "@prisma/client";
import { runtimeAuthorization } from "../authorization/runtime";
import { readCurrentSessionToken } from "../auth";
import { resolveAuthenticatedSession } from "../authorization/session";
import { commandId, ensure, identifier, parseDefinition, record, validateDefinition, type WorkflowDefinition } from "./contracts";

export const draftsEnabled = () => process.env.FLUX_STAGE_BUILDER_DRAFTS === "1";
function enabled() { ensure(draftsEnabled(), "DRAFTS_DISABLED", 404); }
// Canonical JSON prevents object-key order from changing replay/hash identity.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const configurationHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
type Tx = Prisma.TransactionClient;
async function actor(tx: Tx) {
  const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
  ensure(session?.principal.businessRole && session.principal.authorizationVersion, "ACCESS_DENIED", 403);
  return session.principal;
}
function target(id?: string) { if (id) identifier(id); return { capability: "template.configureCustomStages", targetId: id ? `stage-draft:${id}` : "stage-drafts" }; }
function view(revision: WorkflowDraftRevision) {
  return { id: revision.id, workflowId: revision.workflowId, revision: revision.revision, definition: parseDefinition(revision.definition),
    validationStatus: revision.validationStatus, issues: validateDefinition(parseDefinition(revision.definition)), configurationHash: revision.configurationHash,
    actorId: revision.actorId, action: revision.action, createdAt: revision.createdAt.toISOString(), sourceRevisionId: revision.sourceRevisionId };
}
export async function listDrafts(offset = 0) {
  enabled(); ensure(Number.isInteger(offset) && offset >= 0 && offset <= 100000, "INVALID_OFFSET");
  return runtimeAuthorization.runAuthorized(target(), async tx => {
    const principal = await actor(tx), where = principal.businessRole === "DIRECTOR" ? {} : { createdById: principal.userId };
    const rows = await tx.workflowDraft.findMany({ where, take: 31, skip: offset, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
    return { drafts: rows.slice(0, 30).map(row => ({ id: row.id, name: (row.revisions[0].definition as unknown as WorkflowDefinition).name, revision: row.currentRevision,
      createdById: row.createdById, updatedAt: row.updatedAt.toISOString(), validationStatus: row.revisions[0].validationStatus })), hasMore: rows.length > 30 };
  });
}
export async function getDraft(id: string, revision?: number) {
  enabled(); if (revision !== undefined) ensure(Number.isInteger(revision) && revision >= 1, "INVALID_REVISION");
  return runtimeAuthorization.runAuthorized(target(id), async tx => {
    const row = await tx.workflowDraft.findUniqueOrThrow({ where: { id } });
    const snapshot = await tx.workflowDraftRevision.findUnique({ where: { workflowId_revision: { workflowId: id, revision: revision ?? row.currentRevision } } });
    ensure(snapshot, "REVISION_UNAVAILABLE", 404);
    // History is deliberately bounded; any earlier revision remains addressable.
    const history = await tx.workflowDraftRevision.findMany({ where: { workflowId: id }, take: 50, orderBy: { revision: "desc" }, select: { id: true, revision: true, actorId: true, action: true, createdAt: true, configurationHash: true } });
    return { ...view(snapshot), currentRevision: row.currentRevision, createdById: row.createdById, createdAt: row.createdAt.toISOString(), history: history.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });
}
async function execute(action: "CREATE" | "REVISE" | "CLONE", raw: unknown, id?: string) {
  enabled();
  const v = record(raw, action === "CREATE" ? ["commandId", "definition"] : action === "CLONE" ? ["commandId", "expectedRevision"] : ["commandId", "expectedRevision", "definition"]);
  commandId(v.commandId); const key = v.commandId;
  if (action !== "CREATE") ensure(Number.isInteger(v.expectedRevision) && Number(v.expectedRevision) >= 1, "INVALID_REVISION");
  const definition = action === "CLONE" ? null : parseDefinition(v.definition);
  const hash = configurationHash({ action, id: id ?? null, ...v, ...(definition ? { definition } : {}) });
  return runtimeAuthorization.runAuthorized(target(id), async (tx, grant) => {
    // Serialized actor/command replay and locked draft CAS protect all writers.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${grant.actorUserId}:${key}`}, 0))::text`;
    const previous = await tx.workflowDraftRevision.findUnique({ where: { actorId_commandId: { actorId: grant.actorUserId, commandId: key } } });
    if (previous) { ensure(previous.commandHash === hash, "COMMAND_REUSED", 409); return { ...view(previous), replayed: true }; }
    const principal = await actor(tx);
    await tx.$queryRaw`SELECT set_config('flux.draft_actor', ${principal.userId}, true), set_config('flux.draft_session', ${principal.session.id}, true)`;
    let config = definition!, sourceRevisionId: string | null = null;
    const current = id ? await tx.workflowDraft.findUniqueOrThrow({ where: { id } }) : null;
    if (current) ensure(current.currentRevision === v.expectedRevision, "STALE_REVISION", 409);
    if (action === "CLONE") {
      const source = await tx.workflowDraftRevision.findUniqueOrThrow({ where: { workflowId_revision: { workflowId: id!, revision: current!.currentRevision } } });
      config = parseDefinition(source.definition); config.name = `${config.name.slice(0, 150)} (copy)`; sourceRevisionId = source.id;
      // Internal identifiers are scoped to workflow identity; cloning preserves
      // references but creates a new owner, workflow, revision and event identity.
    }
    const draft = action === "REVISE" ? await tx.workflowDraft.update({ where: { id: id!, currentRevision: Number(v.expectedRevision) }, data: { currentRevision: { increment: 1 } } }) :
      await tx.workflowDraft.create({ data: { createdById: principal.userId } });
    const revisionId = `r_${crypto.randomUUID().replaceAll("-", "")}`;
    const issues = validateDefinition(config);
    const revision = await tx.workflowDraftRevision.create({ data: { id: revisionId, workflowId: draft.id, revision: draft.currentRevision,
      actorId: principal.userId, actorRole: principal.businessRole!, actorVersion: principal.authorizationVersion!, action,
      commandId: key, commandHash: hash, configurationHash: configurationHash(config), definition: config as unknown as Prisma.InputJsonValue,
      validationStatus: issues.length ? "INCOMPLETE" : "VALID", sourceRevisionId, eventId: `draft:${revisionId}` } });
    return { ...view(revision), replayed: false };
  });
}
export const createDraft = (raw: unknown) => execute("CREATE", raw);
export const reviseDraft = (id: string, raw: unknown) => execute("REVISE", raw, id);
export const cloneDraft = (id: string, raw: unknown) => execute("CLONE", raw, id);

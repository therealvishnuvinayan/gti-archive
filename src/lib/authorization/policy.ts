import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { BusinessAuthorizationRequirement, TechnicalAuthorizationRequirement } from "./contracts";
import { isBusinessCapability, isTechnicalCapability, type BusinessCapability, type TechnicalCapability } from "./definitions";
import { getBusinessRoleEligibility, getTechnicalPrivilegeEligibility } from "./eligibility";
import { resolveAuthenticatedSession, type AuthenticatedPrincipal } from "./session";

type Capability = BusinessCapability | TechnicalCapability;
type Requirement = BusinessAuthorizationRequirement | TechnicalAuthorizationRequirement;

export type AuthorizationRequest = Readonly<{
  capability: string;
  targetId: string;
  reason?: string;
}>;

/** Evidence is loaded by registered server code inside the authorization
 * transaction. Never accept this object (or a principal) from a request body.
 * Creation uses an authoritative container/draft ID, never an invented target.
 */
export type AuthorizationContext = {
  resource: {
    id: string;
    kind: "project" | "projectCreation" | "task" | "template" | "archive" | "technical";
    projectId?: string;
  };
  project?: { id: string; participantUserIds: readonly string[] };
  task?: { id: string; ownerUserId: string; executorUserIds: readonly string[]; spectatorUserIds: readonly string[] };
  resourcePermission?: boolean;
  integrity?: {
    workflowAllowed: boolean;
    actorUserId: string;
    preservesOwnership: boolean;
    preservesHistory: boolean;
  };
  approvedTemplate?: boolean;
  directorApprovedCreation?: boolean;
  seniorProjectManagerCoOwner?: boolean;
  // These prove that submitting a request/proposal cannot finalize/publish it.
  finalCompletionRequiresDirectorApproval?: boolean;
  publicationRequiresDirectorApproval?: boolean;
  authorizedDestinationFolder?: boolean;
  taskLifecycleAllowed?: boolean;
  selfReviewPolicy?: { policyId: string; permitted: boolean };
  technical?: {
    supportAuthorized: boolean;
    auditRecorded: boolean;
    noBusinessImpersonation: boolean;
    actorUserId: string;
  };
};

type ContextLoader = (input: {
  tx: Prisma.TransactionClient;
  actor: AuthenticatedPrincipal;
  request: AuthorizationRequest;
}) => Promise<AuthorizationContext | null>;

export type ResourcePolicies = Readonly<Partial<Record<Capability, ContextLoader>>>;
export type AuthorizationDecision =
  | { decision: "DENY"; reason: string; requirement?: Requirement }
  | Readonly<{ decision: "ALLOW"; capability: Capability; actorUserId: string; targetId: string;
      reason?: string; directorOverride: boolean }>;

export class AuthorizationDeniedError extends Error {
  constructor(readonly denial: Extract<AuthorizationDecision, { decision: "DENY" }>) {
    super(denial.reason);
    this.name = "AuthorizationDeniedError";
  }
}

function parseRequest(value: unknown): AuthorizationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["capability", "targetId", "reason"].includes(key))) return null;
  if (typeof input.capability !== "string" || typeof input.targetId !== "string" ||
    !input.targetId.trim() || input.targetId.length > 256 || input.targetId.includes("\0") ||
    (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 2000))) return null;
  return Object.freeze({ capability: input.capability, targetId: input.targetId,
    ...(typeof input.reason === "string" ? { reason: input.reason.trim() } : {}) });
}

function resourceMatches(request: AuthorizationRequest, context: AuthorizationContext) {
  const { capability, targetId } = request;
  const { resource, project, task } = context;
  if (!resource || resource.id !== targetId) return false;
  if (capability === "project.create") return resource.kind === "projectCreation";
  if (capability.startsWith("project.")) return resource.kind === "project" && project?.id === (resource.projectId ?? resource.id);
  if (capability.startsWith("task.create")) return resource.kind === "project" && project?.id === resource.id;
  if (capability.startsWith("task.")) return resource.kind === "task" && task?.id === resource.id &&
    !!resource.projectId && project?.id === resource.projectId;
  if (capability.startsWith("template.")) return resource.kind === "template";
  if (capability.startsWith("archive.")) return resource.kind === "archive";
  return capability.startsWith("technical.") && resource.kind === "technical";
}

function evaluate(
  actor: AuthenticatedPrincipal,
  request: AuthorizationRequest,
  context: AuthorizationContext,
  requirements: readonly Requirement[],
): AuthorizationDecision {
  const director = actor.businessRole === "DIRECTOR" && isBusinessCapability(request.capability);
  const taskCreation = request.capability.startsWith("task.create");
  const taskRead = ["task.view", "task.viewAsSpectator"].includes(request.capability);
  if (!resourceMatches(request, context)) return { decision: "DENY", reason: "RESOURCE_CONTEXT_REQUIRED" };
  // Project ownership does not imply task ownership or execution. The action
  // still needs an explicit resource permission and any task relationship below.
  if (!director && context.project && !context.project.participantUserIds.includes(actor.userId)) {
    return { decision: "DENY", reason: "PROJECT_PARTICIPATION_REQUIRED" };
  }
  const ownsTask = context.task?.ownerUserId === actor.userId;
  const executesTask = context.task?.executorUserIds.includes(actor.userId) === true;
  const spectatesTask = context.task?.spectatorUserIds.includes(actor.userId) === true;
  if (!director && request.capability.startsWith("task.") && !taskCreation &&
    !(ownsTask || executesTask || spectatesTask)) return { decision: "DENY", reason: "TASK_RELATIONSHIP_REQUIRED" };
  if (!director && request.capability === "task.viewAsSpectator" && !spectatesTask) {
    return { decision: "DENY", reason: "SPECTATOR_RELATIONSHIP_REQUIRED" };
  }

  function satisfies(requirement: Requirement): boolean {
    switch (requirement) {
      case "RESOURCE_CONTEXT": return resourceMatches(request, context);
      case "RESOURCE_PERMISSION": return context.resourcePermission === true;
      case "WORKFLOW_AND_DATA_INTEGRITY": return context.integrity?.workflowAllowed === true &&
        context.integrity.preservesOwnership === true;
      case "ACTUAL_ACTOR_ATTRIBUTION": return context.integrity?.actorUserId === actor.userId;
      case "PRESERVE_HISTORY": return context.integrity?.preservesHistory === true;
      case "APPROVED_TEMPLATE": return context.approvedTemplate === true;
      case "DIRECTOR_APPROVAL_BEFORE_PROJECT_CREATION": return context.directorApprovedCreation === true;
      case "SENIOR_PROJECT_MANAGER_CO_OWNER": return context.seniorProjectManagerCoOwner === true;
      case "DIRECTOR_APPROVAL_BEFORE_FINAL_COMPLETION": return context.finalCompletionRequiresDirectorApproval === true;
      case "DIRECTOR_APPROVAL_BEFORE_TEMPLATE_PUBLICATION": return context.publicationRequiresDirectorApproval === true;
      case "AUTHORIZED_DESTINATION_FOLDER": return context.authorizedDestinationFolder === true;
      case "TASK_OWNER_OR_DIRECTOR": return director || ownsTask;
      case "TASK_EXECUTOR_OR_DIRECTOR": return director || executesTask;
      case "TASK_LIFECYCLE": return context.taskLifecycleAllowed === true;
      case "NON_EMPTY_COMPLETION_REASON": return !!request.reason?.trim();
      case "SELF_REVIEW_POLICY": return !!context.selfReviewPolicy?.policyId.trim() && context.selfReviewPolicy.permitted === true;
      case "READ_ONLY_SPECTATOR": return director || taskRead || taskCreation || !spectatesTask;
      case "TECHNICAL_OPERATION_CONTEXT": return context.resource.kind === "technical" && !!context.technical;
      case "EXPLICIT_SUPPORT_AUTHORIZATION": return context.technical?.supportAuthorized === true;
      case "AUDIT_LOGGING": return context.technical?.auditRecorded === true && context.technical.actorUserId === actor.userId;
      case "NO_BUSINESS_IMPERSONATION": return context.technical?.noBusinessImpersonation === true;
      default: return false;
    }
  }
  for (const requirement of requirements) {
    if (!satisfies(requirement)) return { decision: "DENY", reason: "REQUIREMENT_NOT_SATISFIED", requirement };
  }
  return Object.freeze({ decision: "ALLOW", capability: request.capability as Capability, actorUserId: actor.userId,
    targetId: request.targetId, ...(request.reason === undefined ? {} : { reason: request.reason }),
    directorOverride: director && (context.resourcePermission !== true ||
      (!!context.project && !context.project.participantUserIds.includes(actor.userId)) ||
      (requirements.includes("TASK_OWNER_OR_DIRECTOR") && !ownsTask) ||
      (requirements.includes("TASK_EXECUTOR_OR_DIRECTOR") && !executesTask) ||
      (spectatesTask && !taskRead)) });
}

/** The only V2 runtime policy evaluator. Construction is trusted server code;
 * request input cannot register policies, supply evidence or replace identity.
 * No legacy resolver/profile participates in a V2 decision. An unregistered
 * capability is denied, so adding the foundation cannot activate domain access.
 */
export function createAuthorizationService(dependencies: {
  database: Pick<PrismaClient, "$transaction">;
  readSessionToken: () => Promise<string | null>;
  policies: ResourcePolicies;
}) {
  const policies = Object.freeze({ ...dependencies.policies });
  async function check(tx: Prisma.TransactionClient, raw: unknown) {
    const request = parseRequest(raw);
    if (!request) return { decision: "DENY", reason: "INVALID_INPUT" } as const;
    const capability = request.capability;
    if (!isBusinessCapability(capability) && !isTechnicalCapability(capability)) {
      return { decision: "DENY", reason: "UNKNOWN_CAPABILITY" } as const;
    }
    // Protect the principal through the transaction, in the same lock order as
    // assignment mutations. Context loaders must lock mutable target rows too.
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`LOCK TABLE "UserAuthorization" IN SHARE MODE`;
    const token = await dependencies.readSessionToken();
    if (!token) return { decision: "DENY", reason: "UNAUTHENTICATED" } as const;
    await tx.$queryRaw`SELECT id FROM "Session" WHERE token = ${token} FOR SHARE`;
    const session = await resolveAuthenticatedSession(tx, token);
    if (!session) return { decision: "DENY", reason: "UNAUTHENTICATED" } as const;
    const actor = session.principal;
    const eligibility = isBusinessCapability(capability)
      ? getBusinessRoleEligibility(actor.businessRole, capability)
      : getTechnicalPrivilegeEligibility(actor.technicalPrivileges, capability);
    if (eligibility.decision === "DENY") return eligibility;
    const loader = policies[capability];
    if (!loader) return { decision: "DENY", reason: "POLICY_NOT_INTEGRATED" } as const;
    const context = await loader({ tx, actor, request });
    if (!context) return { decision: "DENY", reason: "RESOURCE_CONTEXT_REQUIRED" } as const;
    if (Date.parse(actor.session.expiresAt) <= Date.now()) return { decision: "DENY", reason: "UNAUTHENTICATED" } as const;
    return evaluate(actor, request, context, eligibility.requirements);
  }
  return {
    /** A point-in-time decision, never a reusable mutation credential. */
    authorize(raw: unknown): Promise<AuthorizationDecision> {
      return dependencies.database.$transaction((tx) => check(tx, raw), { isolationLevel: "ReadCommitted" });
    },
    /** Future domain services use the grant's target/actor/reason for the
     * operation/audit using this same tx, never re-read mutable request input.
     * A denial throws and rolls back any context-loader writes (e.g. audit).
     */
    runAuthorized<T>(raw: unknown, operation: (tx: Prisma.TransactionClient,
      grant: Extract<AuthorizationDecision, { decision: "ALLOW" }>) => Promise<T>,
      options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number } = {}): Promise<T> {
      return dependencies.database.$transaction(async (tx) => {
        const decision = await check(tx, raw);
        if (decision.decision === "DENY") throw new AuthorizationDeniedError(decision);
        return operation(tx, decision);
      }, { isolationLevel: options.isolationLevel ?? "ReadCommitted", maxWait: 5000, timeout: options.timeout ?? 15000 });
    },
  };
}

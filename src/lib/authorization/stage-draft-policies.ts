import "server-only";
import type { ResourcePolicies, AuthorizationContext } from "./policy";

/** Authoring only. No project, preset, approval or publication grant is produced. */
export const stageDraftPolicies: ResourcePolicies = {
  "template.configureCustomStages": async ({ tx, actor, request }) => {
    if (process.env.FLUX_STAGE_BUILDER_DRAFTS !== "1" || !["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "")) return null;
    if (request.targetId !== "stage-drafts") {
      const match = /^stage-draft:([a-zA-Z][a-zA-Z0-9_-]{0,79})$/.exec(request.targetId);
      if (!match) return null;
      await tx.$queryRaw`SELECT id FROM "WorkflowDraft" WHERE id = ${match[1]} FOR UPDATE`;
      const row = await tx.workflowDraft.findUnique({ where: { id: match[1] } });
      if (!row || row.status !== "DRAFT" || (actor.businessRole !== "DIRECTOR" && row.createdById !== actor.userId)) return null;
    }
    return { resource: { id: request.targetId, kind: "template" }, resourcePermission: true,
      publicationRequiresDirectorApproval: true,
      integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true },
    } satisfies AuthorizationContext;
  },
};

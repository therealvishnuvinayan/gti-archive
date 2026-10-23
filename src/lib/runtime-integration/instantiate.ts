import "server-only";
import { ensure, parseDefinition } from "../stage-builder/contracts";
import { configurationHash } from "../stage-builder/hash";
import { publicationIssues } from "../stage-builder/publication-contracts";
import { defaults, parseCreate } from "../stage-runtime/contracts";
import { history, json, runtimeActor, type Tx } from "../stage-runtime/data";

/** Called only inside a centrally authorized transaction. SQL independently checks creation authority. */
export async function instantiateRuntimeProject(tx: Tx, input: ReturnType<typeof parseCreate>, creatorId: string, projectId?: string) {
    const actor = await runtimeActor(tx);
    const version = await tx.publishedWorkflowVersion.findUnique({ where: { id: input.publishedVersionId } }); ensure(version, "PUBLISHED_VERSION_NOT_FOUND", 404);
    const definition = parseDefinition(version.definition);
    ensure(version.validationStatus === "VALID" && publicationIssues(definition).length === 0 && configurationHash(definition) === input.definitionHash && version.configurationHash === input.definitionHash, "PUBLISHED_DEFINITION_CHANGED", 409);
    const ids = [input.ownerId, ...input.coOwnerIds, ...input.executorIds];
    const assignments = await tx.userAuthorization.findMany({ where: { userId: { in: ids }, accountStatus: "ACTIVE" } });
    ensure(assignments.length === ids.length && assignments.every(a => input.executorIds.includes(a.userId) ? !!a.businessRole : ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(a.businessRole ?? "")), "INELIGIBLE_PARTICIPANT", 403);
    const at = new Date();
    const project = await tx.runtimeProject.create({ data: { ...(projectId ? { id: projectId } : {}), title: input.title, description: input.description, ownerId: input.ownerId, createdById: creatorId, publishedVersionId: version.id, workflowId: version.workflowId, versionNumber: version.number, definitionHash: version.configurationHash, createdAt: at,
      participants: { create: [...input.coOwnerIds.map(userId => ({ userId, role: "CO_OWNER" })), ...input.executorIds.map(userId => ({ userId, role: "EXECUTOR" }))].map(p => ({ ...p, addedById: actor.userId, createdAt: at })) },
      stages: { create: definition.stages.map(s => ({ definitionStageId: s.id, position: s.position, configuration: json(s), values: json(defaults(s)), checklist: {} })) } } });
    const result = { projectId: project.id }; await history(tx, project.id, null, "CREATED", input, result, { ...input, createdById: creatorId, createdAt: at.toISOString() }); return result;
}

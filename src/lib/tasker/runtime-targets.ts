import "server-only";
import type { Prisma } from "@prisma/client";
import { requireRuntimeIntegration } from "../runtime-integration/activation";
import { stageData } from "../stage-runtime/data";
import { validateField } from "../stage-runtime/contracts";
import { DraftError, type FieldDefinition } from "../stage-builder/contracts";
import { TaskerError, ensure, id } from "./contracts";

export function runtimeTargetParts(raw: string) {
  const [kind, stageId, capabilityId, fieldId, extra] = raw.split(":");
  ensure(["runtime-file", "runtime-field"].includes(kind) && !extra && (kind === "runtime-field" ? !!fieldId : !fieldId), "UNSUPPORTED_TARGET");
  return { kind, stageId: id(stageId), capabilityId: id(capabilityId), fieldId: fieldId ? id(fieldId) : null };
}
export async function authorizedRuntimeTarget(tx: Prisma.TransactionClient, userId: string, raw: string) {
  requireRuntimeIntegration();
  const parts = runtimeTargetParts(raw), auth = await tx.userAuthorization.findUnique({ where: { userId } });
  ensure(auth?.accountStatus === "ACTIVE" && ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(auth.businessRole ?? ""), "TARGET_ACCESS_REVOKED", 403);
  const root = await tx.runtimeStage.findUnique({ where: { id: parts.stageId }, select: { projectId: true } });
  ensure(root, "TARGET_UNAVAILABLE", 409);
  await tx.$queryRaw`SELECT id FROM "RuntimeProject" WHERE id=${root.projectId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "RuntimeStage" WHERE id=${parts.stageId} FOR UPDATE`;
  const p = await tx.runtimeProject.findUniqueOrThrow({ where: { id: root.projectId }, include: { participants: true } });
  const managers = [p.ownerId, ...p.participants.filter(x => x.role === "CO_OWNER").map(x => x.userId)];
  ensure(p.state === "ACTIVE" && (auth.businessRole === "DIRECTOR" || managers.includes(userId)), "TARGET_ACCESS_REVOKED", 403);
  const data = await stageData(tx, p.id, parts.stageId);
  ensure(data.stage.state !== "COMPLETED" && !data.blocked && !data.unavailable, "TARGET_UNAVAILABLE", 409);
  const c = data.definition.capabilities.find(c => c.id === parts.capabilityId && c.type === (parts.kind === "runtime-file" ? "FILE_REQUIREMENT" : "INFORMATION"));
  ensure(c, "TARGET_UNAVAILABLE", 409);
  const field = c.type === "INFORMATION" ? c.fields.find(f => f.id === parts.fieldId) : null;
  ensure(c.type !== "INFORMATION" || (field && field.type !== "READ_ONLY"), "UNSUPPORTED_FIELD");
  const identity = { projectId: p.id, stageId: data.stage.id, capabilityId: c.id, fieldId: parts.fieldId,
    nativeId: raw.slice(raw.indexOf(":") + 1), publishedVersionId: p.publishedVersionId, definitionHash: p.definitionHash,
    definitionStageId: data.stage.definitionStageId, fieldType: field?.type ?? "FILE_REQUIREMENT", field: field ?? null, capability: c };
  // File requirements append bounded submissions; field changes additionally use
  // the stage revision to reject stale approval/evidence snapshots.
  const state = field ? { value: (data.stage.values as Prisma.JsonObject)[field.id], revision: data.stage.revision, evidenceRevision: data.stage.evidenceRevision } : {};
  return { kind: parts.kind, nativeId: identity.nativeId, projectId: p.id, label: `${data.definition.title} · ${field?.label ?? c.title}`,
    modes: field ? ["TEXT"] : ["FILE"], identity, state, participantUserIds: managers };
}
export function runtimeProposedValue(identity: Prisma.JsonValue, value: string) {
  const field = (identity as unknown as { field: FieldDefinition }).field;
  try { return { value: validateField(field, field.type === "NUMBER" && value !== "" ? Number(value) : value) }; } catch (error) { return runtimeAdapterError(error); }
}

export function runtimeAdapterError(error: unknown): never {
  if (error instanceof DraftError) throw new TaskerError(error.code, error.status);
  throw error;
}

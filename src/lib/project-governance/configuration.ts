import "server-only";
import type { Prisma, GovernedProjectKind } from "@prisma/client";
import { validateProjectTags } from "../project-tags";
import { governanceHash, legacyArtworkPresetHash, legacyArtworkPreset } from "./preset";

export type CreationDetails = {
  kind: GovernedProjectKind;
  name: string;
  description?: string;
  ownerId: string;
  coOwnerIds: string[];
  executorIds: string[];
  tags: string[];
  executionType: "INTERNAL" | "EXTERNAL";
  presetApprovalId?: string;
  clientRequestId: string;
};
export type CreationSnapshot = Omit<CreationDetails, "presetApprovalId" | "clientRequestId"> & {
  description: string;
  participantVersions: Record<string, number>;
  workflowDefinitionHash: string;
};
export function reasonText(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) throw new Error("A reason between 1 and 2000 characters is required.");
  return value.trim();
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== "string" || !id.trim()) || new Set(value).size !== value.length) throw new Error("Invalid or duplicate participant selection.");
  return [...value].sort();
}
export async function prepareCreation(tx: Prisma.TransactionClient, input: CreationDetails, actorId: string, role: string): Promise<CreationSnapshot> {
  if (!["ARTWORK", "FLEXIBLE"].includes(input.kind) || !["INTERNAL", "EXTERNAL"].includes(input.executionType)) throw new Error("Unsupported project configuration.");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200) throw new Error("Enter a project name of up to 200 characters.");
  if (typeof input.ownerId !== "string" || !input.ownerId || (role !== "DIRECTOR" && input.ownerId !== actorId)) throw new Error("Managers must own the projects they submit.");
  const coOwnerIds = ids(input.coOwnerIds), executorIds = ids(input.executorIds);
  if (coOwnerIds.includes(input.ownerId)) throw new Error("The owner cannot also be a co-owner.");
  const description = input.description ?? "";
  if (typeof description !== "string" || description.length > 20000) throw new Error("Project brief is too long.");
  if (input.kind === "FLEXIBLE" && (!Array.isArray(input.tags) || input.tags.length)) throw new Error("Flexible projects do not support Artwork tags.");
  const tags = input.kind === "ARTWORK" ? validateProjectTags(input.tags) : { tags: [], error: undefined };
  if (tags.error) throw new Error(tags.error);
  const participants = await tx.userAuthorization.findMany({where:{userId:{in:[...new Set([input.ownerId,...coOwnerIds,...executorIds])]}},select:{userId:true,businessRole:true,accountStatus:true,authorizationVersion:true}});
  const byId = new Map(participants.map(row => [row.userId, row]));
  for (const id of [input.ownerId,...coOwnerIds,...executorIds]) if (byId.get(id)?.accountStatus !== "ACTIVE" || !byId.get(id)?.businessRole) throw new Error("Every participant must have an active business role.");
  const ownerRole = byId.get(input.ownerId)!.businessRole;
  if (!["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(ownerRole!)) throw new Error("The project owner must be a Director or Project Manager.");
  if (coOwnerIds.some(id => !["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(byId.get(id)!.businessRole!))) throw new Error("Co-owners must be Project Managers. Director oversight is automatic.");
  if (ownerRole === "JUNIOR_PROJECT_MANAGER" && !coOwnerIds.some(id => byId.get(id)!.businessRole === "SENIOR_PROJECT_MANAGER")) throw new Error("A Junior Project Manager requires an active Senior Project Manager co-owner.");
  if (input.kind === "FLEXIBLE" && (role !== "DIRECTOR" || coOwnerIds.length || executorIds.length || ownerRole === "JUNIOR_PROJECT_MANAGER")) throw new Error("Flexible creation currently supports Director creation without co-owners or executors; its separate co-owner model is pending.");
  return {kind:input.kind,name:input.name.trim(),description,ownerId:input.ownerId,coOwnerIds,executorIds,tags:tags.tags!,executionType:input.executionType,participantVersions:Object.fromEntries(participants.map(row=>[row.userId,row.authorizationVersion])),workflowDefinitionHash:input.kind === "ARTWORK" ? legacyArtworkPresetHash : governanceHash({kind:"FLEXIBLE",version:1})};
}
export async function validateStoredCreation(tx: Prisma.TransactionClient, request: {configuration:Prisma.JsonValue;configurationHash:string;requesterId:string;requesterVersion:number;kind:GovernedProjectKind;expiresAt:Date}) {
  if (request.expiresAt <= new Date() || governanceHash(request.configuration) !== request.configurationHash) throw new Error("This creation request has expired or changed. Submit a new request.");
  const requester = await tx.userAuthorization.findUnique({where:{userId:request.requesterId}});
  if (!requester || requester.accountStatus !== "ACTIVE" || requester.authorizationVersion !== request.requesterVersion || !["DIRECTOR","SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER"].includes(requester.businessRole ?? "")) throw new Error("The requester authorization has changed. Submit a new request.");
  const saved = request.configuration as unknown as CreationSnapshot;
  const current = await prepareCreation(tx,{...saved,clientRequestId:"stored"},request.requesterId,requester.businessRole!);
  if (current.kind !== request.kind || governanceHash(current) !== request.configurationHash) throw new Error("Project details or participant eligibility changed. Submit a new request.");
  return {configuration:current,requester};
}
export async function validPreset(tx: Prisma.TransactionClient, id: string | null) {
  if (!id) return false;
  await tx.$queryRaw`SELECT id FROM "LegacyProjectPresetApproval" WHERE id = ${id} FOR SHARE`;
  const preset = await tx.legacyProjectPresetApproval.findUnique({where:{id}});
  return !!preset && !preset.revokedAt && preset.presetKey === legacyArtworkPreset.key && preset.definitionHash === legacyArtworkPresetHash && governanceHash(preset.definition) === legacyArtworkPresetHash;
}

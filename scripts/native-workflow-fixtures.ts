import assert from "node:assert/strict";
import { AuthorizationDeniedError } from "../src/lib/authorization/policy";
import { randomUUID } from "node:crypto";
import type { AsyncLocalStorage } from "node:async_hooks";
import type { BusinessRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getCurrentUser } from "../src/lib/auth";
import { createVersionedSessionToken } from "../src/lib/authorization/session";

const context = (globalThis as unknown as { __nativeFixtureContext: AsyncLocalStorage<string> }).__nativeFixtureContext;
const tokens = new Map<string, string>();
export function fixtureSession<T>(actor: { id: string }, action: () => T): T {
  const token = tokens.get(actor.id);
  if (!token) throw new Error(`UNSEEDED_FIXTURE_SESSION:${actor.id}`);
  return context.run(token, action);
}
// Preserve the exact actor argument: a forged identity must still be rejected by
// getCurrentUser/runProjectMutation. AsyncLocalStorage isolates concurrent calls.
export function authenticatedFixtureService<T extends (...args: never[]) => unknown>(service: T, actorIndex = 0): T {
  return ((...args: Parameters<T>) => fixtureSession(args[actorIndex] as { id: string }, async () => {
    try { return await service(...args); }
    catch (error) {
      // An explicit read denial is the V2 equivalent of a legacy null view.
      if (service.name.startsWith("get") && error instanceof Error && error.message === "PROJECT_READ_DENIED") return null;
      // Older service tests use result-style denials. Normalize only the actual
      // typed V2 policy rejection/explicitly disabled entry point. Infrastructure,
      // storage, database and assertion failures must still fail the test.
      if (error instanceof AuthorizationDeniedError || (error instanceof Error && ["This operation is blocked pending project governance integration (Phase 1.5D).", "Project/resource mismatch."].includes(error.message))) return { error: error.message };
      throw error;
    }
  })) as T;
}
export async function authorizeFixtureActors<T extends { id: string }>(actors: T[], roles: Array<BusinessRole | null>) {
  if (actors.length !== roles.length) throw new Error("FIXTURE_ROLE_COUNT");
  const director = actors[roles.indexOf("DIRECTOR")] ?? actors[0];
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id',${director.id},true), set_config('flux.authorization_reason','Disposable native workflow V2 fixture identities',true), set_config('flux.authorization_change_id',${randomUUID()},true)`;
    for (const [index, actor] of actors.entries()) await tx.userAuthorization.create({ data: { userId: actor.id, businessRole: roles[index], technicalPrivileges: roles[index] === null ? ["TECHNICAL_ADMIN"] : [], accountStatus: "ACTIVE", authorizationVersion: 1 } });
  });
  if (roles.includes("DIRECTOR")) setFixtureDirector(director);
  const authenticated = [];
  for (const actor of actors) {
    const token = createVersionedSessionToken(1);
    await prisma.session.create({ data: { userId: actor.id, token, expiresAt: new Date(Date.now() + 3600000) } });
    tokens.set(actor.id, token);
    const user = await fixtureSession(actor, getCurrentUser);
    if (!user) throw new Error("FIXTURE_AUTHENTICATION_FAILED");
    authenticated.push(Object.assign(user, { name: user.name ?? "Fixture" }));
  }
  return authenticated;
}
export function countNativeCheck() {
  (globalThis as unknown as { __nativeCountCheck: () => void }).__nativeCountCheck();
}

let fixturePresetApprovalId: string | undefined;
let fixtureDirector: { id: string } | undefined;
export function setFixtureDirector(actor: { id: string }) { fixtureDirector = actor; }
export async function createGovernedFixtureProject(actor: { id: string }, input: { name: string; ownerId: string; tags: string[]; coOwnerIds: string[]; executorIds: string[]; collaboratorIds?: string[] }) {
  if (!fixtureDirector) throw new Error("FIXTURE_DIRECTOR_REQUIRED");
  const { approveLegacyArtworkPreset, submitProjectCreation } = await import("../src/lib/project-governance/service");
  const { legacyArtworkPresetHash } = await import("../src/lib/project-governance/preset");
  if (!fixturePresetApprovalId) fixturePresetApprovalId = (await fixtureSession(fixtureDirector, () => approveLegacyArtworkPreset(fixtureDirector!, { definitionHash: legacyArtworkPresetHash, reason: "Review Artwork preset for disposable workflow regression" }))).approvalId;
  const created = await fixtureSession(actor, () => submitProjectCreation(actor, { kind: "ARTWORK", ...input, executionType: "INTERNAL", presetApprovalId: fixturePresetApprovalId, clientRequestId: randomUUID() }));
  if (!("projectId" in created)) throw new Error("FIXTURE_PROJECT_NOT_ACTIVATED");
  // Historical collaborator records are read-compatibility fixtures, never grants.
  for (const userId of input.collaboratorIds ?? []) await prisma.projectCollaborator.create({ data: { projectId: created.projectId, userId } });
  return created;
}

export async function changeFixtureBusinessRole(actor: { id: string }, businessRole: BusinessRole | null) {
  if (!fixtureDirector) throw new Error("FIXTURE_DIRECTOR_REQUIRED");
  const row = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id',${fixtureDirector!.id},true), set_config('flux.authorization_reason','Test current V2 participant eligibility',true), set_config('flux.authorization_change_id',${randomUUID()},true)`;
    return tx.userAuthorization.update({ where: { userId: actor.id }, data: { businessRole, technicalPrivileges: businessRole ? [] : ["TECHNICAL_ADMIN"], authorizationVersion: { increment: 1 } } });
  });
  const token = createVersionedSessionToken(row.authorizationVersion);
  await prisma.session.create({ data: { userId: actor.id, token, expiresAt: new Date(Date.now() + 3600000) } }); tokens.set(actor.id, token);
  const current = await fixtureSession(actor, getCurrentUser);
  if (!current) throw new Error("FIXTURE_REAUTHENTICATION_FAILED");
  return Object.assign(current, { name: current.name ?? "Fixture" });
}

export async function preservedRevocationDenial(actors: Array<{ id: string }>, action: (actor: { id: string }) => Promise<unknown>, projectId: string) {
  const snapshot = async () => JSON.stringify(await Promise.all([
    prisma.projectWorkflowStage.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectConceptFolder.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectStage.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectRevision.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectAttachment.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectStageFileHandoff.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
    prisma.projectFileChecklist.findMany({ where: { projectId }, include: { items: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    prisma.projectProductionUnit.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
  ]));
  const before = await snapshot();
  for (const actor of actors) {
    const result = await action(actor);
    assert.ok(result && typeof result === "object" && "error" in result && /blocked pending project governance/.test(String(result.error)), "Approval reset stays closed even to Director; no authority is fabricated");
    assert.equal(await snapshot(), before, "Rejected reset preserves exact files, reviews, workflow, handoffs, checklists and production records");
  }
}

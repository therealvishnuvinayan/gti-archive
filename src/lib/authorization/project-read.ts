import "server-only";
import { getCurrentUser } from "../auth";
import { projectReadTarget, type ProjectReadCapability, type ProjectReadTarget } from "./project-read-policies";
import { flexibleProjectReadWhere, projectReadActor, structuredProjectReadWhere } from "./project-read-rules";
import { runtimeAuthorization } from "./runtime";

export async function refreshProjectReader(expected?: { id: string }) {
  const user = await getCurrentUser();
  if (!user || (expected && expected.id !== user.id)) throw new Error("PROJECT_READ_UNAUTHENTICATED");
  return user;
}
export async function projectReadScope(expected?: { id: string }, full = false) {
  const user = await refreshProjectReader(expected);
  const actor = projectReadActor(user);
  return { user, actor, structured: structuredProjectReadWhere(actor, full), flexible: flexibleProjectReadWhere(actor, full) };
}
export async function canReadProjectResource(kind: ProjectReadTarget, id: string,
  capability: ProjectReadCapability = "project.view", expected?: { id: string }) {
  await refreshProjectReader(expected);
  return (await runtimeAuthorization.authorize({ capability, targetId: projectReadTarget(kind, id) })).decision === "ALLOW";
}
export async function requireProjectResourceRead(kind: ProjectReadTarget, id: string,
  capability: ProjectReadCapability = "project.view", expected?: { id: string }) {
  if (!await canReadProjectResource(kind, id, capability, expected)) throw new Error("PROJECT_READ_DENIED");
}

export async function denyUnscopedProjectRead(surface: string): Promise<void> {
 await refreshProjectReader();
 throw new Error(`PROJECT_READ_UNAVAILABLE: ${surface}`);
}

import "server-only";
import { prisma } from "./prisma";
import { runProjectMutation } from "./authorization/project-write";

export async function toggleProjectPin(user: { id: string }, projectId: string) {
  return runProjectMutation(user, "toggleProjectPin", { kind: "structured", id: projectId }, async () => {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { isPinned: true } });
    return prisma.project.update({ where: { id: projectId }, data: { isPinned: !project.isPinned }, select: { isPinned: true } });
  });
}

export async function deleteProject(user: { id: string }, projectId: string): Promise<never> {
  void user; void projectId;
  throw new Error("Project deletion is disabled until retained history and durable deletion audit are supported.");
}

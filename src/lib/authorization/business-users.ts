import "server-only";
import { prisma } from "../prisma";
import { runWorkspaceOperation } from "./workspace";
export async function listBusinessUsers(user: { id: string }) {
  return runWorkspaceOperation(user, "workspace.businessUsers", "root", async () => prisma.user.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, email: true,
      authorization: { select: { businessRole: true, accountStatus: true } } },
  }));
}

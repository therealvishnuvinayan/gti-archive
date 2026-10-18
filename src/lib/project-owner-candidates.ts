import { getCurrentUser } from "@/lib/auth";
import { isProjectManagerReader } from "@/lib/authorization/project-read-rules";
import { UserRole } from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export type ProjectOwnerCandidate = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export async function getEligibleProjectOwnerCandidates(): Promise<
  ProjectOwnerCandidate[]
> {
  const actor = await getCurrentUser();
  if (!actor || !isProjectManagerReader(actor)) throw new Error("Project management permission required.");
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      where: {
        authorization: { is: { accountStatus: "ACTIVE", businessRole: { in: ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"] } } },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    }),
  );

  return users.map((user) => ({
    id: user.id,
    name: user.name?.trim() || getFallbackName(user.email),
    email: user.email,
    role: user.role,
  }));
}

export async function getProjectExecutorCandidates() {
  const actor = await getCurrentUser();
  if (!actor || !isProjectManagerReader(actor)) throw new Error("Project management permission required.");
  const users = await prisma.user.findMany({ where: { authorization: { is: { accountStatus: "ACTIVE", businessRole: { not: null } } } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  return users.map(user => ({ ...user, name: user.name?.trim() || getFallbackName(user.email) }));
}

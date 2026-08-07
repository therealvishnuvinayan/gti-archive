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
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      where: {
        role: {
          not: UserRole.SUPER_ADMIN,
        },
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

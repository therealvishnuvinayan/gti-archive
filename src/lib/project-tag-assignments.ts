import type { Prisma } from "@prisma/client";

export async function resolveProjectTagIdsTx(
  tx: Prisma.TransactionClient,
  names: string[],
) {
  const tagIds: string[] = [];
  for (const name of names) {
    const existing = await tx.projectTag.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    const tag = existing ?? (await tx.projectTag.upsert({
        where: { name },
        create: { name },
        update: {},
        select: { id: true },
      }));
    tagIds.push(tag.id);
  }
  return tagIds;
}

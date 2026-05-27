import { prisma, withPrismaRetry } from "@/lib/prisma";

export async function getFavoriteAttachmentIdSetForUser(
  userId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) {
    return new Set<string>();
  }

  const records = await withPrismaRetry(() =>
    prisma.fileFavorite.findMany({
      where: {
        userId,
        attachmentId: {
          in: attachmentIds,
        },
      },
      select: {
        attachmentId: true,
      },
    }),
  );

  return new Set(records.map((record) => record.attachmentId));
}

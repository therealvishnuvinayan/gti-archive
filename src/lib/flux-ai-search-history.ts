import { prisma, withPrismaRetry } from "@/lib/prisma";

export const RECENT_FLUX_AI_SEARCH_LIMIT = 5;
const STORED_FLUX_AI_SEARCH_LIMIT = 20;

function normalizeSearchQuery(query: string) {
  const displayQuery = query.trim().replace(/\s+/g, " ").slice(0, 240);

  return {
    displayQuery,
    normalizedQuery: displayQuery.normalize("NFKC").toLowerCase(),
  };
}

export async function getRecentFluxAiSearches(userId: string) {
  const searches = await withPrismaRetry(() =>
    prisma.fluxAiSearchHistory.findMany({
      where: { userId },
      orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
      take: RECENT_FLUX_AI_SEARCH_LIMIT,
      select: { query: true },
    }),
  );

  return searches.map((search) => search.query);
}

export async function recordFluxAiSearch(userId: string, query: string) {
  const { displayQuery, normalizedQuery } = normalizeSearchQuery(query);

  if (!displayQuery || !normalizedQuery) {
    return getRecentFluxAiSearches(userId);
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.fluxAiSearchHistory.upsert({
        where: {
          userId_normalizedQuery: {
            userId,
            normalizedQuery,
          },
        },
        update: {
          query: displayQuery,
          searchedAt: new Date(),
        },
        create: {
          userId,
          query: displayQuery,
          normalizedQuery,
        },
      });

      const staleSearches = await tx.fluxAiSearchHistory.findMany({
        where: { userId },
        orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
        skip: STORED_FLUX_AI_SEARCH_LIMIT,
        select: { id: true },
      });

      if (staleSearches.length > 0) {
        await tx.fluxAiSearchHistory.deleteMany({
          where: { id: { in: staleSearches.map((search) => search.id) } },
        });
      }

      const recentSearches = await tx.fluxAiSearchHistory.findMany({
        where: { userId },
        orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
        take: RECENT_FLUX_AI_SEARCH_LIMIT,
        select: { query: true },
      });

      return recentSearches.map((search) => search.query);
    }),
  );
}

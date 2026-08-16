import { prisma, withPrismaRetry } from "@/lib/prisma";

export const RECENT_FLUX_AI_SEARCH_LIMIT = 5;
const STORED_FLUX_AI_SEARCH_LIMIT = 20;
export const MAX_FLUX_AI_SEARCH_QUERY_LENGTH = 240;

function normalizeSearchQuery(query: string) {
  const displayQuery = query
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_FLUX_AI_SEARCH_QUERY_LENGTH);

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

export async function deleteRecentFluxAiSearch(userId: string, query: string) {
  const { normalizedQuery } = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return getRecentFluxAiSearches(userId);
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.fluxAiSearchHistory.deleteMany({
        where: { userId, normalizedQuery },
      });
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

export async function clearRecentFluxAiSearches(userId: string) {
  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.fluxAiSearchHistory.deleteMany({ where: { userId } });
      return [] as string[];
    }),
  );
}

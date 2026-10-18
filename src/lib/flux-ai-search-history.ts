import { getCurrentUser } from "@/lib/auth";
import { runArchiveOperation } from "@/lib/authorization/archive";
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

async function getRecentFluxAiSearchesImplementation(userId: string) {
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

async function recordFluxAiSearchImplementation(userId: string, query: string) {
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

async function deleteRecentFluxAiSearchImplementation(userId: string, query: string) {
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

async function clearRecentFluxAiSearchesImplementation(userId: string) {
  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.fluxAiSearchHistory.deleteMany({ where: { userId } });
      return [] as string[];
    }),
  );
}

export async function getRecentFluxAiSearches(...args: Parameters<typeof getRecentFluxAiSearchesImplementation>): ReturnType<typeof getRecentFluxAiSearchesImplementation> {
  const user = await getCurrentUser();
  if (!user || user.id !== args[0]) throw new Error("Search history authentication mismatch.");
  return runArchiveOperation(user, "archive.view", "root", () => getRecentFluxAiSearchesImplementation(...args));
}

export async function recordFluxAiSearch(...args: Parameters<typeof recordFluxAiSearchImplementation>): ReturnType<typeof recordFluxAiSearchImplementation> {
  const user = await getCurrentUser();
  if (!user || user.id !== args[0]) throw new Error("Search history authentication mismatch.");
  return runArchiveOperation(user, "archive.view", "root", () => recordFluxAiSearchImplementation(...args));
}

export async function deleteRecentFluxAiSearch(...args: Parameters<typeof deleteRecentFluxAiSearchImplementation>): ReturnType<typeof deleteRecentFluxAiSearchImplementation> {
  const user = await getCurrentUser();
  if (!user || user.id !== args[0]) throw new Error("Search history authentication mismatch.");
  return runArchiveOperation(user, "archive.view", "root", () => deleteRecentFluxAiSearchImplementation(...args));
}

export async function clearRecentFluxAiSearches(...args: Parameters<typeof clearRecentFluxAiSearchesImplementation>): ReturnType<typeof clearRecentFluxAiSearchesImplementation> {
  const user = await getCurrentUser();
  if (!user || user.id !== args[0]) throw new Error("Search history authentication mismatch.");
  return runArchiveOperation(user, "archive.view", "root", () => clearRecentFluxAiSearchesImplementation(...args));
}

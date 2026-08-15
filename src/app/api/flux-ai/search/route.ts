import { NextResponse } from "next/server";

import { searchArchivesForUser } from "@/lib/archives";
import { getCurrentUser } from "@/lib/auth";
import { recordFluxAiSearch } from "@/lib/flux-ai-search-history";
import { canUseArchives, hasPermission } from "@/lib/permissions/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ARCHIVE_QUERY_LENGTH = 240;

type FluxArchiveSearchPayload = {
  query?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "fluxAi.view")) {
    return NextResponse.json(
      { error: "You do not have permission to use Flux AI." },
      { status: 403 },
    );
  }

  if (!canUseArchives(user)) {
    return NextResponse.json(
      { error: "You do not have permission to search archives." },
      { status: 403 },
    );
  }

  let payload: FluxArchiveSearchPayload;

  try {
    payload = (await request.json()) as FluxArchiveSearchPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid archive search request." },
      { status: 400 },
    );
  }

  const query = typeof payload.query === "string" ? payload.query.trim() : "";

  if (!query) {
    return NextResponse.json(
      { error: "Enter an archive name or archived filename." },
      { status: 400 },
    );
  }

  if (query.length > MAX_ARCHIVE_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: `Archive searches must be ${MAX_ARCHIVE_QUERY_LENGTH} characters or less.`,
      },
      { status: 400 },
    );
  }

  try {
    const search = await searchArchivesForUser({
      user,
      query,
      limit: 10,
    });
    const searchedLabel = search.recent ? "recent archives" : search.query;
    const message = search.results.length
      ? `Found ${search.results.length} matching archive${
          search.results.length === 1 ? "" : "s"
        }.`
      : `No archives matched '${searchedLabel}'.`;
    const recentSearches = await recordFluxAiSearch(user.id, query).catch(() => null);

    return NextResponse.json(
      {
        ...search,
        message,
        ...(recentSearches ? { recentSearches } : {}),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Archive search is temporarily unavailable." },
      { status: 500 },
    );
  }
}

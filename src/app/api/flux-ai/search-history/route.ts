import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  clearRecentFluxAiSearches,
  deleteRecentFluxAiSearch,
  MAX_FLUX_AI_SEARCH_QUERY_LENGTH,
} from "@/lib/flux-ai-search-history";
import { canUseFluxAi } from "@/lib/permissions/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DeleteSearchHistoryPayload = {
  query?: unknown;
  clearAll?: unknown;
};

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canUseFluxAi(user)) {
    return NextResponse.json(
      { error: "You do not have permission to use Flux AI." },
      { status: 403 },
    );
  }

  let payload: DeleteSearchHistoryPayload;
  try {
    payload = (await request.json()) as DeleteSearchHistoryPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid search history request." },
      { status: 400 },
    );
  }

  const clearAll = payload.clearAll === true;
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!clearAll && (!query || query.length > MAX_FLUX_AI_SEARCH_QUERY_LENGTH)) {
    return NextResponse.json(
      { error: "Select a valid recent search to remove." },
      { status: 400 },
    );
  }

  try {
    const recentSearches = clearAll
      ? await clearRecentFluxAiSearches(user.id)
      : await deleteRecentFluxAiSearch(user.id, query);
    return NextResponse.json(
      { recentSearches },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to update recent searches right now." },
      { status: 500 },
    );
  }
}

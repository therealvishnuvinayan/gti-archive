import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { SearchError } from "@/lib/search-v2/contracts";
import { unifiedSearch } from "@/lib/search-v2/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size) throw new SearchError("INVALID_SEARCH");
    return NextResponse.json(await unifiedSearch(Object.fromEntries(params)), { headers });
  } catch (error) {
    const status = error instanceof SearchError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    if (status === 500) console.error("Search read failed", error);
    return NextResponse.json({ error: status === 500 ? "Search unavailable. Please try again." : status === 403 ? "Search access denied." : status === 404 ? "Search unavailable." : "Invalid search. Use up to 120 characters and supported filters." }, { status, headers });
  }
}

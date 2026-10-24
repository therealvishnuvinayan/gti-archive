import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { AttentionError } from "@/lib/notifications-v2/contracts";
import { getLiveAttention } from "@/lib/notifications-v2/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size) throw new AttentionError("INVALID_ATTENTION");
    return NextResponse.json(await getLiveAttention(Object.fromEntries(params)), { headers });
  } catch(error) {
    const status = error instanceof AttentionError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    if (status === 500) console.error("Attention read failed", error);
    return NextResponse.json({ error: status === 500 ? "Attention center unavailable. Please try again." : status === 403 ? "Attention access denied." : status === 404 ? "Attention center unavailable." : "Invalid attention dates or filters." }, { status, headers });
  }
}

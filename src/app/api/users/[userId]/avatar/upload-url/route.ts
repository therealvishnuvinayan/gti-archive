import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
export async function POST() {
  const user = await getCurrentUser();
  return NextResponse.json({ error: user ? "Managed account photos are unavailable pending V2 administration integration." : "Unauthorized." },
    { status: user ? 403 : 401, headers: { "Cache-Control": "no-store" } });
}

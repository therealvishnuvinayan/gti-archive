import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getActiveAssetTagOptions } from "@/lib/asset-tags";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tags = await getActiveAssetTagOptions();

  return NextResponse.json({ tags });
}

import { NextResponse } from "next/server";

import { getActiveArchiveCategoryOptions } from "@/lib/archive-categories";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const categories = await getActiveArchiveCategoryOptions();

  return NextResponse.json({ categories });
}

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { getDashboardProjectCounts } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "dashboard.viewProjectCounts")) {
    return NextResponse.json({ ongoing: 0 }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const counts = await getDashboardProjectCounts(user);

    return NextResponse.json(
      { ongoing: counts.ongoing },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load project count.",
      },
      { status: 400 },
    );
  }
}

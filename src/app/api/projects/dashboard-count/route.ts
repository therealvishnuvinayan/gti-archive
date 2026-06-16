import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import { hasPermission } from "@/lib/permissions/resolver";
import { getDashboardProjectCounts } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const timer = createDevTimer("[library:init]");
  const user = await getCurrentUser();
  timer.mark("dashboard count auth/session");

  if (!user) {
    timer.end("dashboard count/sidebar request unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "dashboard.viewProjectCounts")) {
    timer.end("dashboard count/sidebar request skipped", {
      reason: "Missing dashboard.viewProjectCounts permission.",
    });
    return NextResponse.json({ ongoing: 0 }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const counts = await getDashboardProjectCounts(user);
    timer.end("dashboard count/sidebar request", {
      ongoing: counts.ongoing,
    });

    return NextResponse.json(
      { ongoing: counts.ongoing },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    timer.end("dashboard count/sidebar request failed", {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load project count.",
    });
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

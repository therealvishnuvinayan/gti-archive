import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import { getRecentNotificationsForUser } from "@/lib/notification-center";
import { hasPermission } from "@/lib/permissions/resolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const timer = createDevTimer("[library:init]");
  const user = await getCurrentUser();
  timer.mark("notifications auth/session");

  if (!user) {
    timer.end("notifications request unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "notification.view")) {
    timer.end("notifications request forbidden");
    return NextResponse.json(
      { error: "You do not have permission to view notifications." },
      { status: 403 },
    );
  }

  try {
    const payload = await getRecentNotificationsForUser(user.id);
    timer.end("notifications request", {
      recentCount: payload.notifications.length,
      unreadCount: payload.unreadCount,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    timer.end("notifications request failed", {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load recent notifications right now.",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load recent notifications right now.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getRecentNotificationsForUser } from "@/lib/notification-center";
import { hasPermission } from "@/lib/permissions/resolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "notification.view")) {
    return NextResponse.json(
      { error: "You do not have permission to view notifications." },
      { status: 403 },
    );
  }

  try {
    const payload = await getRecentNotificationsForUser(user.id);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
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

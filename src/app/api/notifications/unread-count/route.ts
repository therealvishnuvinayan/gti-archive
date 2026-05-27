import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/notification-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const unreadCount = await getUnreadNotificationCount(user.id);

    return NextResponse.json(
      { unreadCount },
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
            : "Unable to load the unread notification count.",
      },
      { status: 400 },
    );
  }
}

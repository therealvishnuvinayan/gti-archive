import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { markAllNotificationsAsRead } from "@/lib/notification-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = await markAllNotificationsAsRead(user.id);

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
            : "Unable to mark notifications as read right now.",
      },
      { status: 400 },
    );
  }
}

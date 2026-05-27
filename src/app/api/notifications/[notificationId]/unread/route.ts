import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { markNotificationAsUnread } from "@/lib/notification-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { notificationId } = await params;

  try {
    const payload = await markNotificationAsUnread(notificationId, user.id);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to mark the notification as unread right now.";

    return NextResponse.json(
      { error: message },
      {
        status: /not found/i.test(message) ? 404 : 400,
      },
    );
  }
}

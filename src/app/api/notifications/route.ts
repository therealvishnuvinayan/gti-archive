import { NextResponse } from "next/server";

import {
  parseNotificationStatusParam,
  parseNotificationTypeFilter,
} from "@/lib/notifications";
import { getCurrentUser } from "@/lib/auth";
import { getNotificationsForUser } from "@/lib/notification-center";
import { hasPermission } from "@/lib/permissions/resolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
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

  const searchParams = new URL(request.url).searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "8");
  const status = parseNotificationStatusParam(searchParams.get("status"));
  const type = parseNotificationTypeFilter(searchParams.get("type"));
  const query = searchParams.get("query") ?? "";

  try {
    const payload = await getNotificationsForUser({
      userId: user.id,
      page,
      pageSize,
      status,
      type,
      query,
    });

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
            : "Unable to load notifications right now.",
      },
      { status: 400 },
    );
  }
}

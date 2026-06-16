import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import { getLibraryPageDataForUser } from "@/lib/library";
import {
  parseLibraryDateFilter,
  parseLibraryQuickMenu,
  parseLibraryTypeFilter,
} from "@/lib/library-shared";

export async function GET(request: Request) {
  const timer = createDevTimer("[library:list]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("library list request unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  try {
    const payload = await getLibraryPageDataForUser(user, {
      search: searchParams.get("search") ?? "",
      projectId: searchParams.get("projectId") ?? "",
      createdById: searchParams.get("createdById") ?? "",
      assetTagId: searchParams.get("assetTagId") ?? "",
      date: parseLibraryDateFilter(searchParams.get("date")),
      type: parseLibraryTypeFilter(searchParams.get("type")),
      quickMenu: parseLibraryQuickMenu(searchParams.get("quickMenu")),
      page,
      pageSize,
    });
    timer.end("library list request", {
      returnedItems: payload.items.length,
      totalItems: payload.total,
      page: payload.page,
      pageSize: payload.pageSize,
    });

    return NextResponse.json(payload);
  } catch (error) {
    timer.end("library list request failed", {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load library files right now.",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load library files right now.",
      },
      { status: 400 },
    );
  }
}

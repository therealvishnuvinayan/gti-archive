import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getLibraryPageDataForUser } from "@/lib/library";
import {
  parseLibraryDateFilter,
  parseLibraryQuickMenu,
  parseLibraryTypeFilter,
} from "@/lib/library-shared";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

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

    return NextResponse.json(payload);
  } catch (error) {
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

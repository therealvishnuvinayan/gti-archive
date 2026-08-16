import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getProjectPrivateFileDownloadUrl } from "@/lib/project-private-folders";
import { decodeRouteParam } from "@/lib/route-params";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; folderId: string; fileId: string }>;
  },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const routeParams = await params;

  try {
    const url = await getProjectPrivateFileDownloadUrl(user, {
      ...routeParams,
      folderId: decodeRouteParam(routeParams.folderId),
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to download file.";
    return NextResponse.json(
      { error: message },
      { status: /permission|access/i.test(message) ? 403 : 404 },
    );
  }
}

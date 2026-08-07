import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getProjectResearchFileDownloadUrl } from "@/lib/project-research-files";
import { decodeRouteParam } from "@/lib/route-params";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; folderId: string; fileId: string }>;
  },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const routeParams = await params;
  const input = {
    ...routeParams,
    folderId: decodeRouteParam(routeParams.folderId),
  };
  try {
    const url = await getProjectResearchFileDownloadUrl(user, input);
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download file.";
    return NextResponse.json(
      { error: message },
      { status: /permission|access/i.test(message) ? 403 : 404 },
    );
  }
}

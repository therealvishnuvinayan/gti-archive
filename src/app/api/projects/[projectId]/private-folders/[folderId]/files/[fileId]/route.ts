import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  deleteProjectPrivateFile,
  getProjectPrivateTextFileContent,
} from "@/lib/project-private-folders";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const routeParams = await params;
  const input = {
    ...routeParams,
    folderId: decodeRouteParam(routeParams.folderId),
    excerpt: new URL(request.url).searchParams.get("excerpt") === "1",
  };

  try {
    return NextResponse.json(
      await getProjectPrivateTextFileContent(user, input),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to preview text file.";
    return NextResponse.json(
      { error: message },
      { status: /permission|access/i.test(message) ? 403 : 404 },
    );
  }
}

export async function DELETE(
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
  const input = {
    ...routeParams,
    folderId: decodeRouteParam(routeParams.folderId),
  };

  try {
    await deleteProjectPrivateFile(user, input);
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath(
      `/projects/${input.projectId}/workspace/private/${encodeURIComponent(input.folderId)}`,
    );
    revalidateTag(PROJECTS_CACHE_TAG, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete file.";
    return NextResponse.json(
      { error: message },
      { status: /permission|access/i.test(message) ? 403 : 404 },
    );
  }
}

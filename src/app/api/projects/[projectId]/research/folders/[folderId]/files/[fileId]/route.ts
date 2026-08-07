import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteProjectResearchFile } from "@/lib/project-research-files";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { decodeRouteParam } from "@/lib/route-params";

export async function DELETE(
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
    await deleteProjectResearchFile(user, input);
    revalidatePath(`/projects/${input.projectId}/stages/2`);
    revalidatePath(
      `/projects/${input.projectId}/stages/2/folders/${input.folderId}`,
    );
    revalidateTag(PROJECTS_CACHE_TAG, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete file.";
    return NextResponse.json(
      { error: message },
      { status: /permission|read-only|access/i.test(message) ? 403 : 400 },
    );
  }
}

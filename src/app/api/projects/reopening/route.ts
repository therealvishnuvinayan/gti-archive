import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getProjectReopening, reopenProject } from "@/lib/project-reopening";
import { taskerRoute } from "@/lib/tasker/http";
import { taskAssert } from "@/lib/tasker/errors";
import type { TaskProjectRef } from "@/lib/tasker/types";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return taskerRoute(async (user) => {
    const params = new URL(request.url).searchParams;
    const view = await getProjectReopening(user, { projectType: params.get("projectType") as TaskProjectRef["projectType"], projectId: params.get("projectId") ?? "" });
    const historyId = params.get("historyId");
    if (!historyId) return { view };
    const item = view.history.find((h) => h.id === historyId);
    taskAssert(item, "Reopening snapshot not found.", 404);
    return new NextResponse(JSON.stringify(item, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="project-reopening-${item.id}.json"`, "Cache-Control": "private, no-store" } });
  });
}
export async function POST(request: Request) {
  return taskerRoute(async (user) => {
    const input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid reopening request.");
    let result;
    try { result = await reopenProject(user, input); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (["P2034", "P2002"].includes(error.code) || (error.code === "P2010" && error.meta?.code === "40001"))) taskAssert(false, "The project changed. Refresh before reopening.", 409);
      throw error;
    }
    revalidateTag("projects", "max");
    revalidateTag("flexible-projects", "max");
    revalidatePath("/projects", "layout");
    revalidatePath("/tasks", "layout");
    revalidatePath("/dashboard");
    return result;
  });
}

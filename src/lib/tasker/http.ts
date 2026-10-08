import { NextResponse, after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishNotificationChanges } from "@/lib/realtime/server";
import { deliverTaskerEmails } from "./delivery";
import { TaskerError } from "./errors";

export async function taskerRoute(run: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<unknown>) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in to use Tasker." }, { status: 401 });
    return NextResponse.json(await run(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TaskerError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    console.error("Tasker request failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Unable to complete this task action. Please retry." }, { status: 500 });
  }
}

export function afterTaskMutation(taskId?: string) {
  revalidateTag("projects", "max");
  revalidateTag("flexible-projects", "max");
  revalidatePath("/tasks", "layout");
  revalidatePath("/projects", "layout");
  after(async () => {
    try {
      const recipients = await prisma.taskerDelivery.findMany({ where: { taskId, sentAt: null }, distinct: ["userId"], select: { userId: true } });
      await publishNotificationChanges({ recipientUserIds: recipients.map((r) => r.userId), reason: "created" });
      await deliverTaskerEmails({ taskId });
    } catch { console.error("Tasker delivery deferred to the outbox worker."); }
  });
}

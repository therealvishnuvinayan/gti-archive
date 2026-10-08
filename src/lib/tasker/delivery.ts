import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendResendEmail, type SendEmailInput } from "@/lib/email/resend";
import { getPermissionProfileSnapshotForUser } from "@/lib/permissions/profiles";
import { canUseTasks } from "@/lib/permissions/resolver";
import { conceptTaskAccessWhere, taskAccessWhere } from "./service";
import { taskFamilyHref } from "./families";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Run after mutations and from the authenticated cron endpoint. A lease and provider
// idempotency key make crashes/retries safe without rolling back accepted task data.
export async function deliverTaskerEmails(options: { taskId?: string; limit?: number; send?: (input: SendEmailInput) => Promise<{ ok: boolean; error?: string }> } = {}) {
  const now = new Date();
  const deliveries = await prisma.taskerDelivery.findMany({ where: { taskId: options.taskId, sentAt: null, availableAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: Math.min(options.limit ?? 20, 100) });
  let sent = 0, failed = 0;
  for (const delivery of deliveries) {
    const leaseToken = randomUUID();
    const claim = await prisma.taskerDelivery.updateMany({ where: { id: delivery.id, sentAt: null, availableAt: { lte: now } }, data: { leaseToken, attempts: { increment: 1 }, availableAt: new Date(now.getTime() + 5 * 60000) } });
    if (!claim.count) continue;
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: delivery.userId } });
      const recipient = { ...user, permissionProfileSnapshot: await getPermissionProfileSnapshotForUser(user) };
      const accessible = canUseTasks(recipient) && (delivery.taskId
        ? await prisma.taskerTask.count({ where: { id: delivery.taskId, ...taskAccessWhere(recipient) } })
        : delivery.conceptId && await prisma.projectConceptFolder.count({ where: { id: delivery.conceptId, ...conceptTaskAccessWhere(recipient) } }));
      if (!accessible) {
        await prisma.taskerDelivery.updateMany({ where: { id: delivery.id, leaseToken }, data: { sentAt: new Date(), leaseToken: null, lastError: "Skipped: recipient no longer has task access." } });
        continue;
      }
      const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
      if (!/^https?:\/\//.test(origin)) throw new Error("Set APP_URL or NEXT_PUBLIC_APP_URL for task email links.");
      const source = delivery.taskId ? { type: "TASK" as const, id: delivery.taskId } : { type: "CONCEPT" as const, id: delivery.conceptId! };
      const path = delivery.dedupeKey.startsWith("tasker-family:") ? taskFamilyHref(source) : `/tasks/${delivery.taskId}`;
      const href = new URL(path, origin).toString();
      const result = await (options.send ?? sendResendEmail)({ to: user.email, subject: delivery.subject, text: `${delivery.message}\n\n${href}`, html: `<p>${escape(delivery.message)}</p><p><a href="${escape(href)}">Open task</a></p>`, idempotencyKey: delivery.dedupeKey });
      if (!result.ok) throw new Error(result.error || "Email delivery failed.");
      await prisma.taskerDelivery.updateMany({ where: { id: delivery.id, leaseToken }, data: { sentAt: new Date(), leaseToken: null, lastError: null } });
      sent++;
    } catch (error) {
      await prisma.taskerDelivery.updateMany({ where: { id: delivery.id, leaseToken }, data: { leaseToken: null, lastError: (error instanceof Error ? error.message : "Delivery failed").slice(0, 1000), availableAt: new Date(Date.now() + Math.min(6 * 3600000, 60000 * 2 ** Math.min(delivery.attempts, 8))) } });
      failed++;
    }
  }
  return { sent, failed };
}

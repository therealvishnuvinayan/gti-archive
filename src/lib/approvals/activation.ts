import "server-only";
import type { Prisma } from "@prisma/client";

export function approvalAdoptionEnabled() { return process.env.FLUX_APPROVAL_ENGINE === "1"; }
export async function approvalEngineAvailable(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{ available: boolean }>>`
    SELECT to_regclass('public."ApprovalRequest"') IS NOT NULL AS available`;
  if (!row.available && approvalAdoptionEnabled()) throw new Error("Approval engine migration is required before activation.");
  return row.available;
}

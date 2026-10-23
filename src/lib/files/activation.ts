import "server-only";
import type { Prisma } from "@prisma/client";

/** Enable new adoption only AFTER separately approved schema activation. Never
 * applies a migration or silently falls back after an enabled write fails. */
export function sharedFileIdentityEnabled() {
  return process.env.FLUX_SHARED_FILE_IDENTITY === "1";
}

/** Read guards stay active for already adopted versions even if new adoption is
 * disabled. A catalog lookup also keeps pre-migration deployments compatible. */
export async function sharedFileIdentityAvailable(tx: Prisma.TransactionClient) {
  const [schema] = await tx.$queryRaw<Array<{ available: boolean }>>`
    SELECT to_regclass('public."SharedFileReference"') IS NOT NULL AS available`;
  return schema.available;
}

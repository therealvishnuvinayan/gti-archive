import { createHash } from "node:crypto";

import { checkRateLimit } from "@/lib/ai/rate-limit";

export function getExternalRequestClientIp(headers: Headers) {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function checkExternalRequestRateLimit(input: {
  token: string;
  clientIp: string;
  scope: "verify" | "upload" | "submit" | "file";
  limit: number;
}) {
  const tokenFingerprint = createHash("sha256")
    .update(input.token)
    .digest("hex")
    .slice(0, 20);
  return checkRateLimit({
    key: `external-checklist:${input.scope}:${input.clientIp}:${tokenFingerprint}`,
    limit: input.limit,
    windowMs: 60_000,
  });
}

import { createHash, randomBytes } from "node:crypto";

const EXTERNAL_TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function getChecklistExternalRequestExpiryDays() {
  const configured = Number.parseInt(
    process.env.CHECKLIST_EXTERNAL_REQUEST_EXPIRY_DAYS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured >= 1 && configured <= MAX_EXPIRY_DAYS
    ? configured
    : DEFAULT_EXPIRY_DAYS;
}

export function hashExternalChecklistToken(token: string) {
  const normalized = token.trim();
  if (!TOKEN_PATTERN.test(normalized)) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function createExternalChecklistToken(now = new Date()) {
  const token = randomBytes(EXTERNAL_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + getChecklistExternalRequestExpiryDays());
  return {
    token,
    tokenHash: hashExternalChecklistToken(token) as string,
    createdAt: now,
    expiresAt,
  };
}

export function buildExternalChecklistRequestUrl(token: string) {
  const appUrl = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${appUrl}/external/checklist-request/${encodeURIComponent(token)}`;
}

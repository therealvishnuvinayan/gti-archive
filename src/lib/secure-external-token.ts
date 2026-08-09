import { createHash, randomBytes } from "node:crypto";

const EXTERNAL_TOKEN_BYTES = 32;
const MAX_EXPIRY_DAYS = 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function getSecureExternalTokenExpiryDays(input: {
  environmentKey: string;
  defaultDays: number;
}) {
  const configured = Number.parseInt(process.env[input.environmentKey] ?? "", 10);
  return Number.isFinite(configured) && configured >= 1 && configured <= MAX_EXPIRY_DAYS
    ? configured
    : input.defaultDays;
}

export function hashSecureExternalToken(token: string) {
  const normalized = token.trim();
  if (!TOKEN_PATTERN.test(normalized)) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function createSecureExternalToken(input: {
  expiryDays: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = randomBytes(EXTERNAL_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + input.expiryDays);
  return {
    token,
    tokenHash: hashSecureExternalToken(token) as string,
    createdAt: now,
    expiresAt,
  };
}

export function getApplicationUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

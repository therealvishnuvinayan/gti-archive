import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashAuthPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyAuthPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const storedBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, 64);

  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedBuffer);
}

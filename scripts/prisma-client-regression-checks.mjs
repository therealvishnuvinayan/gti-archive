import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [prismaSource, permissionProfiles] = await Promise.all([
  readFile("src/lib/prisma.ts", "utf8"),
  readFile("src/lib/permissions/profiles.ts", "utf8"),
]);

assert(
  prismaSource.includes("prismaReconnectPromise?: Promise<void>") &&
    prismaSource.includes("globalForPrisma.prismaReconnectPromise") &&
    prismaSource.includes("await reconnectPrismaClient()"),
  "Transient Prisma recovery must be shared across parallel server renders.",
);
assert(
  !prismaSource.includes("await prisma.$disconnect()"),
  "Request-time retry must not disconnect the shared Prisma client.",
);
assert(
  /withPrismaRetry\(\(\) =>\s*prisma\.userArchiveAccess\.findUnique\(/.test(
    permissionProfiles,
  ),
  "Permission snapshot archive access must use transient connection recovery.",
);

console.log("Prisma shared-client connection recovery checks passed.");

import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

function readDatabaseUrl() {
  const line = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is missing from .env.");
  const raw = line.slice("DATABASE_URL=".length).trim();
  return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status ?? "unknown"}.`);
  }
}

const databaseUrl = readDatabaseUrl();
const schemaName = `flexible_projects_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
const testUrl = new URL(databaseUrl);
testUrl.searchParams.set("schema", schemaName);
const testEnvironment = { ...process.env, DATABASE_URL: testUrl.toString() };
const migrationRoot = mkdtempSync(join(tmpdir(), "gti-flexible-migrations-"));
const temporaryPrismaDirectory = join(migrationRoot, "prisma");
mkdirSync(join(temporaryPrismaDirectory, "migrations"), { recursive: true });
copyFileSync("prisma/schema.prisma", join(temporaryPrismaDirectory, "schema.prisma"));
copyFileSync(
  "prisma/migrations/migration_lock.toml",
  join(temporaryPrismaDirectory, "migrations", "migration_lock.toml"),
);
for (const directory of readdirSync("prisma/migrations")) {
  const source = join("prisma/migrations", directory, "migration.sql");
  if (existsSync(source)) {
    cpSync(join("prisma/migrations", directory), join(temporaryPrismaDirectory, "migrations", directory), {
      recursive: true,
    });
  }
}

try {
  run(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--schema", join(temporaryPrismaDirectory, "schema.prisma")],
    testEnvironment,
  );
  run(
    "node",
    [
      "-r",
      "./scripts/register-compiled-alias.cjs",
      ".tmp/flexible-projects-integration/scripts/flexible-projects-integration-check.js",
    ],
    { ...testEnvironment, COMPILED_ALIAS_ROOT: ".tmp/flexible-projects-integration" },
  );
} finally {
  const cleanup = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await cleanup.$disconnect();
    rmSync(migrationRoot, { recursive: true, force: true });
  }
}

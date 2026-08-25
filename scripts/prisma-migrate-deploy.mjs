import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for Prisma migration deployment.");
  process.exit(1);
}

const migrationUrl = new URL(databaseUrl);
if (migrationUrl.hostname.endsWith(".neon.tech")) {
  migrationUrl.hostname = migrationUrl.hostname.replace(/-pooler(?=\.)/, "");
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to start Prisma migration deployment: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Keep PostgreSQL socket paths short on macOS and never use the application DB.
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-file-size-tests-"));
const data = join(root, "data"), socket = join(root, "socket");
mkdirSync(socket);
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const env = {
  ...process.env,
  FILE_SIZE_MIGRATION_ISOLATED: "1",
  NEXT_PUBLIC_REALTIME_PROVIDER: "none",
  DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/postgres`,
  AWS_S3_BUCKET: "file-size-tests.invalid", AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "file-size-test-dummy", AWS_SECRET_ACCESS_KEY: "file-size-test-dummy",
  COMPILED_ALIAS_ROOT: ".tmp/stage-five-integration",
};
function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || `${command} failed`);
  return result.stdout;
}
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale", "--wal-segsize=1"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-F -p ${port} -k ${socket} -h 127.0.0.1 -c min_wal_size=2MB -c max_wal_size=16MB`, "-w", "start"]);
  started = true;
  const testPrisma = join(root, "prisma");
  cpSync("prisma", testPrisma, { recursive: true });
  for (const entry of readdirSync(join(testPrisma, "migrations"), { withFileTypes: true })) {
    const directory = join(testPrisma, "migrations", entry.name);
    if (entry.isDirectory() && !existsSync(join(directory, "migration.sql"))) rmSync(directory, { recursive: true });
  }
  run("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", join(testPrisma, "schema.prisma")]);
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/archive-next-cache-stub.cjs", "scripts/file-size-schema-integration-check.cjs"]).trim());
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-archive-tests-"));
const data = join(root, "data"), socket = join(root, "socket");
mkdirSync(socket);
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
// Override all external connections before migrations or fixtures. S3 calls are mocked.
const env = {
  ...process.env,
  NEXT_PUBLIC_REALTIME_PROVIDER: "none",
  DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/postgres`,
  AWS_S3_BUCKET: "archive-edit-integration", AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "archive-test-dummy", AWS_SECRET_ACCESS_KEY: "archive-test-dummy",
  COMPILED_ALIAS_ROOT: ".tmp/archive-edit-permission-integration",
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
  run("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"]);
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/archive-next-cache-stub.cjs", ".tmp/archive-edit-permission-integration/scripts/archive-edit-permission-integration-check.js"]).trim());
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

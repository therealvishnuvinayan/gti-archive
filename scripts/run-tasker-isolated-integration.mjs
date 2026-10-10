import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Never read the application's .env database. Fixtures/migrations run in a local,
// disposable PostgreSQL process, with email and realtime disabled.
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-tasker-"));
const data = join(root, "data"), socket = join(root, "socket");
mkdirSync(socket);
const port = await new Promise((resolve, reject) => {
  const server = createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const env = { ...process.env, STAGE_FIVE_ISOLATED: "1", DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/postgres`, NEXT_PUBLIC_REALTIME_PROVIDER: "none", APP_URL: "https://tasker.example.test", RESEND_API_KEY: "", RESEND_FROM_EMAIL: "", COMPILED_ALIAS_ROOT: ".tmp/tasker-integration" };
function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || `${command} failed`);
  return result.stdout;
}
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-F -p ${port} -k ${socket} -h 127.0.0.1`, "-w", "start"]);
  started = true;
  cpSync("prisma", join(root, "prisma"), { recursive: true });
  run("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", join(root, "prisma", "schema.prisma")]);
  console.log("Universal Tasker: all migrations applied to a disposable local database.");
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/tasker-integration-check.js"]).trim());
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/tasker-sisters-integration-check.js"]).trim());
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/tasker-gaps-integration-check.js"]).trim());
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/stage-five-integration-check.js"]).trim());
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/tasker-dependencies-integration-check.js"]).trim());
  console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", ".tmp/tasker-integration/scripts/project-reopening-integration-check.js"]).trim());
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Keep the Unix socket path below PostgreSQL's macOS path-length limit.
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-project-tags-tests-"));
const data = join(root, "data"), socket = join(root, "socket");
mkdirSync(socket);
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
// Always override the app connection before running migrations or fixtures.
const env = { ...process.env, NEXT_PUBLIC_REALTIME_PROVIDER: "none", DATABASE_URL: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:${port}/postgres` };
function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || `${command} failed`);
  return result.stdout;
}
let started = false;
try {
  run("initdb", ["-D", data, "-A", "trust", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-F -p ${port} -k ${socket} -h 127.0.0.1`, "-w", "start"]);
  started = true;
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  console.log("Project tag checks use a disposable local database with all migrations applied.");
  env.COMPILED_ALIAS_ROOT = ".tmp/project-tags-integration";
  for (const script of ["project-tags-integration-check", "project-creation-v2-integration-check", "user-projects-integration-check"]) {
    console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", `.tmp/project-tags-integration/scripts/${script}.js`]).trim());
  }
} catch (error) {
  const log = join(root, "postgres.log");
  if (!started && existsSync(log)) console.error(readFileSync(log, "utf8"));
  throw error;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

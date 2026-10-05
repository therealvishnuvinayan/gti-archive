import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Keep the Unix socket path below PostgreSQL's macOS path-length limit.
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-tasks-tests-"));
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
  cpSync("prisma", join(root, "prisma"), { recursive: true });
  rmSync(join(root, "prisma", "migrations", "20261005200000_task_assignment_sender"), { recursive: true });
  run("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", join(root, "prisma", "schema.prisma")]);
  run("psql", [env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", `
    INSERT INTO "User" (id, email, name, "passwordHash", role, "updatedAt") VALUES
      ('legacy-task-admin', 'legacy-task-admin@example.test', 'Legacy Admin', 'x', 'ADMIN', NOW()),
      ('legacy-task-user', 'legacy-task-user@example.test', 'Legacy User', 'x', 'USER', NOW());
    INSERT INTO "Project" (id, name, "createdById", "ownerId", "updatedAt") VALUES ('legacy-task-project', 'Legacy tasks', 'legacy-task-admin', 'legacy-task-admin', NOW());
    INSERT INTO "ProjectExecutor" ("projectId", "userId", "updatedAt") VALUES ('legacy-task-project', 'legacy-task-user', NOW());
    INSERT INTO "ProjectStage" (id, "projectId", name, "order", "isTasker", "updatedAt") VALUES
      ('legacy-assigned-stage', 'legacy-task-project', 'Assigned', 301, true, NOW()),
      ('legacy-unassigned-stage', 'legacy-task-project', 'Unassigned', 302, true, NOW()),
      ('legacy-unknown-stage', 'legacy-task-project', 'Unknown creator', 303, true, NOW());
    INSERT INTO "ProjectConceptFolder" (id, "projectId", "taskerStageId", "assignedExecutorId", name, "normalizedName", "createdById", "updatedAt") VALUES
      ('legacy-assigned-task', 'legacy-task-project', 'legacy-assigned-stage', 'legacy-task-user', 'Assigned', 'assigned', 'legacy-task-admin', NOW()),
      ('legacy-unassigned-task', 'legacy-task-project', 'legacy-unassigned-stage', NULL, 'Unassigned', 'unassigned', 'legacy-task-admin', NOW()),
      ('legacy-unknown-creator-task', 'legacy-task-project', 'legacy-unknown-stage', 'legacy-task-user', 'Unknown creator', 'unknown creator', NULL, NOW());
  `]);
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  console.log("Tasks migration and checks use a disposable local database with legacy fixtures.");
  env.COMPILED_ALIAS_ROOT = ".tmp/tasks-integration";
  for (const script of ["tasks-integration-check", "user-projects-integration-check"]) {
    console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", "-r", "./scripts/project-tags-next-cache-stub.cjs", `.tmp/tasks-integration/scripts/${script}.js`]).trim());
  }
} catch (error) {
  const log = join(root, "postgres.log");
  if (!started && existsSync(log)) console.error(readFileSync(log, "utf8"));
  throw error;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

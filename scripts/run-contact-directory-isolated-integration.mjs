import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Keep the Unix socket path below PostgreSQL's macOS path-length limit.
const root = mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gti-directory-tests-"));
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
  const priorSchema = join(root, "prisma", "schema.prisma");
  cpSync("prisma", join(root, "prisma"), { recursive: true });
  rmSync(join(root, "prisma", "migrations", "20261005180000_contact_directories"), { recursive: true });
  run("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", priorSchema]);
  run("psql", [env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", `
    INSERT INTO "User" (id, email, name, "passwordHash", role, "updatedAt") VALUES ('legacy-admin', 'legacy@example.test', 'Legacy', 'x', 'SUPER_ADMIN', NOW());
    INSERT INTO "Project" (id, name, "createdById", "ownerId", "updatedAt") VALUES ('legacy-project', 'Legacy project', 'legacy-admin', 'legacy-admin', NOW()), ('legacy-shared-project', 'Shared legacy project', 'legacy-admin', 'legacy-admin', NOW());
    INSERT INTO "ProjectInquiry" (id, "projectId", "updatedAt") VALUES ('legacy-inquiry', 'legacy-project', NOW()), ('legacy-shared-inquiry', 'legacy-shared-project', NOW());
    INSERT INTO "ContactDirectoryEntry" (id, name, company, "createdById", "updatedAt") VALUES
      ('legacy-client', 'Client', 'Legacy Ltd', 'legacy-admin', NOW()), ('legacy-beneficiary', 'Beneficiary', NULL, 'legacy-admin', NOW()),
      ('legacy-shared', 'Shared', 'Shared Ltd', 'legacy-admin', NOW()), ('legacy-unused', 'Unused', 'Unused Ltd', 'legacy-admin', NOW());
    INSERT INTO "ProjectInquiryParty" (id, "inquiryId", role, source, "contactId", "snapshotName", "snapshotCompany", "updatedAt") VALUES
      ('legacy-party-client', 'legacy-inquiry', 'CLIENT', 'MANUAL_CONTACT', 'legacy-client', 'Client', 'Legacy Ltd', NOW()),
      ('legacy-party-beneficiary', 'legacy-inquiry', 'FINAL_BENEFICIARY', 'MANUAL_CONTACT', 'legacy-beneficiary', 'Beneficiary', NULL, NOW()),
      ('legacy-shared-client', 'legacy-shared-inquiry', 'CLIENT', 'MANUAL_CONTACT', 'legacy-shared', 'Shared', 'Shared Ltd', NOW()),
      ('legacy-shared-beneficiary', 'legacy-inquiry', 'FINAL_BENEFICIARY', 'MANUAL_CONTACT', 'legacy-shared', 'Shared', 'Shared Ltd', NOW());
  `]);
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  console.log("Migration applied to a disposable local database with legacy fixtures.");
  env.COMPILED_ALIAS_ROOT = ".tmp/contact-directory-integration";
  for (const script of ["contact-directory-integration-check", "project-inquiry-integration-check"]) {
    console.log(run("node", ["-r", "./scripts/register-compiled-alias.cjs", `.tmp/contact-directory-integration/scripts/${script}.js`]).trim());
  }
} catch (error) {
  const log = join(root, "postgres.log");
  if (!started && existsSync(log)) console.error(readFileSync(log, "utf8"));
  throw error;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}

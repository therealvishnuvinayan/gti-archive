// Private local operator entrypoint. Never imported by Next.js or a public route.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
let temporary;
try {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.CI) throw new Error("LOCAL_DEVELOPMENT_ONLY");
  const { loadEnvConfig } = createRequire(require.resolve("next/package.json"))("@next/env");
  const { parse } = createRequire(require.resolve("prisma/build/index.js"))("dotenv");
  const inheritedUrl = process.env.DATABASE_URL;
  loadEnvConfig(repository, true, { info() {}, error() {} });
  const databaseUrl = process.env.DATABASE_URL;
  // Different shell, Prisma and Next.js bindings are unsafe even if one would win precedence.
  for (const filename of [".env", ".env.local", ".env.development", ".env.development.local", "prisma/.env"]) {
    const path = join(repository, filename);
    if (!existsSync(path)) continue;
    const binding = parse(readFileSync(path)).DATABASE_URL;
    if (binding && binding !== databaseUrl) throw new Error("DATABASE_CONFIGURATION_PRECEDENCE_CONFLICT");
  }
  if (inheritedUrl && inheritedUrl !== databaseUrl) throw new Error("DATABASE_CONFIGURATION_PRECEDENCE_CONFLICT");
  const generated = require.resolve(".prisma/client/schema.prisma", { paths: [require.resolve("@prisma/client")] });
  const normalize = (value) => value.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, "");
  if (normalize(readFileSync(generated, "utf8")) !== normalize(readFileSync(join(repository, "prisma/schema.prisma"), "utf8"))) {
    throw new Error("GENERATED_PRISMA_CLIENT_OUTDATED_RUN_LOCAL_PRISMA_GENERATE");
  }
  temporary = mkdtempSync(join(tmpdir(), "flux-v2-provision-cli-"));
  const output = join(temporary, "compiled");
  const compile = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project",
    join(repository, "scripts/tsconfig.development-provisioning.json"), "--outDir", output], {
    cwd: repository, env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C" }, encoding: "utf8", timeout: 60000,
  });
  if (compile.status !== 0) { console.error("Provisioning TypeScript compilation failed. Run the targeted TypeScript check."); process.exitCode = 1; }
  else {
    const modules = join(output, "node_modules");
    mkdirSync(join(modules, "@prisma"), { recursive: true });
    symlinkSync(dirname(require.resolve("@prisma/client/package.json")), join(modules, "@prisma/client"), "dir");
    // Use Next's real server-only package under its server export condition.
    symlinkSync(dirname(require.resolve("next/dist/compiled/server-only/package.json")), join(modules, "server-only"), "dir");
    const child = spawnSync(process.execPath, ["--conditions=react-server", join(output, "scripts/development-provisioning/cli.js"), ...process.argv.slice(2)], {
      cwd: repository, stdio: "inherit",
      // Do not pass unrelated application credentials or any signing private key to the database process.
      env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "development", DATABASE_URL: databaseUrl,
        FLUX_PROVISION_REPOSITORY: repository, FLUX_PROVISION_PRISMA_CLI: require.resolve("prisma/build/index.js") },
    });
    process.exitCode = child.status ?? 1;
  }
} catch (error) {
  const known = new Set(["LOCAL_DEVELOPMENT_ONLY", "DATABASE_CONFIGURATION_PRECEDENCE_CONFLICT", "GENERATED_PRISMA_CLIENT_OUTDATED_RUN_LOCAL_PRISMA_GENERATE"]);
  console.error(`Provisioning launcher stopped: ${known.has(error?.message) ? error.message : "LOCAL_CONFIGURATION_OR_TOOLING_ERROR"}. No automatic recovery attempted.`);
  process.exitCode = 1;
} finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }

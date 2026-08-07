import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260807120000_project_creation_v2/migration.sql",
);
const creation = read("src/lib/project-creation.ts");
const action = read("src/app/(dashboard)/projects/new/v2-actions.ts");
const form = read("src/components/projects/create-project-form.tsx");
const candidates = read("src/lib/project-owner-candidates.ts");
const resolver = read("src/lib/permissions/resolver.ts");
const fluxRoute = read("src/app/api/flux-ai/create-project/route.ts");

for (const snippet of [
  'ownerId                String?',
  '@relation("ProjectOwner"',
  "model ProjectCoOwner",
  "coOwners               ProjectCoOwner[]",
]) {
  assertIncludes(schema, snippet, `Schema ownership contract ${snippet}`);
}

assert(!schema.includes("enum ProjectExecutorRole"), "Executor role enum must be removed.");
const executorModel = schema.match(/model ProjectExecutor \{[\s\S]*?\n\}/)?.[0] ?? "";
assert(executorModel, "ProjectExecutor model is missing.");
assert(!/\n\s+role\s/.test(executorModel), "Executor rows must not have a role column.");

for (const snippet of [
  'creator."role" <> \'SUPER_ADMIN\'::"UserRole"',
  'CREATE TABLE "ProjectCoOwner"',
  'ALTER TABLE "ProjectExecutor" DROP COLUMN "role"',
  'ALTER TABLE "Project" ALTER COLUMN "category" DROP NOT NULL',
]) {
  assertIncludes(migration, snippet, `Migration contract ${snippet}`);
}
assert(!/DELETE\s+FROM\s+"ProjectExecutor"/i.test(migration), "Migration must preserve every executor row.");

for (const snippet of [
  "hasDuplicates(coOwnerIds)",
  "coOwnerIds.includes(ownerId)",
  "hasDuplicates(executorIds)",
  "owner.role === UserRole.SUPER_ADMIN",
  "user.role === UserRole.SUPER_ADMIN",
  "UserRole.COLLABORATOR",
  "prisma.$transaction",
  "coOwners:",
  "executors:",
  "collaborators:",
  "tx.notification.createMany",
]) {
  assertIncludes(creation, snippet, `Creation service guard ${snippet}`);
}

const projectCreateBlock = creation.slice(
  creation.indexOf("const project = await tx.project.create"),
  creation.indexOf("const ownerRecipientIds"),
);
for (const legacyField of [
  "category,",
  "description,",
  "executionType,",
  "budgetRequired,",
  "currency,",
  "stageCount,",
  "stages:",
]) {
  assert(!projectCreateBlock.includes(legacyField), `V2 creation must not fabricate ${legacyField}`);
}

assertIncludes(candidates, "not: UserRole.SUPER_ADMIN", "Role-based Super Admin filtering");
assert(!/email|name/.test(candidates.slice(candidates.indexOf("where:"), candidates.indexOf("orderBy:"))), "Owner eligibility must not infer role from name or email.");

for (const snippet of [
  "createProjectV2(user, input)",
  'revalidatePath("/projects")',
  "isCreating",
  'router.push("/projects")',
  "fieldErrors",
]) {
  assertIncludes(`${action}\n${form}`, snippet, `Create UI submission behavior ${snippet}`);
}

for (const snippet of [
  "isProjectOwnerOrCoOwner",
  "isProjectExecutor",
  "UserRole.SUPER_ADMIN",
  "ownerId: user.id",
  "coOwners:",
]) {
  assertIncludes(resolver, snippet, `Access resolver rule ${snippet}`);
}

assertIncludes(fluxRoute, "jsonFluxAI(response, 409)", "Flux AI V2 block response");
assert(!fluxRoute.includes("prisma.project.create"), "Flux AI route must not use the legacy create path.");

console.log("Project creation V2 regression checks passed.");

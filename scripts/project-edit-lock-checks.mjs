import { existsSync, readFileSync } from "node:fs";
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

const projectsSource = read("src/lib/projects.ts");
const detailSource = read("src/components/projects/project-detail-workspace.tsx");
const projectActions = read("src/app/(dashboard)/projects/actions.ts");
const editPagePath = join(rootDir, "src/app/(dashboard)/projects/[slug]/edit/page.tsx");
const legacyActionsPath = join(rootDir, "src/app/(dashboard)/projects/new/actions.ts");

assertIncludes(projectsSource, "canEdit: boolean;", "Project detail canEdit field");
assertIncludes(projectsSource, "hasProjectPermission(currentUser, project, \"project.update\")", "Project edit permission check");
assertIncludes(detailSource, "Completed project · editing locked", "Project detail completed lock text");
assert(!detailSource.includes("/edit"), "Project detail must not expose the legacy edit route.");
assert(!existsSync(editPagePath), "Legacy project edit page must be removed.");
assert(!existsSync(legacyActionsPath), "Legacy project edit action module must be removed.");
assertIncludes(projectActions, "Completed projects cannot be deleted.", "V2 completed delete guard");

console.log("Legacy project edit removal regression checks passed.");

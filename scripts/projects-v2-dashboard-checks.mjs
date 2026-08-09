import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(rootDir, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const includes = (source, value, label) =>
  assert(source.includes(value), `${label} is missing.`);

const page = read("src/app/(dashboard)/projects/page.tsx");
const browser = read("src/components/projects/projects-browser.tsx");
const card = read("src/components/projects/project-card.tsx");
const projects = read("src/lib/projects.ts");
const workflow = read("src/lib/project-list-workflow.ts");
const actions = read("src/app/(dashboard)/projects/actions.ts");

for (const status of ["ALL", "ACTIVE", "COMPLETED", "SETUP_NEEDED"]) {
  includes(workflow, `\"${status}\"`, `workflow status ${status}`);
}

for (const role of ["OWNER", "CO_OWNER", "EXECUTOR", "COLLABORATOR"]) {
  includes(projects, `${role}:`, `My Role predicate ${role}`);
}

for (const legacyParam of [
  "activeCategory",
  "activeTag",
  "activeBudgetMin",
  "activeBudgetMax",
  "activeBudgetCurrency",
  "activeCreatedFrom",
  "activeCreatedTo",
]) {
  assert(!page.includes(legacyParam), `Projects page still contains ${legacyParam}.`);
  assert(!browser.includes(legacyParam), `Projects browser still contains ${legacyParam}.`);
}

includes(browser, "Search projects, owners, co-owners, executors...", "V2 search copy");
includes(browser, "All Stages", "stage filter");
includes(browser, "All Owners", "owner filter");
includes(browser, "All Executors", "executor filter");
includes(browser, "All Roles", "My Role filter");
includes(card, "WorkflowProgress", "seven-stage card progress");
includes(card, "Executors (", "card executor summary");
includes(actions, "ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION", "completed delete guard");
includes(projects, "const updatedAt = toProjectDate(project.updatedAt);", "cached updatedAt normalization");

assert(
  !existsSync(join(rootDir, "src/app/(dashboard)/projects/[slug]/edit/page.tsx")),
  "Legacy edit route still exists.",
);
assert(!card.includes("/edit"), "Project card still links to the legacy edit route.");

console.log("Projects V2 dashboard regression checks passed.");

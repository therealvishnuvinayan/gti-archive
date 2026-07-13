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

const projectsSource = read("src/lib/projects.ts");
const detailSource = read("src/components/projects/project-detail-workspace.tsx");
const editPageSource = read("src/app/(dashboard)/projects/[slug]/edit/page.tsx");
const routeStateSource = read("src/components/projects/project-route-state.tsx");
const actionsSource = read("src/app/(dashboard)/projects/new/actions.ts");

assertIncludes(projectsSource, "canEdit: boolean;", "Project detail canEdit field");
assertIncludes(projectsSource, "project.completedAt || project.archivedAt || isProjectStatusCompleted(project.status)", "Project edit lock status/timestamp rule");
assertIncludes(projectsSource, "hasProjectPermission(currentUser, project, \"project.update\")", "Project edit permission check");
assertIncludes(projectsSource, "editingLocked,", "Project edit access locked reason");

assertIncludes(detailSource, "Edit Project", "Project detail Edit Project button");
assertIncludes(detailSource, "href={`/projects/${project.id}/edit`}", "Project detail edit link");
assertIncludes(detailSource, "project.canEdit", "Project detail edit visibility guard");
assertIncludes(detailSource, "bg-white px-5 text-[13px] font-[900] leading-5 text-[#145232]", "Project detail visible edit button styling");
assertIncludes(detailSource, "Completed project · editing locked", "Project detail completed lock text");

assertIncludes(editPageSource, "ProjectEditLockedState", "Direct edit URL locked state");
assertIncludes(editPageSource, "editAccess?.editingLocked", "Edit route completed lock check");

assertIncludes(routeStateSource, "Completed projects cannot be edited.", "Completed project locked message");

assertIncludes(actionsSource, "isProjectStatusCompleted(existingProject.status)", "Server update status-group edit lock");
assertIncludes(actionsSource, "Completed projects cannot be edited.", "Server update completed-project error");

console.log("Project edit lock regression checks passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, page, loading, overview, appFrame] = await Promise.all([
  readFile("src/components/projects/stage-two-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/loading.tsx", "utf8"),
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("src/components/layout/dashboard-app-frame.tsx", "utf8"),
]);

for (const folderName of [
  "Brief",
  "Market & Competition",
  "Tech",
  "Vendors",
  "Finance",
  "Legal",
  "Pitch",
]) {
  assert(
    workspace.includes(`name: "${folderName}"`),
    `Missing predefined Stage 2 folder: ${folderName}`,
  );
}

for (const componentName of [
  "StageTwoWorkspace",
  "StageTwoProjectSummary",
  "FolderOwnerSwitchCard",
  "SharedFolderGrid",
  "SharedFolderTile",
  "StageTwoLoadingShell",
]) {
  assert(
    workspace.includes(`function ${componentName}`),
    `Missing Stage 2 component: ${componentName}`,
  );
}

for (const text of [
  "Stage 2 - Project Research and Planning",
  "Viewing Folder Set",
  "Shared folders",
  "New Folder",
  "Create a new folder",
  "Next Stage",
  "All Stages",
  "Grid view",
  "List view",
  "Name (A–Z)",
]) {
  assert(workspace.includes(text), `Missing Stage 2 UI content: ${text}`);
}

assert(
  workspace.includes("setCustomFolders") &&
    workspace.includes("Folder added to this UI preview."),
  "New Folder must work as explicit local-only UI state.",
);
assert(
  workspace.includes("Stage 3 is not connected yet.") &&
    workspace.includes("safe UI-only placeholder"),
  "Next Stage must remain a safe UI-only placeholder.",
);
assert(
  workspace.includes("href={`/projects/${project.id}`}"),
  "All Stages must return to the project overview.",
);
assert(!workspace.includes("fetch("), "Stage 2 UI must not call a backend API.");
assert(!workspace.includes("Action("), "Stage 2 UI must not invoke a server action.");
assert(
  page.includes("requireUser") &&
    page.includes("getProjectShellById") &&
    page.includes("ProjectBackButton") &&
    page.includes("StageTwoWorkspace"),
  "Stage 2 route must reuse authenticated project access and the existing shell.",
);
assert(
  loading.includes("StageTwoLoadingShell"),
  "Stage 2 route must provide a dedicated loading state.",
);
assert(
  appFrame.includes('nestedSegment === "stages"') &&
    appFrame.includes("<BackPill href={`/projects/${projectId}`} />"),
  "Dedicated stage routes must show the existing shell Back button.",
);
assert(
  overview.includes("stage.number === 1 || stage.number === 2") &&
    overview.includes("href={`/projects/${projectId}/stages/${stage.number}`}"),
  "The overview must open implemented Stage 1 and Stage 2 routes from persisted status.",
);

console.log("Stage 2 UI checks passed.");

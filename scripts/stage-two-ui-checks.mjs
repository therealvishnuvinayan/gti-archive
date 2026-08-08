import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, summary, folderWorkspace, page, folderPage, actions, service, access, files, migration, schema, overview, uploadRoute, completeRoute, deleteRoute, downloadRoute] = await Promise.all([
  readFile("src/components/projects/stage-two-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-summary-strip.tsx", "utf8"),
  readFile("src/components/projects/stage-two-folder-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/folders/[folderId]/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/actions.ts", "utf8"),
  readFile("src/lib/project-research.ts", "utf8"),
  readFile("src/lib/project-research-access.ts", "utf8"),
  readFile("src/lib/project-research-files.ts", "utf8"),
  readFile("prisma/migrations/20260807210000_project_research_workspaces/migration.sql", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("src/app/api/projects/[projectId]/research/folders/[folderId]/upload-url/route.ts", "utf8"),
  readFile("src/app/api/projects/[projectId]/research/folders/[folderId]/complete/route.ts", "utf8"),
  readFile("src/app/api/projects/[projectId]/research/folders/[folderId]/files/[fileId]/route.ts", "utf8"),
  readFile("src/app/api/projects/[projectId]/research/folders/[folderId]/files/[fileId]/download/route.ts", "utf8"),
]);

assert(
  workspace.includes("ProjectSummaryStrip") &&
    workspace.includes('columns="two"') &&
    summary.includes("const MAX_VISIBLE_PEOPLE = 2"),
  "Stage 2 must reuse the compact shared participant summary in its two-column panel.",
);

for (const folderName of ["Brief", "Market & Competition", "Tech", "Vendors", "Finance", "Legal", "Pitch"]) {
  assert(service.includes(`name: "${folderName}"`), `Missing predefined Stage 2 folder: ${folderName}`);
}
for (const text of ["Stage 2 - Project Research and Planning", "Viewing folder set", "Shared folders", "New Folder", "Next Stage", "All Stages", "Business order", "Name (A–Z)", "Read-only"]) {
  assert(workspace.includes(text), `Missing connected Stage 2 UI content: ${text}`);
}
assert(workspace.includes("workspace=${encodeURIComponent(option.id)}"), "Workspace switching must use stable URL state.");
assert(
  workspace.includes('router.push(`/projects/${data.project.id}/stages/3`)') &&
    !workspace.includes('router.push(`/projects/${data.project.id}`)'),
  "Completing Stage 2 must open Stage 3 directly instead of the project overview.",
);
assert(workspace.includes("createProjectResearchFolderAction") && actions.includes("createProjectResearchFolder"), "New Folder must call the persisted server action.");
assert(workspace.includes("completeProjectResearchStageAction") && actions.includes("completeProjectResearchStage"), "Next Stage must call the real completion action.");
assert(!workspace.includes("predefinedFolders") && !workspace.includes("setCustomFolders"), "Folder cards must not use mock/local folder state.");
assert(folderWorkspace.includes('type="file"') && folderWorkspace.includes("multiple") && folderWorkspace.includes("XMLHttpRequest"), "Folder page must support multi-file uploads with progress.");
assert(folderWorkspace.includes("Any file type is accepted") && !folderWorkspace.includes("accept="), "Folder upload must not impose a client MIME allowlist.");
assert(folderWorkspace.includes("/download") && folderWorkspace.includes('method: "DELETE"'), "Folder file actions must include download and delete.");
assert(page.includes("getProjectResearchPageData") && folderPage.includes("getProjectResearchFolderPageData") && page.includes("requireUser"), "Stage 2 routes must load authenticated persisted data.");
assert(
  [folderPage, uploadRoute, completeRoute, deleteRoute, downloadRoute].every((source) =>
    source.includes("decodeRouteParam"),
  ),
  "Encoded research folder ids must be decoded at every dynamic route boundary.",
);
assert(access.includes("UserRole.SUPER_ADMIN") && access.includes("isOwnWorkspace") && access.includes("isProjectCoOwner"), "Workspace access must enforce real roles and relations.");
assert(files.includes("assertResearchFolderWriteAccess") && files.includes("getAttachmentDownloadUrlForUser") && files.includes("deleteAttachmentForUser"), "Research files must reuse secured attachment infrastructure.");
assert(schema.includes("model ProjectResearchWorkspace") && schema.includes("model ProjectResearchFolder") && schema.includes("model ProjectResearchFolderFile"), "Stage 2 Prisma models are missing.");
assert(migration.includes("ON CONFLICT") && migration.includes('FROM "ProjectCollaborator"'), "Migration participant backfill must be idempotent and include ProjectCollaborator.");
assert(migration.includes("'workflow:' || project.\"id\"") && migration.includes('ON CONFLICT ("projectId", "stageKey") DO NOTHING'), "Stage 2 migration must reconcile missing fixed-workflow rows idempotently.");
assert(!schema.includes("parentFolderId") && !migration.includes('ALTER TABLE "ProjectStage"'), "Stage 2 must remain flat and must not mutate legacy ProjectStage.");
assert(overview.includes("stage.number >= 1 && stage.number <= 7") && overview.includes("Available · Stage UI coming next"), "Overview must expose all seven implemented stage UI routes while retaining the safe fallback for any future non-linked stage.");

console.log("Stage 2 connected UI and architecture checks passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, summary, folderWorkspace, assetPreview, page, folderPage, actions, service, access, files, uploadClient, textFile, migration, schema, overview, uploadRoute, completeRoute, deleteRoute, downloadRoute] = await Promise.all([
  readFile("src/components/projects/stage-two-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-summary-strip.tsx", "utf8"),
  readFile("src/components/projects/stage-two-folder-workspace.tsx", "utf8"),
  readFile("src/components/projects/asset-preview-button.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/folders/[folderId]/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/2/actions.ts", "utf8"),
  readFile("src/lib/project-research.ts", "utf8"),
  readFile("src/lib/project-research-access.ts", "utf8"),
  readFile("src/lib/project-research-files.ts", "utf8"),
  readFile("src/lib/project-research-upload-client.ts", "utf8"),
  readFile("src/lib/project-research-text-file.ts", "utf8"),
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
    summary.includes("const COMPACT_VISIBLE_PEOPLE = 1") &&
    summary.includes("const ROOMY_VISIBLE_PEOPLE = 2"),
  "Stage 2 must reuse the compact shared participant summary in its two-column panel.",
);
assert(
  workspace.includes("<WorkspaceSwitch data={data} compact />") &&
    workspace.includes("compact = false") &&
    !workspace.includes("{showChrome ? <ProjectSummary data={data} /> : <div />}") &&
    workspace.includes('!showChrome && "mt-5"'),
  "Streamed Stage 2 must use a compact folder-set switch without an empty header column.",
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
assert(
  workspace.includes("<FolderArtwork />") &&
    workspace.includes("<FolderArtwork action") &&
    !workspace.includes("custom={!folder.isSystem}"),
  "Persisted system and custom folders must share one folder treatment while New Folder remains distinct.",
);
assert(
  workspace.includes("compareBusinessOrder") &&
    workspace.includes("right.fileCount - left.fileCount || compareBusinessOrder(left, right)") &&
    workspace.includes("nameOrder || compareBusinessOrder(left, right)"),
  "Folder sorting must preserve business order whenever the selected sort values are tied.",
);

assert(
  workspace.includes("onDropFiles(folder, Array.from(event.dataTransfer.files))") &&
    workspace.includes("Drop to upload") &&
    workspace.includes("dragDepth.current") &&
    workspace.includes("if (!canWrite || !isFileDrag(event)) return"),
  "Writable folder cards must be stable, exact drag/drop targets while read-only cards remain inactive.",
);
assert(
  workspace.includes("Promise.allSettled") &&
    workspace.includes("fileCount: record.fileCount + uploadedCount") &&
    workspace.includes("Uploading ${upload.fileCount}"),
  "Folder-card multi-file uploads must progress independently and update the real displayed count.",
);
assert(
  workspace.includes("uploadProjectResearchFile") &&
    folderWorkspace.includes("uploadProjectResearchFile") &&
    uploadClient.includes("XMLHttpRequest") &&
    uploadClient.includes("/upload-url") &&
    uploadClient.includes("/complete"),
  "Folder overview and opened folders must share the existing upload-url/completion implementation.",
);
assert(
  folderWorkspace.includes('type="file"') &&
    folderWorkspace.includes("multiple") &&
    folderWorkspace.includes("Promise.allSettled") &&
    folderWorkspace.includes("Drop files to upload to {data.folder.name}"),
  "Opened folders must support progress-aware independent multi-file button and content-area drops.",
);
assert(
  !folderWorkspace.includes("accept=") &&
    uploadClient.includes('file.type || "application/octet-stream"'),
  "Folder upload must continue accepting arbitrary file types without a client MIME allowlist.",
);
assert(
  folderWorkspace.includes("useSyncExternalStore") &&
    folderWorkspace.includes("gti-stage-two-file-view") &&
    folderWorkspace.includes('() => "grid"') &&
    folderWorkspace.includes('view === "grid"'),
  "Opened folders must default to Grid and persist the Grid/List preference locally.",
);
assert(
  folderWorkspace.includes("<Image") &&
    folderWorkspace.includes("/api/project-assets/${file.attachmentId}/preview") &&
    folderWorkspace.includes("visualStyles") &&
    folderWorkspace.includes("getExtension(file.name)"),
  "The gallery must show real image thumbnails and polished type-specific fallback cards.",
);
assert(
  folderWorkspace.includes("grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))]") &&
    folderWorkspace.includes("truncate") &&
    folderWorkspace.includes("Search files in this folder") &&
    ["Newest", "Oldest", "Name (A–Z)", "Name (Z–A)"].every((label) =>
      folderWorkspace.includes(label),
    ),
  "The file gallery must be responsive, truncate safely, search, and support all required sorts.",
);
assert(
  folderWorkspace.includes("FileActionMenu") &&
    folderWorkspace.includes("Preview / Open") &&
    folderWorkspace.includes("Download") &&
    folderWorkspace.includes("{canWrite ? (") &&
    folderWorkspace.includes("Delete"),
  "Grid cards and list rows must reuse Preview, Download, and permission-gated Delete actions.",
);
assert(
  folderWorkspace.includes("AssetPreviewDialog") &&
    folderWorkspace.includes("setPreviewFile(file)") &&
    folderWorkspace.includes("onPreview={onPreview}") &&
    !folderWorkspace.includes('target="_blank"') &&
    assetPreview.includes("export function AssetPreviewDialog") &&
    assetPreview.includes('role="dialog"'),
  "Preview actions and file cards must open the shared in-app preview dialog instead of a new tab.",
);
assert(
  folderWorkspace.includes("ConfirmationDialog") &&
    folderWorkspace.includes('title="Delete file?"') &&
    folderWorkspace.includes('tone="destructive"') &&
    folderWorkspace.includes("setFileToDelete(file)") &&
    !folderWorkspace.includes("window.confirm"),
  "Delete must use the custom destructive confirmation dialog instead of the browser prompt.",
);
assert(
  folderWorkspace.includes("> New <") &&
    folderWorkspace.includes("Upload Files") &&
    folderWorkspace.includes("New Text File") &&
    folderWorkspace.includes("Add to folder"),
  "Writable opened folders must expose a compact New menu for uploads and text files.",
);
assert(
  folderWorkspace.includes('new window.File([input.content], input.fileName') &&
    folderWorkspace.includes('type: "text/plain"') &&
    folderWorkspace.includes("createdTextFile: true") &&
    folderWorkspace.includes("setFiles((current) => [uploadedFile as FolderFile, ...current])"),
  "New text files must reuse the real upload pipeline and appear immediately.",
);
assert(
  folderWorkspace.includes("max-h-[calc(100dvh-2rem)]") &&
    folderWorkspace.includes("min-h-0 flex-1 overflow-y-auto") &&
    folderWorkspace.includes("flex shrink-0 justify-end gap-3 border-t"),
  "The New Text File dialog must scroll only its content and keep Save/Cancel visible.",
);
assert(
  folderWorkspace.includes("normalizeProjectResearchTextFileName") &&
    folderWorkspace.includes("validateProjectResearchTextContent") &&
    folderWorkspace.includes("Plain UTF-8 text only. Line breaks are preserved.") &&
    textFile.includes('endsWith(".txt")') &&
    textFile.includes("invalidFileNameCharacters") &&
    textFile.includes("new TextEncoder().encode(value).byteLength"),
  "Text-file creation must validate safe .txt names and byte-limited multiline UTF-8 content.",
);
assert(
  folderWorkspace.includes("!data.canWrite") &&
    uploadRoute.includes("validatePreparedProjectResearchTextFile") &&
    uploadClient.includes("createdTextFile") &&
    access.includes("assertResearchFolderWriteAccess"),
  "Text-file creation must retain both UI and server-side Stage 2 write authorization.",
);
assert(
  folderWorkspace.includes("No files yet") &&
    folderWorkspace.includes("Drag files here or use New") &&
    folderWorkspace.includes("setFiles((current) => [uploadedFile as FolderFile, ...current])") &&
    !folderWorkspace.includes("router.refresh"),
  "Empty folders must guide upload and successful uploads must appear without a full refresh.",
);
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
assert(
  files.includes("projectResearchFolderFile.findUnique") &&
    files.includes("uploadedAt: file.attachment.createdAt.toISOString()") &&
    completeRoute.includes("{ success: true, file }") &&
    uploadClient.includes("return complete.file"),
  "Upload completion must return the real persisted file so the gallery can update without refreshing.",
);
assert(schema.includes("model ProjectResearchWorkspace") && schema.includes("model ProjectResearchFolder") && schema.includes("model ProjectResearchFolderFile"), "Stage 2 Prisma models are missing.");
assert(migration.includes("ON CONFLICT") && migration.includes('FROM "ProjectCollaborator"'), "Migration participant backfill must be idempotent and include ProjectCollaborator.");
assert(migration.includes("'workflow:' || project.\"id\"") && migration.includes('ON CONFLICT ("projectId", "stageKey") DO NOTHING'), "Stage 2 migration must reconcile missing fixed-workflow rows idempotently.");
assert(!schema.includes("parentFolderId") && !migration.includes('ALTER TABLE "ProjectStage"'), "Stage 2 must remain flat and must not mutate legacy ProjectStage.");
assert(
  !schema.includes("model TextDocument") && !schema.includes("model Note"),
  "Plain-text files must not introduce a separate note or document model.",
);
assert(overview.includes("stage.number >= 1 && stage.number <= 7") && overview.includes("Available · Stage UI coming next"), "Overview must expose all seven implemented stage UI routes while retaining the safe fallback for any future non-linked stage.");

console.log("Stage 2 connected UI and architecture checks passed.");

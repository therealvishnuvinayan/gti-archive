import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  summary,
  route,
  actions,
  concepts,
  chatRoute,
  chatPage,
  stageThreePage,
  stageFourPage,
  stageThreeConceptPage,
  stageFourConceptPage,
  overview,
  workflowAccess,
  workflow,
  schema,
  migration,
] = await Promise.all([
  readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-summary-strip.tsx", "utf8"),
  readFile("src/components/projects/concept-stage-route.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts", "utf8"),
  readFile("src/lib/project-concepts.ts", "utf8"),
  readFile("src/components/projects/concept-chat-route.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/chat/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/3/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/4/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/3/concepts/[folderId]/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/4/concepts/[folderId]/page.tsx", "utf8"),
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("src/lib/workflow-stage-access.ts", "utf8"),
  readFile("src/lib/project-workflow.ts", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile(
    "prisma/migrations/20260807235900_project_concept_folder_stage_scope/migration.sql",
    "utf8",
  ),
]);

for (const label of [
  "Concept Workspace",
  "Project Name",
  "Project Owner",
  "Project Co-Owners",
  "Project Executors",
  "Concept Folders",
  "Manage your concept folders.",
]) {
  assert(
    workspace.includes(label) || summary.includes(label),
    `Missing concept-stage overview content: ${label}`,
  );
}

assert(
  workspace.includes("ProjectFlowSummaryStrip") &&
    summary.includes("const MAX_VISIBLE_PEOPLE = 2") &&
    summary.includes("people.map((person)"),
  "Stages 3 and 4 must reuse the shared compact summary and complete people menu.",
);

assert.equal(
  workspace.match(/New Folder/g)?.length,
  1,
  "The concept overview must render exactly one New Folder action.",
);
assert(
  workspace.includes("initialFolders") &&
    workspace.includes("createProjectConceptFolderAction") &&
    workspace.includes("renameProjectConceptFolderAction") &&
    workspace.includes("router.refresh()"),
  "Folder create/rename must use persistent server actions and refreshable server state.",
);
assert(
  workspace.includes("/concepts/${folder.id}") && workspace.includes("Open ${folder.name}"),
  "Every folder card must link to its dedicated persistent chat route.",
);

for (const forbiddenText of [
  "ProjectChatWorkspace",
  "Submit Revision",
  "Request Changes",
  "Approval",
  "Assignee",
]) {
  assert(!workspace.includes(forbiddenText), `Forbidden overview UI found: ${forbiddenText}`);
}

assert(
  stageThreePage.includes("ConceptStageRoute") &&
    stageThreePage.includes('stageNumber={3}') &&
    stageThreePage.includes('stageTitle="Initial Concept"'),
  "Stage 3 must remain a thin route over the shared concept overview.",
);
assert(
  stageFourPage.includes("ConceptStageRoute") &&
    stageFourPage.includes('stageNumber={4}') &&
    stageFourPage.includes('stageTitle="Final Concept"'),
  "Stage 4 must remain a thin route over the shared concept overview.",
);
assert(
  route.includes("getProjectConceptFolders") &&
    route.includes("canOpenImplementedWorkflowStage") &&
    route.includes("StageLockedState"),
  "Concept routes must use persisted folders and centralized workflow access.",
);

for (const page of [stageThreeConceptPage, stageFourConceptPage]) {
  assert(
    page.includes("ConceptChatRoute") && page.includes("folderId"),
    "Each stage must expose a dedicated folder chat route.",
  );
}
assert(
  chatRoute.includes("getProjectConceptChatContext") &&
    chatRoute.includes("ProjectChatRoute") &&
    chatRoute.includes("taskerStageId={context.folder.taskerStageId}"),
  "Folder routes must authorize the exact mapping and reuse the existing chat route.",
);
assert(
  chatPage.includes("ProjectChatWorkspace") &&
    chatPage.includes("taskerStageId") &&
    chatPage.includes("getProjectChatShellById"),
  "Concept chats must reuse the existing ProjectChatWorkspace and select only their tasker.",
);

assert(
  actions.includes('"use server"') &&
    actions.includes("createProjectConceptFolder") &&
    actions.includes("renameProjectConceptFolder"),
  "Persistent create and rename actions must be server-side.",
);
assert(
  concepts.includes("projectId_workflowStageKey_normalizedName") &&
    concepts.includes("normalizeConceptFolderName") &&
    concepts.includes("isTasker: true") &&
    concepts.includes("taskerStageId: folder.taskerStageId"),
  "Concept persistence must be stage-scoped, case-insensitive, and retain chat identity on rename.",
);
assert(
  !concepts.includes("completeProjectStage") && !concepts.includes("handoff"),
  "Concept folder persistence must not introduce completion or handoff behavior.",
);

assert(
  workflowAccess.includes("user.role === UserRole.SUPER_ADMIN") &&
    workflowAccess.includes("IMPLEMENTED_WORKFLOW_STAGE_KEYS") &&
    overview.includes("canBypassLockedStages"),
  "The temporary SUPER_ADMIN workflow-lock bypass must be centralized and reflected on overview links.",
);
assert(
  workflow.includes('name: "Initial Concept"') && workflow.includes('name: "Final Concept"'),
  "Overview stage labels must match the approved concept-stage names.",
);
assert(
  schema.includes("model ProjectConceptFolder") &&
    schema.includes("workflowStageKey ProjectWorkflowStageKey") &&
    schema.includes("isTasker") &&
    schema.includes("@@unique([projectId, workflowStageKey, normalizedName])"),
  "The Prisma model must persist stage-scoped folder/tasker mappings.",
);
assert(
  migration.includes('DEFAULT \'CONCEPT_CREATION\'') &&
    migration.includes("ProjectConceptFolder_projectId_workflowStageKey_normalizedName_key") &&
    migration.includes("ProjectConceptFolder_workflowStageKey_check"),
  "The additive migration must preserve Stage 3 rows and enforce stage-scoped integrity.",
);

console.log("Stage 3/4 persistent concept-folder UI checks passed.");

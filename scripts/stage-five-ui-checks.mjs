import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, summary, page, workflowAccess, overview, schema, chatWorkspace] =
  await Promise.all([
    readFile("src/components/projects/stage-five-workspace.tsx", "utf8"),
    readFile("src/components/projects/project-stage-summary.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/5/page.tsx", "utf8"),
    readFile("src/lib/workflow-stage-access.ts", "utf8"),
    readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
  ]);

const checklistItems = [
  "Output Name",
  "Technical Drawing",
  "Health Warning",
  "Tar / Nicotine",
  "Compulsory Text",
  "Marketing Copy",
  "Related Graphics",
  "Printing Technology",
  "Finishes",
  "Barcode",
  "Track & Trace",
  "3D's",
  "Tax Stamp",
  "QR Code",
  "Invoice",
];

let lastPosition = -1;
for (const item of checklistItems) {
  const position = workspace.indexOf(`title: "${item}"`);
  assert(position > lastPosition, `Missing or out-of-order Stage 5 checklist item: ${item}`);
  lastPosition = position;
}

for (const content of [
  "Stage 5 - File Checklist",
  "Complete or request the required project information and files.",
  "Pending",
  "Filled",
  "Request",
  "Existing collaborator",
  "Manual email",
  "All Stages",
  "Next Stage",
]) {
  assert(workspace.includes(content), `Missing Stage 5 UI content: ${content}`);
}
for (const label of ["Project Name", "Project Owner", "Project Co-Owners", "Project Executors"]) {
  assert(summary.includes(label), `Missing shared project summary label: ${label}`);
}
assert(
  workspace.includes("ProjectStageSummary") && workspace.includes('from "@/components/projects/project-stage-summary"'),
  "Stage 5 must use the shared real-data project summary.",
);

assert(
  workspace.includes("CHECKLIST_ITEMS.map") &&
    workspace.includes("onRequest={() => setRequestField(item)}"),
  "Every checklist definition must render the shared Request action.",
);
assert(
  workspace.includes('type="file"') && workspace.includes("multiple={multiple}"),
  "Stage 5 must support local single and multiple file selection.",
);
assert(
  workspace.includes("Selected files remain local to this page preview.") &&
    !workspace.includes("fetch(") &&
    !workspace.includes("Action("),
  "Stage 5 attachment interactions must remain local and must not call a backend.",
);
assert(
  workspace.includes("No email or external link will be sent in this UI preview.") &&
    workspace.includes("Request functionality will be connected in the next phase. Nothing was sent."),
  "The Request dialog must clearly remain a non-sending UI placeholder.",
);
assert(
  workspace.includes("Stage 6 remains locked and no workflow status was changed.") &&
    !workspace.includes("completeProject") &&
    !workspace.includes("router.push(`/projects/${project.id}/stages/6"),
  "Next Stage must not complete Stage 5 or navigate to/unlock Stage 6.",
);
assert(
  workspace.includes("href={`/projects/${project.id}`}") && workspace.includes("All Stages"),
  "All Stages must return to the project overview.",
);

assert(
  page.includes("DashboardLayout") &&
    page.includes("getProjectShellById") &&
    page.includes("requireUser") &&
    page.includes("StageFiveWorkspace"),
  "The Stage 5 route must use the existing shell and real authenticated project data.",
);
assert(
  page.includes("ProjectWorkflowStageKey.FINAL_LAYOUT") &&
    page.includes("canOpenImplementedWorkflowStage") &&
    page.includes("StageLockedState"),
  "Stage 5 must reuse centralized persisted workflow access.",
);
assert(
  workflowAccess.includes("ProjectWorkflowStageKey.FINAL_LAYOUT") &&
    overview.includes("stage.number >= 1 && stage.number <= 7"),
  "The centralized SUPER_ADMIN testing bypass and overview must include implemented Stage 5.",
);

for (const forbiddenModel of [
  "ProjectChecklist",
  "ChecklistRequest",
  "ExternalRequest",
  "EmailToken",
  "RequestRecipient",
  "StageFiveAttachment",
]) {
  assert(!schema.includes(`model ${forbiddenModel}`), `Forbidden Stage 5 model found: ${forbiddenModel}`);
}
assert(
  !page.includes('from "@/lib/prisma"') &&
    !workspace.includes('from "@/lib/prisma"') &&
    !workspace.includes('"use server"') &&
    !workspace.includes("$transaction"),
  "Stage 5 must not persist checklist state.",
);
assert(
  chatWorkspace.includes("ProjectChatWorkspace") && !workspace.includes("ProjectChatWorkspace"),
  "Stage 5 must not modify or embed the existing project chat workspace.",
);

console.log("Stage 5 local-only checklist UI checks passed.");

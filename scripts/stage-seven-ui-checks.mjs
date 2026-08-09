import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const [workspace, summaryAlias, summary, page, workflowAccess, overview, schema, chatWorkspace] =
  await Promise.all([
    readFile("src/components/projects/stage-seven-workspace.tsx", "utf8"),
    readFile("src/components/projects/project-stage-summary.tsx", "utf8"),
    readFile("src/components/projects/project-summary-strip.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/7/page.tsx", "utf8"),
    readFile("src/lib/workflow-stage-access.ts", "utf8"),
    readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
  ]);

for (const content of [
  "Stage 7 – Implementation &amp; Supervision",
  "Supervise production through sample rounds until final sign-off.",
  "IN PROGRESS",
  "Production Units",
  "Primary Pack",
  "Outer Pack",
  "Master Carton",
  "Tipping Paper",
  "NOT STARTED",
  "IN REVIEW",
  "REVISIONS NEEDED",
  "SIGNED OFF",
]) {
  assert(workspace.includes(content), `Missing Stage 7 header or Production Unit content: ${content}`);
}

for (const label of ["Project Name", "Project Owner", "Project Co-Owners", "Project Executors"]) {
  assert(summary.includes(label), `Missing shared project summary label: ${label}`);
}
assert(
  workspace.includes("ProjectStageSummary") &&
    workspace.includes('from "@/components/projects/project-stage-summary"') &&
    summaryAlias.includes("ProjectFlowSummaryStrip"),
  "Stage 7 must reuse the compact authenticated project summary.",
);

assert(
  workspace.includes("STAGE_SEVEN_UI_FIXTURE") &&
    workspace.includes("useState") &&
    workspace.includes("selectedUnitId") &&
    workspace.includes("selectedRoundId") &&
    workspace.includes("function selectUnit") &&
    workspace.includes("onSelectRound={setSelectedRoundId}"),
  "Production Unit and Sample Round switching must use isolated local UI state.",
);

for (const metric of [
  "Production Units",
  "Active Sample Rounds",
  "Overdue Deadlines",
  "Signed Off",
]) {
  assert(workspace.includes(metric), `Missing compact Stage 7 summary metric: ${metric}`);
}

for (const roundContent of [
  "Sample Rounds —",
  "New Sample Round",
  "Pre-Production Sample",
  "Production Sample",
  "Final Mass-Production Sign-off",
  "Round {round.number}",
  "number: 1",
  "number: 2",
  "number: 3",
  "UNDER REVIEW",
  "PENDING",
  "COMPLETED",
  "View",
]) {
  assert(workspace.includes(roundContent), `Missing Sample Round list content: ${roundContent}`);
}

for (const deadline of [
  'label: "Submission"',
  'label: "Review"',
  'label: "Revision / Sign-off"',
  'label: "Delivery"',
  "Overdue 2 days",
  "In 9 days",
]) {
  assert(workspace.includes(deadline), `Missing compact deadline/timeline state: ${deadline}`);
}
assert(
  workspace.includes("2 sample-round deadlines are overdue.") &&
    workspace.match(/sample-round deadlines are overdue\./g)?.length === 1,
  "Stage 7 must show one lightweight overdue information banner.",
);

for (const detailsContent of [
  "Selected Round Details",
  "Production Unit",
  "Round Type",
  "Overall Decision",
  "PASS",
  "FAIL",
  "CONDITIONAL",
  "Participants in Review",
  "Add Participants",
  "Evaluation Criteria",
  "Review Notes",
]) {
  assert(workspace.includes(detailsContent), `Missing selected-round detail content: ${detailsContent}`);
}

for (const criterion of [
  "Material Quality",
  "Graphic Reproduction",
  "Size",
  "Construction",
  "Graphic Elements",
  "Functionality",
  "Finishes",
]) {
  assert(workspace.includes(`"${criterion}"`), `Missing evaluation criterion: ${criterion}`);
}
assert(
  workspace.includes("criterionDecisions") &&
    workspace.includes("criterionComments") &&
    workspace.includes("Optional comment") &&
    workspace.includes("onCriterionDecisionChange") &&
    workspace.includes("onCriterionCommentChange"),
  "Evaluation decisions and per-criterion comments must be represented with local controls.",
);

assert(
  workspace.includes("Evidence") &&
    workspace.includes("Add Evidence") &&
    workspace.includes('type: "photo"') &&
    workspace.includes('type: "video"'),
  "Round evidence must show compact photo/video items and a visual Add Evidence action.",
);
for (const action of [
  "Generate Feedback Email",
  "Mark Round Complete",
  "Close Project",
  "Project closure is manual once production supervision is complete.",
]) {
  assert(workspace.includes(action), `Missing Stage 7 visual action: ${action}`);
}
assert(
  !workspace.includes("Archive") && !workspace.includes("Close & Archive Project"),
  "Project closure must remain separate from archiving.",
);

for (const removedOldUi of [
  "Emails Sent",
  "Email Tracking",
  "File Handover Emails",
  "Recent Activity",
  "No new notifications",
  "Complaint Resolution Emails",
  "Documents",
  "Communications",
  "Approval Chain",
]) {
  assert(!workspace.includes(removedOldUi), `Removed/irrelevant Stage 7 UI is still present: ${removedOldUi}`);
}

assert(
  workspace.includes("overflow-x-auto") &&
    workspace.includes("min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)]") &&
    workspace.includes("min-w-0"),
  "Stage 7 must scroll Production Units on small screens, stack safely, and use a desktop two-column layout.",
);
assert(
  !workspace.includes("ProjectBackButton") && !workspace.includes("All Stages"),
  "Stage 7 content must not duplicate the route-level Project Overview back control.",
);

assert(
  page.includes("DashboardLayout") &&
    page.includes("ProjectBackButton") &&
    page.includes("getProjectStageShellById") &&
    page.includes("requireUser") &&
    page.includes("StageSevenWorkspace"),
  "The Stage 7 route must preserve the existing authenticated shell and single back control.",
);
assert(
  page.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION") &&
    page.includes("canOpenImplementedWorkflowStage") &&
    page.includes("StageLockedState"),
  "Stage 7 must preserve centralized workflow access.",
);
assert(
  workflowAccess.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION") &&
    overview.includes("stage.number >= 1 && stage.number <= 7"),
  "The centralized SUPER_ADMIN testing bypass and overview must still include Stage 7.",
);

for (const forbiddenModel of [
  "ProjectSampleRound",
  "SampleRoundEvaluation",
  "SampleRoundEvidence",
  "ImplementationEmail",
  "StageSevenNotification",
]) {
  assert(!schema.includes(`model ${forbiddenModel}`), `Forbidden Stage 7 model found: ${forbiddenModel}`);
}
assert(
  !page.includes('from "@/lib/prisma"') &&
    !workspace.includes('from "@/lib/prisma"') &&
    !workspace.includes("$transaction") &&
    !workspace.includes("fetch(") &&
    !workspace.includes('"use server"') &&
    !workspace.includes("Action("),
  "Stage 7 must remain UI-only with no database, API, or server-action behavior.",
);
assert(
  workspace.includes("This UI preview does not change project data.") &&
    workspace.includes("UI-only fixture") &&
    chatWorkspace.includes("ProjectChatWorkspace") &&
    !workspace.includes("ProjectChatWorkspace"),
  "Stage 7 temporary data/actions must be explicit and must not embed or change project chat.",
);

const appEntries = await readdir("src/app");
for (const forbiddenRoute of ["sample-round", "stage-seven-evidence", "implementation-email"]) {
  assert(!appEntries.includes(forbiddenRoute), `Forbidden public Stage 7 route found: /${forbiddenRoute}`);
}

console.log("Stage 7 sample-supervision UI checks passed.");

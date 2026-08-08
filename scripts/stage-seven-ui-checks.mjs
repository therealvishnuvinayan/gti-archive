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
  "Stage 7 - Implementation &amp; Supervision",
  "Monitor implementation progress, sample requests, issues and complaint resolution.",
  "Overview",
  "Emails Sent",
  "Sample Requests",
  "Issues Reported",
  "In Progress",
  "Resolved",
  "Email Tracking",
  "Track email activities related to this project.",
  "File Handover Emails",
  "Sample Request Emails",
  "Problem Handover Emails",
  "Complaint Resolution Emails",
  "Recent Activity",
  "Notifications",
  "No new notifications",
  "You&apos;re all caught up.",
  "All Stages",
  "Complete Project",
]) {
  assert(workspace.includes(content), `Missing Stage 7 UI content: ${content}`);
}

for (const label of ["Project Name", "Project Owner", "Project Co-Owners", "Project Executors"]) {
  assert(summary.includes(label), `Missing shared project summary label: ${label}`);
}
assert(
  workspace.includes("ProjectStageSummary") &&
    workspace.includes('from "@/components/projects/project-stage-summary"') &&
    summaryAlias.includes("ProjectFlowSummaryStrip"),
  "Stage 7 must reuse the shared authenticated project summary.",
);

for (const metric of [
  ['label: "Emails Sent"', "value: 12"],
  ['label: "Sample Requests"', "value: 5"],
  ['label: "Issues Reported"', "value: 3"],
  ['label: "In Progress"', "value: 2"],
  ['label: "Resolved"', "value: 7"],
]) {
  assert(metric.every((value) => workspace.includes(value)), `Missing Stage 7 mock metric: ${metric.join(" / ")}`);
}

for (const category of [
  ['label: "File Handover Emails"', "count: 4"],
  ['label: "Sample Request Emails"', "count: 5"],
  ['label: "Problem Handover Emails"', "count: 2"],
  ['label: "Complaint Resolution Emails"', "count: 1"],
]) {
  assert(category.every((value) => workspace.includes(value)), `Missing Stage 7 email category: ${category.join(" / ")}`);
}

for (const activity of [
  "File handover email sent to production.head@company.com",
  "Sample request sent to quality@company.com",
  "Problem reported by marketing@company.com",
  "Complaint resolved for invoice.issue@company.com",
  "08 Aug 2026, 09:30 PM",
  "08 Aug 2026, 04:15 PM",
  "07 Aug 2026, 02:40 PM",
  "07 Aug 2026, 11:20 AM",
]) {
  assert(workspace.includes(activity), `Missing Stage 7 mock activity: ${activity}`);
}

assert(
  workspace.includes("Email tracking is a UI preview.") &&
    workspace.includes("No Stage 7 email data is connected yet.") &&
    workspace.includes("No emails are sent in this UI preview."),
  "Stage 7 email surfaces must be explicitly local UI previews.",
);
assert(
  workspace.includes("Project completion UI preview.") &&
    workspace.includes("No project state was changed.") &&
    !workspace.includes("completeProject") &&
    !workspace.includes("fetch(") &&
    !workspace.includes('"use server"') &&
    !workspace.includes("Action("),
  "Complete Project must remain a local toast and must not mutate workflow state.",
);
assert(
  workspace.includes("href={`/projects/${project.id}`}") && workspace.includes("All Stages"),
  "All Stages must return to the project overview.",
);

assert(
  page.includes("DashboardLayout") &&
    page.includes("getProjectShellById") &&
    page.includes("requireUser") &&
    page.includes("StageSevenWorkspace"),
  "The Stage 7 route must use the existing shell and real authenticated project data.",
);
assert(
  page.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION") &&
    page.includes("canOpenImplementedWorkflowStage") &&
    page.includes("StageLockedState"),
  "Stage 7 must reuse centralized persisted workflow access.",
);
assert(
  workflowAccess.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION") &&
    overview.includes("stage.number >= 1 && stage.number <= 7"),
  "The centralized SUPER_ADMIN testing bypass and overview must include implemented Stage 7.",
);

for (const forbiddenModel of [
  "ImplementationEmail",
  "SampleRequest",
  "ProjectIssue",
  "ProjectComplaint",
  "ComplaintResolution",
  "StageSevenNotification",
]) {
  assert(!schema.includes(`model ${forbiddenModel}`), `Forbidden Stage 7 model found: ${forbiddenModel}`);
}
assert(
  !page.includes('from "@/lib/prisma"') &&
    !workspace.includes('from "@/lib/prisma"') &&
    !workspace.includes("$transaction"),
  "Stage 7 must not persist dashboard or communication state.",
);
assert(
  chatWorkspace.includes("ProjectChatWorkspace") && !workspace.includes("ProjectChatWorkspace"),
  "Stage 7 must not modify or embed the existing project chat workspace.",
);

const appEntries = await readdir("src/app");
for (const forbiddenRoute of ["implementation-email", "sample-request", "complaint-resolution"]) {
  assert(!appEntries.includes(forbiddenRoute), `Forbidden public Stage 7 route found: /${forbiddenRoute}`);
}

console.log("Stage 7 local-only implementation and supervision UI checks passed.");

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const [workspace, summary, page, workflowAccess, overview, schema] = await Promise.all([
  readFile("src/components/projects/stage-six-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-stage-summary.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/6/page.tsx", "utf8"),
  readFile("src/lib/workflow-stage-access.ts", "utf8"),
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
]);

for (const content of [
  "Stage 6 - Handover &amp; Approval",
  "Configure the handover file and approval chain.",
  "Handover File",
  "Final_Concept_Package.pdf",
  "PDF · 24.8 MB · Uploaded by Super Admin",
  "Preview",
  "Download",
  "Approval Chain",
  "Add Approver",
  "Approval Overview",
  "Total Approvers",
  "Approved",
  "Pending",
  "Rejected",
  "All Stages",
  "Next Stage",
]) {
  assert(workspace.includes(content), `Missing Stage 6 UI content: ${content}`);
}
for (const label of ["Project Name", "Project Owner", "Project Co-Owners", "Project Executors"]) {
  assert(summary.includes(label), `Missing shared project summary label: ${label}`);
}
assert(
  workspace.includes("ProjectStageSummary") && workspace.includes('from "@/components/projects/project-stage-summary"'),
  "Stage 6 must use the shared real-data project summary.",
);

for (const mockValue of [
  "Design Department",
  "design.head@company.com",
  "Regulatory Affairs",
  "regulatory.manager@company.com",
  "Production Department",
  "production.head@company.com",
]) {
  assert(workspace.includes(mockValue), `Missing initial mock approval value: ${mockValue}`);
}
assert.equal(
  workspace.match(/id: "mock-[^"]+-approval"/g)?.length,
  3,
  "Stage 6 must initialize exactly three mock approval steps.",
);
assert(
  workspace.includes("crypto.randomUUID()") &&
    workspace.includes("onClick={addApprover}") &&
    workspace.includes("onRemove={() => onChange(steps.filter"),
  "Add and Remove Approver must update local React state.",
);
assert(
  /useState<ApprovalStep\[]>\(\s*INITIAL_APPROVAL_STEPS,?\s*\)/.test(workspace) &&
    !workspace.includes("fetch(") &&
    !workspace.includes('"use server"') &&
    !workspace.includes("Action("),
  "Approval-chain data must remain local and must not call a backend.",
);
assert(
  workspace.includes("No email or link is created in this UI preview.") &&
    !workspace.match(/Resend|SendGrid|Nodemailer|AWS SES/),
  "Stage 6 must describe future email behavior without sending email.",
);
assert(
  workspace.includes("Stage 7 remains locked.") &&
    !workspace.includes("completeProject") &&
    !workspace.includes("stages/7"),
  "Next Stage must not complete Stage 6 or open/unlock Stage 7.",
);
assert(
  workspace.includes("href={`/projects/${project.id}`}") && workspace.includes("All Stages"),
  "All Stages must return to the project overview.",
);

assert(
  page.includes("DashboardLayout") &&
    page.includes("getProjectShellById") &&
    page.includes("requireUser") &&
    page.includes("StageSixWorkspace"),
  "The Stage 6 route must use the existing shell and real authenticated project data.",
);
assert(
  page.includes("ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER") &&
    page.includes("canOpenImplementedWorkflowStage") &&
    page.includes("StageLockedState"),
  "Stage 6 must reuse centralized persisted workflow access.",
);
assert(
  workflowAccess.includes("ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER") &&
    overview.includes("stage.number >= 1 && stage.number <= 7"),
  "The centralized SUPER_ADMIN testing bypass and overview must include implemented Stage 6.",
);

for (const forbiddenModel of [
  "ProjectApproval",
  "ApprovalChain",
  "ApprovalRequest",
  "HandoverFile",
  "ExternalApproval",
  "ApprovalToken",
]) {
  assert(!schema.includes(`model ${forbiddenModel}`), `Forbidden Stage 6 model found: ${forbiddenModel}`);
}
assert(
  !page.includes('from "@/lib/prisma"') &&
    !workspace.includes('from "@/lib/prisma"') &&
    !workspace.includes("$transaction"),
  "Stage 6 must not persist handover or approval-chain state.",
);

const appEntries = await readdir("src/app");
for (const forbiddenRoute of ["approval", "handover", "external-approval"]) {
  assert(!appEntries.includes(forbiddenRoute), `Forbidden public approval route found: /${forbiddenRoute}`);
}

console.log("Stage 6 local-only handover and approval UI checks passed.");

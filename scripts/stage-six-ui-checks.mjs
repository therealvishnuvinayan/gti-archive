import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  service,
  page,
  schema,
  approvalWorkspace,
  externalPage,
  authenticatedPage,
  actions,
  authenticatedActions,
  externalDecisionRoute,
  constants,
  migration,
  stageSevenService,
  stageSevenWorkspace,
] = await Promise.all([
  readFile("src/components/projects/stage-six-workspace.tsx", "utf8"),
  readFile("src/lib/stage-six.ts", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/6/page.tsx", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile("src/components/projects/production-approval-workspace.tsx", "utf8"),
  readFile("src/app/external/production-approval/[token]/page.tsx", "utf8"),
  readFile("src/app/production-approvals/[stepId]/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/6/actions.ts", "utf8"),
  readFile("src/app/production-approvals/[stepId]/actions.ts", "utf8"),
  readFile("src/app/api/external/production-approval/[token]/decision/route.ts", "utf8"),
  readFile("src/lib/stage-six-constants.ts", "utf8"),
  readFile("prisma/migrations/20260812090000_stage_six_optional_handover_contacts/migration.sql", "utf8"),
  readFile("src/lib/stage-seven.ts", "utf8"),
  readFile("src/components/projects/stage-seven-workspace.tsx", "utf8"),
]);

for (const content of [
  "Stage 6 - Production &amp; Handover",
  "Production Units",
  "Pending Approval",
  "Production Files",
  "Production Details",
  "Approval Chain",
  "Marketing Director — Required",
  "Add Approver",
  "Information to share",
  "Select All",
  "Existing Collaborator",
  "External Email",
  "Internal",
  "External",
  "Company name",
  "Contact name",
  "e.g. +971 50 123 4567",
  "Optional",
  "Complete Stage 6",
]) {
  assert(workspace.includes(content), `Missing Stage 6 UI content: ${content}`);
}

assert(!workspace.includes("Department / Role"), "The generic Department approval column must be removed.");
assert(!workspace.includes("INITIAL_APPROVAL_STEPS"), "Stage 6 must not use mock approval steps.");
assert(workspace.includes("UnitSwitcher") && workspace.includes("overflow-x-auto"), "Stage 6 must use the file-card switcher instead of a primary dropdown.");
assert(workspace.includes("pageData.summary") && workspace.includes("unit.approvalSteps"), "Stage 6 summaries must use real server data.");
assert(workspace.includes("step.reviewHref") && workspace.includes("Review Approval"), "An assigned approver must have a direct review action on Stage 6.");
assert(workspace.includes("max-h-[calc(100dvh-1.5rem)]") && workspace.includes("overflow-y-auto overscroll-contain"), "The approval request dialog must remain bounded by the viewport and scroll its form content.");
assert(workspace.includes("shrink-0 flex-col-reverse") && workspace.includes("border-t border-[#e7ece8] bg-white"), "The approval request actions must remain in a persistent modal footer.");
assert(
  workspace.includes('aria-labelledby="production-handover-dialog-title"') &&
    (workspace.match(/max-h-\[calc\(100dvh-1\.5rem\)\]/g)?.length ?? 0) >= 2 &&
    (workspace.match(/overflow-y-auto overscroll-contain/g)?.length ?? 0) >= 2 &&
    workspace.includes('className="shrink-0 border-t border-[#e7ece8] bg-white px-6 py-4 sm:px-7"'),
  "The Production Handover dialog must remain viewport-bounded with a scrollable form and persistent footer.",
);
assert(
  workspace.includes("h-24 min-h-20 max-h-36 resize-y rounded-[14px]") &&
    workspace.includes("border-[#c8d5cb] bg-[#fbfdfb]") &&
    workspace.includes("focus-visible:border-[#46906a]") &&
    workspace.includes("Add context or instructions for the approver (optional)."),
  "The optional approval message must use a controlled height with visible resting and focus boundaries.",
);
assert(
  workspace.match(/border-\[#c8d5cb\]/g)?.length >= 7 &&
    workspace.includes("Enter recipient name") &&
    workspace.includes("Enter company name") &&
    workspace.includes("Enter contact name"),
  "External approval and handover recipient fields must have labels and visible resting/focus borders.",
);
assert(page.includes("getStageSixWorkspaceData") && page.includes("ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER"), "The route must load persisted Stage 6 data through workflow access.");

for (const model of [
  "ProjectProductionUnit",
  "ProjectProductionUnitFile",
  "ProductionApprovalStep",
  "ProjectProductionHandover",
]) {
  assert(schema.includes(`model ${model}`), `Missing Stage 6 model: ${model}`);
}
assert(schema.includes("sourceHandoffId") && schema.includes("sourceChecklistId") && schema.includes("sourceAttachmentId"), "Production Unit lineage must remain explicit.");
assert(schema.includes("isMarketingDirectorRequired") && schema.includes("@@unique([productionUnitId, sequence])"), "The required first step and per-unit sequence must be persisted.");
assert(schema.includes("sharedFieldKeys") && schema.includes("selectedFileIds") && schema.includes("sharedSnapshot"), "Selective sharing and stable snapshots must be persisted.");
assert(schema.includes("externalTokenHash") && !schema.includes("externalToken        String"), "Only external token hashes may be stored.");
assert(
  schema.includes("recipientCompany") &&
    schema.includes("recipientPhone") &&
    migration.includes('ADD COLUMN "recipientCompany"') &&
    migration.includes('ADD COLUMN "recipientPhone"'),
  "External handover company and phone details must be persisted through a migration.",
);

for (const content of ["Approve", "Reject", "Shared Information", "Optional comment", "requestedBy"]) {
  assert(approvalWorkspace.includes(content), `Missing approval experience content: ${content}`);
}
assert(
  approvalWorkspace.includes('access.kind === "authenticated"') &&
    approvalWorkspace.includes('href={`/projects/${data.project.id}/stages/6`}') &&
    approvalWorkspace.includes("Back to Stage 6"),
  "Authenticated production approvals must provide a direct return to their Stage 6 workspace.",
);
assert(externalPage.includes('dynamic = "force-dynamic"') && externalPage.includes("noStore()"), "The external approval route must be dynamic and no-store.");
assert(authenticatedPage.includes("getAuthenticatedProductionApprovalData"), "The direct Stage 6 review action must land on the authenticated approval route.");
assert(service.includes("ProductionApprovalStepStatus.ACTIVE") && service.includes("ProductionApprovalStepStatus.WAITING"), "Sequential activation must be server-enforced.");
assert(service.includes("recipientUserId === user.id") && service.includes("reviewHref:"), "Stage 6 must derive the direct review action from the authenticated assigned approver.");
assert(
  constants.includes('name: "Slavomir Kluziak"') &&
    constants.includes('"abhijithajikumarofficial@gmail.com"') &&
    service.includes("STAGE_SIX_EMAIL_DELIVERY_ADDRESS") &&
    service.includes("STAGE_SIX_FIRST_APPROVER") &&
    workspace.includes("STAGE_SIX_FIRST_APPROVER"),
  "All Stage 6 delivery and the required first approval must use the shared temporary email constant.",
);
assert(
  workspace.includes("!step.isConfigured") &&
    service.includes("isConfigured: Boolean(clientRequestId)"),
  "The first-step Assign action must be driven by persisted configuration state, not hidden by its fixed recipient placeholder.",
);
assert(
  actions.includes("reorderProductionApproverAction") &&
    service.includes("reorderProductionApprover") &&
    workspace.includes("Move approval step") &&
    workspace.includes("Remove approval step"),
  "Waiting approval steps must expose manager-only reorder and delete controls backed by server validation.",
);
assert(
  !workspace.includes("window.confirm") &&
    workspace.includes('title="Remove approver?"') &&
    workspace.includes('confirmLabel="Remove approver"') &&
    workspace.includes('tone="destructive"'),
  "Stage 6 approver deletion must use the custom destructive confirmation dialog.",
);
assert(
  service.includes("Completed approval steps cannot be removed.") &&
    service.includes("Only waiting approval steps can be reordered."),
  "Completed decisions must remain immutable and only waiting approvals may be reordered.",
);
assert(
  workspace.includes("ProjectProductionUnitStatus.APPROVAL_PENDING") &&
    service.includes("Approvers can be added only while this approval chain is active."),
  "Managers must retain approval-chain controls after the required first request starts.",
);
assert(
  authenticatedActions.includes("publishProjectActivityUpdatedAfterResponse") &&
    externalDecisionRoute.includes("publishProjectActivityUpdatedAfterResponse") &&
    workspace.includes("window.setInterval(refreshVisiblePage, 15_000)"),
  "Authenticated and external decisions must refresh open Stage 6 pages in realtime with a polling fallback.",
);
assert(
  service.includes("unit.status !== ProjectProductionUnitStatus.HANDOVER_READY") &&
    service.includes("unit.status !== ProjectProductionUnitStatus.HANDED_OVER") &&
    workspace.includes("Handover is optional") &&
    service.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION"),
  "Stage 6 completion must require approval, allow optional handover, and unlock only Stage 7.",
);
assert(
  service.includes("Internal handover requires an existing project participant.") &&
    service.includes("External handover requires external recipient details.") &&
    service.includes("Enter the external recipient company name.") &&
    service.includes("Enter a valid external phone number including country code."),
  "The backend must enforce distinct internal and external handover recipient rules.",
);
assert(
  stageSevenService.includes("ProjectProductionUnitStatus.HANDOVER_READY") &&
    stageSevenService.includes("ProjectProductionUnitStatus.HANDED_OVER") &&
    stageSevenWorkspace.includes("the optional handover is not required"),
  "Stage 7 must accept approved units even when the optional Stage 6 handover is skipped.",
);
assert(service.includes("user.role === UserRole.SUPER_ADMIN") && !service.includes("user.role === UserRole.ADMIN ||"), "Stage 6 management must not grant ADMIN implicit rights.");
assert(actions.includes("completeStageSixAction") && actions.includes("handoverProductionUnitAction"), "Stage 6 server actions must expose real workflow mutations.");

console.log("Stage 6 production and handover UI/security checks passed.");

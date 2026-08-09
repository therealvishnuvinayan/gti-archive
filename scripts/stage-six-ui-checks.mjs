import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, service, page, schema, approvalWorkspace, externalPage, actions] = await Promise.all([
  readFile("src/components/projects/stage-six-workspace.tsx", "utf8"),
  readFile("src/lib/stage-six.ts", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/6/page.tsx", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile("src/components/projects/production-approval-workspace.tsx", "utf8"),
  readFile("src/app/external/production-approval/[token]/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/6/actions.ts", "utf8"),
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
  "Purchase Department",
  "Direct Vendor",
  "Complete Stage 6",
]) {
  assert(workspace.includes(content), `Missing Stage 6 UI content: ${content}`);
}

assert(!workspace.includes("Department / Role"), "The generic Department approval column must be removed.");
assert(!workspace.includes("INITIAL_APPROVAL_STEPS"), "Stage 6 must not use mock approval steps.");
assert(workspace.includes("UnitSwitcher") && workspace.includes("overflow-x-auto"), "Stage 6 must use the file-card switcher instead of a primary dropdown.");
assert(workspace.includes("pageData.summary") && workspace.includes("unit.approvalSteps"), "Stage 6 summaries must use real server data.");
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

for (const content of ["Approve", "Reject", "Shared Information", "Optional comment", "requestedBy"]) {
  assert(approvalWorkspace.includes(content), `Missing approval experience content: ${content}`);
}
assert(externalPage.includes('dynamic = "force-dynamic"') && externalPage.includes("noStore()"), "The external approval route must be dynamic and no-store.");
assert(service.includes("ProductionApprovalStepStatus.ACTIVE") && service.includes("ProductionApprovalStepStatus.WAITING"), "Sequential activation must be server-enforced.");
assert(service.includes("ProjectProductionUnitStatus.HANDED_OVER") && service.includes("ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION"), "Stage 6 completion must require handover and unlock only Stage 7.");
assert(service.includes("user.role === UserRole.SUPER_ADMIN") && !service.includes("user.role === UserRole.ADMIN ||"), "Stage 6 management must not grant ADMIN implicit rights.");
assert(actions.includes("completeStageSixAction") && actions.includes("handoverProductionUnitAction"), "Stage 6 server actions must expose real workflow mutations.");

console.log("Stage 6 production and handover UI/security checks passed.");

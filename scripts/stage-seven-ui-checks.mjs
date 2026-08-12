import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, page, actions, service, dashboard, schema, baseMigration, correctionMigration, physicalMigration, recipientMigration, cronRoute, datePicker] =
  await Promise.all([
    readFile("src/components/projects/stage-seven-workspace.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/7/page.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/7/actions.ts", "utf8"),
    readFile("src/lib/stage-seven.ts", "utf8"),
    readFile("src/lib/dashboard.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("prisma/migrations/20260809210000_stage_seven_production_supervision/migration.sql", "utf8"),
    readFile("prisma/migrations/20260809233000_correct_stage_seven_sample_round/migration.sql", "utf8"),
    readFile("prisma/migrations/20260809235900_stage_seven_physical_sample_requests/migration.sql", "utf8"),
    readFile("prisma/migrations/20260812130000_stage_seven_sample_request_recipients/migration.sql", "utf8"),
    readFile("src/app/api/internal/stage-seven/overdue/route.ts", "utf8"),
    readFile("src/components/calendar/app-date-picker.tsx", "utf8"),
  ]);

for (const content of [
  "Stage 7 – Implementation &amp; Supervision",
  "Request, track, and accept physical production samples",
  "Production Units",
  "Waiting for Sample",
  "Overdue",
  "Accepted",
  "Physical Sample Requests —",
  "<span>Round</span><span>Name / Type</span><span>Recipient</span><span>Deadline</span><span>Status</span>",
  "Request New Sample",
  "Round Name *",
  "Sample Type *",
  "Deadline *",
  "Who receives this sample request? *",
  "Internal Recipient *",
  "Company Name *",
  "Contact Name *",
  "Email *",
  "Phone *",
  "Request Note",
  "Send Sample Request",
  "Physical Sample Review",
  "Accept Sample",
  "Reject Sample",
  "Retry Email",
  "Mark Project as Completed",
]) {
  assert(workspace.includes(content), `Missing final Stage 7 UI content: ${content}`);
}

for (const removed of [
  "Evaluation Criteria",
  "Overall Decision",
  "Participants in Review",
  "Evidence",
  "Generate Feedback Email",
  "Mark Round Complete",
  "Sign Off Production Unit",
  "Save Progress",
  "Review Progress",
  "Submission deadline",
  "Review deadline",
  "Revision / Sign-off",
  "Delivery deadline",
  "Approval Chain",
  "Stage 8",
]) {
  assert(!workspace.includes(removed), `Retired Stage 7 product UI remains: ${removed}`);
}

assert(
  page.includes("getStageSevenWorkspaceData") &&
    page.includes("selectedUnitId={unit}") &&
    page.includes("selectedRoundId={round}") &&
    workspace.includes("URLSearchParams") &&
    workspace.includes('params.set("round", roundId)'),
  "Stage 7 must load persisted data and keep unit/round selection URL-backed.",
);
assert(
  workspace.includes("ProductionHandoverRoute.PURCHASE_DEPARTMENT") &&
    workspace.includes("ProductionHandoverRoute.DIRECT_VENDOR") &&
    workspace.includes("border-[#c8d5cb]") &&
    workspace.includes("focus-visible:border-[#46906a]") &&
    service.includes("Internal sample requests require an existing project participant.") &&
    service.includes("External sample requests require external recipient details.") &&
    recipientMigration.includes('ADD COLUMN "recipientRoute"') &&
    recipientMigration.includes('ADD COLUMN "recipientCompany"') &&
    recipientMigration.includes('ADD COLUMN "recipientPhone"'),
  "Sample requests must mirror the bordered Stage 6 internal/external recipient workflow.",
);
assert(
  workspace.includes("unit.rawFileName !== unit.name") &&
    service.includes("ProjectFileChecklistField.OUTPUT_NAME") &&
    service.includes("outputNameFromChecklist(output?.value)"),
  "OUTPUT_NAME must be the Production Unit title with the raw filename retained as secondary context.",
);
assert(
  workspace.includes("AppDatePicker") &&
    workspace.includes("popoverZIndex={200}") &&
    datePicker.includes('event.key === "Escape"') &&
    !workspace.includes('type="date"') &&
    !workspace.includes('type="datetime-local"'),
  "The request must use the reusable date-only AppDatePicker.",
);

for (const action of [
  "createProductionSampleRoundAction",
  "retryProductionSampleRequestEmailAction",
  "decidePhysicalSampleRoundAction",
  "closeStageSevenProjectAction",
]) {
  assert(workspace.includes(action) && actions.includes(action), `Final Stage 7 action is not wired: ${action}`);
}
for (const removedAction of [
  "updateProductionSampleEvaluationAction",
  "addProductionSampleParticipantAction",
  "addProductionSampleEvidenceAction",
  "sendStageSevenFeedbackAction",
  "completeProductionSampleRoundAction",
  "signOffProductionUnitAction",
]) {
  assert(!workspace.includes(removedAction) && !actions.includes(removedAction), `Retired Stage 7 action remains wired: ${removedAction}`);
}

for (const model of ["ProjectProductionSupervision", "ProductionSampleRound", "ProjectClosure"]) {
  assert(schema.includes(`model ${model}`), `Missing Stage 7 persistence: ${model}`);
  assert(baseMigration.includes(`CREATE TABLE "${model}"`), `Missing original Stage 7 table migration: ${model}`);
}
assert(
  correctionMigration.includes('ADD COLUMN "name" TEXT') &&
    correctionMigration.includes('ADD COLUMN "deadline" DATE') &&
    !correctionMigration.includes("DROP COLUMN") &&
    physicalMigration.includes('CREATE TYPE "PhysicalSampleDecision"') &&
    physicalMigration.includes('ADD COLUMN "recipientEmail" TEXT') &&
    physicalMigration.includes('ADD COLUMN "requestReferenceFileIds" TEXT[]') &&
    physicalMigration.includes('ADD COLUMN "emailStatus" "ProductionDispatchStatus"') &&
    physicalMigration.includes('ADD COLUMN "decision" "PhysicalSampleDecision"') &&
    !physicalMigration.includes("DROP COLUMN") &&
    !physicalMigration.includes("DROP TABLE"),
  "The final change must be additive and preserve earlier Stage 7 records.",
);

assert(
  service.includes("user.role === UserRole.SUPER_ADMIN") &&
    service.includes("project.ownerId === user.id") &&
    service.includes("project.coOwners.some") &&
    !service.includes("user.role === UserRole.ADMIN ||"),
  "Only Owner, Co-Owner, and SUPER_ADMIN may manage Stage 7.",
);
assert(
  service.includes("requestReferenceFileIds") &&
    service.includes("uniqueReferenceAttachments(unit)") &&
    service.includes("attachment.projectId === unit.projectId") &&
    service.includes("expiresInSeconds: 60 * 60 * 24 * 7") &&
    service.includes("sendResendEmail"),
  "Supplier email must use only this Production Unit's Stage 6 reference files through expiring links.",
);
assert(
  service.includes("emailStatus: ProductionDispatchStatus.PENDING") &&
    service.includes("emailStatus: ProductionDispatchStatus.FAILED") &&
    service.includes("emailStatus: ProductionDispatchStatus.SENT") &&
    service.includes("emailAttemptCount: { increment: 1 }") &&
    service.includes("return { duplicate: true }") &&
    workspace.includes("The request is saved, but the recipient email was not delivered."),
  "Sample requests must persist before delivery and support audited, idempotent retry.",
);
assert(
  service.includes("PhysicalSampleDecision.ACCEPTED") &&
    service.includes("PhysicalSampleDecision.REJECTED") &&
    service.includes("Enter a review note before rejecting the sample.") &&
    service.includes("Previous sample rounds are read-only history.") &&
    service.includes("status: ProductionSupervisionStatus.SIGNED_OFF") &&
    service.includes("status: ProductionSupervisionStatus.REVISIONS_NEEDED"),
  "Acceptance and rejection must be final, audited decisions with rejection-note enforcement.",
);
assert(
  service.includes("decision: null") &&
    service.includes("deadline: { lt: currentDate }") &&
    service.includes("stage7-physical-sample-overdue:${round.id}:${userId}") &&
    service.includes("skipDuplicates: true") &&
    dashboard.includes("decision: null") &&
    cronRoute.includes("CRON_SECRET") &&
    cronRoute.includes("timingSafeEqual"),
  "Pending past-deadline requests must be surfaced and centrally deduplicated.",
);
assert(
  service.includes("unit.supervision?.status !== ProductionSupervisionStatus.SIGNED_OFF") &&
    service.includes("projectClosure.create") &&
    service.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    !service.includes("projectArchive.create") &&
    workspace.includes("Archiving remains a separate action."),
  "Manual project completion must require every unit accepted and remain separate from archive.",
);
assert(
  workspace.includes("overflow-x-auto") &&
    workspace.includes("min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)]") &&
    !workspace.includes("ProjectBackButton"),
  "The responsive switcher/two-column workspace and single route-level back control must remain.",
);

console.log("Stage 7 physical-sample request UI, persistence, email, decision, and closure wiring checks passed.");

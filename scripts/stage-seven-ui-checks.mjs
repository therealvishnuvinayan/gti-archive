import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, page, actions, service, schema, migration, uploadClient, cronRoute] =
  await Promise.all([
    readFile("src/components/projects/stage-seven-workspace.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/7/page.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/7/actions.ts", "utf8"),
    readFile("src/lib/stage-seven.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("prisma/migrations/20260809210000_stage_seven_production_supervision/migration.sql", "utf8"),
    readFile("src/lib/stage-seven-upload-client.ts", "utf8"),
    readFile("src/app/api/internal/stage-seven/overdue/route.ts", "utf8"),
  ]);

for (const content of [
  "Stage 7 – Implementation &amp; Supervision",
  "Supervise production through sample rounds until final sign-off.",
  "Production Units",
  "Active Sample Rounds",
  "Overdue Deadlines",
  "Signed Off",
  "Sample Rounds —",
  "New Sample Round",
  "Selected Round Details",
  "Overall Decision",
  "Participants in Review",
  "Evaluation Criteria",
  "Evidence",
  "Overall Review Notes",
  "Generate Feedback Email",
  "Mark Round Complete",
  "Sign Off Production Unit",
  "Close Project",
]) {
  assert(workspace.includes(content), `Missing functional Stage 7 UI content: ${content}`);
}

assert(!workspace.includes("STAGE_SEVEN_UI_FIXTURE"), "Stage 7 fixture must be removed.");
for (const fakeValue of ["Primary Pack", "Outer Pack", "Master Carton", "Tipping Paper", "Overdue 2 days", "In 9 days"]) {
  assert(!workspace.includes(fakeValue), `Fixture/mock value remains in Stage 7: ${fakeValue}`);
}
assert(
  page.includes("getStageSevenWorkspaceData") &&
    page.includes("selectedUnitId={unit}") &&
    page.includes("selectedRoundId={round}") &&
    workspace.includes("URLSearchParams") &&
    workspace.includes('params.set("round", roundId)'),
  "Stage 7 must load persisted data and keep unit/round selection URL-backed.",
);

for (const emptyState of [
  "No handed-over Production Units are available.",
  "No sample rounds yet.",
  "No evidence added.",
  "No review participants selected.",
]) {
  assert(workspace.includes(emptyState), `Missing Stage 7 empty state: ${emptyState}`);
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
  assert(workspace.includes(criterion), `Missing persisted evaluation criterion label: ${criterion}`);
}

for (const action of [
  "createProductionSampleRoundAction",
  "completeProductionSampleMilestoneAction",
  "updateProductionSampleEvaluationAction",
  "updateProductionSampleRoundDecisionAction",
  "addProductionSampleParticipantAction",
  "addProductionSampleEvidenceAction",
  "completeProductionSampleRoundAction",
  "signOffProductionUnitAction",
  "sendStageSevenFeedbackAction",
  "closeStageSevenProjectAction",
]) {
  assert(workspace.includes(action) && actions.includes(action), `Stage 7 action is not wired: ${action}`);
}

assert(
  workspace.includes('accept="image/*,video/*"') &&
    workspace.includes("multiple") &&
    workspace.includes("uploadStageSevenEvidence") &&
    uploadClient.includes('assetType: "SAMPLE_ROUND_EVIDENCE"') &&
    uploadClient.includes("request.upload.onprogress"),
  "Evidence must reuse ProjectAttachment upload with multiple image/video files and progress.",
);
assert(
  workspace.includes("Some evidence files were not added.") &&
    workspace.includes("failures") &&
    workspace.includes("uploaded += 1"),
  "Evidence uploads must preserve successful files when another file fails.",
);

for (const model of [
  "ProjectProductionSupervision",
  "ProductionSampleRound",
  "ProductionSampleEvaluation",
  "ProductionSampleRoundParticipant",
  "ProductionSampleRoundEvidence",
  "ProductionSampleFeedback",
  "ProjectClosure",
]) {
  assert(schema.includes(`model ${model}`), `Missing Stage 7 Prisma model: ${model}`);
  assert(migration.includes(`CREATE TABLE "${model}"`), `Missing Stage 7 migration table: ${model}`);
}
assert(
  migration.includes('UNIQUE INDEX "ProductionSampleRound_supervisionId_sequence_key"') &&
    migration.includes('CONSTRAINT "ProductionSampleRound_deadline_order"') &&
    migration.includes('UNIQUE INDEX "ProjectClosure_projectId_key"'),
  "Stage 7 migration must protect round sequencing, deadline chronology, and closure idempotency.",
);

assert(
  service.includes("status: ProjectProductionUnitStatus.HANDED_OVER") &&
    service.includes("unit.supervision?.status ?? ProductionSupervisionStatus.NOT_STARTED") &&
    !service.includes("projectProductionUnit.update"),
  "Stage 7 must derive handed-over Stage 6 units without mutating Stage 6 status.",
);
assert(
  service.includes("user.role === UserRole.SUPER_ADMIN") &&
    service.includes("project.ownerId === user.id") &&
    service.includes("project.coOwners.some") &&
    !service.includes("user.role === UserRole.ADMIN ||"),
  "Stage 7 management must be Owner/Co-Owner/SUPER_ADMIN only.",
);
assert(
  service.includes("stage7-overdue:${round.id}:${milestone.key}:${userId}") &&
    service.includes("skipDuplicates: true") &&
    cronRoute.includes("CRON_SECRET") &&
    cronRoute.includes("timingSafeEqual"),
  "Overdue alerts must be centrally deduplicated behind a secure cron-compatible endpoint.",
);
assert(
  service.includes("expiresInSeconds: 60 * 60 * 24 * 7") &&
    service.includes("sendResendEmail") &&
    service.includes("ProductionDispatchStatus.FAILED"),
  "Feedback must use expiring evidence links and audited email failure/retry behavior.",
);
assert(
  service.includes("projectClosure.create") &&
    service.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    !service.includes("projectArchive.create") &&
    workspace.includes("Archiving is a separate action."),
  "Manual Stage 7 closure must remain separate from archive.",
);

for (const forbiddenUi of ["Approval Chain", "Communications", "Documents", "Stage 8"] ) {
  assert(!workspace.includes(forbiddenUi), `Irrelevant Stage 7 UI remains: ${forbiddenUi}`);
}
assert(
  workspace.includes("overflow-x-auto") &&
    workspace.includes("min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)]") &&
    !workspace.includes("ProjectBackButton"),
  "Approved Stage 7 switcher/two-column structure and single route-level back control must remain.",
);

console.log("Stage 7 real supervision UI and service wiring checks passed.");

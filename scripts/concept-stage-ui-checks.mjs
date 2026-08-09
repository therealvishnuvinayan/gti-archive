import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  route,
  actions,
  concepts,
  access,
  history,
  realtime,
  recipients,
  notificationTriggers,
  chatPage,
  chatWorkspace,
  stageThreePage,
  stageFourPage,
  schema,
  migration,
] = await Promise.all([
  readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
  readFile("src/components/projects/concept-stage-route.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts", "utf8"),
  readFile("src/lib/project-concepts.ts", "utf8"),
  readFile("src/lib/project-concept-access.ts", "utf8"),
  readFile("src/lib/project-history.ts", "utf8"),
  readFile("src/app/api/realtime/ably/token/route.ts", "utf8"),
  readFile("src/lib/notification-center/recipients.ts", "utf8"),
  readFile("src/lib/notification-center/triggers.ts", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/chat/page.tsx", "utf8"),
  readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/3/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/4/page.tsx", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile(
    "prisma/migrations/20260809120000_concept_executor_assignment_round_one/migration.sql",
    "utf8",
  ),
]);

for (const label of [
  "Create Concept",
  "Concept Name *",
  "Assigned Executor *",
  "Concept Brief",
  "Brief Attachments",
  "Viewing Executor",
  "All Executors",
  "No concepts yet",
  "Concept 1",
  "Edit Concept",
]) {
  assert(workspace.includes(label), `Missing Round 1 concept UI: ${label}`);
}

assert(
  workspace.includes("SelectTrigger") && workspace.includes("SelectContent"),
  "Executor controls must use the themed select component rather than a native select.",
);
assert(
  workspace.includes('assetType: "GENERAL_PROJECT_ASSET"') &&
    workspace.includes("/api/project-assets/upload-url") &&
    workspace.includes("/api/project-assets/complete") &&
    workspace.includes("Promise.allSettled"),
  "Brief files must reuse the existing attachment upload pipeline and preserve partial successes.",
);
assert(
  stageThreePage.includes("searchParams") &&
    stageThreePage.includes("executorFilter={executor}") &&
    workspace.includes("?executor=${encodeURIComponent(value)}"),
  "Stage 3 executor filtering must be URL-backed.",
);
assert(
  route.includes("folders.canManage") &&
    route.includes("folders.selectedExecutorId") &&
    concepts.includes("requestedExecutorId") &&
    concepts.includes(": user.id"),
  "Only concept managers may use the switcher; executor views must remain self-scoped.",
);
assert(
  concepts.includes("actualStartedAt: null") &&
    concepts.includes("startedById: null") &&
    concepts.includes("invoiceRequired: false") &&
    concepts.includes("status: StageStatus.ONGOING"),
  "New concept taskers must be ongoing but not accepted or started.",
);
assert(
  !concepts.includes("ensureDefaultProjectConceptFolder") &&
    !concepts.includes("getDefaultTaskerStageId") &&
    stageFourPage.includes("ConceptStageRoute"),
  "Stage 3/4 reads must never manufacture Concept 1.",
);
assert(
  concepts.includes("Assigned Executor must be a current project executor") &&
    concepts.includes("project.executors.some") &&
    concepts.includes("Assigned Executor is required"),
  "Concept mutations must require a current ProjectExecutor.",
);
assert(
  concepts.includes("locked after work starts") &&
    concepts.includes("taskerStage.actualStartedAt") &&
    concepts.includes("taskerStageId: folder.taskerStageId"),
  "Accepted concepts must lock assignment/brief while retaining tasker identity.",
);

for (const helper of [
  "canViewProjectConcept",
  "canManageProjectConcept",
  "canWorkOnProjectConcept",
  "assertConceptTaskerAccessIfNeeded",
  "getProjectConceptParticipantUserIds",
]) {
  assert(access.includes(helper), `Missing centralized concept policy helper: ${helper}`);
}
assert(
  access.includes("user.role === UserRole.SUPER_ADMIN") &&
    !access.includes("UserRole.ADMIN ||"),
  "SUPER_ADMIN must be the sole implicit global concept role.",
);
assert(
  history.includes('mode: "work"') &&
    access.includes("Only the assigned concept executor") &&
    history.includes("Concept taskers cannot use the legacy approve/complete action"),
  "Accept Brief must be assigned-executor-only and legacy tasker approval must be blocked.",
);
assert(
  chatWorkspace.includes("!activeStage?.isTasker") &&
    chatWorkspace.includes("Request Revision"),
  "Concept mode must hide only legacy approval and retain Request Changes/Revision.",
);
assert(
  realtime.includes("assertConceptTaskerAccessIfNeeded") &&
    realtime.includes("Concept participant access denied"),
  "Ably capability issuance must enforce concept participation.",
);
assert(
  recipients.includes("getProjectConceptParticipantUserIds") &&
    recipients.includes("stageId?: string | null") &&
    chatPage.includes("conceptParticipantIds") &&
    chatPage.includes("mentionParticipants.filter"),
  "Notifications and mention suggestions must use the concept participant set.",
);
assert(
  notificationTriggers.includes("buildProjectStageNotificationUrl") &&
    notificationTriggers.includes("/stages/${stageNumber}/concepts/") &&
    notificationTriggers.includes("getProjectConceptAccessContext"),
  "Concept notifications must deep-link to the secured concept route.",
);
assert(
  schema.includes("assignedExecutorId String?") &&
    schema.includes("ProjectConceptFolderAssignedExecutor") &&
    schema.includes("references: [projectId, userId]") &&
    migration.includes('REFERENCES "ProjectExecutor"("projectId", "userId")'),
  "Concept assignment must use the ProjectExecutor composite database relationship.",
);
assert(
  migration.includes('stage."startedById"') &&
    migration.includes("HAVING COUNT(*) = 1") &&
    !migration.includes("ORDER BY"),
  "Legacy assignment backfill must use only a valid starter or exactly one executor.",
);
assert(
  !concepts.includes("completeProjectStage") &&
    !concepts.includes("ProjectStageFileHandoff") &&
    !concepts.includes("ComparisonComment"),
  "Round 1 must not add completion, handoff, or a replacement comparison system.",
);
assert(actions.includes('"use server"') && actions.includes("editProjectConceptFolder"));

console.log("Stage 3/4 Round 1 concept UI/security checks passed.");

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
  "Create Task",
  "Concept Taskers",
  "Concept Name *",
  "Assigned Executor *",
  "Concept Brief",
  "Brief Attachments",
  "Viewing Executor",
  "All Executors",
  "No taskers yet",
  "Concept 1",
  "Edit Task",
  "Delete Task",
]) {
  assert(workspace.includes(label), `Missing Round 1 concept UI: ${label}`);
}

assert(
  route.includes('description="Create and manage concept taskers."') &&
    workspace.includes("Manage your concept taskers.") &&
    !workspace.includes("Create Concept") &&
    !workspace.includes("Concept Folders"),
  "Stage 3/4 must present concept containers as taskers and label creation as Create Task.",
);
assert(
  concepts.includes("createdById: true") &&
    concepts.includes("folder.createdById === currentUserId") &&
    concepts.includes("!folder.promotedStage4Concept") &&
    concepts.includes("export async function deleteProjectConceptFolder") &&
    concepts.includes("Only the person who created this task can delete it.") &&
    concepts.includes("tx.projectConceptFolder.delete") &&
    concepts.includes("tx.projectStage.delete") &&
    actions.includes("deleteProjectConceptFolderAction") &&
    workspace.includes("folder.canDelete") &&
    workspace.includes('tone="destructive"') &&
    workspace.includes("all of its chat, captions, submissions, and attachments"),
  "Task deletion must be creator-only, dependency-aware, server-enforced, and explicitly confirmed in Stage 3/4.",
);
assert(
  workspace.includes("SelectTrigger") && workspace.includes("SelectContent"),
  "Executor controls must use the themed select component rather than a native select.",
);
assert(
  workspace.includes("max-h-[calc(100dvh-1.5rem)]") &&
    workspace.includes("min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain") &&
    workspace.includes("flex shrink-0 flex-col-reverse gap-3 border-t"),
  "The concept details dialog must fit the viewport, scroll its fields, and keep actions accessible.",
);
assert(
  workspace.includes("max-w-[680px]") &&
    workspace.includes("overflow-x-hidden overflow-y-auto") &&
    workspace.includes("grid min-w-0 gap-5") &&
    workspace.includes('className="min-w-0 max-w-full"'),
  "The Create Task dialog must contain wide editor controls without collapsing or horizontally scrolling the form.",
);
assert(
  workspace.includes("border-[#cfdad1] bg-[#fbfdfb]") &&
    workspace.includes('minHeightClassName="min-h-[112px]"') &&
    workspace.includes('ariaLabel="Concept brief"') &&
    workspace.includes("border border-dashed border-[#b9c9bc]") &&
    workspace.includes('className="sr-only"') &&
    workspace.includes("Selected brief attachments"),
  "Concept fields and brief attachments must use clearly bordered, aligned containers.",
);
assert(
  workspace.includes("AssetImageThumbnail") &&
    workspace.includes('className="mr-1 h-9 w-12"') &&
    workspace.includes("folder.startingReference.previewPath"),
  "Stage 4 starting references must show an uncropped image thumbnail in the file row rather than beside the action icons.",
);
assert(
  workspace.includes('assetType: "GENERAL_PROJECT_ASSET"') &&
    workspace.includes("/api/project-assets/upload-url") &&
    workspace.includes("/api/project-assets/complete") &&
    workspace.includes("Promise.allSettled"),
  "Brief files must reuse the existing attachment upload pipeline and preserve partial successes.",
);
assert(
  workspace.includes("Concept Brief *") &&
    workspace.includes(">Brief Attachments</span>") &&
    workspace.includes("Concept Brief is required.") &&
    !workspace.includes("At least one Brief Attachment is required.") &&
    workspace.includes("disabled={!canSubmit}"),
  "Concept creation must require a brief while keeping brief attachments optional.",
);
assert(
  workspace.includes("taskerStageId: null") &&
    workspace.includes("briefAttachmentIds") &&
    workspace.includes("discardConceptBriefAttachments") &&
    concepts.includes('error: "Concept Brief is required."') &&
    !concepts.includes('error: "At least one Brief Attachment is required."') &&
    concepts.includes("INVALID_CONCEPT_BRIEF_ATTACHMENTS") &&
    concepts.includes("data: { stageId: taskerStage.id }") &&
    actions.includes("briefAttachmentIds?: string[]"),
  "Concept creation must accept no attachment and atomically validate/associate any provided brief attachments.",
);
assert(
  stageThreePage.includes("searchParams") &&
    stageThreePage.includes("executorFilter={executor}") &&
    stageFourPage.includes("searchParams") &&
    stageFourPage.includes("executorFilter={executor}") &&
    route.includes("executorId: executorFilter") &&
    workspace.includes("/stages/${stageNumber}${query}"),
  "Stage 3/4 executor filtering must be URL-backed.",
);
assert(
  workspace.includes("defaultAssignedExecutorId") &&
    workspace.includes("executors.length === 1 ? executors[0]?.id") &&
    workspace.includes("Automatically assigned because this project has one executor") &&
    workspace.includes("Choose the project executor responsible for this concept"),
  "Single-executor concepts must auto-assign while multi-executor projects retain an explicit owner choice.",
);
assert(
  route.includes("folders.canManage") &&
    route.includes("folders.canCompleteStage") &&
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
  "canCompleteProjectConceptStage",
  "canReviewProjectConcept",
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
  workspace.includes("canCompleteStage && !managementLocked && stageCompletionReady") &&
    workspace.includes("canCompleteStage &&") &&
    workspace.includes("completionDialogOpen &&") &&
    workspace.includes("const stageCompletionReady =") &&
    workspace.includes("disabled={isCompleting}") &&
    workspace.includes("completionDialogOpen &&\n          stageCompletionReady") &&
    concepts.includes("canCompleteProjectConceptStage(user, managerContext)") &&
    concepts.includes("unapprovedConcepts.length > 0") &&
    concepts.includes("Every Stage 3 concept must have an Approved Concept") &&
    workspace.includes("isEmptyStageThree || allConceptsApproved") &&
    concepts.includes("Only the Project Owner or Super Admin can complete Stage 3."),
  "Stage 3 may be skipped only while empty; otherwise Stage 3/4 completion must wait for every created concept and remain owner-authorized.",
);
assert(
  workspace.includes("No Stage 3 concepts have been created") &&
    workspace.includes("Stage 4 will open without automatically creating any taskers") &&
    workspace.includes('"Continue to Stage 4"') &&
    workspace.includes("Go to Stage 4") &&
    workspace.includes('href={`/projects/${project.id}/stages/4`}') &&
    workspace.includes("stageNumber === 3 && managementLocked") &&
    workspace.includes('"Continue to Stage 5"') &&
    workspace.includes("Go to Stage 5") &&
    workspace.includes('href={`/projects/${project.id}/stages/5`}') &&
    workspace.includes("stageNumber === 4 && managementLocked") &&
    workspace.includes('cancelLabel="Cancel"') &&
    !concepts.includes("const stageTransition = await completeStageThreeConcepts") &&
    !concepts.includes("const stageTransition = await completeStageFourConcepts"),
  "Stages 3 and 4 must advance only through their explicit manual continue/skip actions, then retain direct navigation to the unlocked next stage.",
);
assert(
  concepts.includes("const isProjectExecutor = project.executors.some") &&
    concepts.includes("!canManage && !isProjectExecutor && visibleFolders.length === 0"),
  "Project executors must be able to open an unlocked empty concept-stage workspace without gaining access to unassigned concept folders.",
);
assert(
  route.includes("const folderVersion = folders.folders") &&
    route.includes('key={`${stageNumber}:${folders.selectedExecutorId ?? "all"}:${folderVersion}`}') &&
    route.includes("StageRouteShell") &&
    actions.includes("publishProjectActivityUpdatedAfterResponse") &&
    actions.includes('eventType: "participant_access_changed"') &&
    actions.includes("changedEntityId: folder.id"),
  "Concept creation and assignment changes must broadcast a project refresh, and refreshed server folders must remount stale client state.",
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
  chatWorkspace.includes('"flex h-full flex-col overflow-hidden"') &&
    chatWorkspace.includes('? "min-h-0 flex-1"') &&
    chatWorkspace.includes('isConceptMode ? "" : "sticky bottom-1"') &&
    chatWorkspace.includes('"flex-row items-end gap-1.5') &&
    chatWorkspace.includes('"max-h-[96px] min-h-10') &&
    chatWorkspace.includes('max-w-[1280px]'),
  "Concept chat must reserve layout space for the composer instead of overlaying timeline content.",
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
  /assignedExecutorId\s+String\?/.test(schema) &&
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

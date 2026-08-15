import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const [workspace, chat, concepts, actions, stageFive, notifications, history, schema] =
  await Promise.all([
    readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
    readFile("src/lib/project-concepts.ts", "utf8"),
    readFile(
      "src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts",
      "utf8",
    ),
    readFile("src/lib/stage-five.ts", "utf8"),
    readFile("src/lib/notification-center/triggers.ts", "utf8"),
    readFile("src/lib/project-history.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
  ]);
const migrationDirectories = await readdir("prisma/migrations");

assert(
  schema.includes("approvedAttachmentId") &&
    schema.includes("approvedById") &&
    schema.includes("approvedAt") &&
    schema.includes("model ProjectStageFileHandoff") &&
    schema.includes("model ProjectFileChecklist") &&
    !schema.includes("stage4FinalAttachmentId") &&
    !migrationDirectories.some((name) => /round[_-]?four/i.test(name)),
  "Round 4 must reuse the existing approval, handoff, checklist, and workflow schema without a migration.",
);

assert(
  concepts.includes("markStageFourFinalApprovedAttachment") &&
    concepts.includes("workflowStageKey: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT") &&
    concepts.includes("formalConceptAttachmentTypes") &&
    concepts.includes("AttachmentStatus.READY") &&
    concepts.includes("attachment.revision.stageId !== input.taskerStageId") &&
    concepts.includes("Only a ready formal revision file from this exact Stage 4 concept") &&
    concepts.includes("canReviewProjectConcept(user, accessContext)"),
  "Final designation must be concept-scoped, formal-revision-only, READY, and server-authorized.",
);

assert(
  concepts.includes("Final Approved File selection is locked because Stage 4 is completed") &&
    concepts.includes("hasStageFiveDownstreamActivityForAttachment") &&
    concepts.includes("This final file already has Stage 5 activity and cannot be replaced directly.") &&
    concepts.includes("projectStageFileHandoff.delete") &&
    concepts.includes("removedUnusedHandoff"),
  "Replacement must lock after completion, protect meaningful Stage 5 work, and remove only an unused initialized handoff.",
);
assert(
  concepts.includes("approveConceptRevision") &&
    concepts.includes("status: ProjectRevisionStatus.APPROVED") &&
    concepts.includes("submissionReviewStatus: SubmissionReviewStatus.APPROVED") &&
    concepts.includes("status: StageStatus.COMPLETED") &&
    concepts.includes("allConceptsApproved: conceptsWithoutFinalFile === 0") &&
    !concepts.includes("const stageTransition = await completeStageFourConcepts"),
  "Final-file approval must approve its revision and files and complete the concept tasker without bypassing explicit Stage 4 confirmation.",
);
assert(
  concepts.includes("revokeStageFourFinalApprovedAttachment") &&
    concepts.includes("reopensWorkflowStage") &&
    concepts.includes("Stage 5 already contains checklist activity") &&
    concepts.includes("already has Stage 5 activity and cannot be revoked") &&
    concepts.includes("projectStageFileHandoff.delete") &&
    concepts.includes("approvedAttachmentId: null") &&
    concepts.includes("submissionReviewStatus: SubmissionReviewStatus.PENDING_REVIEW") &&
    concepts.includes("status: StageStatus.ONGOING"),
  "Stage 4 revocation must reopen the tasker while protecting completed workflow and meaningful Stage 5 dependencies.",
);

assert(
  stageFive.includes("hasStageFiveDownstreamActivityForAttachment") &&
    stageFive.includes("hasMeaningfulChecklistValue") &&
    stageFive.includes("item.status !== ProjectFileChecklistItemStatus.PENDING") &&
    stageFive.includes("item._count.attachments > 0") &&
    stageFive.includes("checklist._count.requests > 0"),
  "Stage 5 downstream activity must be defined once from values, statuses, attachments, and requests.",
);

const stageFourCompletionSource = concepts.slice(
  concepts.indexOf("export async function completeStageFourConcepts"),
  concepts.indexOf("export async function getProjectConceptChatContext"),
);

assert(
  concepts.includes("completeStageFourConcepts") &&
    concepts.includes("canCompleteProjectConceptStage(user, managerContext)") &&
    concepts.includes("Only a project owner, co-owner, or administrator can complete Stage 4.") &&
    concepts.includes("At least one concept must have a Final Approved File before Stage 4 can be completed.") &&
    concepts.includes("projectStageFileHandoff.upsert") &&
    concepts.includes("projectFileChecklist.upsert") &&
    concepts.includes("TransactionIsolationLevel.Serializable") &&
    concepts.includes("getWorkflowStageCompletionMode") &&
    concepts.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    concepts.includes("ProjectWorkflowStageStatus.AVAILABLE") &&
    concepts.includes("id: stageFiveWorkflow.id") &&
    concepts.includes("status: ProjectWorkflowStageStatus.LOCKED") &&
    !stageFourCompletionSource.includes("PRODUCTION_AND_HANDOVER"),
  "Owner/co-owner/administrator Stage 4 completion must atomically hand off final files, unlock Stage 5, and leave Stage 6 untouched.",
);

for (const label of [
  "Final Approved",
  "In Progress",
  "Changes Requested",
  "Continue to Stage 5",
  "Stage 4 Completed",
  "Final Approved File",
  "will continue to Stage 5",
  "Every Stage 4 concept must receive Final Approval",
]) {
  assert(workspace.includes(label), `Missing Round 4 Stage 4 UI label: ${label}`);
}
assert(
  workspace.includes("completeStageFourConceptsAction") &&
    workspace.includes("allConceptsApproved") &&
    workspace.includes("canCompleteStage && !managementLocked && stageCompletionReady") &&
    workspace.includes("confirmDisabled={!stageCompletionReady}") &&
    concepts.includes("conceptsWithoutFinalFile.length > 0") &&
    concepts.includes("Every Stage 4 concept must receive Final Approval") &&
    !workspace.includes("Final files for Stage 5") &&
    !workspace.includes("Send to Stage 5"),
  "Stage 4 completion must stay hidden until every concept is finally approved and retire the temporary file-picker handoff UI.",
);

for (const label of [
  "Mark Final Approved File",
  "Final Approved File",
  "Replace the currently approved final file?",
  "Replace Final Approved File",
]) {
  assert(chat.includes(label), `Missing Round 4 chat designation UI: ${label}`);
}
assert(
  chat.includes("markStageFourFinalApprovedAttachmentAction") &&
    chat.includes("revokeStageFourFinalApprovedAttachmentAction") &&
    chat.includes("Revoke Final Approved File?") &&
    chat.includes("Revoke Approval") &&
    chat.includes("Stage 5 will be relocked") &&
    chat.includes("conceptMode.canReview") &&
    chat.includes("conceptMode.isWorkflowCompleted") &&
    chat.includes("!activeStage?.isTasker"),
  "Stage 4 final-file UI must use concept reviewer policy while legacy tasker approval stays blocked.",
);

assert(
    actions.includes("markStageFourFinalApprovedAttachmentAction") &&
    actions.includes("revokeStageFourFinalApprovedAttachmentAction") &&
    actions.includes("completeStageFourConceptsAction") &&
    actions.includes("result.changed") &&
    actions.includes("result.transitioned") &&
    notifications.includes("notifyStageFourFinalFileApproved") &&
    notifications.includes("notifyStageFiveActivated") &&
    notifications.includes('title: "Final concept file approved"') &&
    notifications.includes('title: "Stage 5 available"'),
  "Round 4 approval and explicit completion actions must revalidate and emit scoped state-change-only notifications.",
);

assert(
  !stageFive.includes("handoffStageFourFiles") &&
    !stageFive.includes("getStageFourFinalFileHandoffData") &&
    stageFive.includes("getStageFiveWorkspaceData") &&
    stageFive.includes("saveStageFiveChecklist") &&
    stageFive.includes("requestStageFiveChecklistInformation"),
  "Only the temporary handoff helper may be retired; the Stage 5 selector, checklist, and request architecture must remain.",
);

assert(
  history.includes(
    "Concept taskers cannot use the legacy approve/complete action. Request changes remains available.",
  ) &&
    !concepts.includes("completeProject") &&
    !concepts.includes("ProjectCompletionWorkflow"),
  "Round 4 must not revive legacy tasker approval or trigger project completion/archive logic.",
);

console.log("Stage 3/4 Round 4 final-file, handoff, workflow, and security checks passed.");

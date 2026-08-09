import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  chatRoute,
  concepts,
  history,
  actions,
  comparison,
  compareWorkspace,
  compareRoute,
  stageThreeCompare,
  stageFourCompare,
  access,
  notifications,
  projects,
] = await Promise.all([
  readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/chat/page.tsx", "utf8"),
  readFile("src/lib/project-concepts.ts", "utf8"),
  readFile("src/lib/project-history.ts", "utf8"),
  readFile("src/app/(dashboard)/projects/actions.ts", "utf8"),
  readFile("src/lib/comparison.ts", "utf8"),
  readFile("src/components/projects/project-compare-workspace.tsx", "utf8"),
  readFile("src/components/projects/concept-compare-route.tsx", "utf8"),
  readFile(
    "src/app/(dashboard)/projects/[slug]/stages/3/concepts/[folderId]/compare/page.tsx",
    "utf8",
  ),
  readFile(
    "src/app/(dashboard)/projects/[slug]/stages/4/concepts/[folderId]/compare/page.tsx",
    "utf8",
  ),
  readFile("src/lib/project-concept-access.ts", "utf8"),
  readFile("src/lib/notification-center/triggers.ts", "utf8"),
  readFile("src/lib/projects.ts", "utf8"),
]);

assert(
  concepts.includes('type: "concept"') &&
    concepts.includes('"Stage 3 - Initial Concept"') &&
    concepts.includes('"Stage 4 - Final Concept"') &&
    chatRoute.includes("conceptMode={conceptMode}"),
  "Stage 3/4 must share an explicit server-derived concept chat mode.",
);

for (const label of ["Project", "Stage", "Concept", "Assigned Executor"]) {
  assert(workspace.includes(`"${label}"`), `Missing compact concept context: ${label}`);
}
assert(
  workspace.includes("conceptMode.backHref") &&
    concepts.includes("backHref:") &&
    concepts.includes("compareHref:"),
  "Concept navigation must preserve the stage and folder identity.",
);

assert(
  workspace.includes("!isConceptMode ? (") &&
    workspace.includes("Translate All") &&
    workspace.includes("handleMicrophoneToggle") &&
    workspace.includes("ChatLanguagePicker"),
  "Translation, language, and microphone controls must remain normal-chat-only.",
);
assert(
  workspace.includes("ConceptBriefContextCard") &&
    workspace.includes("Concept Brief") &&
    workspace.includes("Brief Attachments") &&
    workspace.includes("hasAcceptedBrief"),
  "Concept Brief text, attachments, and compact acceptance state must be present.",
);
assert(
  workspace.includes("Concept Status") &&
    workspace.includes("StageTimeRemainingCard") &&
    workspace.includes("min-width:1680px") &&
    workspace.includes("Stage Overview"),
  "Concept mode needs a lightweight collapsible panel while normal Stage Overview remains intact.",
);
assert(
  workspace.includes("ProjectExecutorsPanel") &&
    workspace.includes("ProjectCollaboratorsPanel") &&
    workspace.includes("{conceptMode ? (") &&
    workspace.includes(") : (\n            <>"),
  "Generic executor/collaborator panels must remain in the normal-chat branch only.",
);
assert(
  workspace.includes("isConceptIrrelevantSystemEntry") &&
    workspace.includes("displayedMessages") &&
    workspace.includes("archive"),
  "Concept-irrelevant system history must be presentation-filtered without deleting records.",
);

assert(
  workspace.includes("if (isConceptMode || !deferCompletionData)") &&
    chatRoute.includes("completionWorkflow={null}") &&
    projects.includes("includeStageInvoiceData?: boolean") &&
    projects.includes("participantUserIds") &&
    projects.includes("without-stage-invoices"),
  "Concept chat must skip completion, invoice data, and unrelated participant loading.",
);

assert(
  history.includes("Concept revisions require at least one submitted file") &&
    history.includes("status: AttachmentStatus.READY") &&
    history.includes("stagedAttachmentCount !== stagedAttachmentIds.length") &&
    history.includes("data: { revisionId: revision.id }") &&
    history.includes("ActivityLogAction.REVISION_CREATED"),
  "A concept revision must atomically bind one or more READY files before review.",
);
assert(
  workspace.indexOf("const uploadResults = await uploadRevisionFiles();") <
      workspace.indexOf("attachmentIds: successfulUploads.map") &&
    actions.indexOf("const revision = await createStageRevision") <
      actions.indexOf('runNotificationTask("revision-submitted"'),
  "Concept files must finish before revision creation and notification.",
);
assert(
  history.includes('mode: "work"') &&
    history.includes("Please accept the brief before submitting work") &&
    history.includes("cancelStagedConceptRevisionAttachments"),
  "Concept submission must be assigned-executor-only, accepted, and safely cleanable.",
);

assert(
  concepts.includes("const canReview = canReviewProjectConcept") &&
    access.includes("context.coOwnerIds.includes(user.id)") &&
    access.includes("user.role === UserRole.SUPER_ADMIN") &&
    access.includes("context.assignedExecutorId !== user.id") &&
    workspace.includes("conceptMode.canReview && !conceptMode.isAssignedExecutor") &&
    workspace.includes("latestRevisionMessage?.authorId !== currentUserId") &&
    history.includes("You cannot review your own submission.") &&
    workspace.includes('isConceptMode ? "Request Changes"') &&
    workspace.includes("!activeStage?.isTasker"),
  "Owner/co-owner/SUPER_ADMIN review and Request Changes must not restore tasker approval.",
);
assert(
    history.includes("Concept taskers cannot use the legacy approve/complete action") &&
    history.includes("rejectionReason") &&
    history.includes('input.status === "REJECTED"'),
  "Legacy approval must remain blocked while rejection details persist.",
);

assert(
  compareRoute.includes("getProjectConceptChatContext") &&
    compareRoute.includes("context.folder.taskerStageId") &&
    compareRoute.includes("getComparisonCommentsForPair") &&
    compareRoute.includes("conceptMode={chatMode}") &&
    stageThreeCompare.includes("ProjectWorkflowStageKey.CONCEPT_CREATION") &&
    stageFourCompare.includes("ProjectWorkflowStageKey.PROJECT_DEVELOPMENT"),
  "Stage 3/4 comparison routes must resolve the concept tasker server-side.",
);
assert(
  compareWorkspace.includes("conceptMode?.compareHref") &&
    compareWorkspace.includes("conceptMode.conceptName") &&
    compareWorkspace.includes("!conceptMode ?"),
  "Concept comparison must retain exact routing and hide generic comparison context.",
);
assert(
  comparison.includes("getProjectConceptAccessContext") &&
    comparison.includes("canReviewProjectConcept") &&
    comparison.includes("canCreateComparisonMarker") &&
    compareRoute.includes("canAddCaptions={chatMode.canReview}"),
  "Only centralized concept reviewers may create comparison markers.",
);
assert(
  comparison.includes("baseAttachmentId") &&
    comparison.includes("compareAttachmentId") &&
    comparison.includes("projectId: input.projectId") &&
    comparison.includes("stageId: input.stageId"),
  "Comparison file pairs must remain project- and tasker-scoped.",
);
assert(
  notifications.includes("buildProjectStageNotificationUrl") &&
    notifications.includes("/stages/${stageNumber}/concepts/"),
  "Concept revision/caption notification links must preserve the concept route.",
);

for (const retained of [
  "ProjectAccessRealtimeGuard",
  "Load earlier messages",
  "mentionSuggestions",
  "deleteMessageTarget",
  "AttachmentHistoryList",
  "Project Completion",
  "Stage Invoice",
]) {
  assert(workspace.includes(retained), `Normal/core chat regression: missing ${retained}`);
}

assert(
  !concepts.includes("ProjectStageFileHandoff") &&
    !history.includes("Mark as Approved Concept") &&
    !compareRoute.includes("completeProjectStage"),
  "Round 2 must not implement final approval, completion, or handoff.",
);

console.log("Stage 3/4 Round 2 concept chat/revision/comparison UI checks passed.");

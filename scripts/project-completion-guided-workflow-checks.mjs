import { readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/projects/project-chat-workspace.tsx", "utf8");
const checklistSource = readFileSync(
  "src/components/projects/project-completion-checklist.tsx",
  "utf8",
);
const completeRouteSource = readFileSync(
  "src/app/api/project-completion-documents/complete/route.ts",
  "utf8",
);
const completionServiceSource = readFileSync("src/lib/project-completion.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  chatSource.includes("showProjectCompletionStickyAction") &&
    chatSource.includes("Project ready for completion") &&
    chatSource.includes("Start Completion Checklist") &&
    chatSource.includes("Authority approval pending") &&
    chatSource.includes("Upload Approval Proof") &&
    !chatSource.includes("View Blockers"),
  "Stage Chat must expose final completion as a single sticky guided action with contextual upload states.",
);

assert(
  chatSource.includes("completionChecklistOpen ? (") &&
    !chatSource.includes("completionChecklistOpen && effectiveCompletionWorkflow") &&
    chatSource.includes("Guided final workflow") &&
    chatSource.includes('surface="plain"') &&
    chatSource.includes("Loading completion details..."),
  "Start Completion Checklist must keep the guided modal mounted during workflow refresh/loading.",
);

const inlineCompletionBlockStart = chatSource.indexOf('<div ref={completionWorkflowRef}');
const inlineCompletionBlockEnd = chatSource.indexOf("{hasEarlierMessages", inlineCompletionBlockStart);
const inlineCompletionBlock = chatSource.slice(
  inlineCompletionBlockStart,
  inlineCompletionBlockEnd,
);

assert(
  inlineCompletionBlockStart >= 0 && inlineCompletionBlockEnd > inlineCompletionBlockStart,
  "Unable to locate Stage Chat inline completion block.",
);

assert(
  !inlineCompletionBlock.includes("<ProjectCompletionChecklist"),
  "Stage Chat must not render the full Project Completion checklist inline.",
);

assert(
  chatSource.includes("Project completion is locked until all stages are completed.") &&
    chatSource.includes("completionState.allStagesCompleted"),
  "Project Completion must stay locked before all stages are completed.",
);

assert(
  chatSource.includes("!canCompleteProject") &&
    chatSource.includes("Archive remains locked until authority approval, copyright transfer"),
  "Archive action must remain disabled until final completion blockers are resolved.",
);

assert(
  chatSource.includes("Boolean(latestRevisionMessage) && !isStageCompleted && !isProjectCompleted"),
  "Latest revision actions must hide after stage completion.",
);

assert(
  checklistSource.includes('surface?: "card" | "plain"') &&
    checklistSource.includes("Authority / Client Approval") &&
    checklistSource.includes("Review & Complete Project") &&
    checklistSource.includes("Archive Project"),
  "Project Completion checklist must support the guided five-step modal surface.",
);

assert(
  !checklistSource.includes("router.refresh()") &&
    !checklistSource.includes("useRouter") &&
    !checklistSource.includes("refreshPage()"),
  "Project Completion checklist must apply returned workflow state without route refresh.",
);

assert(
  checklistSource.includes("const nextWorkflow = await uploadCompletionDocument") &&
    checklistSource.includes("applyWorkflowUpdate(nextWorkflow)") &&
    completeRouteSource.includes("getProjectCompletionWorkflowForUser") &&
    completeRouteSource.includes("return NextResponse.json({ ok: true, workflow })"),
  "Completion document uploads must return and apply the updated workflow.",
);

assert(
  checklistSource.includes("Waiting for approval proof") &&
    checklistSource.includes("Authority approval is completed when") &&
    checklistSource.includes("selected approval contact"),
  "Pending authority approval must explain that the selected contact uploads approval proof.",
);

assert(
  completeRouteSource.includes("stage-chat.completion-document-uploaded") &&
    completeRouteSource.includes('eventType: "completion_updated"') &&
    chatSource.includes('payload.eventType === "completion_updated"') &&
    chatSource.includes("void loadCompletionData({ showLoading: false })"),
  "Completion document uploads must update other Stage Chat views without a full route refresh.",
);

const finalizeUploadStart = completionServiceSource.indexOf(
  "export async function finalizeProjectCompletionDocumentUpload",
);
const finalizeUploadEnd = completionServiceSource.indexOf(
  "export async function getProjectCompletionDocumentDownloadUrlForUser",
  finalizeUploadStart,
);
const finalizeUploadSource = completionServiceSource.slice(
  finalizeUploadStart,
  finalizeUploadEnd,
);
const finalizeTransactionStart = finalizeUploadSource.indexOf("prisma.$transaction");
const finalizeTransactionSource = finalizeUploadSource.slice(finalizeTransactionStart);

assert(
  finalizeUploadStart >= 0 &&
    finalizeUploadEnd > finalizeUploadStart &&
    finalizeUploadSource.includes("await assertProjectAccess(user, input.projectId)") &&
    !finalizeTransactionSource.includes("await assertProjectAccess"),
  "Completion document finalization must perform access checks before opening the write transaction.",
);

console.log("Project completion guided workflow regression checks passed.");

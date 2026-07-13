import { readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/projects/project-chat-workspace.tsx", "utf8");
const historySource = readFileSync("src/lib/project-history.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const reviewModalStart = chatSource.indexOf("{reviewRevisionMessage ? (");
const reviewRejectMode = chatSource.indexOf("{reviewRejectMode ? (", reviewModalStart);
const reviewModalSource = chatSource.slice(reviewModalStart, reviewRejectMode);

assert(
  reviewModalStart >= 0 && reviewRejectMode > reviewModalStart,
  "Unable to locate Review Submission modal section.",
);

assert(
  !reviewModalSource.includes("Stage Invoice"),
  "Review Submission modal must not show Stage Invoice before approval.",
);

assert(
  !chatSource.includes("disabled={Boolean(pendingRevisionReviewId) || stageInvoiceMissing}"),
  "Approve Submission must not be disabled by missing stage invoice.",
);

assert(
  chatSource.includes("Submission approved. Invoice is required before this stage can be completed."),
  "Post-approval invoice next action copy is missing.",
);

assert(
  historySource.includes("const canCompleteStageOnApproval =") &&
    historySource.includes("!isStageInvoiceRequired(revision.project, revision.stage)") &&
    historySource.includes("await hasReadyStageInvoice(input.projectId, revision.stageId)"),
  "Revision approval must separate approval from invoice-gated stage completion.",
);

assert(
  historySource.includes("latestRevision.status !== ProjectRevisionStatus.APPROVED"),
  "Invoice request must require an approved latest revision.",
);

console.log("Stage invoice after approval regression checks passed.");

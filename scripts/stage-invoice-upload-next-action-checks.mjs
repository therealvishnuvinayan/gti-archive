import { readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/projects/project-chat-workspace.tsx", "utf8");
const completeRouteSource = readFileSync("src/app/api/project-assets/complete/route.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  completeRouteSource.includes("invoiceCommentId: result?.invoiceCommentId ?? null"),
  "Project asset completion API must return the invoice timeline comment id.",
);

assert(
  chatSource.includes("serverEntryId: result.invoiceCommentId ?? undefined") &&
    chatSource.includes("id: result.invoiceCommentId ?? `confirmed-invoice-${result.attachmentId}`"),
  "Optimistic invoice uploaded cards must be keyed to the server invoice comment id.",
);

assert(
  !chatSource.includes("releaseInvoiceStageOverride"),
  "Invoice upload must not release local invoice state before refreshed server props arrive.",
);

assert(
  chatSource.includes("const getInvoiceUploadedTimelineBody = useCallback") &&
    chatSource.includes("You uploaded invoice for") &&
    chatSource.includes("Invoice uploaded by"),
  "Invoice uploaded timeline cards must render viewer-aware copy.",
);

assert(
  chatSource.includes("function renderStageInvoiceActions") &&
    chatSource.includes("canUseStageInvoiceFileActions") &&
    chatSource.includes('label="View Invoice"') &&
    chatSource.includes("View Invoice") &&
    chatSource.includes("Download"),
  "Invoice uploaded cards must expose file actions only through the guarded invoice action helper.",
);

const invoiceActionBlockStart = chatSource.indexOf("function renderStageInvoiceActions");
const invoiceActionBlockEnd = chatSource.indexOf("\n  return (\n    <section", invoiceActionBlockStart);
const invoiceActionBlock = chatSource.slice(invoiceActionBlockStart, invoiceActionBlockEnd);

assert(
  invoiceActionBlock.includes("<AssetPreviewButton") &&
    !invoiceActionBlock.includes("href={stageInvoiceAttachment.previewPath"),
  "View Invoice must open the existing preview modal instead of a new tab.",
);

assert(
  chatSource.includes("showInvoiceUploadedNextAction") &&
    chatSource.includes("Invoice uploaded") &&
    chatSource.includes("Complete Stage"),
  "Owner/reviewer must get a sticky invoice uploaded next-action with the next valid stage action.",
);

assert(
  chatSource.includes("const action = isInvoiceUploadedMessage && !showInvoiceUploadedNextAction"),
  "Invoice uploaded timeline card actions must be hidden when the sticky next-action bar is active.",
);

console.log("Stage invoice upload next-action regression checks passed.");

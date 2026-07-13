import { readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/projects/project-chat-workspace.tsx", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  chatSource.includes("Invoice requested from you. Please upload the invoice for this completed stage."),
  "Invoice recipient must see viewer-aware upload instruction.",
);

assert(
  chatSource.includes("Waiting for invoice upload."),
  "Owner/requester must see neutral invoice waiting text.",
);

assert(
  chatSource.includes("const latestRevisionAllowsNewSubmission =") &&
    chatSource.includes('!latestRevisionMessage || latestRevisionStatus === "REJECTED"') &&
    chatSource.includes("latestRevisionAllowsNewSubmission &&"),
  "Submit Work CTA must only allow first submissions or revision-requested resubmissions.",
);

assert(
  chatSource.includes("{canUploadStageInvoice ? (") &&
    chatSource.includes("Invoice requested") &&
    chatSource.includes("Upload Invoice"),
  "Selected invoice recipient must get a sticky Upload Invoice CTA.",
);

assert(
  !chatSource.includes('message.title === "Invoice requested" && canUploadStageInvoice ? ('),
  "Invoice request timeline card must not duplicate the sticky upload CTA.",
);

assert(
  chatSource.includes("getInvoiceRequestTimelineBody()"),
  "Invoice request system cards must use viewer-aware body rendering.",
);

console.log("Stage invoice and Submit Work CTA regression checks passed.");

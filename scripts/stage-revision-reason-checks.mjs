import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const historySource = read("src/lib/project-history.ts");
const workspaceSource = read("src/components/projects/project-chat-workspace.tsx");

assert(
  historySource.includes("body: `Revision brief for Revision ${revision.revisionNumber}: ${rejectionReason}`"),
  "Server must persist the revision request reason in the system comment body.",
);

assert(
  historySource.includes("([\\s\\S]*)$/i") &&
    historySource.includes("reason: match[2]?.trim() || null"),
  "Revision request system mapper must preserve single- and multi-paragraph stored reasons.",
);

assert(
  historySource.includes(
    "revisionRequestReason: revisionRequestSystemDetails.reason",
  ) &&
    !historySource.includes("Reason: ${revisionRequestSystemDetails.reason}"),
  "Refetched revision request system cards must keep rich-text reasons separate from plain activity text.",
);

assert(
  workspaceSource.includes("const revisionReasonText = nextReason || rejectionReason"),
  "Optimistic revision request card must preserve the entered reason.",
);

assert(
  workspaceSource.includes("revisionRequestReason: revisionReasonText") &&
    !workspaceSource.includes("Reason: ${revisionReasonText}"),
  "Optimistic revision request cards must keep rich-text reasons separate from plain activity text.",
);

assert(
  workspaceSource.includes(
    'addSegment("revisionRequestReason", message.revisionRequestReason)',
  ) &&
    workspaceSource.includes("value={displayRevisionRequestReason}"),
  "Revision request reasons must support translation and render through the safe rich-text component.",
);

assert(
  workspaceSource.includes("Revision reason is required."),
  "Review Submission modal must still require a reason before requesting revision.",
);

assert(
  workspaceSource.includes("h-[calc(100dvh-2rem)]") &&
    workspaceSource.includes("sm:h-[calc(100dvh-4rem)]") &&
    workspaceSource.includes("max-h-[860px]") &&
    workspaceSource.includes("min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain") &&
    workspaceSource.includes("[scrollbar-gutter:stable]") &&
    workspaceSource.includes("shrink-0 flex-col-reverse") &&
    workspaceSource.includes("sm:flex-nowrap"),
  "Review Submission must stay viewport-bounded with an internally scrolling form and persistent action footer.",
);

console.log("Stage revision reason regression checks passed.");

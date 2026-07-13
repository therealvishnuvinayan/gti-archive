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
  historySource.includes("reason: match[2]?.trim() || null"),
  "Revision request system mapper must parse the stored reason.",
);

assert(
  historySource.includes("Reason: ${revisionRequestSystemDetails.reason}"),
  "Refetched revision request system cards must display the reason.",
);

assert(
  workspaceSource.includes("const revisionReasonText = nextReason || rejectionReason"),
  "Optimistic revision request card must preserve the entered reason.",
);

assert(
  workspaceSource.includes("Reason: ${revisionReasonText}"),
  "Optimistic revision request card must display the reason.",
);

assert(
  workspaceSource.includes("Revision reason is required."),
  "Review Submission modal must still require a reason before requesting revision.",
);

console.log("Stage revision reason regression checks passed.");

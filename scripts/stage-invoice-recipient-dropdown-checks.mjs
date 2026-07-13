import { readFileSync } from "node:fs";

const chatSource = readFileSync("src/components/projects/project-chat-workspace.tsx", "utf8");
const historySource = readFileSync("src/lib/project-history.ts", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  chatSource.includes("setExecutors(project.executors)") &&
    chatSource.includes("setCollaborators(project.collaborators)"),
  "Stage Chat must sync participant state from refreshed project props.",
);

const candidateBlockStart = chatSource.indexOf("const invoiceRequestCandidates = useMemo");
const candidateBlockEnd = chatSource.indexOf("const hasAcceptedBrief", candidateBlockStart);
const candidateBlock = chatSource.slice(candidateBlockStart, candidateBlockEnd);

assert(candidateBlockStart >= 0 && candidateBlockEnd > candidateBlockStart, "Unable to locate invoice candidate block.");
assert(
  candidateBlock.includes("executors") && !candidateBlock.includes("project.executors.map"),
  "Invoice candidates must use live executor state instead of stale project.executors.",
);
assert(
  candidateBlock.includes("candidateByUserId") && candidateBlock.includes("candidate.rank < existing.rank"),
  "Invoice candidates must be deduped by user.",
);
assert(
  candidateBlock.includes('executor.role === "MAIN_EXECUTOR"') &&
    !candidateBlock.includes('collaborator.group === "external"') &&
    !candidateBlock.includes('role: executor.role === "MAIN_EXECUTOR" ? "Main Executor" : "Executor"'),
  "Invoice candidates must include only current main executors.",
);
assert(
  chatSource.includes("invoiceRequestCandidates.length === 1 ? invoiceRequestCandidates[0]?.id : \"\""),
  "Multiple invoice recipients must not silently preselect the first recipient.",
);
assert(
  chatSource.includes("Select main executor"),
  "Invoice recipient dropdown placeholder must be main-executor specific.",
);
assert(
  chatSource.includes('<SelectContent className="z-[120]">'),
  "Invoice recipient dropdown content must render above the z-[70] invoice modal overlay.",
);
assert(
  historySource.includes("executor.role === ProjectExecutorRole.MAIN_EXECUTOR") &&
    historySource.includes("Invoice can only be requested from a project main executor.") &&
    !historySource.includes("externalCollaboratorCandidate"),
  "Server validation must allow only current project main executors.",
);

console.log("Stage invoice recipient dropdown regression checks passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  workspace,
  chatWorkspace,
  concepts,
  actions,
  history,
  notifications,
  access,
  schema,
  migration,
] = await Promise.all([
  readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
  readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
  readFile("src/lib/project-concepts.ts", "utf8"),
  readFile(
    "src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts",
    "utf8",
  ),
  readFile("src/lib/project-history.ts", "utf8"),
  readFile("src/lib/notification-center/triggers.ts", "utf8"),
  readFile("src/lib/project-concept-access.ts", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
  readFile(
    "prisma/migrations/20260809150000_concept_approval_round_three/migration.sql",
    "utf8",
  ),
]);

for (const field of [
  "approvedAttachmentId",
  "approvedById",
  "approvedAt",
  "sourceStage3ConceptId",
  "sourceStage3ApprovedAttachmentId",
]) {
  assert(schema.includes(field), `Missing Round 3 schema field: ${field}`);
  assert(migration.includes(`"${field}"`), `Missing Round 3 migration field: ${field}`);
}
assert(
  schema.includes('relation("ProjectConceptApprovedAttachment"') &&
    schema.includes('relation("ProjectConceptPromotion"') &&
    schema.includes('relation("ProjectConceptStartingReference"') &&
    migration.includes("ProjectConceptFolder_approval_audit_check") &&
    migration.includes("ProjectConceptFolder_source_pair_check"),
  "Approval audit and Stage 3→4 lineage must be explicit database relationships.",
);

assert(
  concepts.includes("markProjectConceptApprovedAttachment") &&
    concepts.includes("formalConceptAttachmentTypes") &&
    concepts.includes("AttachmentStatus.READY") &&
    concepts.includes("attachment.revision.projectId !== input.projectId") &&
    concepts.includes("attachment.revision.stageId !== input.taskerStageId") &&
    concepts.includes("canManageProjectConcept(user, accessContext)"),
  "Approved Concept designation must validate a same-project/tasker READY formal revision file through centralized manager policy.",
);
assert(
  access.includes("user.role === UserRole.SUPER_ADMIN") &&
    access.includes("context.ownerId === user.id") &&
    access.includes("context.coOwnerIds.includes(user.id)") &&
    !access.includes("user.role === UserRole.ADMIN ||"),
  "Only owner, co-owner, and SUPER_ADMIN may manage concept approval.",
);
assert(
  concepts.includes("folder.approvedAttachmentId === attachment.id") &&
    concepts.includes("approvedById: user.id") &&
    concepts.includes("approvedAt") &&
    concepts.includes("Approved Concept selection is locked because Stage 3 is completed"),
  "Designation must be idempotent, audited, replaceable before completion, and locked afterward.",
);

assert(
  concepts.includes("completeStageThreeConcepts") &&
    concepts.includes("TransactionIsolationLevel.Serializable") &&
    concepts.includes("approvedConcepts.length === 0") &&
    concepts.includes("unapprovedConcepts") &&
    concepts.includes("sourceStage3ConceptId: concept.id") &&
    concepts.includes("sourceStage3ApprovedAttachmentId: approvedAttachmentId") &&
    concepts.includes("description: null") &&
    concepts.includes("actualStartedAt: null") &&
    concepts.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    concepts.includes("ProjectWorkflowStageStatus.AVAILABLE") &&
    !concepts.includes("ProjectStageFileHandoff"),
  "Stage 3 completion must atomically promote only approved concepts to fresh Stage 4 taskers without a Stage 5 handoff.",
);
assert(
  concepts.includes("bySourceId") &&
    concepts.includes("byNormalizedName") &&
    concepts.includes("unrelated concept named") &&
    concepts.includes("transitioned"),
  "Promotion must be idempotent and fail clearly on unrelated Stage 4 name collisions.",
);

for (const label of [
  "Approved Concept",
  "Not Approved",
  "Changes Requested",
  "Complete Stage 3",
  "Starting Reference",
  "Stage 3 Completed",
]) {
  assert(workspace.includes(label), `Missing Round 3 workspace UI: ${label}`);
}
assert(
  workspace.includes("unapprovedConcepts.map") &&
    workspace.includes("completeStageThreeConceptsAction") &&
    workspace.includes("confirmDisabled={approvedConceptCount === 0}") &&
    workspace.includes("folder.startingReference.previewPath") &&
    workspace.includes("folder.startingReference.downloadPath"),
  "Completion confirmation must warn about unapproved concepts and Stage 4 references must preview/download.",
);

assert(
    chatWorkspace.includes("Mark as Approved Concept") &&
    chatWorkspace.includes("Replace the currently approved concept file?") &&
    chatWorkspace.includes("markProjectConceptApprovedAttachmentAction") &&
    chatWorkspace.includes("approvedConceptAttachmentId") &&
    chatWorkspace.includes("conceptMode.isWorkflowCompleted") &&
    chatWorkspace.includes("Read-only approved Stage 3 reference") &&
    chatWorkspace.includes("!activeStage?.isTasker"),
  "Concept chat must expose the new designation separately while the legacy tasker approval remains hidden.",
);

assert(
  history.includes("sourceStage3ApprovedAttachmentId: attachment.id") &&
    history.includes("canViewProjectConcept(user, startingReferenceContext)") &&
    history.includes("approvedConceptFolder") &&
    history.includes("conceptStartingReference") &&
    history.includes("Concept files are locked because this workflow stage is completed") &&
    !history.includes("This workflow stage is completed. Chat is read-only"),
  "Starting-reference access and explicit management/deletion locks must be enforced without inventing a completed-stage chat lock.",
);

assert(
  actions.includes("markProjectConceptApprovedAttachmentAction") &&
    actions.includes("completeStageThreeConceptsAction") &&
    actions.includes("result.changed") &&
    actions.includes("result.transitioned || result.createdFolderIds.length > 0") &&
    notifications.includes("notifyConceptFileApproved") &&
    notifications.includes("notifyStageFourConceptsActivated") &&
    notifications.includes('title: "Concept file approved"') &&
    notifications.includes('title: "Stage 4 concepts activated"'),
  "Round 3 actions must revalidate and send scoped, state-change-only notifications.",
);

console.log("Stage 3/4 Round 3 approval/promotion UI and security checks passed.");

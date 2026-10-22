import type {
  BusinessAuthorizationRequirement,
  BusinessRoleEligibilityDecision,
  TechnicalPrivilegeEligibilityDecision,
} from "./contracts";
import {
  businessCapabilityValues,
  isBusinessCapability,
  isBusinessRole,
  isTechnicalCapability,
  isTechnicalPrivilege,
  type BusinessCapability,
  type BusinessRole,
} from "./definitions";

const directorOnlyCapabilities = [
  "template.decideProposal",
  "project.decideCreation",
  "project.approveLegacyPreset",
  "project.finalize",
  "project.approveCompletion",
  "project.directorIntervention",
  "template.approvePublish",
] as const satisfies readonly BusinessCapability[];

const taskFocusedRoleRestrictions = [
  "project.create",
  "task.createDataInput",
  "task.createInspectFile",
  "task.createInitialConcept",
  "task.createFinalConcept",
  "archive.upload",
  "archive.editMetadata",
  "archive.share",
  "archive.shareExternal",
  "archive.manageAccess",
  "archive.publishFromProject",
  "archive.category.delete",
  "archive.delete",
] as const satisfies readonly BusinessCapability[];

// Hard restrictions must be evaluated before any future configurable grants.
// No override/configuration input is accepted by this foundation.
const fixedRoleRestrictions: Record<BusinessRole, readonly BusinessCapability[]> = {
  DIRECTOR: [],
  SENIOR_PROJECT_MANAGER: [
    ...directorOnlyCapabilities,
    "archive.verify",
    "archive.delete",
    "archive.category.delete",
  ],
  JUNIOR_PROJECT_MANAGER: [...directorOnlyCapabilities, "archive.verify"],
  DESIGNER: [
    ...directorOnlyCapabilities,
    ...taskFocusedRoleRestrictions,
    "archive.manageCategoriesFolders",
    "archive.category.create",
    "archive.category.update",
    "archive.verify",
  ],
  DIGITAL_LEAD: [...directorOnlyCapabilities, ...taskFocusedRoleRestrictions],
};

// Task ownership actions are independent of which task types a role may create.
const taskOwnerCapabilities = [
  "task.review",
  "task.complete",
  "task.delete",
  "task.manage",
] as const satisfies readonly BusinessCapability[];

const libraryReaderCapabilities = [
  "library.view", "library.download", "library.favorite", "library.accessProjectFile",
] as const satisfies readonly BusinessCapability[];

const calendarCapabilities = ["workspace.calendar.view", "workspace.calendar.create", "workspace.calendar.delete"] as const;

const projectManagerCapabilities = [
  "workspace.dashboard", ...calendarCapabilities,
  ...libraryReaderCapabilities,
  "project.requestCreation",
  "project.activateCreation",
  "project.viewGovernance",
  "project.view",
  "project.viewContext",
  "project.viewStage",
  "project.viewFile",
  "project.viewFolder",
  "project.create",
  "project.edit",
  "project.manageStage",
  "project.executeTask",
  "project.writeFile",
  "project.comment",
  "project.respond",
  "project.manageParticipants",
  "project.requestCompletion",
  "task.list",
  "task.view",
  "task.message",
  "task.download",
  "task.createGeneral",
  "task.createFileUpload",
  "task.createDataInput",
  "task.createInspectFile",
  "task.createInitialConcept",
  "task.createFinalConcept",
  "task.execute",
  "task.requestCompletion",
  ...taskOwnerCapabilities,
  "task.viewAsSpectator",
] as const satisfies readonly BusinessCapability[];

const taskFocusedCapabilities = [
  ...calendarCapabilities,
  ...libraryReaderCapabilities,
  "project.executeTask",
  "project.writeFile",
  "project.comment",
  "project.respond",
  "project.view",
  "project.viewContext",
  "project.viewFile",
  "project.viewFolder",
  "task.list",
  "task.view",
  "task.message",
  "task.download",
  "task.createGeneral",
  "task.createFileUpload",
  "task.execute",
  "task.requestCompletion",
  ...taskOwnerCapabilities,
  "task.viewAsSpectator",
  "archive.view",
  "archive.download",
] as const satisfies readonly BusinessCapability[];

// Explicit allowlists keep unspecified rights denied. Membership in these
// lists is eligibility only: task ownership, assignment and resource grants
// remain separate from project ownership and must be checked during integration.
const eligibleCapabilities: Record<BusinessRole, readonly BusinessCapability[]> = {
  DIRECTOR: businessCapabilityValues,
  SENIOR_PROJECT_MANAGER: [
    ...projectManagerCapabilities,
    "template.createProposal",
    "template.editProposal",
    "template.configureCustomStages",
    "template.submitWorkflow",
    "template.viewWorkflowApprovals",
    "template.viewPublications",
    "archive.view",
    "archive.download",
    "archive.upload",
    "archive.editMetadata",
    "archive.manageCategoriesFolders",
    "archive.share",
    "archive.shareExternal",
    "archive.category.create",
    "archive.category.update",
    "archive.manageAccess",
    "archive.publishFromProject",
  ],
  JUNIOR_PROJECT_MANAGER: projectManagerCapabilities,
  DESIGNER: taskFocusedCapabilities,
  DIGITAL_LEAD: [...taskFocusedCapabilities, "archive.manageCategoriesFolders", "archive.category.create", "archive.category.update", "archive.verify"],
};

/** Pure eligibility assessment. Runtime policy must evaluate its requirements. */
export function getBusinessRoleEligibility(
  role: unknown,
  capability: unknown,
): BusinessRoleEligibilityDecision {
  if (!isBusinessCapability(capability)) {
    return { decision: "DENY", reason: "UNKNOWN_BUSINESS_CAPABILITY" };
  }
  if (!isBusinessRole(role)) {
    return { decision: "DENY", reason: "UNKNOWN_BUSINESS_ROLE" };
  }
  if (fixedRoleRestrictions[role].includes(capability)) {
    return { decision: "DENY", reason: "FIXED_ROLE_RESTRICTION" };
  }
  if (!eligibleCapabilities[role].includes(capability)) {
    return { decision: "DENY", reason: "NOT_ELIGIBLE" };
  }

  const requirements: BusinessAuthorizationRequirement[] = [
    "RESOURCE_CONTEXT",
    "WORKFLOW_AND_DATA_INTEGRITY",
    "ACTUAL_ACTOR_ATTRIBUTION",
    "PRESERVE_HISTORY",
  ];
  if (role !== "DIRECTOR") {
    requirements.push("RESOURCE_PERMISSION");
    if (capability === "task.createFileUpload") {
      requirements.push("AUTHORIZED_DESTINATION_FOLDER");
    }
    if (capability === "project.requestCompletion") {
      requirements.push("DIRECTOR_APPROVAL_BEFORE_FINAL_COMPLETION");
    }
  }
  if (role === "SENIOR_PROJECT_MANAGER") {
    if (capability === "project.create") requirements.push("APPROVED_TEMPLATE");
    if (capability.startsWith("template.")) {
      requirements.push("DIRECTOR_APPROVAL_BEFORE_TEMPLATE_PUBLICATION");
    }
  }
  if (role === "JUNIOR_PROJECT_MANAGER" && (capability === "project.create" || capability === "project.activateCreation")) {
    requirements.push("DIRECTOR_APPROVAL_BEFORE_PROJECT_CREATION", "SENIOR_PROJECT_MANAGER_CO_OWNER");
  }
  if (capability.startsWith("task.")) requirements.push("READ_ONLY_SPECTATOR");
  if (taskOwnerCapabilities.some((ownerCapability) => ownerCapability === capability)) {
    requirements.push("TASK_OWNER_OR_DIRECTOR", "TASK_LIFECYCLE");
  }
  if (capability === "task.execute" || capability === "task.requestCompletion") {
    requirements.push("TASK_EXECUTOR_OR_DIRECTOR", "TASK_LIFECYCLE");
  }
  if (capability === "task.complete" || capability === "task.requestCompletion") {
    requirements.push("NON_EMPTY_COMPLETION_REASON");
  }
  if (capability === "task.review") requirements.push("SELF_REVIEW_POLICY");

  return {
    decision: "REQUIRES_AUTHORIZATION",
    capability,
    scope: role === "DIRECTOR" ? "BUSINESS_WIDE" : "AUTHORIZED_RESOURCES",
    requirements,
  };
}

/** Business roles and legacy SUPER_ADMIN are never technical privileges. */
export function getTechnicalPrivilegeEligibility(
  privileges: readonly unknown[],
  capability: unknown,
): TechnicalPrivilegeEligibilityDecision {
  if (!isTechnicalCapability(capability)) {
    return { decision: "DENY", reason: "UNKNOWN_TECHNICAL_CAPABILITY" };
  }
  if (!privileges.some(isTechnicalPrivilege)) {
    return { decision: "DENY", reason: "MISSING_TECHNICAL_PRIVILEGE" };
  }
  return {
    decision: "REQUIRES_AUTHORIZATION",
    capability,
    scope: "TECHNICAL_OPERATIONS",
    requirements: [
      "TECHNICAL_OPERATION_CONTEXT",
      "EXPLICIT_SUPPORT_AUTHORIZATION",
      "AUDIT_LOGGING",
      "NO_BUSINESS_IMPERSONATION",
    ],
  };
}

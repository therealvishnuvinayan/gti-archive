/** V2 contracts used by runtime policy. Never map or cast these to UserRole. */
export const businessRoleValues = [
  "DIRECTOR",
  "SENIOR_PROJECT_MANAGER",
  "JUNIOR_PROJECT_MANAGER",
  "DESIGNER",
  "DIGITAL_LEAD",
] as const;

export type BusinessRole = (typeof businessRoleValues)[number];

export const technicalPrivilegeValues = ["TECHNICAL_ADMIN"] as const;

export type TechnicalPrivilege = (typeof technicalPrivilegeValues)[number];

/** Future contracts, not a claim that these operations already exist. */
export const businessCapabilityCatalog = {
  workspace: ["workspace.dashboard", "workspace.businessUsers", "workspace.contacts", "workspace.masterData",
    "workspace.calendar.view", "workspace.calendar.create", "workspace.calendar.delete"],
  project: [
    "project.view",
    "project.viewContext",
    "project.viewStage",
    "project.viewFile",
    "project.viewFolder",
    "project.create",
    "project.requestCreation",
    "project.decideCreation",
    "project.activateCreation",
    "project.approveLegacyPreset",
    "project.viewGovernance",
    "project.finalize",
    "project.edit",
    "project.manageStage",
    "project.executeTask",
    "project.writeFile",
    "project.comment",
    "project.respond",
    "project.manageParticipants",
    "project.delete",
    "project.requestCompletion",
    "project.approveCompletion",
    "project.directorIntervention",
  ],
  template: [
    "template.createProposal",
    "template.decideProposal",
    "template.editProposal",
    "template.approvePublish",
    "template.configureCustomStages",
  ],
  task: [
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
    // Executor request; does not mark the task completed.
    "task.requestCompletion",
    // Owner review includes accepting submissions, subject to self-review policy.
    "task.review",
    // Owner's Mark as Completed action; distinct from an executor request.
    "task.complete",
    "task.delete",
    "task.manage",
    "task.viewAsSpectator",
  ],
  library: [
    "library.view", "library.download", "library.upload", "library.editMetadata",
    "library.manageTags", "library.favorite", "library.share", "library.delete",
    "library.accessProjectFile",
  ],
  archive: [
    "archive.view",
    "archive.download",
    "archive.upload",
    "archive.editMetadata",
    "archive.manageCategoriesFolders",
    "archive.share",
    "archive.shareExternal",
    "archive.category.create",
    "archive.category.update",
    "archive.category.delete",
    "archive.manageAccess",
    "archive.publishFromProject",
    "archive.verify",
    "archive.delete",
  ],
} as const;

export type BusinessCapability =
  (typeof businessCapabilityCatalog)[keyof typeof businessCapabilityCatalog][number];

export const businessCapabilityValues: readonly BusinessCapability[] =
  Object.values(businessCapabilityCatalog).flat();

/** Application maintenance only; no deployment, database or secrets authority. */
export const technicalCapabilityValues = [
  "technical.maintenance",
  "technical.diagnostics",
  "technical.configureApplication",
  "technical.systemRecovery",
  "technical.accountRecovery",
  "technical.troubleshoot",
  "technical.securityAdministration",
] as const;

export type TechnicalCapability = (typeof technicalCapabilityValues)[number];

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === "string" && businessRoleValues.includes(value as BusinessRole);
}

export function isTechnicalPrivilege(value: unknown): value is TechnicalPrivilege {
  return value === "TECHNICAL_ADMIN";
}

export function isBusinessCapability(value: unknown): value is BusinessCapability {
  return typeof value === "string" && businessCapabilityValues.includes(value as BusinessCapability);
}

export function isTechnicalCapability(value: unknown): value is TechnicalCapability {
  return typeof value === "string" && technicalCapabilityValues.includes(value as TechnicalCapability);
}

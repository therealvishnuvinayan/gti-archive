import assert from "node:assert/strict";

import {
  businessCapabilityCatalog,
  businessCapabilityValues,
  businessRoleValues,
  isBusinessCapability,
  isBusinessRole,
  isTechnicalCapability,
  isTechnicalPrivilege,
  technicalCapabilityValues,
  technicalPrivilegeValues,
  type BusinessCapability,
  type BusinessRole,
} from "../src/lib/authorization/definitions";
import {
  getBusinessRoleEligibility,
  getTechnicalPrivilegeEligibility,
} from "../src/lib/authorization/eligibility";

function eligible(role: BusinessRole, capability: BusinessCapability) {
  const result = getBusinessRoleEligibility(role, capability);
  assert.equal(result.decision, "REQUIRES_AUTHORIZATION", `${role}: ${capability}`);
  assert.ok(result.decision === "REQUIRES_AUTHORIZATION");
  return result;
}

function denied(role: unknown, capability: unknown, fixed = false) {
  const result = getBusinessRoleEligibility(role, capability);
  assert.equal(result.decision, "DENY", `${String(role)}: ${String(capability)}`);
  if (fixed) assert.deepEqual(result, { decision: "DENY", reason: "FIXED_ROLE_RESTRICTION" });
}

assert.deepEqual([...businessRoleValues], [
  "DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DESIGNER", "DIGITAL_LEAD",
]);
assert.deepEqual([...technicalPrivilegeValues], ["TECHNICAL_ADMIN"]);
for (const role of businessRoleValues) {
  assert.equal(isBusinessRole(role), true);
  assert.equal(isTechnicalPrivilege(role), false);
}
assert.equal(isBusinessRole("TECHNICAL_ADMIN"), false);
assert.equal(isTechnicalPrivilege("TECHNICAL_ADMIN"), true);
for (const value of ["SUPER_ADMIN", "ADMIN", "USER", "director", "", null, undefined, {}]) {
  assert.equal(isBusinessRole(value), false);
  assert.equal(isTechnicalPrivilege(value), false);
  for (const capability of businessCapabilityValues) denied(value, capability);
}

assert.equal(new Set(businessCapabilityValues).size, businessCapabilityValues.length);
for (const capability of businessCapabilityValues) {
  assert.equal(isBusinessCapability(capability), true);
  assert.equal(isTechnicalCapability(capability), false);
  const result = eligible("DIRECTOR", capability);
  assert.equal(result.scope, "BUSINESS_WIDE");
  assert.ok(result.requirements.includes("RESOURCE_CONTEXT"));
  assert.ok(result.requirements.includes("WORKFLOW_AND_DATA_INTEGRITY"));
  assert.ok(result.requirements.includes("ACTUAL_ACTOR_ATTRIBUTION"));
  assert.ok(result.requirements.includes("PRESERVE_HISTORY"));
  assert.equal(result.requirements.includes("RESOURCE_PERMISSION"), false);
}

// A technical-only actor cannot approve business work. A Designer may be eligible
// for owner review, but adding technical privileges must not remove any conditions.
const technicalOnlyActor = { businessRole: null, technicalPrivileges: ["TECHNICAL_ADMIN"] };
const designerMaintainer = { businessRole: "DESIGNER", technicalPrivileges: ["TECHNICAL_ADMIN"] };
for (const capability of [
  "project.approveCompletion", "template.approvePublish", "task.review",
  "task.complete", "task.delete", "task.manage", "task.requestCompletion", "archive.verify",
]) {
  denied(technicalOnlyActor.businessRole, capability);
  denied("TECHNICAL_ADMIN", capability);
  assert.deepEqual(
    getBusinessRoleEligibility(designerMaintainer.businessRole, capability),
    getBusinessRoleEligibility("DESIGNER", capability),
  );
  assert.deepEqual(getTechnicalPrivilegeEligibility(technicalOnlyActor.technicalPrivileges, capability), {
    decision: "DENY", reason: "UNKNOWN_TECHNICAL_CAPABILITY",
  });
}
for (const capability of technicalCapabilityValues) {
  assert.equal(isTechnicalCapability(capability), true);
  assert.equal(isBusinessCapability(capability), false);
  denied("DIRECTOR", capability);
  for (const privileges of [[], ["DIRECTOR"], ["SUPER_ADMIN"], [null, "ADMIN"]]) {
    assert.deepEqual(getTechnicalPrivilegeEligibility(privileges, capability), {
      decision: "DENY", reason: "MISSING_TECHNICAL_PRIVILEGE",
    });
  }
  const result = getTechnicalPrivilegeEligibility(technicalOnlyActor.technicalPrivileges, capability);
  assert.ok(result.decision === "REQUIRES_AUTHORIZATION");
  assert.equal(result.scope, "TECHNICAL_OPERATIONS");
  assert.ok(result.requirements.includes("EXPLICIT_SUPPORT_AUTHORIZATION"));
  assert.ok(result.requirements.includes("AUDIT_LOGGING"));
  assert.ok(result.requirements.includes("NO_BUSINESS_IMPERSONATION"));
}

for (const role of ["DESIGNER", "DIGITAL_LEAD"] as const) {
  for (const capability of [
    "project.create", "task.createDataInput", "task.createInspectFile",
    "task.createInitialConcept", "task.createFinalConcept",
  ]) denied(role, capability, true);
  eligible(role, "task.createGeneral");
  const upload = eligible(role, "task.createFileUpload");
  assert.equal(upload.scope, "AUTHORIZED_RESOURCES");
  assert.ok(upload.requirements.includes("AUTHORIZED_DESTINATION_FOLDER"));
  assert.ok(upload.requirements.includes("RESOURCE_PERMISSION"));
  eligible(role, "task.execute");
  for (const capability of ["project.edit", "project.manageParticipants", "project.delete", "project.requestCompletion"]) {
    denied(role, capability);
  }
  for (const capability of ["archive.upload", "archive.editMetadata", "archive.share", "archive.delete"]) {
    denied(role, capability, true);
  }
}

// Ownership, not the role's task-creation restrictions, governs owner actions.
// These calls provide no relationship evidence and must remain pending for every role.
for (const role of businessRoleValues) {
  for (const capability of ["task.review", "task.complete", "task.delete", "task.manage"] as const) {
    const ownerAction = eligible(role, capability);
    assert.ok(ownerAction.requirements.includes("TASK_OWNER_OR_DIRECTOR"));
    assert.ok(ownerAction.requirements.includes("TASK_LIFECYCLE"));
    assert.ok(ownerAction.requirements.includes("RESOURCE_CONTEXT"));
    assert.ok(ownerAction.requirements.includes("READ_ONLY_SPECTATOR"));
    assert.equal(ownerAction.requirements.includes("TASK_EXECUTOR_OR_DIRECTOR"), false);
    if (role !== "DIRECTOR") {
      assert.equal(ownerAction.scope, "AUTHORIZED_RESOURCES");
      assert.ok(ownerAction.requirements.includes("RESOURCE_PERMISSION"));
    }
  }
  assert.ok(eligible(role, "task.review").requirements.includes("SELF_REVIEW_POLICY"));

  const completion = eligible(role, "task.complete");
  const request = eligible(role, "task.requestCompletion");
  assert.notEqual(request.capability, completion.capability);
  assert.ok(completion.requirements.includes("NON_EMPTY_COMPLETION_REASON"));
  assert.ok(request.requirements.includes("NON_EMPTY_COMPLETION_REASON"));
  assert.ok(request.requirements.includes("TASK_EXECUTOR_OR_DIRECTOR"));
  assert.ok(request.requirements.includes("TASK_LIFECYCLE"));
  assert.equal(request.requirements.includes("TASK_OWNER_OR_DIRECTOR"), false);
  assert.ok(eligible(role, "task.execute").requirements.includes("TASK_EXECUTOR_OR_DIRECTOR"));

  // Role eligibility for any task action cannot turn a spectator into an owner
  // or executor. Director intervention uses independent, attributable authority.
  for (const capability of businessCapabilityCatalog.task) {
    const result = getBusinessRoleEligibility(role, capability);
    if (result.decision === "DENY") continue;
    assert.ok(result.requirements.includes("READ_ONLY_SPECTATOR"));
  }
}

for (const role of businessRoleValues) {
  if (role === "DIRECTOR" || role === "DIGITAL_LEAD") eligible(role, "archive.verify");
  else denied(role, "archive.verify", true);
  if (role !== "DIRECTOR") {
    denied(role, "project.approveCompletion", true);
    denied(role, "project.directorIntervention", true);
    denied(role, "template.approvePublish", true);
    denied(role, "project.delete");
  }
  assert.ok(eligible(role, "task.viewAsSpectator").requirements.includes("READ_ONLY_SPECTATOR"));
}

for (const capability of businessCapabilityCatalog.archive) {
  if (capability === "archive.delete" || capability === "archive.verify") {
    denied("SENIOR_PROJECT_MANAGER", capability, true);
  } else {
    eligible("SENIOR_PROJECT_MANAGER", capability);
  }
  denied("JUNIOR_PROJECT_MANAGER", capability);
}
eligible("DESIGNER", "archive.view");
eligible("DESIGNER", "archive.download");
denied("DESIGNER", "archive.manageCategoriesFolders", true);
eligible("DIGITAL_LEAD", "archive.manageCategoriesFolders");

for (const role of ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"] as const) {
  for (const capability of [
    "task.createGeneral", "task.createFileUpload", "task.createDataInput",
    "task.createInspectFile", "task.createInitialConcept", "task.createFinalConcept",
  ] as const) eligible(role, capability);
  assert.ok(eligible(role, "project.requestCompletion").requirements.includes("DIRECTOR_APPROVAL_BEFORE_FINAL_COMPLETION"));
}
assert.ok(eligible("SENIOR_PROJECT_MANAGER", "project.create").requirements.includes("APPROVED_TEMPLATE"));
const juniorCreation = eligible("JUNIOR_PROJECT_MANAGER", "project.create");
assert.ok(juniorCreation.requirements.includes("DIRECTOR_APPROVAL_BEFORE_PROJECT_CREATION"));
assert.ok(juniorCreation.requirements.includes("SENIOR_PROJECT_MANAGER_CO_OWNER"));
for (const capability of ["template.createProposal", "template.editProposal", "template.configureCustomStages"] as const) {
  assert.ok(eligible("SENIOR_PROJECT_MANAGER", capability).requirements.includes("DIRECTOR_APPROVAL_BEFORE_TEMPLATE_PUBLICATION"));
  denied("JUNIOR_PROJECT_MANAGER", capability);
}

for (const capability of ["", "*", "project.*", "project.unknown", "constructor", "__proto__", null, undefined, {}]) {
  for (const role of businessRoleValues) {
    assert.deepEqual(getBusinessRoleEligibility(role, capability), {
      decision: "DENY", reason: "UNKNOWN_BUSINESS_CAPABILITY",
    });
  }
  assert.deepEqual(getTechnicalPrivilegeEligibility(["TECHNICAL_ADMIN"], capability), {
    decision: "DENY", reason: "UNKNOWN_TECHNICAL_CAPABILITY",
  });
}
for (const capability of ["technical.deploy", "technical.databaseAccess", "technical.manageSecrets", "technical.manageEnvironment", "technical.impersonate"]) {
  assert.deepEqual(getTechnicalPrivilegeEligibility(["TECHNICAL_ADMIN"], capability), {
    decision: "DENY", reason: "UNKNOWN_TECHNICAL_CAPABILITY",
  });
}

// No resource context is available to this module. Every eligible pair remains
// pending, including Director intervention; no unconditional grant can emerge.
for (const role of businessRoleValues) {
  for (const capability of businessCapabilityValues) {
    const result = getBusinessRoleEligibility(role, capability);
    if (result.decision === "DENY") continue;
    assert.equal(result.decision, "REQUIRES_AUTHORIZATION");
    assert.ok(result.requirements.includes("RESOURCE_CONTEXT"));
    if (role !== "DIRECTOR") {
      assert.equal(result.scope, "AUTHORIZED_RESOURCES");
      assert.ok(result.requirements.includes("RESOURCE_PERMISSION"));
    }
  }
}

console.log("FLUX V2 authorization foundation checks passed (roles, domain separation, creation restrictions, task ownership, executor requests and pending resource authorization).");

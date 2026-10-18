import type { BusinessCapability, TechnicalCapability } from "./definitions";

export type EligibilityDenialReason =
  | "UNKNOWN_BUSINESS_ROLE"
  | "UNKNOWN_BUSINESS_CAPABILITY"
  | "UNKNOWN_TECHNICAL_CAPABILITY"
  | "MISSING_TECHNICAL_PRIVILEGE"
  | "FIXED_ROLE_RESTRICTION"
  | "NOT_ELIGIBLE";

export type BusinessAuthorizationRequirement =
  | "RESOURCE_CONTEXT"
  | "RESOURCE_PERMISSION"
  | "WORKFLOW_AND_DATA_INTEGRITY"
  | "ACTUAL_ACTOR_ATTRIBUTION"
  | "PRESERVE_HISTORY"
  | "APPROVED_TEMPLATE"
  | "DIRECTOR_APPROVAL_BEFORE_PROJECT_CREATION"
  | "SENIOR_PROJECT_MANAGER_CO_OWNER"
  | "DIRECTOR_APPROVAL_BEFORE_FINAL_COMPLETION"
  | "DIRECTOR_APPROVAL_BEFORE_TEMPLATE_PUBLICATION"
  | "AUTHORIZED_DESTINATION_FOLDER"
  // Relationships must be verified against the target task. Director may intervene.
  | "TASK_OWNER_OR_DIRECTOR"
  | "TASK_EXECUTOR_OR_DIRECTOR"
  | "TASK_LIFECYCLE"
  | "NON_EMPTY_COMPLETION_REASON"
  // An approved policy is still required; ownership never implies self-approval.
  | "SELF_REVIEW_POLICY"
  // A spectator relationship cannot authorize mutation of the target task.
  | "READ_ONLY_SPECTATOR";

export type TechnicalAuthorizationRequirement =
  | "TECHNICAL_OPERATION_CONTEXT"
  | "EXPLICIT_SUPPORT_AUTHORIZATION"
  | "AUDIT_LOGGING"
  | "NO_BUSINESS_IMPERSONATION";

/**
 * Deliberately has no ALLOW result. Role/privilege eligibility is insufficient
 * to authorize an operation, even for Director. The runtime resource policy must
 * evaluate trusted context and enforce requirements at the relevant transition.
 */
type EligibilityDecision<Capability, Scope, Requirement> =
  | Readonly<{
      decision: "DENY";
      reason: EligibilityDenialReason;
    }>
  | Readonly<{
      decision: "REQUIRES_AUTHORIZATION";
      capability: Capability;
      scope: Scope;
      requirements: readonly Requirement[];
    }>;

export type BusinessRoleEligibilityDecision = EligibilityDecision<
  BusinessCapability,
  "BUSINESS_WIDE" | "AUTHORIZED_RESOURCES",
  BusinessAuthorizationRequirement
>;

export type TechnicalPrivilegeEligibilityDecision = EligibilityDecision<
  TechnicalCapability,
  "TECHNICAL_OPERATIONS",
  TechnicalAuthorizationRequirement
>;

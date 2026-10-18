# FLUX V2 authorization foundations — Phase 1.1

This module is inactive. It has no imports from authentication, Prisma, the legacy
permission resolver or application services. No production caller should use it
until account mapping and resource-policy integration are approved. Capability
identifiers describe V2 contracts; they do not imply implemented product features.

## Two independent domains

`BusinessRole` contains exactly DIRECTOR, SENIOR_PROJECT_MANAGER,
JUNIOR_PROJECT_MANAGER, DESIGNER and DIGITAL_LEAD. `TechnicalPrivilege` contains
TECHNICAL_ADMIN and is independent: an account may eventually have a business role,
technical privileges, both, or neither. Nothing maps legacy SUPER_ADMIN, ADMIN or
USER to either domain. Their existing behavior remains in `src/lib/permissions/`.

Only one active Director is intended; this module does not enforce assignment or
uniqueness. Storage, account mapping and lifecycle enforcement belong to later work.

Technical capabilities cover application maintenance, diagnostics, configuration,
system/account recovery, troubleshooting and security administration. They grant no
business authority, impersonation, deployment, database, secrets or environment
access. Director business authority likewise grants no technical privileges.

## Eligibility is not authorization

`getBusinessRoleEligibility` and `getTechnicalPrivilegeEligibility` return a
discriminated union with only `DENY` or `REQUIRES_AUTHORIZATION`. Neither can return
ALLOW, accept resource evidence, execute an action or replace the legacy resolver.
An eligible result must never be used as a boolean authorization check.

Unknown capabilities fail closed, including capabilities from the other domain.
Unknown business roles are denied; technical eligibility requires an explicitly
recognized privilege. Fixed restrictions run before eligibility allowlists. Future
configurable grants must never override these restrictions or workflow requirements.

| Role | Business eligibility, still requiring authorization |
| --- | --- |
| Director | Every defined business capability, across the business without project membership |
| SPM | Authorized project management except deletion/final approval/intervention; all six task types and scoped task management; template proposals/custom stage proposals; archive management except verify/delete |
| JPM | Authorized project management except deletion/final approval/intervention; all six task types and scoped task management |
| Designer | Relevant project/task views; General/File Upload creation; own-task review/completion/deletion/management; permitted execution/completion requests; read-only spectator view; archive view/download |
| Digital Lead | Designer eligibility plus archive category/folder management and verification |

Resource authorization is a **future integration requirement**, not implemented
here. `RESOURCE_CONTEXT` must identify trusted target or creation context.
`RESOURCE_PERMISSION` must evaluate action-specific project participation, task
ownership/assignment, folder/field grants and limited visible context. Project
ownership alone must not imply task ownership. Task execution may convey a narrowly
scoped submission right without direct destination-folder or stage-field access.
File Upload creation additionally requires destination-folder permission.
Spectator participation must remain read-only at every entry point; eligibility for
another task capability does not promote a spectator into an executor or owner.

## Task ownership and completion

Any authorized project participant may create task types permitted by their
business role. The creator normally becomes the Task Owner. These contracts do not
assign ownership or change Tasker. Designer and Digital Lead creation remains
limited to General and File Upload tasks, with destination-folder authorization
for File Upload creation. Creation restrictions do not restrict owner actions on
an authorized task.

All five business roles are eligible for the following actions, **not authorized
by role alone**:

| Capability | Required task authority | Additional requirements |
| --- | --- | --- |
| `task.review` | Target Task Owner or Director intervention | Review/acceptance must satisfy an approved self-review policy |
| `task.complete` | Target Task Owner or Director intervention | Mark as Completed requires a non-empty reason |
| `task.delete` | Target Task Owner or Director intervention | Deletion must be permitted by the task lifecycle and history rules |
| `task.manage` | Target Task Owner or Director intervention | Management must stay within the authorized lifecycle |
| `task.requestCompletion` | Target Executor or Director intervention | Completion request requires a non-empty reason; it does not complete the task |

`TASK_OWNER_OR_DIRECTOR` and `TASK_EXECUTOR_OR_DIRECTOR` require target-specific
relationship authorization or explicit Director business authority. They are not
evidence that either relationship exists. Non-Director actions still require
resource permission; all actions retain resource-context and integrity checks.
`task.execute` also requires Executor authority or Director intervention.

`NON_EMPTY_COMPLETION_REASON` requires a meaningful, non-whitespace reason for
both completion and completion requests, including Director actions. Future
integration must validate and record it with the actual actor. `task.manage` does
not substitute for review, completion or deletion checks. Mark as Completed must
not fabricate acceptance of a submission or rewrite an earlier approval.

`READ_ONLY_SPECTATOR` accompanies every task capability: a spectator relationship
cannot authorize a mutation of that task. Creating a separate task requires its
own project/resource authority. Director intervention uses independent global
business authority, never an elevation of spectator permissions.

Self-review remains unresolved when the Task Owner is also an Executor of the
submission under review. `SELF_REVIEW_POLICY` is an outstanding authorization
requirement, not permission to approve one's own work. No such approval rule or
resource evaluator is implemented here.

Director's `BUSINESS_WIDE` scope removes the membership requirement, not resource
context, workflow/data integrity, actual actor attribution or history preservation.
Interventions must record the real actor and preserve real owners/creators and
prior approvals. They must not impersonate or silently rewrite history.

Requirements refer to their named workflow transition:

- SPM project creation uses an approved template.
- JPM project creation needs Director approval and an SPM co-owner.
- SPM/JPM can request completion; Director approval gates final completion, not
  submission of the request.
- SPM can draft template/custom-stage proposals; Director approval gates publishing
  or applying them, not drafting the proposal.
- Technical operations need explicit support authorization and audit logging.
  These requirements do not themselves authorize access to business records.

## Decisions deferred

Unspecified rights stay denied: JPM archives/templates and non-Director project
deletion. SPM archive sharing is
eligible as archive management; recipient/export scope still needs a resource rule.
Self-review, exact lifecycle/field constraints, template/stage lifecycle rules and
exceptional support procedures also require approved policies before integration.

Phase 1.2 should first approve the additive persistence/account-mapping design,
single-active-Director safeguards and role-change session/cache invalidation. The
actual deployed migration state must be reconciled before preparing migrations.
No database reconciliation or Phase 1.2 work occurs in this change.

## Local checks

Run `pnpm authorization:foundation-check`. It compiles and executes only the pure
V2 module checks using the repository's existing TypeScript/assert convention.
It does not load Prisma, authentication, environment files or network clients.

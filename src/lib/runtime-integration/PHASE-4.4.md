# Phase 4.4 — partial implementation report

**Historical package report.** The current combined A+B+C+D candidate, checksum, counts and verification are documented in [PHASE-4.4D.md](PHASE-4.4D.md). Earlier hashes and rehearsal counts below remain historical.

> Historical Phase 4.4A report. [Phase 4.4B](./PHASE-4.4B.md) now adds runtime General Tasks and records the current combined candidate, checksum, 116/138 rehearsal and verification. The checksum and 116/136 counts below describe creation governance alone and are superseded. Neither report authorizes activation.

**INCOMPLETE — NOT READY FOR CONTROLLED ACTIVATION.** This working tree implements and verifies the runtime creation-governance portion only. It does not fulfill the full Phase 4.4 request. Do not apply this candidate to Neon or enable `FLUX_RUNTIME_INTEGRATION` on the strength of this report.

Verified 23 October 2026. Baseline activation evidence: `.tmp/phase43-activation/final-verification.json`, recording 115 successful migrations, 134 public tables and ten enabled flags. This phase made no Neon connection or mutation. All actual environment files, all 115 historical migration SQL files and the pre-existing staged Phase 4.3 preflight report are unchanged. Existing Git staging is preserved. No real account/password, live S3, worker, email, notification, push, deployment or Phase 5 action occurred.

## Implemented scope

- Director direct creation remains available through the existing runtime path. SPM creation is separately enabled by the Phase 4.4 flag, requires an active SPM to be the actual Owner, and revalidates the immutable approved executable version. No second Director approval is added for SPM creation.
- JPM direct creation remains denied. A JPM can submit an immutable request as the genuine proposed Owner, with an eligible SPM Co-owner, other eligible participants, exact published version/hash and mandatory reason. No project or stages exist before approval.
- Director approval/rejection requires explicit confirmation, reason and the exact request hash. Rejection retains the request and decision. Approval atomically creates one pinned RuntimeProject and its stages. JPM creator attribution remains separate from the actual Director decision and participant-assignment actor.
- Requests and decisions have restrictive foreign keys, unique command identities, immutable guards and native typed BusinessEvent/outbox records. Current sessions, request locks and command advisory locks protect review. Concurrent same-command decisions produce at most one project; exact replay returns the recorded result. Requester and participant eligibility are rechecked at approval.
- Initial participants remain immutable. There is no ownership-transfer or participant-removal endpoint. Executors gain no stage-management access. Director oversight creates no fictitious membership.
- Central authorization gains explicit runtime creation/governance capabilities and resource policies. Actual SPM/JPM/Director roles remain distinct from technical privilege. Request lists are scoped to the requester except for Director oversight.
- The creation UI exposes SPM direct creation and JPM request submission, a mandatory reason, genuine Owner selection and Co-owner selection. `/projects/runtime/requests` gives requesters retained status and Directors a reasoned decision form. An approval-navigation link is added to Projects.
- The application continues to run against the 115-migration schema with integration disabled. Relation-only additions on existing models avoid new-column queries. The existing 503-assertion runtime suite passed on that baseline before the candidate was applied to populated disposable PostgreSQL.

## Required scope still missing

| Requested capability | Actual status |
| --- | --- |
| Runtime resource discriminator and Universal Tasker project association | Not implemented. Tasker remains structured/flexible only. |
| Runtime task creation/navigation, counts, filters and My Tasks | Not implemented. |
| File Upload acceptance into a runtime FILE_REQUIREMENT | Not implemented. Existing task-folder behavior is preserved. |
| Data Input acceptance into pinned runtime fields, stale conflict and approval supersession | Not implemented. Existing native Stage 5 adapter is preserved. |
| Runtime Inspect File, Initial/Final Concept and Sister context | Not implemented. Existing native/flexible suites pass. |
| Runtime completion-document policy, uploads, review and exact-version evidence | Not implemented. |
| Owner final-completion request and Director final decision | Not implemented. Final runtime closure remains unavailable. |
| Completed runtime-project immutability/read-only navigation | Not implemented beyond existing completed-stage protections. |
| Unified native/flexible/runtime dashboard and contextual field/file task actions | Not implemented; only creation/approval navigation changed. |
| Browser proof of Tasker-to-stage updates and final project completion | Not run because these capabilities do not exist in this implementation. |

The user explicitly selected this completion policy: **require Director-approved document requirements before final completion is available; unconfigured projects stay blocked**. This decision is recorded, but no policy model, policy approval UI or document/final-completion adapter has been implemented. Do not silently substitute an all-documents-required default, an INTERNAL exemption, or a Director-as-Owner self-approval bypass. Approval proof, copyright transfer and invoice requirements need explicit supported policy binding and accepted versioned evidence. Existing native completion workflows are unchanged.

## Current additive candidate — partial scope only

`prisma/migrations/20261024010000_runtime_integration/migration.sql`

SHA-256: `478f5307744d966bab47b6432c4933edf6c7499454a782a7dac8abee5c4192c2`

Current disposable result: **116 successful migrations, zero unfinished migrations, 136 public tables including the ledger, zero Prisma drift**. The two new tables start empty; every original populated table and prior migration ledger row/checksum is preserved exactly. These counts describe this partial candidate, not a final Phase 4.4 schema.

New tables: `RuntimeCreationRequest` and `RuntimeCreationDecision`. Seven restrictive foreign keys (event and approved-project links initially deferred), nine indexes including primary/unique indexes, two shape checks, two BusinessEvent enum values and seven triggers. Four new functions: `flux_runtime_creation_valid`, `flux_runtime_creation_guard`, `flux_runtime_creation_consistency`, `flux_emit_runtime_creation_event`. Narrow replacements extend `flux_runtime_guard`, `flux_runtime_consistency`, `flux_event_write_guard` and the existing event contract check. No existing physical column is added or changed. No historical conversion, backfill or synthetic business data is inserted by the migration.

The candidate uses explicit BEGIN/COMMIT, five-second lock and sixty-second statement timeouts. Only disposable PostgreSQL 14.19 has executed it. It is not certified or authorized for Neon PostgreSQL 18.6 activation. The new feature flag remains absent/disabled in actual environment files.

## Verification actually completed

| Check | Result |
| --- | --- |
| Populated 115 → 116 preservation and schema drift | PASS; old table contents/checksums unchanged; new tables empty |
| New creation-governance integration | PASS, 49 assertions; SPM/JPM rules, rejection/approval, replay/concurrency, SQL immutability, request-list isolation and forced outbox rollback |
| Existing runtime integration on 115 baseline | PASS, 503 assertions |
| All six existing Tasker types, Sister Tasks, Stage Builder and publication | PASS in the complete isolated Tasker/runtime runner; runtime-context support is not claimed |
| Broad authorization/session/administration/workspace/project governance/read/write, completion documents, approvals, shared files/events, Archives and Library | PASS |
| Authorization foundation/persistence and approval/event/Tasker units | PASS |
| Both repaired legacy task/concept runners and four native UI runners | PASS |
| Full TypeScript | PASS |
| Targeted ESLint | PASS, 22 changed/new TS/TSX/MJS files, zero warnings |
| Isolated production build | PASS; dummy database endpoints, no actual environment files |
| Isolated Chromium browser | PASS, 76 assertions / 19 screenshots, zero page errors and external requests |

The browser used real synthetic logins and persisted Director creation, SPM independent creation and JPM request → Director approval. It also retained stage form/file/ordered-review/completion workflows and unrelated-manager, Designer, Digital Lead and both technical-administrator page/API/file denials. It did **not** demonstrate runtime task assignment/application or final project completion. PostgreSQL and storage were disposable/local, and HTTP/browser external access was blocked.

Intermediate failures were fixed before the reported runs: a new event guard accessed a field absent on EventOutbox, the creation producer initially omitted its mandatory outbox insertion, one test used a nonexistent synthetic account, the browser expected the old migration count, and its decision select locator was too strict. No failing completed test remains. The unimplemented acceptance scenarios listed above remain omitted coverage, not passes.

Evidence: `.tmp/phase44/` — `governance-test.log`, `authorization.log`, `regressions.json` and per-suite logs, `typecheck.log`, `lint-final.log`, `build-result.json`, `browser/result.json`, nineteen screenshots and `preservation.json`. Reproduce the creation integration with `pnpm runtime-integration:check`. The browser mode uses `FLUX_BROWSER_RUNTIME_INTEGRATION=1` only in the isolated runner process.

## Exact file inventory

Created:

- `prisma/migrations/20261024010000_runtime_integration/migration.sql`
- `scripts/runtime-integration-check.ts`
- `src/app/(dashboard)/projects/runtime/requests/page.tsx`
- `src/app/api/runtime-projects/creation-requests/route.ts`
- `src/components/projects/runtime-creation-requests.tsx`
- `src/lib/runtime-integration/activation.ts`
- `src/lib/runtime-integration/creation-contracts.ts`
- `src/lib/runtime-integration/creation.ts`
- `src/lib/runtime-integration/instantiate.ts`
- `src/lib/runtime-integration/PHASE-4.4.md`

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/run-universal-tasker-isolated.mjs`
- `scripts/stage-builder-browser-check.mjs`
- `scripts/stage-runtime-browser-check.mjs`
- `scripts/tasker-schema-baseline.mjs`
- `scripts/tsconfig.universal-tasker.json`
- `scripts/workflow-publication-browser-check.mjs`
- `src/components/projects/stage-runtime-entry.tsx`
- `src/components/projects/stage-runtime.tsx`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/stage-runtime-policies.ts`
- `src/lib/events/contracts.ts`
- `src/lib/stage-runtime/service.ts`

## Readiness

**Phase 4 is not functionally ready for final controlled activation.** Remaining implementation must cover the runtime Tasker resource model and guarded field/file applications, all runtime task types/Sisters, Director-approved completion-document requirements, native runtime document submissions/reviews, Owner completion requests, Director final decisions, complete navigation and the corresponding integration/browser acceptance. The current creation work is only a foundation for that remaining scope.

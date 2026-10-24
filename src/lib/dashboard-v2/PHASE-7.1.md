# FLUX V2 Phase 7.1 implementation and acceptance report

24 October 2026, Asia/Dubai.

Phase 7.1 is implemented behind `FLUX_DASHBOARD_V2`, disabled by default. The existing `/` dashboard is the entry point; `/dashboard` still redirects there. The new dashboard uses authenticated application records, current versioned sessions and existing resource policies. No migration, live activation, Neon connection, live S3 operation, account change, notification, push or deployment was performed.

## Existing experience reviewed

The original landing page and `src/lib/dashboard.ts` provide native artwork/flexible project cards, workflow-derived statistics, attention/deadline panels and a Universal Tasker entry card. `DashboardLayout`, `DashboardAppFrame`, `Sidebar`, `StatCard`, loading skeletons and the existing green FLUX design remain in use. The new flag selects the dashboard content at the existing route; it does not create another application.

Existing navigation retains Projects, Tasks, Project Approvals, role-dependent Archives/Archive Categories, Library and technical Settings. Native artwork/flexible views retain their existing category, search, status, relationship, stage, sorting and pagination controls. Existing project context, full workspace, native search/filter, Archive search and Tasker query services were reviewed. No cross-application search, calendar or reminder feature was added.

The implementation also follows Phase 6 activation evidence and the Phase 5.4 distinction between an approved executable workflow and an official GTI standard. All five internal candidates remain unchanged and are not designated official by this work.

## Dashboard capabilities and count meanings

| Area | Data and exact meaning |
| --- | --- |
| Accessible active projects | Sum of authorized full-workspace RuntimeProjects in `ACTIVE`, FlexibleProjects in `ACTIVE`, and native Projects with an explicit active status group or a valid active native workflow when no status is assigned. Native project completion/closure and archival exclude active classification. |
| Accessible completed projects | RuntimeProject `COMPLETED`; FlexibleProject `COMPLETED`; native Project `completedAt`, project closure, or explicit completed status group. Stage completion alone never completes a project. |
| Tasks ready for your action | Actual executor relationship, authorized enabled Tasker type, not deleted, `OPEN` or `IN_PROGRESS`, writable runtime context, and an inspection source when required. No blanket overdue classification. |
| Pending dashboard decisions | Eligible items in the selected supported queues. Shown only when the complete candidate set fits the first bounded batch and evidence can be evaluated. Omitted on subsequent batches, when more candidates exist, or when stage evidence exceeds the read bound. It is not a universal approval or notification count. |
| Project list | Separate RuntimeProject, native Project and FlexibleProject views, real categories/types, authorized Owner/Co-owner names, status, dates and existing workspace links. Unknown native status displays “Status not set” and does not inflate active counts. |

Project counts apply only to full workspaces the actor can inspect. Designer and Digital Lead receive no active/completed project statistics. Their project list contains authorized native/flexible context references with no status, dates, participant roster or stage detail. Runtime project references remain inside their authorized Tasker cards, linking to the task workspace.

Native records without a status use the existing native workflow read model only to identify active work. A fully completed stage sequence without project-level completion is labeled “Awaiting project completion”. Native archived/pending/on-hold/cancelled or unclassified records are available in All where authorized; they are not automatically treated as active or completed.

Each project/task page has at most 12 rows. Stable sorts include a unique ID tie-breaker. Project families and status filters, task relationship/status views, and attention categories have independent pagination. Input parsing rejects unsupported fields, duplicate API parameters, invalid enums and out-of-range pages. The API is read-only and sends `Cache-Control: private, no-store`.

## My Work and Needs My Attention

One Tasker projection handles General, File Upload, Data Input, Inspect File, Initial Concept and Final Concept. It shows the actual title/type/status, Owner, executor, authoritative deadline, task relationship, minimal project identity, Sister marker and real `/tasks/[taskId]` link. Views distinguish Ready for me, Assigned to me, Owned by me and Completed. A completed runtime project makes remaining task context read only.

Owner completion requests appear in Needs My Attention. Director intervention is explicitly labeled; it does not relabel the Director as Task Owner. The latest request actor and executor are excluded from self-review. Project management is never substituted for a Tasker relationship. Task acceptance, target application, stage approval and final project completion remain separate services and events.

Implemented attention sources:

- Task Owner completion reviews and eligible Director task intervention.
- Director review of submitted, current workflow draft revisions with current submitter authority.
- JPM runtime creation requests eligible under the original creation validator, including a genuine JPM Owner and eligible SPM Co-owner.
- Runtime final-completion requests with current Owner authority, current document policy, native readiness and exact persisted evidence comparison.
- Active RuntimeProjects awaiting their first Director completion-document policy decision.
- Pending configured runtime-stage approval steps, with project permission, configured reviewer relationship, contributor separation, requester version, evidence revision/hash, predecessor and blocking-state checks.

The runtime decision service and attention projection share the extracted reviewer-eligibility function. The original creation validator is exported and reused without changing its checks. Decision execution stays in the existing services. No approve/reject action was added to the dashboard API.

Attention scans 12 candidates per selected category per page and filters eligibility before returning titles or links. A batch can contain no eligible items while later candidates remain; the UI says so and preserves Next. Stage evaluation reads bounded evidence metadata, never binary content or storage keys. A stage with more than 500 current submissions requires its existing workspace and suppresses the aggregate decision metric. Final-completion evidence is compared in PostgreSQL; completion-document snapshots are not returned to the dashboard.

JPMs also see their latest 12 own creation-request titles and persisted outcomes, with a link to the existing request screen. This informational list is separate from actionable approvals.

## Role and privacy evidence

| Actor | Dashboard behavior and tested boundary |
| --- | --- |
| Director | Global authorized full-project counts and project-family lists; current Director decisions; explicit task intervention. Resource-specific evidence remains in original workspaces. |
| Senior Project Manager | Owned/co-owned runtime projects and full native/flexible workspaces allowed by central predicates; own/executed tasks; own task reviews and a genuinely configured independent SPM stage approval. No Director-only policy, creation or final-completion decisions. |
| Junior Project Manager | Authorized workspaces/tasks and own creation-request status. Creation uses the existing request route. Direct creation and requests without an eligible SPM Co-owner deny. No Archive navigation or Director approval authority. |
| Designer | Only assigned/owned Tasker work and authorized native/flexible project references. Can own and review their own task. No full runtime workspace or project status counters. Unrelated tasks and project names are absent from the response. |
| Digital Lead | Same Tasker and limited project-context boundary; existing Archive navigation/capabilities remain under original policies. No new runtime Archive verification, sharing or project authority. |
| Technical-only administrator | Dashboard API returns 403 when enabled; home redirects to existing Settings. Technical privilege alone yields no business dashboard. |
| Anonymous, expired, revoked or wrong-version session | Dashboard read denied. Caller-supplied actor IDs are rejected input. |

The aggregate executes under the central `workspace.dashboard` authorization transaction. Task reads additionally use `task.list` and the same `taskAccess` predicate as existing Tasker services. Runtime scope uses `runtimeCreationScope`; native/flexible scope uses the central project read predicates. Archive/Library links use their existing visibility helpers and load no Archive/Library records.

The only eligibility extension is access to the dashboard workspace for Designer/Digital Lead when the new flag is enabled. With the flag disabled, the workspace policy and default-route/resolver checks retain their prior manager-only dashboard behavior. No task acceptance, stage progression, workflow publication or Archive permission was broadened.

## Routes and screenshots

All links resolve to existing routes: `/projects`, `/projects/[id]`, `/projects/flexible/[slug]`, `/projects/runtime`, `/projects/runtime/[id]`, `/projects/runtime/[id]?stage=[stageId]`, `/projects/runtime/[id]/completion`, `/projects/runtime/new`, `/projects/runtime/requests`, `/projects/approvals`, `/projects/workflow-drafts`, `/projects/workflow-approvals/[requestId]`, `/projects/published-workflows`, `/tasks/[taskId]`, `/archives` and `/library`.

Only `/api/dashboard` is new. It supports GET aggregation and no business mutations.

Chromium evidence is retained locally under [`.tmp/phase71/browser`](../../../.tmp/phase71/browser). Representative screenshots:

- [Director dashboard](../../../.tmp/phase71/browser/director-dashboard.png), [attention](../../../.tmp/phase71/browser/director-attention.png), [runtime projects](../../../.tmp/phase71/browser/director-projects.png).
- [SPM dashboard](../../../.tmp/phase71/browser/spm-dashboard.png), [configured SPM approval](../../../.tmp/phase71/browser/spm-configured-approval.png).
- [JPM dashboard](../../../.tmp/phase71/browser/jpm-dashboard.png), [governed creation](../../../.tmp/phase71/browser/jpm-governed-creation.png).
- [Designer dashboard](../../../.tmp/phase71/browser/designer-dashboard.png), [mobile](../../../.tmp/phase71/browser/designer-mobile.png), [tablet](../../../.tmp/phase71/browser/designer-tablet.png).
- [Digital Lead dashboard](../../../.tmp/phase71/browser/digital-dashboard.png), [empty dashboard](../../../.tmp/phase71/browser/empty-dashboard.png).
- [Technical Settings](../../../.tmp/phase71/browser/technical-settings.png), [original flag-off dashboard](../../../.tmp/phase71/browser/flag-off-original-dashboard.png).

The browser receipt lists every screenshot, check and denied endpoint: [result.json](../../../.tmp/phase71/browser/result.json). All business records and logins in these images are disposable synthetic fixtures.

## Validation results

| Check | Result |
| --- | --- |
| New dashboard service/API acceptance | PASS, **126 assertions** in disposable PostgreSQL. Covers empty state, all roles, technical/anonymous/session denials, exact accessible counts, all six Tasker types, Sister state, accepted concept/Data Input, separate task/stage/project completion, stale approval disappearance, independent configured SPM review, genuine project identities, pagination and forbidden fields. |
| Dashboard read-only behavior | PASS; dashboard reads did not change business events, approval decisions, runtime activities or Tasker entries; no fake-storage reads or external requests during aggregation. |
| Authorization/Archive/Library/native project read/write/governance/completion documents/file identity/events | PASS, existing combined disposable authorization runner. |
| Tasker/Stage Builder/publication/runtime | PASS. Published-workflow suite 402 assertions; runtime stages 503; runtime creation 49; General integration 463; deliverables 376; concepts/Sisters 483; runtime completion 340. Suite totals are separate receipts, not unique requirement counts. |
| Five standard templates | PASS, 3,803 integration assertions including both POSM variants; specification/source check also passes. All original definitions/hashes preserved. |
| Phase 6 folders/verification/sharing/runtime Archive | PASS; 50 verification, 64 sharing and 53 runtime-publication expected denials. Populated historical migration rehearsal, 500/501 review and 50/51 publication boundaries and empty drift all pass in disposable PostgreSQL. |
| Native tasks/project workflows | PASS: 66 native task assertions, 57 user-project assertions and three historical assignment-migration assertions. |
| Full TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false`. |
| Targeted ESLint | PASS with `--max-warnings 0` for all changed/new executable application and test files. |
| Isolated production build | PASS: `pnpm build --webpack` through `scripts/dashboard-v2-build.mjs`. Build-only unreachable database URL, no copied environment files; 680 application code/style source hashes match the tested checkout. |
| Chromium 153.0.8010.12 | PASS: **9 scenario groups, 32 screenshots, 12 expected denied/invalid responses, 0 unexpected HTTP responses, 0 page errors, 0 external requests**. Real password logins, persisted data, actual task/native/flexible/runtime/approval links, role-specific screens, empty state, stable pagination, mobile/tablet overflow, keyboard focus and flag-off restoration. |
| Additional passing checks | Authorization foundation/persistence, approval unit, Tasker unit, project-list workflow, navigation UI and standard-template specification/source. |

The production build retains the existing `keyv → got → ably` dynamic-dependency warning and exits successfully. Flag-off browser acceptance logs expected missing-native-workflow diagnostics for intentionally minimal synthetic native projects; it has no unexpected HTTP or JavaScript failures.

The sandbox initially prevented PostgreSQL shared memory. The requested isolated runners were approved through automatic escalation review. An initial browser setup also encountered local disk exhaustion; only obsolete temporary builds from this task were removed. Final acceptance completed after test-fixture/harness corrections. No real database or account was used to resolve these issues.

### Historical and baseline test failures

The three documented historical exceptions were reproduced and remain failures:

| Command | Failure |
| --- | --- |
| `phase0:check` | `project archive download per-project guard is missing.` |
| `flow:check` | Same obsolete per-project Archive assertion. |
| `project-create:v2-check` | `ADMIN-only co-owner candidates is missing.` |

Three additional optional legacy commands failed. Each was rerun against an untouched Git HEAD extracted into a separate temporary directory and failed identically:

| Command | Identical current/baseline failure |
| --- | --- |
| `projects:v2-check` | `completed delete guard is missing.` Source-string assertion on unchanged legacy code. |
| `dashboard:v2-check` | `Dashboard panel is missing: Flexible Projects`. Old panel-string assertion on the unchanged legacy dashboard component. |
| `projects:user-check` | Standalone compiled test cannot resolve `server-only`; its disposable authenticated integration counterpart passes 57 assertions. |

These six failures are not claimed as passes. No obsolete permission was restored and none of these historical tests was altered. Current authenticated integration and browser evidence provide the applicable authorization checks. Receipts: [static results](../../../.tmp/phase71/static-results.json), [untouched HEAD comparison](../../../.tmp/phase71/baseline-static-results.json).

## Migration, environment and preservation

No schema change or new migration was needed. All **117 migration SQL files** retain their original hashes, including `20261025010000_archive_folders/migration.sql`:

`f654a4101f805a93544d34e22efd73d914234f0690451d2bbab8b8d80627e5b9`

All 156 protected schema/migration/template/Archive-report/environment files checked against the initial manifest remain unchanged. The five Phase 5 candidate definitions and their hashes are unchanged. Existing Archive/Library authorization and Phase 6 services are unchanged. Git staging is unchanged; unrelated tracked files remain intact.

`.env`, `.env.local` and `.env.example` are unchanged. All fifteen pre-existing local V2 flags still read `1`; no `FLUX_DASHBOARD_V2` setting was added to environment files. Tests inject this flag only into isolated processes. No live activation was performed.

Neon's 117 successful migrations/159 public tables/PostgreSQL 18.6 remain the **reported Phase 6 baseline**, not a new live verification claim. This package made no Neon connection. PostgreSQL 14.19 was used for disposable integration/browser tests; historical migrations were applied only inside those throwaway clusters. No real S3 credentials, emails, notification delivery, external integration, push or deployment was used.

Preservation receipts: [manifest comparison](../../../.tmp/phase71/preservation.json), [flag check](../../../.tmp/phase71/flag-preservation.json).

## Exact file inventory

Modified existing files:

1. `package.json` — three isolated dashboard verification commands.
2. `src/app/(dashboard)/page.tsx` — default-off content switch, validated query handling, original fallback retained.
3. `src/lib/authorization/eligibility.ts` — dashboard eligibility for task-focused business roles.
4. `src/lib/authorization/workspace-policies.ts` — flag-gated resource permission preserving old behavior.
5. `src/lib/permissions/resolver.ts` — dashboard sidebar visibility behind the new flag.
6. `src/lib/permissions/fallback-route.ts` — role dashboard landing only when enabled.
7. `src/lib/approvals/runtime-stage.ts` — reuse the extracted, unchanged configured-reviewer predicate.
8. `src/lib/runtime-integration/creation.ts` — export/reuse the existing creation validator; validation behavior unchanged.

Created files:

1. `src/lib/dashboard-v2/activation.ts`
2. `src/lib/dashboard-v2/contracts.ts`
3. `src/lib/dashboard-v2/projects.ts`
4. `src/lib/dashboard-v2/attention.ts`
5. `src/lib/dashboard-v2/service.ts`
6. `src/lib/dashboard-v2/PHASE-7.1.md`
7. `src/lib/tasker/dashboard.ts`
8. `src/lib/stage-runtime/attention.ts`
9. `src/lib/approvals/runtime-stage-eligibility.ts`
10. `src/components/dashboard/role-dashboard.tsx`
11. `src/app/api/dashboard/route.ts`
12. `scripts/dashboard-v2-integration-check.ts`
13. `scripts/tsconfig.dashboard-v2.json`
14. `scripts/run-dashboard-isolated.mjs`
15. `scripts/dashboard-v2-build.mjs`
16. `scripts/dashboard-browser-check.mjs`

Ignored `.tmp/phase71` contains only local test logs, manifests, comparison results and screenshots. The latest isolated build is identified by `.tmp/phase71/build-path`; disposable databases and browser application copies are removed by their runners.

Reproduction commands, using only isolated processes:

```sh
pnpm dashboard:role-check
pnpm dashboard:role-build
FLUX_BROWSER_BUILD="$(cat .tmp/phase71/build-path)" pnpm dashboard:role-browser-check
```

The PostgreSQL/browser commands need permission to create local shared memory and loopback listeners. They accept no live database URL. The build command deliberately uses an unreachable build-only database.

## Known limits and next package

- Attention totals cover the implemented dashboard queues, not every native legacy approval/task engine. Native project governance, native completion-document reviews, runtime document-file reviews, legacy production approvals and native task execution remain in their original workspaces; this package provides existing navigation rather than duplicating those decision engines.
- Manager project summaries cover full authorized workspaces. Additional limited native/flexible relationships remain available through the existing Projects context views and authorized task references. Designer/Digital Lead dashboard references remain deliberately minimal.
- Existing sidebar badges retain their original native-project/Tasker semantics; they are not the combined dashboard portfolio metrics.
- Task deadlines are authoritative; no runtime project-wide due date, completion percentage, health score, calendar roll-up or reminder delivery is inferred. Runtime dates are labeled Created.
- Attention pagination is by candidate batch within each category, with stable tie-breakers. It does not promise a fixed number of eligible rows on every page. Unknown totals are omitted. Stage evidence beyond the stated bound needs workspace review.
- Dashboard eligibility reflects current persisted application evidence. Original decision/file services still recheck evidence, target state, actor/session validity and exact storage integrity at execution. No dashboard query checks live S3 bytes.
- Browser acceptance verifies the dashboard and navigation, not new file delivery behavior. Existing fake-storage Tasker/Archive suites cover file workflows. No production QA, live S3/IAM acceptance or live PostgreSQL 18 rehearsal was performed in this package.

Recommended next separately authorized Phase 7 package: a bounded, permission-aware search slice across the existing project families and Universal Tasker, preserving context-only projections and resource-specific deep-link authorization. Resolve the legacy test-harness/source-assertion drift as an explicit maintenance task. Calendar/reminder delivery and external integrations remain separate work.

**Stop after Phase 7.1. The new flag remains disabled; no activation, deployment or Phase 7.2 work is started.**

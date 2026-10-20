# FLUX V2 — Phase 1.5H completion audit

**Phase 1.5I update:** [BUSINESS-ADMINISTRATION.md](./BUSINESS-ADMINISTRATION.md)
supersedes this report's read-only administration limitation and recommended next
milestone. Existing-account business management, protected Director transfer and
separate technical privilege controls are now integrated with the audited V2
services. Onboarding and the other explicitly deferred workflows remain separate.
The remainder of this document preserves H's implementation/verification record.

Reviewed against HEAD `7827c86` (Phase 1.5G), 2026-10-18. This report supersedes earlier reports' historical statements about remaining legacy navigation/account permissions. RUNTIME, PROJECT-READ, PROJECT-WRITE, PROJECT-GOVERNANCE, COMPLETION-DOCUMENTS, ARCHIVES, LIBRARY and LEGACY-ENTRY-POINTS were checked against their implementations.

## Result

Phase 1.5H's scoped navigation and authorization integration is implemented and locally verified. No database migration is required. Full Phase 1 product functionality is **not** declared complete: account administration has an intentionally read-only UI, and the explicit deferred workflows below remain unavailable.

No Neon connection or mutation was performed. The reported development baseline remains 105 migrations and nine V2 assignments; this milestone did not independently re-query that live baseline. All database writes used new private PostgreSQL clusters and disposable fixtures. Existing user passwords/assignments, projects, approvals, Archives/Library records, live S3, migration history and production configuration were untouched. No emails, push or deployment occurred.

## Effective navigation

| Role | Landing and menus | Enforced limits |
| --- | --- | --- |
| Director | Management Dashboard, Projects/New Project, Project Approvals, Tasks, Archives, Library, Business Users, contact directories, Calendar, Notifications, Settings and Help | Global business authority; no technical diagnostics, account recovery, secrets or impersonation grant. Directory is read-only. |
| SPM | Management Dashboard, Projects, creation/governance requests, Tasks, global Archives/category management, scoped Library, Calendar and Notifications | Creation requires approved preset; project writes/completion requests remain scoped; final completion remains Director-only. |
| JPM | Management Dashboard, Projects, creation requests/approvals, Tasks, scoped Library, personal Calendar and Notifications | Director creation approval plus SPM Co-owner; no Archive/Archive AI access or legacy admin editor. |
| Designer | Tasks, granted Archives/Archive search, authorized Library task files, personal Calendar, Notifications, Settings and Help | No management dashboard/sidebar, approvals, admin, category management or generic stage controls. Direct permitted project URLs retain restricted task context. |
| Digital Lead | Designer navigation plus Archive Categories | Existing category permissions only; no deletion, ACL escalation, ungranted files or Archive verification UI. |
| Technical-only | Settings and Help | No business menus, project counts, approvals, Archives, Library, calendar or notification access. No technical console is invented. |

All business roles have Tasks. These are the existing concept tasks, not the future six-type Universal Tasker. Task lists/counts also reject inconsistent concept-folder/stage project associations. Current notification content remains limited to authorized full-project context; task-focused accounts do not receive generic stage/project details through notifications.

Sidebar flags, login/root redirects and settings role labels use the trusted V2 identity. Both technical privileges and business roles can be displayed independently. Legacy ADMIN/SUPER_ADMIN/USER values and ALL/FULL permission snapshots confer no runtime grants.

## Security fixes and administration

- Replaced remaining legacy compatibility permission fallback with explicit V2 projections. Added workspace capabilities to the existing central evaluator, rather than a second policy engine.
- Dashboard reads, global contact-directory operations, business-user directory reads, project master-data actions and calendar operations authenticate the current session. Mutations run with assignment/session protection and propagated transactions. Stale or mismatched actor objects cannot choose attribution.
- Calendar events/reminders are personal. Only Director can create/read shared Projects/Payments entries. Director cannot read/delete someone else's private events. Historical calendar-collaborator rows no longer grant authority; participant sharing is closed pending a defined resource policy. The UI offers only permitted calendar types.
- Removed executable legacy user/role/profile editors, global invitations and collaborator account mutations. Closed their server actions and managed-user avatar APIs. Legacy invitation tokens cannot activate/reset an assigned account's password. Stored invitation/account data was not changed.
- Director's `/users` page selects name, email, business role and account status only. It exposes no password hashes, invite tokens, technical grants or editable legacy profiles. Existing V2 assignment/transfer services remain authoritative, with real actor audit attribution, version invalidation, immutable history and the single-Director invariant. No new assignment shortcut or unaudited UI was added.
- Removed shared-tab sessionStorage caches for notification bodies and project counts; one account's cached values cannot render for another. Technical-only layouts do not poll or subscribe to business notifications.
- Search-history services now bind reads, writes and deletion to the current Archive-authorized user, including direct service calls. AI chat tools require authorized project context; a context-free call is denied.
- Project collaborator candidate reads require a current manager and an authorized project, or Director directory authority. Candidate/visibility checks use active V2 assignments, independent of legacy labels. Shared-folder routes no longer reject valid V2 readers solely because of a legacy role label.
- Project realtime token issuers now fail closed at the underlying service as well as the API. Notification tokens require current V2 business identity, target only that user's subscribe-only channel and carry invalidation signals, not project/document content. Existing broker tokens have their existing ten-minute lifetime; every subsequent data fetch rechecks authorization. Live broker delivery was not exercised.
- Updated Help to explain the implemented V2 boundaries instead of the retired permission editors.

Personal profile/password settings retain their existing self-service behavior; no account recovery, cross-user password editing or session-management UI was introduced.

## Test harness corrections

`user-role:foundation-check` now tests every V2 role under all three legacy labels, forged/serialized ALL/FULL profiles, technical isolation, guarded creation flags and landings. Historical enum/migration compatibility guards remain. Obsolete assertions that any signed-in user gets Archives or that a legacy creation flag grants authority were replaced by denial assertions.

`flux-ai:archive-search-integration-check` now invokes the controlled isolated PostgreSQL runner. It neither reads `.env` nor discovers real users/records. It loads the isolated generated Prisma client after installing the test module boundary, avoiding the old `server-only` failure and a mixed-client dependency-resolution failure found during migration. Retained exact/case/partial/natural-language ranking, seven field queries, 43 metadata/date/size checks, combined filters, four phrase regressions, existence/URL checks and mutation-prompt non-mutation assertions. Added V2 restricted/global scope, per-user history deletion, cross-user denial and history limits. Only disposable Node test output contains the server-only marker shim.

`navigation:ui-check` previously imported TypeScript directly under Node 22.12 and failed before assertions. It now compiles the helper first and checks the current Private Projects labels. Archive/Library browser harnesses now expect V2 role-specific fallback routes.

## Verification

| Check | Result |
| --- | --- |
| Full `pnpm exec tsc --noEmit --incremental false` | PASS |
| Targeted ESLint for all changed/new TS/TSX/MJS files | PASS; zero errors/warnings |
| `pnpm build` | PASS: bundling, TypeScript and page generation |
| Authorization foundation and persistence unit checks | PASS |
| Assignment services, concurrency, audit invariants, one Director | PASS |
| Runtime authentication, real login, role/privilege/status/session invalidation | PASS |
| Project read and write integrations | PASS |
| Project creation/final-completion governance | PASS |
| Completion-document integration | PASS |
| Archives and Library authorization integrations | PASS |
| New workspace/navigation/direct-API suite | PASS |
| Legacy role checker migrated to V2 | PASS |
| Archive query parser/finder and migrated search integration | PASS |
| Deterministic navigation and notification/submission realtime source checks | PASS |
| Isolated browser matrix | PASS: all five business roles plus technical-only |

The production build was run with environment-file key names explicitly blanked and unreachable loopback database URLs. `build` runs `prisma generate && next build`; it does not migrate. `vercel-build` does run migration deployment and was not used.

Isolated integration databases apply all 105 repository migrations, verify the existing schema/constraints and produce empty Prisma schema diffs. PostgreSQL in this local harness is **14.19**, not the development server's reported **18.6**; no remote PostgreSQL 18.6 run is claimed. Nine-account preservation was asserted where applicable, including passwords/legacy labels/business assignments and retained audit records. Native lifecycle, document and file permission regressions remain enforced.

Browser: Chromium **153.0.8010.12**, genuine password login and versioned sessions, copied production build with no environment files, private PostgreSQL and blocked external networking. Verified management landings for Director/SPM/JPM, creation/approval pages, Director's nine-row read-only directory, Designer/Digital Lead task landings, technical Settings-only navigation, direct URL/API denials, Digital Lead category page, Designer category denial, personal Calendar filters and ignored foreign notification/count cache sentinels. **13 screenshots**, **zero JavaScript errors**, **zero external requests**, **zero storage operations**. Browser fixtures create no additional projects after setup and preserve the one initial synthetic project. No live browser session or live business record was used.

Evidence logs/artifacts are local under `/private/tmp/flux-phase15h-*`: `build.log`, `types.log`, `lint.log`, `regressions.log`, `final-workspace-search.log`, individual command logs and `browser-artifacts/result.json` plus screenshots. These are verification artifacts, not repository deployment assets.

## Definitive Phase 1 status

| Status | Scope | Remaining condition |
| --- | --- | --- |
| Fully implemented and verified | V2 persisted roles/invariants, audited assignment services, runtime/session boundaries; Phase 1.5A–G current authorization flows; Phase 1.5H navigation, service/API separation and existing concept Tasks | Verified locally against disposable databases and browser sessions. |
| Implemented but pending activation | No new H database activation | No migration. Live H operator acceptance/restart has not been performed; no deployment requested. Existing D/E activation is the user-reported baseline. |
| Partially implemented | Business user administration | Director directory implemented; role/status assignment, Director transfer and technical-grant UI must integrate existing versioned/audited services with genuine sessions and precise domain separation. Current mutations stay denied. |
| Explicitly deferred | Technical support/recovery/diagnostics UI; legacy invitations/onboarding; calendar sharing; Project Tracker; project realtime subscriptions | Require explicit capability/resource policies and, for realtime, revocation-safe delivery. Current unsafe entry points stay denied. |
| Explicitly deferred | Archive verification; Library sharing and broader manager management permissions; template publication/new project templates; Custom Stage Builder; six-type Universal Tasker | Existing eligibility is not an activation. Preserve approved Archive scope and restrictive Library scope until separately approved implementation. |
| Failing or blocked | None in the required current H verification | Full product sign-off remains conditional on the stated partial/deferred scope; no claim that future domains are complete. |

No unresolved failing test or demonstrated authorization bypass remains in the verified H scope. This is a bounded security-integration sign-off, not certification of every future or legacy repository feature. Static realtime checks verify retained integration wiring; project subscriptions remain intentionally disabled, and live external-service operation is outside this run.

Recommended next milestone: a dedicated V2 account-administration UI using the existing audited assignment services, with session invalidation and Director/technical-domain separation tested end to end. Agree that scope before starting; then proceed to the separately planned Tasker/template milestones. Neither that milestone nor Phase 2 was started.

## Exact change manifest

11 files created; 49 modified. No schema or migration files changed.

Created:

- `scripts/tsconfig.dashboard-navigation.json`
- `scripts/tsconfig.workspace.json`
- `scripts/workspace-authorization-integration-check.ts`
- `scripts/workspace-browser-check.mjs`
- `scripts/workspace-test-fixture.ts`
- `src/lib/authorization/PHASE-1-COMPLETION.md`
- `src/lib/authorization/business-users.ts`
- `src/lib/authorization/deferred-administration.ts`
- `src/lib/authorization/workspace-policies.ts`
- `src/lib/authorization/workspace-transaction.ts`
- `src/lib/authorization/workspace.ts`

Modified:

- `package.json`
- `scripts/archives-browser-check.mjs`
- `scripts/authorization-project-read-integration-check.ts`
- `scripts/dashboard-navigation-checks.mjs`
- `scripts/flux-ai-archive-search-integration-check.ts`
- `scripts/library-browser-check.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/user-role-foundation-check.ts`
- `src/app/(dashboard)/calendar/page.tsx`
- `src/app/(dashboard)/collaboration/page.tsx`
- `src/app/(dashboard)/help/page.tsx`
- `src/app/(dashboard)/projects/[slug]/workspace/shared/[folderId]/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/settings/permissions/page.tsx`
- `src/app/(dashboard)/settings/project-master-data/actions.ts`
- `src/app/(dashboard)/users/actions.ts`
- `src/app/(dashboard)/users/page.tsx`
- `src/app/api/projects/[projectId]/collaborators/available/route.ts`
- `src/app/api/projects/dashboard-count/route.ts`
- `src/app/api/users/[userId]/avatar/route.ts`
- `src/app/api/users/[userId]/avatar/upload-url/route.ts`
- `src/app/sign-in/actions.ts`
- `src/components/calendar/calendar-workspace.tsx`
- `src/components/calendar/event-dialog.tsx`
- `src/components/layout/dashboard-app-frame.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/notifications/notification-center.tsx`
- `src/lib/ai/access.ts`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/project-transaction.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/calendar.ts`
- `src/lib/collaboration.ts`
- `src/lib/contact-directory.ts`
- `src/lib/dashboard.ts`
- `src/lib/flux-ai-search-history.ts`
- `src/lib/permissions/fallback-route.ts`
- `src/lib/permissions/profiles.ts`
- `src/lib/permissions/resolver.ts`
- `src/lib/prisma.ts`
- `src/lib/project-master-data.ts`
- `src/lib/project-owner-candidates.ts`
- `src/lib/projects.ts`
- `src/lib/realtime/ably-server.ts`
- `src/lib/user-permissions.ts`
- `src/lib/user-tasks.ts`

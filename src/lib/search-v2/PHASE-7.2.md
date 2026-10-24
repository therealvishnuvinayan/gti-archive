# FLUX V2 Phase 7.2 implementation and acceptance report

24 October 2026, Asia/Dubai.

Phase 7.2 adds unified project and Universal Task search at `/search`, with a read-only `/api/search` endpoint. `FLUX_SEARCH_V2` defaults OFF and remains unset locally. `FLUX_DASHBOARD_V2` remains independently disabled. No migration, Neon connection, live S3 operation, real account change, notification, push or deployment was performed.

The recorded development baseline remains 117 migrations and 159 public tables on Neon PostgreSQL 18.6. Those figures are historical Phase 6 evidence, not a new live verification. Acceptance below uses disposable PostgreSQL and synthetic accounts.

## Existing searches and policies reviewed

- Native `getProjectsList`, `buildProjectsWhere`, `ProjectsBrowser` and `/projects`: existing filters, relationship scopes, pagination and restricted identity-only matching remain unchanged.
- Flexible `getFlexibleProjectsList` and the existing Projects flexible view: full-project summaries include data beyond the new search projection, so the unified endpoint reuses the central predicates with a smaller, bounded select.
- Runtime project list/read policies and `runtimeCreationScope`: genuine RuntimeProject IDs and current Owner/Co-owner authority, including historical completed projects only while runtime integration is enabled.
- Universal Tasker `listTasks`, `taskAccess`, resource policies and family privacy: project management never substitutes for a Tasker relationship. Existing Tasker search can match briefs; unified search intentionally matches titles only.
- Phase 7.1 `service.ts`, `projects.ts` and `tasker/dashboard.ts`: reuse of the authenticated aggregate pattern and `dashboardTaskScope`, without changing dashboard projections or counts.
- Existing shell, sidebar, topbar, back-navigation, current-session resolution and default routes: no existing cross-project/Tasker search entry point was present.
- Archive query parsing/ranking, protected Archive search, Library filtering and their authorization policies: those services remain separate. No Archive or Library record is selected by unified search.
- Phase 6 activation report and Phase 5 candidate status: approved executable workflows are not presented as official GTI standards.

## Search behavior and source identities

A blank query displays instructions without browsing records. A nonblank query matches literal, case-insensitive project names and existing identifiers, or actual task titles. Native and runtime identifiers are IDs; flexible identifiers include IDs and slugs. `%`, `_` and backslash are escaped before Prisma `contains` matching. No SQL expression, user regex, fuzzy score or arbitrary sort is accepted.

| Source | Returned identity and destination | Metadata boundary |
| --- | --- | --- |
| Native Project | Actual ID, `/projects/[id]` | Authorized name; full readers also receive persisted lifecycle/category and bounded Owner/Co-owner context. |
| FlexibleProject | Actual ID, `/projects/flexible/[slug]` | Authorized name; full readers also receive persisted status, scope and Owner. |
| RuntimeProject | Actual runtime ID, `/projects/runtime/[id]` | Full runtime readers only; title, state, intended project type and bounded Owner/Co-owner context. No fabricated native Project. |
| UniversalTask | Actual task ID, `/tasks/[taskId]` | Title, type, persisted status, Dubai-formatted deadline and actual actor relationships. No project stages, private brief, messages, evidence, files or inspiration data. |

All six task types are supported: General, File Upload, Data Input, Inspect File, Initial Concept and Final Concept. A Director without a task relationship is labeled **Director oversight**; actual Task Owner, Executor and Spectator relationships are retained independently.

A Sister Task keeps its own identity and a Sister marker. Source/root links appear only when each relative independently satisfies the same enabled-type, relationship and non-deleted predicates. A hidden relative's ID, title, family traversal key and sibling count are omitted. Search never expands into other Sisters automatically.

Native completion comes from project-level completion/closure or an explicit completed status group. Stage completion does not imply project completion. Missing native status is labeled “Status not set”; there are no inferred progress percentages or urgency/approval/official-template badges.

## Authorization and privacy

`workspace.search` is registered in the existing central V2 policy system and requires the new flag, the root workspace target and a current authenticated business identity. It grants entry to search, not authority over search sources. Technical privilege alone is insufficient.

The service uses the live versioned session inside a RepeatableRead authorization transaction. It checks session expiry again before returning. Native/flexible identity matching uses the existing context predicates; an additional full-reader predicate controls enrichment of only the visible page. This also preserves context-only assignments held by managers on projects they do not manage. Runtime queries use `runtimeCreationScope`. Task queries additionally authorize `task.list` and reuse `dashboardTaskScope`/`taskAccess`.

| Actor | Visibility |
| --- | --- |
| Director | Permitted global project oversight and task discovery, with actual task relationships distinguished from oversight. |
| SPM / JPM | Full projects allowed by current Owner/Co-owner or applicable flexible relationships, plus existing limited native/flexible context assignments. Only owned, executed or spectated tasks. Existing JPM creation governance is unchanged. |
| Designer / Digital Lead | Existing native/flexible name-and-identity references and eligible tasks. Project status, Owner/Co-owner rosters and runtime project results are absent. Archive category rights add no project access. |
| Technical-only / anonymous / expired / revoked | Service and API deny business search. Technical-only page navigation returns to Settings; anonymous page access uses existing sign-in behavior. |

No caller-supplied actor, resource grant, offset size, sort expression or source override is accepted. Unknown/duplicate parameters, invalid enum values, control characters and out-of-range pages are rejected. Filter options derive from role and feature support, never from hidden records. There are no total counts, autocomplete, hidden-source summaries or additional data sources.

Task relationship removal, native executor removal, flexible responsibility removal, account suspension and session revocation remove subsequent search visibility. Reactivation cannot revive an old session version. Every destination retains its existing authorization. URLs are navigation hints, not access grants.

## Pagination and database work

Each selected source returns at most eight results, plus one internal lookahead row; All can show at most 32 rows across the four sections. Pagination advances each source's own ordered batch. Project sources sort by name/title and ID; tasks sort by title and ID. Page numbers are bounded to 0–99, so each source skips at most 792 rows. A new submitted search resets the page to zero while preserving selected filters. At the final supported page, further matches produce a request to refine the query.

Only authorized lookahead records determine Next. No global or estimated totals are computed. Native/flexible metadata enrichment is limited to the eight displayed identities. Co-owner projections are capped at 30 displayed names with an explicit “More in workspace” indicator. Sister lineage reads at most 16 selected IDs and returns only authorized relatives.

PostgreSQL enforces a three-second per-statement timeout and the transaction has a 15-second timeout. Actual Prisma-generated SELECTs were replayed using `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against disposable representative fixtures. Plans and fixture sizes are recorded with the acceptance receipts. Existing indexes were sufficient for these fixtures; no new index or migration is proposed. Substring search can require scans; these development measurements are not a production-volume benchmark.

Offset pages are deterministic for unchanged records. Concurrent insertions, renames or revocations may move results between requests; each request rechecks access. No cross-request snapshot or signed cursor is claimed.

## Interface and navigation

The existing FLUX sidebar exposes Search only when the feature is enabled and the current actor has a business role. The page uses the existing shell, green controls and result sections. It provides a labeled search input, Projects/Tasks/All selection, permitted project families, enabled task types, blank/no-match states, pending/loading feedback and Previous/Next/First page controls. Family filters apply to project sections; task type applies to the task section.

Terms, filters and page number remain in the URL. Result links carry a validated internal return target. The topbar's Back to Search restores that target from native, flexible, runtime and task workspaces; external and invalid return targets retain the previous navigation fallback. New submissions and pagination preserve browser history and move focus to the results heading. Mobile/tablet controls and maximum-length queries are checked in Chromium.

Both flags are independent. Disabled search exposes no sidebar link and its API returns 404. Dashboard behavior and Designer/Digital Lead landing routes remain controlled solely by the dashboard flag. Search adds no dashboard counters.

## File inventory

Created application files:

- `src/lib/search-v2/activation.ts`
- `src/lib/search-v2/contracts.ts`
- `src/lib/search-v2/projects.ts`
- `src/lib/search-v2/tasks.ts`
- `src/lib/search-v2/service.ts`
- `src/lib/search-v2/PHASE-7.2.md`
- `src/components/search/search-workspace.tsx`
- `src/app/(dashboard)/search/page.tsx`
- `src/app/(dashboard)/search/loading.tsx`
- `src/app/api/search/route.ts`

Created test files:

- `scripts/search-v2-integration-check.ts`
- `scripts/search-browser-check.mjs`
- `scripts/tsconfig.search-v2.json`

Modified files:

- `src/lib/authorization/definitions.ts`: central search capability.
- `src/lib/authorization/eligibility.ts`: business-role entry eligibility.
- `src/lib/authorization/workspace-policies.ts`: feature-gated workspace policy.
- `src/lib/permissions/resolver.ts`: authenticated sidebar visibility.
- `src/components/layout/sidebar.tsx`: conditional Search link.
- `src/lib/dashboard-navigation.ts`: validated Search return target.
- `scripts/dashboard-v2-integration-check.ts`: optional search acceptance hook after existing genuine fixtures and query capture.
- `scripts/run-dashboard-isolated.mjs`: optional `--search` mode; existing dashboard mode remains available.
- `scripts/dashboard-v2-build.mjs`: optional isolated search build and artifact directory.
- `package.json`: three search verification commands.

Total: **13 created and 10 modified files**. Ignored local logs, query plans, screenshots and preservation receipts are under `.tmp/phase72/`.

## Preservation

All 117 existing migration SQL files, all Phase 5 template files and Archive/Library implementation files remain unchanged. The preservation receipt checks 173 protected files, all three environment files, Git HEAD/staging and 689 application code/style files against the final isolated build. No migration was added or applied to an existing database. Test runners replay migrations only in newly created disposable clusters.

The fifteen previously enabled local flags retain their exact bytes. Neither new dashboard nor search flag was activated. The recorded Neon baseline was not contacted or reverified. No real password, role, business record or S3 object was touched. No gates, scheduling, reminders, procurement integrations, notifications or later-phase work was added.

Five canonical candidate definition hashes remain:

| Candidate | SHA-256 |
| --- | --- |
| Packaging Artwork | `1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7` |
| POSM Promotional Materials | `2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc` |
| Retail Display | `dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694` |
| Exhibition Stand | `88266d16c856d7c3c9c20f7fbd5339242395443b73e9bfda11fecfb9807dbec1` |
| Digital | `f11f5a5e839b682685a771076b41a88a1e4f126ea327276ab76c56848986643c` |

## Acceptance results

| Check | Final result |
| --- | --- |
| Search service/API | **PASS: 243 assertions**, 21 expected denied/invalid responses and one deliberately injected database failure, returned as sanitized HTTP 500. All six types, genuine Sister lineage, Owner/executor/spectator differences, Director oversight, private-task isolation, all project identities, hidden-result invariance, stable pagination, session/account/resource revocation and invalid parameters are covered. |
| Existing dashboard acceptance | **PASS: 126 assertions**, reused before the search suite. All four dashboard/search flag combinations also pass in search service and browser acceptance. |
| Read-only search | PASS: business events, approval decisions, runtime activities and task entries unchanged during reads; zero storage reads and zero external requests during search. |
| Query plans | **17 actual Prisma SELECT plans** against 2,004 native, 501 flexible and 17 runtime projects plus 46 Universal Tasks. Final execution times **0.001–0.452 ms**, median **0.067 ms**; at most nine rows returned by any plan. These are disposable fixture measurements, excluding transaction/API overhead. |
| Authorization regressions | PASS: complete disposable runner covering current assignments/sessions, Archives, Library, project read/write/governance, completion documents, runtime adapter, shared file identity and events, with empty schema drift. |
| Tasker/publication/runtime regressions | PASS: existing six-type Tasker and Sister suites; workflow publication **414 assertions**, runtime stages **503**, runtime disabled-schema compatibility **17**, runtime creation **49**, General integration **463**, deliverables **376**, concepts/Sisters **483**, final completion **340**. Counts are individual suite receipts. |
| Standard templates | PASS: **3,803 assertions**, all five candidates and both POSM variants; specification check and unchanged canonical hashes. |
| Native tasks/projects | PASS: **66** task assertions, **57** user-project assertions and **3** historical assignment-migration assertions. |
| TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false`. |
| ESLint | PASS: all created/modified executable application and test files, `--max-warnings 0`. |
| Isolated production build | PASS: `pnpm build --webpack`, no environment files copied, all flags injected only into the isolated process, unreachable build-only database URL, 689 code/style hashes equal the final checkout. |
| Chromium 153.0.8010.12 | **PASS: 7 scenario groups, 23 screenshots, 16 expected denied responses, 0 unexpected HTTP responses, 0 page errors, 0 external requests**. Real synthetic password sign-ins, populated search, working destinations, return navigation, private/empty/invalid searches, six types, hidden Sister parent, mobile/tablet/max-length input, keyboard focus and four feature combinations. |
| Additional static checks | Navigation UI, native project workflow list and standard-template specification pass. |

The production build retains the existing `keyv → got → ably` dynamic-dependency warning and exits successfully. Isolated PostgreSQL runs required automatic sandbox escalation for shared memory; all clusters, sessions and application processes were removed by the runners. No live credential fallback was used. The broader regressions ran once successfully; targeted search/browser checks were repeated after fixture corrections and the maximum-length mobile input check.

The six known static failures were reproduced and remain **FAIL**:

| Command | Recorded failure |
| --- | --- |
| `phase0:check` | `project archive download per-project guard is missing.` |
| `flow:check` | Same obsolete per-project Archive assertion. |
| `project-create:v2-check` | `ADMIN-only co-owner candidates is missing.` |
| `projects:v2-check` | `completed delete guard is missing.` |
| `dashboard:v2-check` | `Dashboard panel is missing: Flexible Projects`. |
| `projects:user-check` | Standalone compiled runner cannot resolve `server-only`. The authenticated disposable user-project suite passes 57 assertions. |

None of these six tests or the valid V2 permissions they inspect was weakened. No new application regression was found in the completed checks.

## Screenshots and reproducible evidence

Representative screenshots:

- [Director populated search](../../../.tmp/phase72/browser/director-search.png)
- [SPM search](../../../.tmp/phase72/browser/spm-search.png), [JPM search](../../../.tmp/phase72/browser/jpm-search.png)
- [Designer search](../../../.tmp/phase72/browser/designer-search.png), [Digital Lead search](../../../.tmp/phase72/browser/digital-search.png)
- [Native destination](../../../.tmp/phase72/browser/native-destination.png), [flexible destination](../../../.tmp/phase72/browser/flexible-destination.png), [runtime destination](../../../.tmp/phase72/browser/runtime-destination.png), [task destination](../../../.tmp/phase72/browser/task-destination.png)
- [Sister with hidden parent](../../../.tmp/phase72/browser/sister-with-private-parent.png), [second task page](../../../.tmp/phase72/browser/tasks-page-two.png)
- [Hidden-record empty state](../../../.tmp/phase72/browser/hidden-record-empty-state.png), [invalid search](../../../.tmp/phase72/browser/invalid-search.png), [technical-only denial](../../../.tmp/phase72/browser/technical-denial.png)
- [Mobile](../../../.tmp/phase72/browser/designer-mobile.png), [tablet](../../../.tmp/phase72/browser/designer-tablet.png), [120-character mobile query](../../../.tmp/phase72/browser/mobile-long-search.png)
- [Both flags off](../../../.tmp/phase72/browser/flags-dashboard-0-search-0.png), [dashboard only](../../../.tmp/phase72/browser/flags-dashboard-1-search-0.png), [search only](../../../.tmp/phase72/browser/flags-dashboard-0-search-1.png), [both enabled in tests](../../../.tmp/phase72/browser/flags-dashboard-1-search-1.png)

Exact receipts: [service](../../../.tmp/phase72/service-result.json), [browser](../../../.tmp/phase72/browser/result.json), [query plans](../../../.tmp/phase72/query-plans.json), [preservation](../../../.tmp/phase72/preservation.json), [static results](../../../.tmp/phase72/static-results.json). Logs: `browser.log`, `authorization.log`, `tasker.log`, `native-projects.log`, `typecheck.log`, `lint.log` and `build.log` in `.tmp/phase72/`.

```sh
pnpm search:v2-check
pnpm search:v2-build
FLUX_BROWSER_BUILD="$(cat .tmp/phase72/build-path)" pnpm search:v2-browser-check
node scripts/run-authorization-isolated-integration.mjs --archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events
node scripts/run-universal-tasker-isolated.mjs --stage-runtime --runtime-integration --standard-templates
node scripts/run-tasks-isolated-integration.mjs
pnpm exec tsc --noEmit --incremental false
```

The isolated runner accepts no external database URL, creates a private socket-only cluster, replays migrations there, uses genuine persisted service workflows and fake storage, then removes its database and browser application. The browser harness uses the existing local Playwright installation, overridable through `FLUX_PLAYWRIGHT_PACKAGE`. Build and screenshot artifacts remain local and are not deployed assets.

## Limitations and Phase 7.3 recommendation

Search deliberately excludes Archive/Library records, task content, descriptions, files, semantic/fuzzy ranking, completion percentages and cross-source counts. Grouped offset pagination has the concurrent-change behavior described above. Search availability is time-bounded and may return a generic retry message on larger workloads; production-volume query plans remain a separate measurement before considering indexes.

Phase 7.3 should begin only from its approved scope. Reuse this search entry point and central read predicates wherever that package needs discovery or workspace return navigation. Keep activation decisions for Phases 7.1 and 7.2 separate, and handle the six obsolete static checks in the later maintenance package described in the brief. No Phase 7.3 implementation or activation is included here.

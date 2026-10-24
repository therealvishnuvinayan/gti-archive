# FLUX V2 Phase 7.3 implementation and acceptance report

24 October 2026, Asia/Dubai.

Phase 7.3 implements a permission-aware **Task Calendar** at the existing `/calendar` route, with a read-only `/api/calendar` projection. It displays actual Universal Tasker deadlines in month, week and agenda views. `FLUX_CALENDAR_V2` defaults OFF and remains unset. Dashboard and Search flags remain independently OFF. No migration, live activation, Neon connection, real account change, live S3 operation, push or deployment occurred.

The recorded development baseline of 117 migrations, 159 public tables, PostgreSQL 18.6 and zero recorded drift is historical Phase 6 evidence. This phase does not claim a fresh Neon verification. All mutation fixtures described below belong to disposable PostgreSQL.

## Persisted date sources reviewed

| Existing source | Actual meaning | Calendar treatment |
| --- | --- | --- |
| `UniversalTask.deadline` | Required `TIMESTAMP(3) NOT NULL`, exposed as Prisma DateTime. Tasker accepts only an ISO timestamp with an explicit zone/offset; its form uses `datetime-local` converted to an ISO instant. | The only source of calendar entries in Phase 7.3. All six types share this contract. |
| Native `Project.startDate/endDate`, `ProjectStage.plannedStartAt/plannedDueAt` | Optional planning fields with native project/stage authorization. | Kept in their existing workspaces, outside this task projection. No inferred project or stage deadline. |
| Native `ProjectInquiry.deadline`, `ProductionSampleRound.deadline` | Existing SQL DATE fields for distinct native business records. | Not merged into Task Calendar or converted into invented timed entries. |
| `FlexibleProject.deadline`, `FlexibleMilestone.deadline` | Optional DateTime fields written by a date-only parser as UTC midnight. Full-project and assigned milestone permissions differ. | Genuine separate dates, but no unified project scheduling adapter is claimed or added. |
| `RuntimeProject`, `RuntimeStage` | Creation/activity/completion timestamps; RuntimeProject has no due-date field. Configured scalar fields and organiser dates do not establish a scheduling contract. | No calendar entry derived from creation, completion, approval or arbitrary field text. |
| Legacy `CalendarEvent.startAt/endAt` | Manually recorded Projects, Events, Reminders and Payments, with separate legacy workspace policies. | Existing data/services remain unchanged. The reused Calendar route now presents Task Calendar; it does not read, create, delete or deliver these manual records. |

Reviewed implementation includes Tasker deadline parsing, creation/editing/list/read policies, Phase 7.1 My Work, Phase 7.2 search/return navigation, current versioned sessions, existing calendar components and date helpers, native/flexible/runtime read models and the Phase 6 activation report.

The existing month grid and calendar service use browser/server local dates. The new small date utility uses civil date keys and explicit IANA formatting so server and browser locale cannot move deadline cells. No scheduling dependency was added.

Phase 5.4 blockers **GTI-B29** (schedules/milestones), **GTI-B30** (starter tasks/reminders), **GTI-B44** (leave/deputies) and decision **GTI-D15** remain open. This display does not resolve their business policies or close those blockers.

## Views and interaction

- **Month:** Monday–Sunday grid covering complete weeks, at most 42 days. Each day shows at most three authorized tasks, with actual due time, title, type, status and relationship. “More deadlines” appears only when an additional authorized row exists and opens that day's agenda.
- **Week:** Seven days starting Monday, with at most eight authorized tasks per day and the same safe overflow link. Days stack on small screens and form columns on desktop.
- **Agenda:** Chronological selected-month or selected-day list, at most 30 rows per page. Next page uses a deadline-and-ID cursor; First page clears it. No fabricated total or global date count is displayed.

Date navigation provides previous/next month, week or day, Today, an explicit date input and month/week/agenda selection. Filters include Assigned to me, Owned by me, Other permitted tasks, All permitted tasks, enabled task type and stored status. Applying filters resets pagination. Date, view, filters and cursor are represented in the URL and survive refresh.

Other permitted tasks excludes tasks the actor owns or executes, then applies the existing read scope. For non-Directors this means eligible spectator tasks. For Directors it can include genuine oversight. A spectator is never labeled executor, and oversight is never labeled ownership.

Entries link to the real `/tasks/[taskId]` workspace, carrying a validated internal return URL. Back to Calendar restores date, view, filters and agenda cursor. Destination authorization remains unchanged. Deadline editing remains in the existing Tasker workspace; Calendar has no mutation API, creation form, drag rescheduling or alternate edit operation.

The existing FLUX sidebar entry is now gated by the Calendar flag and current business authorization. With the flag OFF, the sidebar hides Calendar, `/api/calendar` returns 404, and `/calendar` calls the established `notFound()` behavior without rendering Calendar data. Next.js may stream that not-found page with HTTP 200; browser acceptance checks the actual not-found content and absence of Calendar rather than requiring a 404 transport status. This explicitly replaces the prior unconditional Calendar navigation, as requested. The legacy manual-event implementation and stored records are retained, without a second competing calendar route.

Month grids scroll within a labeled, keyboard-focusable region on narrow screens. Agenda provides a mobile list and week uses stacked cards. Controls have visible focus states; filter/view/page navigation focuses the period heading. Initial loading, pending filters, empty views, invalid input and generic failure states are provided. Tasker being disabled produces an unavailable state without querying tasks.

## Time interpretation

The disposable catalog confirms the deadline column is **timestamp without time zone, precision 3, non-null**. Tasker writes JavaScript Dates created from explicit zoned timestamps; Prisma stores their UTC value in that column and returns an instant. The Calendar converts that instant to `Asia/Dubai` for both day placement and time labels.

Range predicates use inclusive local midnight and exclusive next local midnight, converted to UTC before querying. Civil-date arithmetic uses UTC getters/setters solely to avoid host-zone arithmetic; `Intl.DateTimeFormat` supplies Dubai offsets and display labels. Week starts match the existing Monday convention. Today is resolved on the server in Dubai and returned to the client.

For example, `2026-10-31T19:59:00Z` appears on 31 October at 23:59; `2026-10-31T20:00:00Z` appears on 1 November at 00:00. A supplied `2026-11-02T00:15:00+04:00` stays on 2 November at 00:15. Midnight is a real stored time, not an all-day inference.

Date-only and undated Universal Tasks are not supported by the existing contract: service validation rejects them and the column is NOT NULL. Calendar does not substitute Today or infer a time. It cannot recover an undocumented original “date-only” intention from an externally written timestamp; existing supported Tasker writes explicitly carry a time. Native/flexible date-only records remain separate rather than being mislabeled timed tasks.

Calendar navigation accepts valid dates from 1900 through 2199, including leap dates. Adjacent grid cells beyond these bounds are disabled and do not query tasks. Ranges are derived from the selected view, never caller-supplied arbitrary start/end dates. Boundary, leap-day, year transition and host-zone consistency are tested; Chromium uses a Los Angeles browser zone to verify Dubai interpretation.

## Authorization and privacy

The central V2 capability `workspace.calendar.tasks` controls feature-gated business entry. It does not replace Tasker authorization. The service resolves the current live versioned session inside its authorization transaction, checks identity against the grant, invokes `task.list`, and reuses `dashboardTaskScope`/`taskAccess` for every query. Session expiry is checked again before returning.

| Actor | Calendar access |
| --- | --- |
| Director | Genuinely permitted task oversight, separately labeled from direct responsibility. |
| SPM / JPM | Owned, executed and eligible spectated tasks. Project management alone grants no private-task discovery. JPM creation governance is unchanged. |
| Designer / Digital Lead | Only eligible Tasker records. No new project/stage access, participant roster, Archive file access or category-derived task grant. |
| Technical-only | Denied API/service access; page uses existing Settings fallback. |
| Anonymous, expired, deleted session, suspended account or stale version | Denied. Reactivation does not revive old-version sessions. |

Projection fields are only actual task identity/title/type/status/deadline, actor relationship labels, Sister marker and task destination. It selects no private brief, messages, files, inspiration, project names, stage state, related Sister tasks or parent traversal keys. A completed task is displayed as its stored status, without claiming accepted deliverable application, stage completion or project completion.

Permissions are applied before selecting titles or overflow rows. Hidden records cannot change dates, counts, filter options or empty states. There are no totals; overflow is based only on an extra authorized result. Type/status options are static supported values rather than hidden-data aggregations. Removing a relationship or changing a deadline through the existing Tasker service changes the next Calendar response.

Caller actor overrides, duplicate/unknown parameters, unsupported filters, invalid dates and malformed/out-of-range cursors are rejected. All API responses use `Cache-Control: private, no-store`. Unexpected errors become a generic retry response, with no SQL details sent to the client.

## Query bounds and performance

Month uses at most **42 authorized, bounded SELECTs**, fetching at most four rows per day and displaying three: at most 168 candidates / 126 displayed tasks. Week uses seven SELECTs, at most nine rows per day and eight displayed: at most 63 candidates / 56 displayed tasks. Agenda uses one SELECT of at most 31 rows, displaying 30. A crowded first day cannot silently consume a global cap and hide later days.

All queries sort by deadline then unique task ID. Agenda's cursor applies the same authorized date range and a `(deadline, id)` continuation predicate, without deep OFFSET scans. No unbounded count or parent-family query runs. Current state is reauthorized for each request; concurrent edits can move tasks between requests, so pagination is not a historical snapshot.

The transaction has a 15-second timeout and each SQL statement a three-second timeout. Work stays read-only apart from transaction-local settings. Existing owner/executor deadline indexes are reused; query plans were inspected on representative populated fixtures before deciding that no new index or migration was warranted. Director/spectator queries may scan on these existing indexes; fixture timings are not a production-volume guarantee.

## Exact file inventory

Created:

- `src/lib/calendar-v2/activation.ts`
- `src/lib/calendar-v2/dates.ts`
- `src/lib/calendar-v2/contracts.ts`
- `src/lib/calendar-v2/service.ts`
- `src/lib/calendar-v2/PHASE-7.3.md`
- `src/components/calendar/task-calendar-workspace.tsx`
- `src/app/(dashboard)/calendar/loading.tsx`
- `src/app/api/calendar/route.ts`
- `scripts/calendar-v2-integration-check.ts`
- `scripts/calendar-browser-check.mjs`
- `scripts/tsconfig.calendar-v2.json`

Modified:

- `src/app/(dashboard)/calendar/page.tsx`: reuse the route for gated Task Calendar.
- `src/lib/authorization/definitions.ts`: register the read workspace capability.
- `src/lib/authorization/eligibility.ts`: include it in business-role eligibility.
- `src/lib/authorization/workspace-policies.ts`: gate the new capability independently.
- `src/lib/permissions/resolver.ts`: gate existing Calendar navigation.
- `src/lib/dashboard-navigation.ts`: validated Calendar return target on task workspaces.
- `scripts/dashboard-v2-integration-check.ts`: optional calendar acceptance hook and query capture after existing fixtures/search checks.
- `scripts/run-dashboard-isolated.mjs`: optional `--calendar` mode with separate Phase 7.3 artifacts.
- `scripts/dashboard-v2-build.mjs`: optional isolated Calendar build.
- `package.json`: three Calendar verification commands.

Total: **11 created and 10 modified files**. Local evidence is under ignored `.tmp/phase73/`.

## Preservation and scope

No migration was created or applied to an existing database. Test runners replay historical migrations only in fresh disposable clusters. All **117** historical migration files/checksums remain unchanged, along with **239 protected files** covering Tasker/runtime services, Dashboard/Search projections, Archive/Library code, Phase 5 factories and the GTI registers/blueprints. All **696 application code/style files** match the final isolated build. Git HEAD/staging and `.env`, `.env.local`, `.env.example` retain their original hashes.

The fifteen existing flags remain enabled and byte-for-byte unchanged. Dashboard, Search and Calendar flags remain OFF/unset locally; all test combinations are injected only into disposable processes. Real users, passwords, roles, account versions and business data were not touched. No live S3 or Neon verification/write was attempted.

The five Phase 5 canonical definition hashes remain unchanged and their specification checks pass. Official GTI template status remains unapproved; executable workflow publication is not relabeled official.

## Acceptance evidence

All six existing types are supported: **General, File Upload, Data Input, Inspect File, Initial Concept and Final Concept**. Status filters/display use the five stored states: **Open, In progress, Completion requested, Completed and Closed**. Tasker type flags still govern availability through the existing scope predicate.

| Verification | Result |
| --- | --- |
| Calendar service/API | **PASS: 295 assertions**, 26 expected denied/invalid responses, one deliberately injected database failure with sanitized output. |
| Existing Dashboard service | **PASS: 126 assertions**, covering all five roles, technical/anonymous denial, actual work and decision queues, project families and pagination. |
| Existing Search service | **PASS: 243 assertions**, 21 expected denied/invalid responses, one injected failure, 17 inspected query plans. |
| Central authorization | **PASS:** current sessions, Archive, Library, project reads/writes/governance, completion documents, runtime, file identity and events on disposable PostgreSQL. |
| Tasker and runtime | **PASS:** native Tasker/family checks; publication 414 assertions; runtime 503; disabled-schema compatibility 17; creation governance 49; runtime General 463; deliverables 376; concepts/Sisters 483; completion 340. |
| Native projects/tasks | **PASS:** 66 task assertions, 57 My Projects assertions and three historical-assignment migration assertions. |
| Navigation / project workflow / template specifications | **PASS:** current targeted checks, including all five canonical template definitions. |
| Full TypeScript | **PASS:** `pnpm exec tsc --noEmit --incremental false`. |
| Targeted ESLint | **PASS:** changed application/test files, including the final browser assertion correction. |
| Isolated production build | **PASS:** webpack build using copied source and an unreachable build-only database URL. Existing `keyv` → `got` → `ably` dynamic dependency warning remains. |
| Isolated Chromium | **PASS:** eight acceptance groups, 34 screenshots, 20 expected denied/invalid HTTP responses, zero unexpected responses, zero page errors and zero external requests. Chromium 153.0.8010.12. |

Service fixtures exercise all six types and five stored statuses, Owner/executor/spectator/Director relationships, a Sister executor without access to its parent, hidden-task insertion without changing the authorized response, deleted tasks, actual Tasker deadline editing and relationship revocation. Suspended, expired, revoked, anonymous, technical-only and old-version sessions deny. Reactivation does not restore an old session. Invalid dates, duplicate/unknown filters, actor overrides and invalid cursors fail safely. Legacy manual events do not become Task Calendar deadlines.

Date checks cover month/week/year transitions, leap day, the supported range's edges, explicit offsets and Dubai midnight. Identical requests under UTC, Los Angeles, Tokyo and Dubai process zones return consistent results. Date-only, null and omitted Tasker deadlines are rejected by the existing service contract; no undated row can be inserted into the non-null deadline column or assigned an invented date by Calendar.

The populated fixture contains **253 tasks**, including 75 on one busy day and 120 distributed across the month grid. The busy day's 78 eligible results paginate as 30/30/18 without duplicates; later dates remain visible in the month grid. Captured Calendar reads confirm 42 task SELECTs for the Designer month, seven for the Digital Lead week and one for the Director agenda. Six actual SQL queries were replayed with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, preserving timestamp parameter types. Their execution times were **0.024–0.376 ms per query** in the final local run. These timings exclude application/transaction/network overhead and are local fixture evidence, not a production load test.

Chromium used genuine synthetic Director, SPM, JPM, Designer and Digital Lead password logins, plus empty-work and technical-only accounts. It navigated the actual sidebar, all three views, six type filters, Completed filters, previous/next periods, overflow, cursor pages, authorized task destinations, Back to Calendar and refresh. Mobile 390×844 and tablet 768×1024 checks found no page-width overflow. All eight Dashboard/Search/Calendar flag combinations passed; the four disabled Calendar pages rendered not-found content and no Calendar data. The API recorded four Calendar-disabled 404s. [Browser receipt](../../../.tmp/phase73/browser/result.json) lists every screenshot and expected denial.

Selected screenshots:

| Evidence | Screenshot |
| --- | --- |
| Actual month deadlines | [Designer month](../../../.tmp/phase73/browser/designer-month-deadlines.png) |
| Seven-day view and stored statuses | [Designer week](../../../.tmp/phase73/browser/designer-week.png) |
| Separate Sister without private parent | [Digital Lead week](../../../.tmp/phase73/browser/digital-sister-week.png) |
| Genuine oversight relationship | [Director agenda](../../../.tmp/phase73/browser/director-oversight-agenda.png) |
| Bounded overflow / navigation | [Busy day](../../../.tmp/phase73/browser/busy-day-agenda.png), [second page](../../../.tmp/phase73/browser/agenda-page-two.png), [task destination](../../../.tmp/phase73/browser/task-destination.png) |
| Mobile controls / actual entries | [Mobile agenda](../../../.tmp/phase73/browser/mobile-agenda.png), [mobile deadlines](../../../.tmp/phase73/browser/mobile-deadlines.png) |
| Responsive month / week | [Scrollable mobile month](../../../.tmp/phase73/browser/mobile-month.png), [tablet week](../../../.tmp/phase73/browser/tablet-week.png) |
| Empty / denied / invalid | [Empty work](../../../.tmp/phase73/browser/empty-calendar.png), [technical fallback](../../../.tmp/phase73/browser/technical-denial.png), [invalid date](../../../.tmp/phase73/browser/invalid-date.png) |
| Flag independence | [Calendar alone](../../../.tmp/phase73/browser/flags-001.png), [all disabled](../../../.tmp/phase73/browser/flags-000.png), [all enabled in fixture](../../../.tmp/phase73/browser/flags-111.png) |

The full unchanged 3,803-assertion standard-template workflow suite was not repeated; its prior result remains historical. This phase reran canonical specification checks and the relevant authorization, Tasker/runtime and project regressions instead.

Reproducible Calendar commands:

```sh
pnpm calendar:v2-check
pnpm calendar:v2-build
FLUX_BROWSER_BUILD=/private/tmp/flux-dashboard-build-<build-id> pnpm calendar:v2-browser-check
```

The build command reports its disposable build path; supply that path for Chromium. The browser harness uses installed `playwright-core` through `FLUX_PLAYWRIGHT_PACKAGE` (with the existing local QA harness as fallback). Runners whitelist process variables, use socket-only disposable PostgreSQL and fake storage, and block external requests. They do not source real environment files.

Local receipts: [Calendar service](../../../.tmp/phase73/service-result.json), [Search service](../../../.tmp/phase73/search/service-result.json), [query plans](../../../.tmp/phase73/query-plans.json), [authorization](../../../.tmp/phase73/authorization.log), [Tasker/runtime](../../../.tmp/phase73/tasker.log), [native projects](../../../.tmp/phase73/native-projects.log), [build](../../../.tmp/phase73/build.log), [preservation](../../../.tmp/phase73/preservation.json).

## Historical static-check exceptions

All six previously documented commands still fail with the same baseline failures. Their source assertions and approved permissions were not weakened. The results are recorded in [static receipts](../../../.tmp/phase73/static-results.json).

| Command | Unchanged failure |
| --- | --- |
| `phase0:check` | `project archive download per-project guard is missing.` |
| `flow:check` | Same inherited Phase 0 assertion. |
| `project-create:v2-check` | `ADMIN-only co-owner candidates is missing.` |
| `projects:v2-check` | `completed delete guard is missing.` |
| `dashboard:v2-check` | `Dashboard panel is missing: Flexible Projects`. |
| `projects:user-check` | Standalone compiled runner cannot resolve `server-only`; the proper isolated 57-assertion My Projects runner passes. |

## Scheduling remains pending; Phase 7.4 recommendation

This phase implements deadline display only. It does not implement automatic project scheduling, stage durations, calculated milestone deadlines, Exhibition backward planning, vendor lead times, starter tasks, holiday/working-day calendars, leave/deputy rules, escalation, recurring Digital schedules, task-to-stage blocking, overdue reminders, notification delivery, background jobs, drag rescheduling, vendor/CERBER, Toolio or tracker integrations. Existing Tasker acceptance and project completion remain unchanged.

For Phase 7.4, first establish its approved scope and acceptance criteria. Reuse the current authorization and explicit date contract if it extends Calendar. Any scheduling work requires separate Director/process-owner decisions for GTI-B29, GTI-B30, GTI-B44 and GTI-D15, with explicit date precision, working-day and reminder rules before implementation. Phase 7.4 and Phase 8 have not been started; activation, deployment and live verification remain separate work.

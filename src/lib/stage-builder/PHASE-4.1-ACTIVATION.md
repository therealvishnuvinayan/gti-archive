# FLUX V2 — Phase 4.1 activation verification

**PASS.** The explicitly approved migration was applied once to development, preservation checks passed, and `FLUX_STAGE_BUILDER_DRAFTS=1` was enabled in local `.env.local` only. All required post-activation verification passed. Final database verification completed at **2026-10-21T20:48:38.140Z / 2026-10-22 00:48:38 Dubai**.

The workspace began clean at `17b60c176644c52d1e98901c24b70c66d4c908e4`. This report records the separately approved activation following [verification closure and preflight](./PHASE-4.1-PREFLIGHT.md). Product code, test runners, Prisma schema and migration files were unchanged during activation. Existing staged changes and HEAD were preserved.

## Approved execution and repeated preflight

| Identity | Verified value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database/schema | `neondb/public` |
| PostgreSQL | `18.6 (fd34222)` |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled endpoint | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct fingerprint | `5b001dbfcdb263fa` |
| Pooled fingerprint | `9d6f1df51a9db284` |

Endpoint fingerprints are the first 16 hexadecimal characters of SHA-256 over `hostname:5432/neondb`, excluding credentials. Provider identity, connection precedence, direct/pooled consistency and server version were independently checked again.

Only migration **`20261023010000_stage_builder_drafts`** was applied. Its repository SQL, reviewed copy and final ledger checksum match the approved 64-character SHA-256:

```text
3527adb36ac84d49069e9f0db084af3df6af09d4bed890d5b64681afbd8430fe
```

The repeated preflight confirmed all 112 existing migration names/checksums, exactly this one pending migration, 122 public tables, no baseline drift, unchanged prior catalog and full-table fingerprints, and nine unchanged accounts. No competing sessions, active transactions, waiting locks or prepared transactions were present. A further snapshot, preservation comparison and empty baseline diff immediately preceded execution.

Neon recovery retention was **21,600 seconds / six hours**. A fresh provider GET successfully retrieved the historical 122-table schema at `2026-10-21T20:35:10.966Z`, checked at `20:37:12.764Z`. Recovery availability was verified; no restore drill or recovery mutation was performed.

Installed Prisma **6.19.3** executed `migrate deploy --schema <reviewed-copy>/schema.prisma` through the direct endpoint. The unchanged installed CLI and schema-engine binaries were fingerprinted. A SELECT-only probe through that same engine verified **5-second lock timeout and 60-second statement timeout**; those connection options were enforced for execution. The SQL's explicit transaction wrapper was preserved.

The single attempt started at `20:41:17.028Z` and completed successfully at `20:41:25.589Z`. Prisma reported exactly one applied migration and exited 0. The execution wrapper recorded an exclusive attempt marker before invoking Prisma and prohibited a second attempt. No retry, repair, reset, resolve or recovery command was used.

## Database result and preservation

| Check | Before | After migration and final verification |
| --- | ---: | ---: |
| Successful migrations | 112 | **113** |
| Failed migrations | 0 | **0** |
| Pending migrations | 1 | **0** |
| Public tables, including Prisma ledger | 122 | **124** |
| Prisma schema drift | None | **None** |
| Workflow drafts / revisions | Tables absent | **0 / 0** |

Every one of the **121 pre-existing non-ledger tables** retained its complete row count and canonical full-row SHA-256 fingerprint. All **112 previous migration ledger rows** remained identical. After the isolated tests, all **124 table fingerprints**, the complete 113-row ledger and the complete post-migration catalog matched the immediate postcheck snapshot again.

- All nine User rows, including stored passwords, names and legacy roles, were preserved. User-table SHA-256: `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e`.
- Nine authorization assignments and nine authorization-history records were preserved, including active status and version 1. Exactly one Director and two technical-only administrators remain, with no business/technical authority crossover. Authorization-table SHA-256: `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36`.
- All three sessions, the one approved Artwork compatibility preset and its original governance event were preserved, including approver, definition hash and timestamps. Six status groups and ten status options were preserved.
- Existing project/stage, Universal Tasker/Sister, shared-file, approval/event, Archive and Library structures and data were preserved. These operational tables were empty on this development branch; populated preservation was separately exercised in disposable integration databases.

There was no historical backfill, existing-row rewrite, synthetic Neon business data, draft seeding or automatic publication.

## Installed object validation

Actual PostgreSQL 18 catalog definitions were compared against a fresh local application of the approved migration chain. All four SQL function bodies, including the existing event guard replacement, match the approved SQL exactly. Only the reviewed existing BusinessEvent check and event guard changed; no other existing catalog object changed or disappeared.

| Object | Validated result |
| --- | --- |
| Tables | `WorkflowDraft`, `WorkflowDraftRevision`; 21 columns total |
| Seven indexes | `WorkflowDraft_pkey`, `WorkflowDraft_createdById_updatedAt_id_idx`, `WorkflowDraftRevision_pkey`, `WorkflowDraftRevision_eventId_key`, `WorkflowDraftRevision_sourceRevisionId_idx`, `WorkflowDraftRevision_workflowId_revision_key`, `WorkflowDraftRevision_actorId_commandId_key` |
| Five foreign keys | Draft creator → User; revision workflow → WorkflowDraft; revision actor → User; source revision → WorkflowDraftRevision; revision event → BusinessEvent. All use restrictive update/delete behavior; only the event FK is initially deferred. |
| Two new checks | `WorkflowDraft_shape`, `WorkflowDraftRevision_shape` |
| Three new functions | `flux_draft_guard`, `flux_draft_consistency`, `flux_emit_draft_event` |
| Six triggers | Guard and truncate triggers on each new table; initially deferred draft consistency trigger on WorkflowDraft; event emission trigger on WorkflowDraftRevision |
| Event extension | `WORKFLOW_DRAFT_REVISED` enum value; reviewed extension of `BusinessEvent_contract_check` and `flux_event_write_guard`; prior event branches preserved |
| PostgreSQL 18 NOT NULL catalog entries | All 20 required-column constraints validated |

All constraints are validated, all indexes valid and ready, and all user triggers enabled. Both new tables remain empty. The installed migration executed successfully on PostgreSQL 18.6; its database behavior was additionally tested on disposable PostgreSQL 14.19.

## Local activation

Only after the database postchecks passed, local `.env.local` was updated at `2026-10-21T20:42:18.911Z`:

```dotenv
FLUX_SHARED_FILE_IDENTITY=1
FLUX_APPROVAL_ENGINE=1
FLUX_SHARED_EVENTS=1
FLUX_UNIVERSAL_TASKER=1
FLUX_TASKER_DELIVERABLES=1
FLUX_TASKER_CONCEPTS=1
FLUX_TASKER_SISTERS=1
FLUX_STAGE_BUILDER_DRAFTS=1
```

The seven existing values and every other byte of environment content were preserved; `.env` and `.env.example` were unchanged. A fresh Next.js **16.2.6** process loaded the actual repository environment through Next's environment loader and verified all eight flags. It reached Ready, then stopped. Live database access was disabled before application startup, external network access was prohibited, and it made zero HTTP/fetch requests or socket connections. No application request or live account login was needed for this startup check.

## Post-activation verification

Every check below was rerun after local activation and exited successfully.

| Check | Result |
| --- | --- |
| Full TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false` |
| Targeted ESLint | PASS: all 30 reviewed implementation and repaired-verification files; no diagnostics |
| Fresh production build | PASS: isolated source copy, dummy database endpoints, no environment files or live credentials |
| `stage-builder:check` | PASS: populated migration preservation, disabled-feature 112-migration baseline, complete draft behavior and event/outbox safeguards |
| Broad V2 authorization/governance integration | PASS: **112 checkpoints**, including services, sessions, administration, workspace, project reads/writes, governance, shared files, approvals, events, Archives, Library and completion documents |
| Foundation/persistence and approval/event/Tasker units | PASS, including business/technical separation and Sister confirmation contracts |
| All six Universal Tasker types and Sister Tasks | PASS: General, File Upload, Data Input, Inspection, Initial Concept, Final Concept, family traversal, retained evidence and independent lifecycle |
| Legacy Tasks | PASS: **126 assertions** — 66 task, 57 project relationship, three historical assignment |
| Legacy concepts | PASS: **887 assertions** across seven suites — 171, 142, 61, 170, 46, 188 and 109 respectively |
| `stage-five:ui-check` | PASS: 94 native source assertions and 30 isolated checkpoints |
| `stage-six:ui-check` | PASS: 73 native source assertions and 21 isolated checkpoints |
| `stage-seven:ui-check` | PASS: 81 native source assertions and 29 isolated checkpoints |
| `concept-stage:ui-check` | PASS: 54 native source assertions and 21 isolated checkpoints |

The four repaired runners executed **302 source assertions**. Their isolated checkpoints overlap and are not presented as additive unique assertions. The legacy concept concurrency test took its 142-assertion branch in this run. The earlier six runner failure-exit probes remain documented in the preflight report; they were not rerun during activation.

Stage Builder integration and browser tests verified Director global creation/editing, SPM own-draft creation/editing, cross-SPM isolation, and JPM/Designer/Digital Lead/technical-only denials. Coverage also included all four typed capability categories, ordered stages and completion gates, malformed schemas/duplicate IDs/arbitrary-expression denial, immutable revisions and actor history, stale and concurrent edits, independent cloning and stable field IDs, atomic revision/event/outbox rollback, unchanged existing governance, and unavailable publication/approval/project-activation routes.

| Isolated browser acceptance | Screenshots | Acceptance groups |
| --- | ---: | ---: |
| Stage Builder | 14 | 3 |
| Sister Tasks | 16 | 2 |
| Inspection / Initial Concept / Final Concept | 13 | 3 |
| General Tasker | 9 | 3 |
| File Upload / Data Input | 10 | 1 |
| Current application on 112 migrations with Stage Builder disabled | 10 | 4 |
| **Total** | **72** | **16** |

All six browser processes exited 0, with **zero page errors and zero blocked external requests**. They used PostgreSQL **14.19**, Chromium **153.0.8010.12**, disposable synthetic fixtures and fake local storage. The desktop structure preview and mobile Stage Builder editor screenshots were visually inspected. All verification servers and disposable databases were stopped and cleaned up.

No test failed during this activation run. The build emitted one non-failing multiple-lockfile workspace-root inference warning from the isolated copy. Expected denial, stale-write and rollback cases passed as assertions. Browser/service checks were isolated: no interactive Neon draft was created, no restore drill was performed, and no real S3 or notification delivery was tested. Native Stage 5/6/7 and concept UI runners verify source wiring plus actual V2 services/actions; no new interactive walkthrough of those native screens was added.

## Evidence and stop point

Local evidence is retained in `.tmp/phase41-activation-3e3g8r6f/`: `verification-summary.json`, `preflight-passed.json`, `engine-readonly.json`, `execution-started.json`, `execution-result.json`, `migration.log`, `postchecks-passed.json`, `catalog-changes.json`, `final-verification.json`, all check logs/receipts, and the six browser screenshot directories.

`table-fingerprints.json` contains complete before/after/final table counts and hashes without raw passwords, password hashes or session tokens. Its SHA-256 is `cbaa840894d0cd79db9ff5d8109f267cd5a18f1b5dd9b0e05a385e2b11d0f252`.

No workflow draft was approved or published, no configurable stage was instantiated in a project, no existing account or permission was changed, and no live S3 object was modified. No external worker or notification delivery was activated. Nothing was pushed or deployed. **Phase 4.2 was not started. Activation verification is complete; work stops here.**

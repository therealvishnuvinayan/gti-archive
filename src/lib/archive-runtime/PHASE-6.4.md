# FLUX V2 — Phase 6.4: completed RuntimeProject Archive integration

> Superseded candidate notice: [Phase 6.5](./PHASE-6.5.md) adds the required migration timeouts and records the integrated verification/read-only Neon preflight. Current candidate SHA-256: `f654a4101f805a93544d34e22efd73d914234f0690451d2bbab8b8d80627e5b9`. Migration remains unapplied; all four Phase 6 flags remain off/unset. Checksums and “not started” statements below are historical to this phase.

Implemented and locally verified on 24 October 2026 against committed Phase 6.3 (`38471f6`). **Not activated.** No Neon connection/migration, live S3 operation, actual environment change, real project publication, real account/password change, push or deployment. Phase 6.5 and Phase 7 were not started.

## 1. Publication eligibility and authority

The new `publish-runtime:<actual RuntimeProject ID>` resource is evaluated by the existing central `archive.publishFromProject` policy, inside the current versioned-session Serializable transaction. The feature requires `FLUX_ARCHIVE_RUNTIME=1` exactly; its default is off.

A genuine `COMPLETED` RuntimeProject must retain its own approved `RuntimeCompletionRequest`, requested by its actual Owner, and its own `RuntimeCompletionDecision` with outcome APPROVE. The linked immutable completion activity must identify a Director, the actual decision and APPROVE outcome. The pinned PublishedWorkflowVersion must match the project's workflow ID, version number and definition hash. An ACTIVE project or merely completed final stage fails authorization. No legacy Project or Stage 7 identity is manufactured.

Publication is **Director-only**. Existing SPM eligibility for `archive.publishFromProject` still requires the legacy native Project ownership policy; it is not treated as an approved runtime publication permission. Granting runtime publication authority to SPM needs an explicit policy decision. Folder management, general Archive browsing, source participation and task assignments confer no publication permission.

The command also rechecks an active authorized destination category, an actual same-category folder when folders are enabled, exact source references/versions, a mandatory reason, explicit publication confirmation and an explicit non-sensitive-content confirmation. No automatic publication is added to completion.

## 2. Supported and excluded evidence

Supported: selected current RuntimeFileSubmission records from genuinely completed RuntimeStages, with the exact submission/version/state present in the immutable stage-completion snapshot and stage configuration matching the pinned published workflow. The version must be READY, have its original uploader matching the submitter, a genuine SharedFileReference, an ETag, and an object-version pin or application seal. The submission must be ACCEPTED, or SUBMITTED where the approved FILE_REQUIREMENT explicitly has acceptance NONE. Superseded, failed, uploading, rejected, mismatched and already-published/retired submissions are excluded.

Publication is bounded to **1–50 explicitly selected versions**, with no preselected files. The review page supports projects with at most 500 stage submissions and shows per-file exclusions. It also explains these excluded source classes:

- All runtime completion documents, including invoices, financial records, copyright/legal agreements and authority proofs, even when accepted. Their protected source access remains intact.
- Universal Tasker attachments, deliverables, concepts, conversations and Tasker-derived stage submissions. `RuntimeTaskPublication` lineage excludes a file even after transfer into a stage.
- Form values, checklist values, entire completion snapshots, private task context and historical versions.

There is no automatic content classifier. The Director must review the selected stage outputs and attest that they contain no restricted financial, legal, Tasker or other confidential material before publishing to the displayed Archive audience. Known restricted source classes cannot be selected. This attestation does not authorize publication of confidential content or replace a future source-confidentiality adapter.

## 3. Genuine data model

| Model | Meaning |
| --- | --- |
| `RuntimeArchivePublication` | Immutable command/publication history: actual runtime project, final decision, published workflow version, category, original folder ID, canonical reviewed manifest/hash, publisher, authorization version/session, reason, command/hash, timestamp and event. |
| `RuntimeArchiveFile` | One immutable typed Archive identity for an actual RuntimeFileSubmission, original SharedFileReference and exact SharedFileVersion, linked to its publication/category. |
| `ArchiveFilePlacement` | Adds an optional typed runtime-file FK to the still-unapplied Phase 6 table. Same category, revision and folder rules apply. |
| `RetainedArchiveSource` | Adds an optional typed historical runtime source ID to the still-unapplied retention table. |

The original 150 tables receive no scalar columns. Existing native/manual Archive sources remain native/manual. Runtime IDs never occupy legacy Project, ArchivedProjectFile or ManualArchiveFile foreign keys.

Each source reference/version can be published only once, including across categories. A different manifest can publish additional eligible unarchived files; it cannot duplicate or resurrect already-published evidence. Native and runtime Archive IDs cannot collide or reuse retained runtime identities.

## 4. Versions, provenance and storage

Publication reuses the original runtime SharedFileReference and SharedFileVersion; it does not mutate the reference role, source relation, uploader, stage evidence, provenance, storage locator or version number. The runtime submission retains its genuine stage/project origin and original submitter. Existing SharedFileProvenance remains attached to the original version; no synthetic provenance/approval/checksum is inserted.

Every selected version receives a conditional storage observation before publication. Bucket, key, size, MIME, ETag, object version and established checksum evidence must match. Publication creates **no S3 copy, upload, delete or new direct presigned URL**. Runtime Archive previews/downloads use the existing protected version endpoint with `kind=runtime-archive-file`, fresh central authorization and conditional pinned GET. A version ID alone grants nothing.

## 5. Completion and approval immutability

The publication path writes only its new Archive publication/files, optional placements, BusinessEvent and EventOutbox. It does not create a project, reopen a stage, close tasks, modify completion requirements, change workflow versions, or replace the Owner request/final Director decision. Integration snapshots confirm all source projects, stages, submissions, completion requests/decisions/documents, versions, references and provenance stay unchanged through publication, sharing, review, movement and Archive deletion.

## 6. Navigation, details and UI

An authorized Director sees **Publish to Archives** in a completed runtime workspace. The review page displays the actual project, pinned workflow version, Owner request and Director decision; category/folder selection; eligible and excluded exact files; source-file review links; mandatory reason; and two explicit confirmations. Persistence occurs only after confirmation. An uncertain response retains the same command for retry. Successful publication opens the existing Archive location; subsequent visits show retained publication history and prevent duplicate selection.

Runtime files participate in category summaries/counts, category lists, filename search, folder paths, literal folder search and database-paginated folder results. File and category grants are applied before restricted counts, search matches and visible paths. Folder visibility never grants file access. The category details show actual runtime project/stage/submission/reference/version, original submitter, publisher/date, final decision and workflow version. Runtime metadata identity remains immutable; native Edit and external Share controls are not offered for it.

The existing category view works with folders disabled. With folders enabled, same-category moves use the existing organization command/revision/history and leave grants and verification intact.

## 7. Sharing and revocation

The existing sharing UI, ArchiveAccessDecision history and ArchiveGrantScope are reused. A runtime grant's native UserArchiveAssetAccess row has both legacy source FKs null; its immutable scope/decision binds the genuine typed runtime file, exact original reference/version and source fingerprint. The native one-file CHECK gains only this guarded runtime form, validated against a genuine matching access decision and runtime source. The native grant trigger rejects unaudited creation, mutation and deletion; scope creation/removal still occurs only within the reviewed decision/delete workflow. Original native/manual forms retain their exactly-one-source rule.

Director/SPM may grant active eligible Designer/Digital Lead recipients under the existing category rules. New grants remain preview/download-only, with optional bounded expiry. Changed source identity, expiry, revocation or category/actor changes deny later protected requests. No runtime external/public sharing link is created. Existing legacy S3 URLs retain their already-documented expiry limitation; no new long-lived direct runtime URL is issued. In-flight transfers are not retroactively recalled.

## 8. Verification

A new runtime Archive file begins **NOT VERIFIED**. The original runtime reference is the exact-version review identity. Director verification and revocation use the existing conditional observation, reason/confirmation, current session, sequence/CAS, immutable decision history and audit/outbox. Publication and source-stage acceptance do not constitute Archive verification. Source approvals remain unchanged; version-specific histories never transfer to a different reference/version.

**Digital Lead limitation:** Phase 6.3's new preview/download grants do not delegate VERIFY. There are no historical runtime-native grants to reuse, so this package does not manufacture a Digital Lead verification grant for a newly created runtime Archive file. Such a grant remains denied in service/UI/SQL. The requested eligible-grant Digital Lead verification scenario is covered on a genuine existing native Archive source by the retained Phase 6.2 suite and both browser runs. Any new runtime verification-delegation policy requires separate approval.

## 9. Role matrix

| Role | Runtime publication | Runtime Archive browsing/download | Manage exact grants | Verify/revoke | Delete |
| --- | --- | --- | --- | --- | --- |
| Director | Yes, eligible completed project and reviewed manifest | Global, active category and valid source | Yes | Yes / yes | Yes |
| SPM | No; runtime policy approval required | Existing global Archive scope | Yes | No / no | No |
| Digital Lead | No | Explicit effective file grant plus category permission | No | New preview/download grant does not confer verification | No |
| Designer | No | Explicit effective file grant plus category permission | No | No / no | No |
| JPM | No | Denied by default | No | No | No |
| Technical-only / unassigned | No | Denied by default | No | No | No |

A technical account with a separate business role follows that actual business role. No legacy FULL profile or copied caller object establishes V2 authority. Library authorization remains independent.

## 10. Deletion and retained history

The existing Director-only delete operation removes the RuntimeArchiveFile and its placement, deletes its exact runtime grants, and creates RetainedArchiveSource with the original file/reference snapshots and current actor/session. It retains the publication manifest, access decisions, verification decisions, event/outbox, original runtime SharedFileReference, SharedFileVersion, RuntimeProject, stage evidence and Tasker/completion history. The runtime reference keeps its original source association; it is not nulled or converted into a legacy reference. No physical storage cleanup is attempted for this shared source. Retired references/IDs cannot be republished or reused to revive old access.

## 11. Idempotency, concurrency and rollback

Actor-scoped command identity/hash and canonical manifest hash provide replay/duplicate protection. Current Director/session, completed source and authorized destination are evaluated before replay. Changed payloads cannot reuse a command; sorted exact file bindings make item ordering canonical. Project locks, an advisory publication lock, Serializable transactions, unique source/reference/version constraints and database guards serialize competing publication attempts. A stale concurrent command must refresh; it cannot overwrite another manifest.

The publication AFTER trigger creates the exact manifest files, initial folder placements, `ARCHIVE_RUNTIME_PUBLISHED` BusinessEvent and `internal.audit.v1` outbox together. Event decoding and the event-write guard validate the actual publication, actor, sequence, correlation/causation and manifest hash. Event payloads contain no document snapshot, file key or publication reason. No dispatcher activation or new background job is introduced.

The integration suite forces an outbox failure after file creation and observes no extra publication/file; concurrent attempts create one legitimate publication. It also tests unauthorized replay, wrong project/category/workflow/final decision/version/reference, native/runtime ID collision, direct grant/scope/file/history attacks, source immutability, expiry and post-revocation denial.

## 12. Migration inventory and flags

Still-unapplied candidate: `prisma/migrations/20261025010000_archive_folders/migration.sql`

**Complete SHA-256: `c4700cf0dc4288e31d34fc7cd52e6384ad45557515ff1f97c34c157d1517087a`.**

Expected result: **117 successful migrations / 159 public tables** (including `_prisma_migrations`), from the recorded 116/150 baseline. This supersedes Phase 6.3's 157-table candidate.

The populated PostgreSQL **14.19** rehearsal preserved every row in all 150 original tables and every historical ledger checksum. All nine new tables started empty; there is no backfill, conversion or relocation. Prisma drift is empty. The exact catalog delta is recorded in `/private/tmp/flux-phase64-migration-inventory.json`:

- Added: 9 tables, 39 indexes, 49 constraints (34 foreign keys, 9 primary keys, 6 checks), 21 functions and 22 triggers.
- Changed existing objects only: BusinessEventType (the three Phase 6 event values), BusinessEvent_contract_check, UserArchiveAssetAccess_single_asset_check, flux_event_write_guard(), flux_shared_file_reference_guard().
- No removed existing objects. Existing function branches are retained; Phase 6 adapters are added to the pending candidate.

All **116 historical migration files**, actual environment file hashes and Git staging are unchanged. `FLUX_ARCHIVE_FOLDERS`, `FLUX_ARCHIVE_VERIFICATION`, `FLUX_ARCHIVE_SHARING` and `FLUX_ARCHIVE_RUNTIME` remain off/unset in actual environment files. The current client and disabled services were tested against the actual original 116-migration schema. Runtime flag-off calls reject before accessing new tables; existing Archive reads/downloads still work. Switching the runtime flag off hides/disables the runtime adapter without removing retained records or broadening grants.

Neon PostgreSQL 18.6 was not independently rehearsed or contacted. Activation remains a separate explicit operation.

## 13. Validation results

| Check | Result |
| --- | --- |
| `node scripts/run-archive-folders-isolated.mjs --verification --sharing --runtime` | PASS: populated migration, exact catalog/empty tables/zero drift; Phase 6.1–6.3 regressions; genuine runtime workflow, stage files, actual Owner request and Director completion; 44 runtime denial cases, 50 verification denial cases and 64 sharing denial cases. |
| Authorization runner with `--archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events` | PASS: native accepted Archive publication/manual uploads/grants/deletion, independent Library rules, current sessions, original file identity and events, native governance and completion. |
| Tasker runner with `--stage-runtime --runtime-integration --standard-templates` | PASS: runtime creation/stages, Tasker/deliverables/concepts/Sisters, final completion and all five standard-template candidates. Template package: 3,803 assertions, including both POSM variants. |
| `pnpm exec tsc --noEmit --incremental false` | PASS. |
| Targeted ESLint over every changed/new executable TS/TSX/MJS file, `--max-warnings 0` | PASS. |
| Archive access/edit/direct-wizard, final permission and Flux AI Archive finder checks | PASS. Existing static checks now recognize immutable runtime metadata/external-sharing exclusions; the old native HTTP fixture expects the established 307 redirect. |
| Source extraction `--check` | PASS: 523 paragraphs; SHA-256 `4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944`. |
| Isolated production `pnpm build --webpack` | PASS: compilation, full build TypeScript and page generation. No environment files copied; unreachable loopback build-only DB. Existing `keyv → got → ably` dynamic dependency warning remains. |
| Chromium 153.0.8010.12, folders enabled | PASS: 14 scenario groups, 24 screenshots, 17 expected denials; zero page errors, unexpected responses, failed file requests or external requests. |
| Chromium 153.0.8010.12, folders disabled | PASS: 11 scenario groups, 19 screenshots, 12 expected denials; the same zero-error/network checks. |

Both browser runs use PostgreSQL 14.19, genuine synthetic logins, current-session workflow APIs and fake loopback S3. They create a genuine published workflow/runtime project, submit and accept exact stage evidence, record Owner completion request and Director approval, then exercise the actual publication form, category/folder browsing, authorized protected bytes, Designer sharing, technical denial, revocation denial and mobile retained-publication view. No fake completed row or legacy Project is used. The source project/final approval/version snapshots and nine account assignments are unchanged by Archive operations. Desktop and mobile publication screenshots were inspected.

All five candidate definitions/hashes and their status remain unchanged: Packaging `1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7`; POSM `2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc`; Retail Display `dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694`; Exhibition Stand `88266d16c856d7c3c9c20f7fbd5339242395443b73e9bfda11fecfb9807dbec1`; Digital `f11f5a5e839b682685a771076b41a88a1e4f126ea327276ab76c56848986643c`. No official designation was created.

Evidence in `/private/tmp/`: `flux-phase64-integration.log`, `flux-phase64-regressions.log`, `flux-phase64-runtime.log`, `flux-phase64-types.log`, `flux-phase64-lint.log`, `flux-phase64-build.log`, `flux-phase64-template-source.log`, `flux-phase64-static.log`, `flux-phase64-browser-folders/result.json`, `flux-phase64-browser-legacy/result.json`, `flux-phase64-before.json`, `flux-phase64-preservation.json` and the catalog inventory. The final build location is recorded in `flux-phase64-build-path`. Disposable databases/apps were removed. An obsolete task-created build/cache was removed after a temporary disk-space failure; the final rehearsal and browser runs passed afterward.

## 14. Remaining limits and readiness

Supported publication is deliberately limited to reviewed non-sensitive stage outputs. Completion documents, all Tasker evidence and Tasker-derived submissions need an approved confidentiality-preserving adapter before publication. No source-content classification engine, automatic publication, mass historical adoption, cross-category move, runtime external sharing or mutable runtime Archive metadata is added. Publication review is limited to 500 source submissions, 50 selected files and the latest 50 publication receipts.

SPM runtime publication and Digital Lead runtime verification delegation remain explicit permission dependencies. The native eligible Digital Lead verification policy is preserved; new preview/download grants remain narrow. Deleting a publication's files retains its manifest and blocks republication of those same references. Legacy issued S3 URL expiry and in-flight transfer limitations remain.

Phase 6.4 is ready for **Phase 6.5 final integrated verification and controlled activation planning**, with these limits recorded. This is a local development/rehearsal result, not production QA, a live S3 test or permission to migrate/activate. Stop here; no automatic Phase 6.5 or activation step follows.

## 15. Exact file manifest

Modified (28):

- `prisma/migrations/20261025010000_archive_folders/migration.sql`
- `prisma/schema.prisma`
- `scripts/archive-edit-permission-checks.mjs`
- `scripts/archive-folders-browser-check.mjs`
- `scripts/archive-folders-integration-check.ts`
- `scripts/archive-folders-schema-baseline.mjs`
- `scripts/archives-authorization-integration-check.ts`
- `scripts/run-archive-folders-isolated.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/projects/runtime/[id]/page.tsx`
- `src/app/api/archives/verification/route.ts`
- `src/components/archives/archive-category-workspace.tsx`
- `src/components/archives/archive-verification.tsx`
- `src/components/projects/stage-runtime.tsx`
- `src/lib/archive-folders/PHASE-6.1.md`
- `src/lib/archive-folders/contracts.ts`
- `src/lib/archive-folders/service.ts`
- `src/lib/archive-sharing/PHASE-6.3.md`
- `src/lib/archive-sharing/contracts.ts`
- `src/lib/archive-sharing/service.ts`
- `src/lib/archive-verification/PHASE-6.2.md`
- `src/lib/archive-verification/contracts.ts`
- `src/lib/archive-verification/service.ts`
- `src/lib/archives.ts`
- `src/lib/authorization/archive-policies.ts`
- `src/lib/events/contracts.ts`
- `src/lib/files/access.ts`
- `src/lib/files/contracts.ts`

Created (10):

- `scripts/archive-runtime-browser-acceptance.mjs`
- `scripts/archive-runtime-integration-check.ts`
- `src/app/(dashboard)/projects/runtime/[id]/archive/page.tsx`
- `src/app/api/archives/runtime/route.ts`
- `src/components/archives/runtime-archive-publisher.tsx`
- `src/lib/archive-runtime/PHASE-6.4.md`
- `src/lib/archive-runtime/activation.ts`
- `src/lib/archive-runtime/contracts.ts`
- `src/lib/archive-runtime/service.ts`
- `src/lib/archive-runtime/sources.ts`

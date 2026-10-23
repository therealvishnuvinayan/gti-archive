# FLUX V2 — Phase 6.2: Exact-version Archive verification and revocation

> Phase 6.3 extends this still-unapplied migration. The checksum and 155-table result below record the Phase 6.2 rehearsal; current checksum, 157-table inventory, and sharing evidence are in [PHASE-6.3.md](../archive-sharing/PHASE-6.3.md).

Implemented and locally verified on 24 October 2026. **Not activated.** This extends the committed Phase 6.1 baseline (`23def33`). Both Phase 6 flags remain off/unset in actual environment files. Neon, live S3, real Archive reviews, real users, deployment and push were not used. Phase 6.3 and Phase 7 were not started.

## Source coverage and exact identity

| Existing source | Coverage |
| --- | --- |
| `ManualArchiveFile` | Eligible only with its genuine existing SharedFileReference to an immutable READY SharedFileVersion, matching bucket/key/size/MIME, and an actual object-version pin or application seal plus ETag. |
| `ArchivedProjectFile` / `ProjectArchive` | The same exact-version requirement, plus matching archive/project/source attachment/source revision and current category. Source attachment must be READY; any native submission review or revision must be APPROVED. A rejected/pending source cannot be verified. |
| Native evidence/revisions without a shared reference | Their native metadata alone is not adopted as an immutable file identity. Verification is unavailable; existing downloads remain available under their original policy. |
| SharedFile / versions / references / provenance | Logical identity is distinct from the selected immutable version. Existing typed references are required; no upload, uploader, source project, checksum or approval is fabricated. |
| Runtime and Library sources | No new Archive publication adapter or Library permission is introduced. |

Archive verification never resolves a filename or silently chooses the newest logical version. The supported native reference pins one exact version. A subsequent genuine upload/version has a distinct source/reference; it begins NOT VERIFIED. Its predecessor's review remains historical. Current source corruption or an ineligible source fails closed. Existing artwork `approvedBy` metadata has no effect on verification.

Each review uses the central current-session Archive policy, checks the exact typed native source and current category again, then observes the selected S3 object with conditional HEAD (`VersionId` when present, `If-Match`, checksum mode when applicable). ETag, object version, MIME, size and any established full-object SHA-256 must match. The observation and time are stored in the decision; storage locators are excluded from UI/API projections. ETags remain opaque validators, never SHA-256 hashes. Missing/changed objects and failed observations produce UNAVAILABLE.

This is an authorized GTI file-review attestation, not proof of legal compliance, copyright ownership, artwork quality or byte authenticity beyond the observed evidence. HEAD does not independently hash downloaded bytes. Storage and PostgreSQL are not one atomic system; conditional downloads continue to enforce the existing pinned identity. Bucket versioning, retention/IAM and real storage behavior were not inspected or changed.

## Lifecycle, permissions and audit

The four projected conditions are NOT VERIFIED, VERIFIED, REVOKED and UNAVAILABLE. A reason and explicit confirmation are mandatory. VERIFY can follow no decision or REVOKE; REVOKE can follow only the current VERIFY. Re-verification creates a new independent decision. A Director can revoke an existing review even when a new storage observation is unavailable; the revocation retains the original storage evidence. Current source/version authorization is still required.

| Role | Review authority |
| --- | --- |
| Director | Verify and revoke eligible exact files globally; actual Director attribution, without fabricated project ownership. |
| Digital Lead | Verify only with an explicit file grant and a permitted current category. Cannot revoke, edit/move/delete files or manage grants through this feature. |
| Senior Project Manager | Existing browsing/organization and authorized per-file history; no verification, revocation or file deletion. |
| Designer | Existing granted-file preview/download and minimal current status; no reviewer/reason history, verification, revocation or management. |
| JPM, technical-only, unassigned and ungranted users | No automatic Archive authority; denied through service/API and SQL review guards. |

No express Digital Lead revocation authority exists in the reviewed policy. Revocation is therefore Director-only. Any future Digital Lead revocation right needs a separate explicit policy decision, including whether it would cover only their own decisions.

`ArchiveVerificationDecision` is append-only. It records the exact reference/version, explicit source kind/ID, genuine category/project/revision snapshot, actual actor/role/authorization version/session, reason/time, observed storage evidence, command identity/hash, sequence, preceding decision and event FK. A unique reference/sequence and preceding-decision relation form one consistent chain. The effective state is derived from its latest decision, avoiding a separately mutable boolean/projection.

Commands run inside Serializable authorization transactions with a reference-specific advisory lock. Expected revision and preceding decision must match. Actor-scoped command IDs replay only an identical normalized request after current authorization; changed payloads and stale/conflicting commands fail. No silent retry overwrites another reviewer. SQL independently checks current versioned session, permitted role, current category/file grants, exact source/version binding, transition order and storage-evidence shape. Storage observation itself is performed by the trusted server adapter, not by SQL.

A native decision trigger creates the narrowly typed `ARCHIVE_VERIFICATION_DECIDED` BusinessEvent and existing internal audit outbox atomically. The event has a genuine exact-version FK and a strict action-only payload; it invents no project or approval subject. Its decision-event FK is deferred to allow trigger production and remains restrictive. Updates, deletes and truncates of decision and retained-source history are denied. Forced event and outbox failures roll back the decision as well. The existing dispatcher decodes this type and retains delivery/replay integrity.

## Existing file deletion

The existing Director-only deletion entry point is retained. Previously, an adopted Archive source's restrictive SharedFileReference FK prevented physical native deletion. The new deletion trigger:

1. Requires the current Director session inside the existing authorized Serializable deletion operation.
2. Saves the original typed native source and exact reference snapshots in immutable `RetainedArchiveSource`.
3. Clears only the native Archive association on that same SharedFileReference, then permits the existing native deletion and its existing grant/share/placement cascades.
4. Retains the reference ID, role, version, timestamp, immutable READY version, provenance, decisions, events and outbox. It rejects reuse of the deleted native source ID.

The original native IDs in the tombstone become historical identifiers; its reference and actor retain genuine restrictive FKs. The surviving reference/version chain remains the decision's real FK anchor. No immutable decision is rewritten or cascade-deleted. Other reference mutations/deletions remain forbidden. Missing source routes deny access after deletion. Storage cleanup now counts SharedFileVersion references, preserving their object rather than deleting retained evidence. Legacy unadopted deletion remains unchanged.

Deletion retention is migration-based and remains effective with either feature flag off; disabling a UI cannot resurrect a deleted source or remove its history. On the original 116 schema, a read-only catalog check bypasses the unavailable retention extension.

## UI and organization preservation

A shared verification panel is present in the legacy category/details view and the folder workspace. It shows current status, exact version, storage-evidence strength, reviewer/date where authorized, and paginated authorized history. Older decisions load 50 at a time under the same fresh file authorization. Designer projections contain no reviewer/reason history. Status loads only for visible cards and never enumerates unrelated sources.

Verify/revoke dialogs require a note and explicit checkbox confirmation. Buttons reflect current server-projected permissions. Success and status changes follow the committed server response and a fresh read. Conflicts/errors remain visible; native dialogs, labelled fields, keyboard controls and mobile wrapping are preserved. No new global status counts, project names or storage paths are exposed.

Phase 6.1 categories, nested folders, descriptions/icons, breadcrumbs, sidebar, grid/list, pagination, literal search, confirmed drag/drop, keyboard moves and cycle/depth/source guards remain intact. Folder changes never write a review/version/provenance; review commands never write organization. Original Archive publication, sharing, preview/download and category/file grants remain governed by the existing services. Library remains separate.

## Migration, flags and preservation

The single unapplied candidate was safely extended; no separate migration is necessary:

`prisma/migrations/20261025010000_archive_folders/migration.sql`

**Current combined SHA-256:** `d31232757d4d53465a5dd7ce925ba672c501e110e42b56742bd5519b5bb2a81b`

**Historical Phase 6.1-only SHA-256, no longer current:** `66053e6d7d5de17a9c68e4f3d70db4a1180e56da587e68543ab99a0b59a11f59`

Expected result: **117 successfully applied migrations / 155 public tables**, including `_prisma_migrations`, from the genuine **116 / 150** baseline. Five added tables start empty. The populated PostgreSQL 14.19 rehearsal preserved every original row and historical ledger checksum, performed zero conversion/backfill and ended with zero Prisma drift. All 116 historical migration SQL files are byte-identical. No old scalar column was added or changed; existing-model Prisma additions are inverse relations, with one new BusinessEventType value.

The exact catalog delta is five tables, 19 indexes (including five PK indexes), 14 FKs, four CHECKs, five PK constraints, eight new functions and ten triggers. Two existing guard functions and one BusinessEvent CHECK are extended, and one enum value is added. No catalog object is removed. The inventory below identifies all additions; the disposable runner also saves their complete PostgreSQL definitions to `/private/tmp/flux-phase62-migration-inventory.json`.

| Folder flag | Verification flag | Behavior after migration |
| --- | --- | --- |
| Off | Off | Existing Archive view; review endpoints reject without querying review tables. |
| On | Off | Phase 6.1 folders; verification remains closed. |
| Off | On | Verification works in the existing category/details view. |
| On | On | Folder and legacy views both offer authorized verification. |

Both switches require exactly `1`. They are independent but either enabled feature requires the combined migration. Both off was exercised against the actual 116-migration schema using the current generated client: old reads/downloads work and new services reject before missing-table access. All four combinations were exercised after migration; Chromium separately exercised verification with folders on and off. Actual `.env*` files and existing flags are unchanged. Git staging remained empty and byte-identical to its entry snapshot. Phase 5 candidate/source files and hashes are unchanged.

## Validation results

| Check | Final result |
| --- | --- |
| Combined populated 116→117 rehearsal and Phase 6.1 suite | PASS; 150→155 tables, original rows/ledger preserved, exact catalog delta, zero drift/backfill. |
| Phase 6.2 integration | PASS; 50 intentional denials, exact manual/native sources, current roles/grants, wrong bindings, rejected source, missing/changed objects, mandatory confirmation/reason, stale/replayed/concurrent commands, history cursor privacy, immutable history, new-version noninheritance, folder preservation, direct SQL role/grant attacks, retained deletion and six audit deliveries with replay. |
| Forced BusinessEvent and EventOutbox failure | PASS; no false decision/event/outbox survives rollback. |
| V2 Archive / Library / session / project-read / completion documents | PASS; original role, sharing, download/preview, accepted publication, deletion and isolation contracts retained. |
| Shared File Identity / file-access / existing approvals and events | PASS; exact pins, overwrite denial, provenance, historical compatibility, delivery retry/replay and populated follow-up migrations. |
| Native project governance and project-write | PASS; current authorization, real actor, closure/approval boundaries and rollback retained. |
| Tasker / concepts / Sisters / Stage Builder / publication / runtime / runtime completion | PASS. |
| Five Phase 5 templates, both POSM choices | PASS; 3,803 template assertions. Source extraction check also passes with unchanged SHA-256 `4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944`. |
| Archive access/edit/direct-wizard, final permissions, AI Archive finder static checks | PASS. |
| Full TypeScript (`--noEmit --incremental false`) | PASS. |
| Targeted ESLint over all changed/new executable TS/TSX/MJS (`--max-warnings 0`) | PASS. |
| Isolated production `pnpm build --webpack` | PASS compilation, TypeScript and generation; existing `keyv → got → ably` dynamic-dependency warning only. No environment files copied; unreachable loopback build DB. |
| Chromium 153.0.8010.12, folders on + verification on | PASS; 10 groups, 15 screenshots, nine expected denied/conflict responses, zero unexpected HTTP responses, JavaScript errors or external requests. |
| Chromium, folders off + verification on | PASS; seven groups, 10 screenshots, four expected denied responses, zero unexpected HTTP responses, JavaScript errors or external requests. |

Both browser runs use genuine synthetic password logins and persisted database assertions: Director VERIFY, Director REVOKE retaining the initial decision and audit, then independently authorized Digital Lead VERIFY. SPM/Designer actions remain unavailable, Designer review history stays private, and mobile keyboard controls work. Nine account assignments/passwords remain unchanged. All S3 traffic goes to the local protocol fixture. Disposable app/database/storage fixtures are removed afterward.

During development, the new deferred event FK and generic event-trigger table branch were corrected before the passing suite. Older harness assumptions also needed scoped dialog selectors and the new migration/table totals. Their corrected reruns pass; there is no remaining failing required check. This is local implementation verification on PostgreSQL **14.19**, not formal production QA or an independent Neon **18.6** rehearsal.

Evidence in `/private/tmp`: `flux-phase62-integration.log`, `flux-phase62-regressions.log` (initial combined run, including the subsequently corrected legacy harness assertion), `flux-phase62-events.log`, `flux-phase62-project-regressions.log`, `flux-phase62-runtime.log`, `flux-phase62-template-source.log`, `flux-phase62-types.log`, `flux-phase62-lint.log`, `flux-phase62-build.log`, `flux-phase62-browser.log`, `flux-phase62-browser-legacy.log`, both `flux-phase62-browser*-artifacts/result.json` directories, `flux-phase62-migration-inventory.json`, `flux-phase62-before.json` and `flux-phase62-preservation.json`.

Reproduction entry points: `pnpm archive:verification-check` (includes Phase 6.1), `pnpm archive:folders-check`, and the browser harness using an isolated build via `FLUX_BROWSER_BUILD` plus `--verification` / `--without-folders`.

## Remaining scope and Phase 6.3 recommendation

Historical records without a genuine exact shared reference, READY version and supported pin/seal remain unavailable for verification. No live coverage percentage is asserted because Neon was not queried. A later native upload/publication adapter must establish identity at its real finalization boundary; bulk historical adoption requires a separate reviewed plan. Retained deletion history is available in the database audit chain; no new deleted-file/history browsing endpoint is introduced.

The unresolved policy question is Digital Lead revocation authority; this package conservatively keeps it Director-only. No additional rights are implied by organization or verification.

For Phase 6.3, separately review the intended sharing lifecycle against this exact-version and retained-history contract: grants/expiry/revocation, authorized source resolution and version pinning. Do not use verification as a sharing permission or legal certification. Scope and review that package separately; no Phase 6.3 implementation, activation or deployment is authorized by this report.

## Exact combined migration inventory

### Tables

- `ArchiveFilePlacement`
- `ArchiveFolder`
- `ArchiveOrganizationCommand`
- `ArchiveVerificationDecision`
- `RetainedArchiveSource`
### Indexes (including primary keys)

- `ArchiveFilePlacement_archivedProjectFileId_key`
- `ArchiveFilePlacement_categoryId_folderId_idx`
- `ArchiveFilePlacement_manualArchiveFileId_key`
- `ArchiveFilePlacement_pkey`
- `ArchiveFolder_categoryId_parentId_idx`
- `ArchiveFolder_id_categoryId_key`
- `ArchiveFolder_pkey`
- `ArchiveFolder_sibling_name_key`
- `ArchiveOrganizationCommand_categoryId_createdAt_idx`
- `ArchiveOrganizationCommand_pkey`
- `ArchiveVerificationDecision_actorId_commandId_key`
- `ArchiveVerificationDecision_eventId_key`
- `ArchiveVerificationDecision_pkey`
- `ArchiveVerificationDecision_previousId_key`
- `ArchiveVerificationDecision_referenceId_sequence_key`
- `ArchiveVerificationDecision_sourceKind_sourceId_versionId_idx`
- `RetainedArchiveSource_manualSourceId_key`
- `RetainedArchiveSource_pkey`
- `RetainedArchiveSource_projectSourceId_key`
### Constraints

- `"ArchiveFilePlacement".ArchiveFilePlacement_archivedProjectFileId_fkey` — foreign key
- `"ArchiveFilePlacement".ArchiveFilePlacement_categoryId_fkey` — foreign key
- `"ArchiveFilePlacement".ArchiveFilePlacement_folderId_categoryId_fkey` — foreign key
- `"ArchiveFilePlacement".ArchiveFilePlacement_manualArchiveFileId_fkey` — foreign key
- `"ArchiveFilePlacement".ArchiveFilePlacement_pkey` — primary key
- `"ArchiveFilePlacement".ArchiveFilePlacement_target_check` — check
- `"ArchiveFolder".ArchiveFolder_categoryId_fkey` — foreign key
- `"ArchiveFolder".ArchiveFolder_metadata_check` — check
- `"ArchiveFolder".ArchiveFolder_parentId_categoryId_fkey` — foreign key
- `"ArchiveFolder".ArchiveFolder_pkey` — primary key
- `"ArchiveOrganizationCommand".ArchiveOrganizationCommand_actorUserId_fkey` — foreign key
- `"ArchiveOrganizationCommand".ArchiveOrganizationCommand_pkey` — primary key
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_actorId_fkey` — foreign key
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_eventId_fkey` — foreign key, deferred
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_pkey` — primary key
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_previousId_fkey` — foreign key
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_referenceId_fkey` — foreign key
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_values_check` — check
- `"ArchiveVerificationDecision".ArchiveVerificationDecision_versionId_fkey` — foreign key
- `"RetainedArchiveSource".RetainedArchiveSource_actorId_fkey` — foreign key
- `"RetainedArchiveSource".RetainedArchiveSource_id_fkey` — foreign key
- `"RetainedArchiveSource".RetainedArchiveSource_pkey` — primary key
- `"RetainedArchiveSource".RetainedArchiveSource_typed_check` — check
### New functions

- `flux_archive_command_retained()`
- `flux_archive_folder_guard()`
- `flux_archive_placement_guard()`
- `flux_archive_retention_guard()`
- `flux_archive_review_guard()`
- `flux_archive_review_source(text)`
- `flux_archive_source_retention()`
- `flux_emit_archive_review_event()`
### Triggers

- `"ArchiveFilePlacement".flux_archive_placement_guard`
- `"ArchiveFolder".flux_archive_folder_guard`
- `"ArchiveOrganizationCommand".flux_archive_command_retained`
- `"ArchiveVerificationDecision".flux_archive_review_guard`
- `"ArchiveVerificationDecision".flux_archive_review_truncate`
- `"ArchiveVerificationDecision".flux_emit_archive_review_event`
- `"ArchivedProjectFile".flux_archive_source_retention`
- `"ManualArchiveFile".flux_archive_source_retention`
- `"RetainedArchiveSource".flux_archive_retention_guard`
- `"RetainedArchiveSource".flux_archive_retention_truncate`

Extended existing objects: `BusinessEventType` (one value), `BusinessEvent_contract_check`, `flux_event_write_guard()` and `flux_shared_file_reference_guard()`. Existing producer branches and reference guards remain in place. The five tables start empty; all original table data is preserved.

## Exact Phase 6.2 file manifest

Measured against committed Phase 6.1 (`23def33`): **8 files created; 23 modified**. No files were staged, unstaged, committed, pushed or deployed.

### Created

- `scripts/archive-verification-browser-acceptance.mjs`
- `scripts/archive-verification-integration-check.ts`
- `src/app/api/archives/verification/route.ts`
- `src/components/archives/archive-verification.tsx`
- `src/lib/archive-verification/PHASE-6.2.md`
- `src/lib/archive-verification/activation.ts`
- `src/lib/archive-verification/contracts.ts`
- `src/lib/archive-verification/service.ts`

### Modified

- `package.json`
- `prisma/migrations/20261025010000_archive_folders/migration.sql`
- `prisma/schema.prisma`
- `scripts/archive-folders-browser-acceptance.mjs`
- `scripts/archive-folders-browser-check.mjs`
- `scripts/archive-folders-integration-check.ts`
- `scripts/archive-folders-schema-baseline.mjs`
- `scripts/run-archive-folders-isolated.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/run-universal-tasker-isolated.mjs`
- `scripts/tasker-schema-baseline.mjs`
- `src/app/(dashboard)/archives/[slug]/page.tsx`
- `src/components/archives/archive-category-workspace.tsx`
- `src/components/archives/archive-folder-workspace.tsx`
- `src/lib/archive-folders/PHASE-6.1.md`
- `src/lib/archives.ts`
- `src/lib/authorization/ARCHIVES.md`
- `src/lib/authorization/archive-policies.ts`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/events/contracts.ts`
- `src/lib/files/FOUNDATION.md`
- `src/lib/storage/s3.ts`

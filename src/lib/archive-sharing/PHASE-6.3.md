# FLUX V2 — Phase 6.3: internal Archive sharing

> Historical phase report. [Phase 6.4](../archive-runtime/PHASE-6.4.md) records the latest still-unapplied combined migration, checksum, 159-table rehearsal and runtime Archive integration. The implementation and evidence below retain their original phase scope.

Development implementation, 2026-10-24. Phase 6.3 only. No Neon migration, live S3 use, flag activation, account changes, push, deployment, runtime Archive publication, or later package work.

## 1. Existing implementation reviewed and preserved

Reviewed the Phase 6.1/6.2 reports, central Archive policies and eligibility, `archives.ts`, category ACLs, `archive-access.ts`, native access route/button, folder queries, protected download/preview routes, Shared File Identity access, current versioned sessions, and BusinessEvent/outbox contracts.

`UserArchiveAssetAccess` already grants a specific manual or archived-project file to an active Designer/Digital Lead. Director and SPM manage those grants. Category restrictions remain an additional requirement. Native upload, download, metadata, Director deletion, and legacy external sharing already have their own authorization boundaries. Existing grant rows had no expiry or version restriction, and their checkbox writer had no explicit confirmation, mandatory revocation reason, durable decision history, or transactional audit event. Digital Lead's existing native grant can independently satisfy the file-grant requirement for verification.

No historical grant is converted, narrowed, backfilled, or assigned invented history. The native table remains the access authority. Two additive tables supply only the missing narrowing metadata and immutable decisions; they do not independently confer access.

## 2. Workflow

Director/SPM can open **Manage access** from an authorized file, search active eligible recipients, review the proposed scope and optional expiry, confirm a grant, inspect current recipients/effectiveness, and revoke with a mandatory reason. State is reloaded after the server confirms a command. Recipient search is bounded to 50 matches, with an explicit prompt to narrow the search; history has 50-record cursor pages. Duplicate submissions reuse the exact command when the response is uncertain.

New commands use `POST /api/archives/access`. Manager reads reuse `GET` when the dedicated flag is enabled. The existing `PUT` writer remains available for untouched native files with the flag disabled. Audited files require the confirmed workflow; the old checkbox UI cannot misrepresent their scoped or expired grants. SQL also prevents unaudited mutation/recreation of an audited native grant pair, including with the UI flag disabled.

## 3. Exact scope and version identity

`ArchiveGrantScope` attaches a decision to the existing native grant by primary/FK identity. The immutable `ArchiveAccessDecision` records actual actor, current role/authorization version/session, recipient, native source/category, genuine reference/version when available, source fingerprint, capability, optional expiry, reason, command hash, sequence/previous decision, and event identity.

Every new grant permits `PREVIEW_DOWNLOAD` only. With genuine supported identity, it pins the exact native reference/version and source fingerprint; no logical-file, sibling, source-project, future-version, or family grant is created. A version or source mismatch denies access. Conditional version GET checks the exact source, current permission, ETag and object version through the existing Shared File service.

Historical unmapped sources retain the legitimate native download path, explicitly labeled **integrity unknown**. New grants also freeze their native source fingerprint and expire normally. No version, checksum, approval, uploader, ownership, or provenance is invented. Existing unscoped native grants retain their previous semantics. Renewing an expired/new scoped grant requires explicit revocation and a new grant; it is never silently extended.

## 4. Category and folder boundaries

Category ACL plus eligible explicit native file grant remains the restricted-role rule. Prepared effective grant filters are used by central file authorization, category summaries, native lists/search, category availability, folder contents/counts and ancestor paths. No prepared scope fails closed. Category access and folders cannot independently authorize a file.

Folder moves/renames and file movement within the category do not modify grants or review decisions. Cross-category organization remains denied. New files in an existing folder inherit no access. Download-only readers see only their files and the ancestor paths necessary to reach them. Digital Lead retains its independently authorized category management and empty-folder visibility.

## 5. Roles

| Role | Internal sharing | File use / verification |
| --- | --- | --- |
| Director | Manage grants and revoke with actual identity | Existing global access, deletion and verification; verification revocation remains Director-only |
| Senior Project Manager | Manage grants under existing broad policy | Existing permitted access; cannot delete, verify, or revoke verification |
| Digital Lead | Cannot enumerate/manage recipients or grants | Category management retained; new grants permit preview/download only; independent existing native grant plus category/current-role requirements may allow verification |
| Designer | Cannot enumerate/manage recipients/history | Explicit granted files only, preview/download and permitted status; no verification reasons or review actions |
| Junior Project Manager | Denied | A forged native grant does not bypass role eligibility |
| Technical administrator / unassigned | Denied | Technical or legacy FULL profile does not confer business Archive authority |

Current session, account status, business role, authorization version, category ACL and source binding are checked for protected application operations. Sharing does not change Library or project permissions.

## 6. Expiry and revocation

Optional expiry is bounded to the future and at most 90 days; the UI offers no expiry or 1/7/30/90 days. SQL uses UTC consistently with Prisma timestamps. Expired grants remain visible to managers as ineffective until explicitly revoked. Revocation removes the native grant and its narrowing companion, retaining the immutable decision chain and event/outbox.

New protected requests deny after revocation or expiry, including direct version requests, lists/search and folder paths. Restrictions remain active on a migrated database with the sharing flag off. Sessions invalidated by expiry or current authorization changes cannot revive access.

Previously issued legacy direct S3 URLs remain usable until their existing expiry (up to five minutes); revocation does not recall already downloaded bytes or an authorized response already in progress. New exact-version grants use the protected conditional streaming route instead of minting a new direct S3 URL. No instant storage-level URL invalidation is claimed.

## 7. UI and protected downloads

Both category/details and folder workspace use the same accessible native dialog, recipient search, scope explanation, expiry, confirmation checkbox, revoke reason, current recipient list, immutable history, server errors and success messages. Controls are limited to existing sharing managers. Restricted users do not receive management DTOs.

Native preview/download routes reauthorize every request and use private/no-store redirects. Relative protected Location headers preserve the browser origin behind reverse proxies; they do not use the server’s internal hostname. For a new version-specific grant, redirects point to the existing protected version route, which rechecks permission and streams conditionally pinned bytes. Legacy download behavior remains available for eligible unmapped sources. The native checkbox workflow is preserved for untouched files while the new workflow is disabled.

## 8. Verification compatibility

New grant metadata never confers VERIFY: central policy, UI projection and the PostgreSQL verification guard all enforce this. Original native Digital Lead grants still permit eligible independent review. Revoking one removes future file/review access without altering its existing verification decisions. Director's verified decision survives grant/revoke; SPM remains ineligible for review/deletion. New versions retain separate verification states. File/folder moves leave review history unchanged. Director source deletion removes access while retaining exact reference/version, tombstone and audit evidence; audited source IDs cannot be reused, including historical unmapped sources.

## 9. Audit, concurrency and rollback

Confirmed commands run through current-session `runArchiveOperation` with Serializable isolation, source/category/grant locks, a per-source advisory lock, expected native grant ID, expected decision ID/sequence, and actor-scoped command/hash replay (canonical field ordering). Stale/competing writes cannot overwrite current access. A replay returns its original receipt without regranting access after a later revocation.

Guarded append-only decisions trigger the native grant create/delete, companion metadata, `ARCHIVE_ACCESS_DECIDED` BusinessEvent and `internal.audit.v1` outbox atomically. History, scopes and audited native grant mutations are guarded in SQL. The event guard/decoder validates exact native causation; events exclude free-text reasons and raw storage locators. Tests inject BusinessEvent and EventOutbox failures and confirm no decision, grant, scope or partial audit survives. Dispatcher replay creates one receipt.

## 10. Changed files

This package changes 33 files (25 modified, 8 created):

- `prisma/migrations/20261025010000_archive_folders/migration.sql`
- `prisma/schema.prisma`
- `scripts/archive-folders-browser-check.mjs`
- `scripts/archive-folders-integration-check.ts`
- `scripts/archive-folders-schema-baseline.mjs`
- `scripts/archive-sharing-browser-acceptance.mjs`
- `scripts/archive-sharing-integration-check.ts`
- `scripts/run-archive-folders-isolated.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/archives/[slug]/page.tsx`
- `src/app/api/archives/access/route.ts`
- `src/app/api/archives/files/[archivedFileId]/download/route.ts`
- `src/app/api/archives/files/[archivedFileId]/preview/route.ts`
- `src/components/archives/archive-access-button.tsx`
- `src/components/archives/archive-category-workspace.tsx`
- `src/components/archives/archive-folder-workspace.tsx`
- `src/components/archives/archive-manage-access.tsx`
- `src/lib/archive-access.ts`
- `src/lib/archive-folders/PHASE-6.1.md`
- `src/lib/archive-folders/service.ts`
- `src/lib/archive-sharing/PHASE-6.3.md`
- `src/lib/archive-sharing/activation.ts`
- `src/lib/archive-sharing/contracts.ts`
- `src/lib/archive-sharing/service.ts`
- `src/lib/archive-verification/PHASE-6.2.md`
- `src/lib/archive-verification/service.ts`
- `src/lib/archives.ts`
- `src/lib/authorization/ARCHIVES.md`
- `src/lib/authorization/archive-grants.ts`
- `src/lib/authorization/archive-policies.ts`
- `src/lib/authorization/archive-rules.ts`
- `src/lib/authorization/archive.ts`
- `src/lib/events/contracts.ts`

No Git staging was changed. The Phase 6.2 baseline is committed as `ea71dbb`; Git index entries match the initial preservation snapshot. All work in this package remains unstaged.

## 11. Pending migration and preservation

Extended the one unapplied candidate: `prisma/migrations/20261025010000_archive_folders/migration.sql`.

Complete SHA-256: `5b7c6cd5e7a8b98dcbd4c0235df1d50899ea17a2bbce4bce7ed1390720ef8944`.

The prior Phase 6.1+6.2 checksum `d31232757d4d53465a5dd7ce925ba672c501e110e42b56742bd5519b5bb2a81b` is historical, not the current deployment checksum. All 116 historically applied migration files remain byte-identical.

Populated PostgreSQL **14.19** rehearsal: **116 migrations / 150 public tables → 117 / 157**. Compared every original table row and old migration ledger/checksum before/after; all unchanged. All seven new tables begin empty; no backfill, relocation, grant conversion, or destructive migration. Prisma drift is empty before and after the candidate. Current application code/client also passed against the original 116 schema with new features disabled.

Combined additions versus 116: **7 tables, 27 indexes, 34 constraints (22 FKs, 5 checks, 7 PKs), 14 functions, 17 triggers**. No catalog objects removed. Four existing definitions change: BusinessEventType, BusinessEvent_contract_check, flux_event_write_guard(), flux_shared_file_reference_guard(). Phase 6.3 contributes 2 tables, 8 indexes, 11 constraints (8 FKs, 1 check, 2 PKs), 6 functions and 7 triggers to the previous candidate; it also strengthens the pending verification/source-retention guards. Exact names follow below; full observed catalog definitions are retained in `/private/tmp/flux-phase63-migration-inventory.json`.

`FLUX_ARCHIVE_SHARING` defaults off unless exactly `1`. Existing folders and verification flags remain independent. `.env`, `.env.local`, `.env.example`, template definitions/source and all historical SQL were checked against the initial snapshot; no environment files were edited and all three Phase 6 flags are off/unset.

## 12. Validation

- Combined `run-archive-folders-isolated.mjs --verification --sharing`: passed populated migration/zero drift, Phase 6.1 and Phase 6.2, and sharing service/HTTP/SQL regressions. Phase 6.2: 50 expected denials and 6 audit deliveries; sharing: 64 expected denials and 13 deliveries including separate verification events. Zero unexpected errors; fake storage only.
- New tests cover Director/SPM grants, eligible recipients and all denied roles, actual actor/source/version, conditional preview/download, wrong version/source project, raw SQL actor forgery, legacy behavior, Digital Lead independent/native review versus new download-only grants, search/count/breadcrumb privacy, expiry including flag-off, session/category revocation, stale/CAS/races/replay, immutable audit/scopes, forced event/outbox rollback, preserved verification, source deletion and ID reuse denial.
- Authorization regression runner with `--archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events`: passed. Original native upload/download/share/revoke/delete, external native links, current roles/sessions, Shared File Identity, Library, project services, approval events and outbox remain intact.
- Tasker/runtime runner with `--stage-runtime --runtime-integration --standard-templates`: passed, including runtime concepts/Sisters/completion and all five Phase 5 templates (3,803 template assertions, both POSM material choices). Source extraction check passed: 523 paragraphs, unchanged SHA-256 `4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944`.
- Full `tsc --noEmit --incremental false`, targeted ESLint with zero warnings, static Archive/access/edit/direct-wizard/final-permissions/AI-finder checks: passed.
- Isolated production webpack build: passed with a deliberately unreachable build-only DB URL and no environment-file copy. Existing keyv → got → ably dynamic dependency warning remains; no new build errors.
- Chromium **153.0.8010.12** acceptance: passed with folders enabled (**12 groups, 19 screenshots, 14 expected denials**) and disabled (**9 groups, 14 screenshots, 9 expected denials**). Both runs demonstrated persisted Director/SPM grants, genuine Designer exact-version download/preview, confirmed reasoned revocation, subsequent native/version denial, private management/history, unchanged source identity and mobile keyboard dialogs. Zero page errors, unexpected HTTP responses, failed file requests or external requests in either run. Harness uses genuine synthetic logins, disposable PG, loopback fake S3, Node/browser external-network blocking, persisted native/decision/outbox assertions and screenshots. No live services.

Evidence logs: `/private/tmp/flux-phase63-{integration,regressions,native-final,runtime,types,lint,lint-final,build,template-source}.log`; browser artifacts: `/private/tmp/flux-phase63-browser-folders` and `/private/tmp/flux-phase63-browser-legacy`. Exact before/after file hashes and final preservation checks: `/private/tmp/flux-phase63-changes.json`.

## 13. Remaining limitations

This is development verification, not formal production QA. PostgreSQL 18.6/Neon activation has not been rehearsed live and no production data/storage was contacted. Scale/performance and long-running load are not certified by the synthetic suites. Source snapshots and effective native grant IDs are prepared per restricted transaction; large recipient/grant populations merit measurement before activation. Live recipient lists are unpaginated to avoid silently hiding grants; recipient search and audit history are bounded. Existing grant history before this package remains unknown, with no fabricated backfill. Scoped grants cannot be edited in place; explicit revoke/regrant is required. Direct legacy storage URL and in-progress response limitations remain as described above.

## 14. Phase 6.4 recommendation

Proceed only through a separate Phase 6.4 request after review of the combined pending migration, identity/grant semantics and local evidence. Keep all Phase 6 flags off and Neon unchanged until an explicitly authorized activation rehearsal. No later-phase implementation or activation was started.

## Exact combined catalog additions

Table objects:

```text
ArchiveAccessDecision
ArchiveFilePlacement
ArchiveFolder
ArchiveGrantScope
ArchiveOrganizationCommand
ArchiveVerificationDecision
RetainedArchiveSource
```

Index objects:

```text
ArchiveAccessDecision_actorId_commandId_key
ArchiveAccessDecision_eventId_key
ArchiveAccessDecision_pkey
ArchiveAccessDecision_previousId_key
ArchiveAccessDecision_sourceKind_sourceId_createdAt_idx
ArchiveAccessDecision_source_recipient_sequence_key
ArchiveFilePlacement_archivedProjectFileId_key
ArchiveFilePlacement_categoryId_folderId_idx
ArchiveFilePlacement_manualArchiveFileId_key
ArchiveFilePlacement_pkey
ArchiveFolder_categoryId_parentId_idx
ArchiveFolder_id_categoryId_key
ArchiveFolder_pkey
ArchiveFolder_sibling_name_key
ArchiveGrantScope_decisionId_key
ArchiveGrantScope_pkey
ArchiveOrganizationCommand_categoryId_createdAt_idx
ArchiveOrganizationCommand_pkey
ArchiveVerificationDecision_actorId_commandId_key
ArchiveVerificationDecision_eventId_key
ArchiveVerificationDecision_pkey
ArchiveVerificationDecision_previousId_key
ArchiveVerificationDecision_referenceId_sequence_key
ArchiveVerificationDecision_sourceKind_sourceId_versionId_idx
RetainedArchiveSource_manualSourceId_key
RetainedArchiveSource_pkey
RetainedArchiveSource_projectSourceId_key
```

Constraint objects:

```text
"ArchiveAccessDecision".ArchiveAccessDecision_actorId_fkey
"ArchiveAccessDecision".ArchiveAccessDecision_eventId_fkey
"ArchiveAccessDecision".ArchiveAccessDecision_pkey
"ArchiveAccessDecision".ArchiveAccessDecision_previousId_fkey
"ArchiveAccessDecision".ArchiveAccessDecision_recipientId_fkey
"ArchiveAccessDecision".ArchiveAccessDecision_referenceId_fkey
"ArchiveAccessDecision".ArchiveAccessDecision_values_check
"ArchiveAccessDecision".ArchiveAccessDecision_versionId_fkey
"ArchiveFilePlacement".ArchiveFilePlacement_archivedProjectFileId_fkey
"ArchiveFilePlacement".ArchiveFilePlacement_categoryId_fkey
"ArchiveFilePlacement".ArchiveFilePlacement_folderId_categoryId_fkey
"ArchiveFilePlacement".ArchiveFilePlacement_manualArchiveFileId_fkey
"ArchiveFilePlacement".ArchiveFilePlacement_pkey
"ArchiveFilePlacement".ArchiveFilePlacement_target_check
"ArchiveFolder".ArchiveFolder_categoryId_fkey
"ArchiveFolder".ArchiveFolder_metadata_check
"ArchiveFolder".ArchiveFolder_parentId_categoryId_fkey
"ArchiveFolder".ArchiveFolder_pkey
"ArchiveGrantScope".ArchiveGrantScope_decisionId_fkey
"ArchiveGrantScope".ArchiveGrantScope_grantId_fkey
"ArchiveGrantScope".ArchiveGrantScope_pkey
"ArchiveOrganizationCommand".ArchiveOrganizationCommand_actorUserId_fkey
"ArchiveOrganizationCommand".ArchiveOrganizationCommand_pkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_actorId_fkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_eventId_fkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_pkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_previousId_fkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_referenceId_fkey
"ArchiveVerificationDecision".ArchiveVerificationDecision_values_check
"ArchiveVerificationDecision".ArchiveVerificationDecision_versionId_fkey
"RetainedArchiveSource".RetainedArchiveSource_actorId_fkey
"RetainedArchiveSource".RetainedArchiveSource_id_fkey
"RetainedArchiveSource".RetainedArchiveSource_pkey
"RetainedArchiveSource".RetainedArchiveSource_typed_check
```

Function objects:

```text
flux_apply_archive_access()
flux_archive_access_guard()
flux_archive_access_source(text,text)
flux_archive_command_retained()
flux_archive_folder_guard()
flux_archive_grant_effective(text,text)
flux_archive_native_grant_guard()
flux_archive_placement_guard()
flux_archive_retention_guard()
flux_archive_review_guard()
flux_archive_review_source(text)
flux_archive_scope_guard()
flux_archive_source_retention()
flux_emit_archive_review_event()
```

Trigger objects:

```text
"ArchiveAccessDecision".flux_apply_archive_access
"ArchiveAccessDecision".flux_archive_access_guard
"ArchiveAccessDecision".flux_archive_access_truncate
"ArchiveFilePlacement".flux_archive_placement_guard
"ArchiveFolder".flux_archive_folder_guard
"ArchiveGrantScope".flux_archive_scope_guard
"ArchiveGrantScope".flux_archive_scope_truncate
"ArchiveOrganizationCommand".flux_archive_command_retained
"ArchiveVerificationDecision".flux_archive_review_guard
"ArchiveVerificationDecision".flux_archive_review_truncate
"ArchiveVerificationDecision".flux_emit_archive_review_event
"ArchivedProjectFile".flux_archive_source_retention
"ManualArchiveFile".flux_archive_source_retention
"RetainedArchiveSource".flux_archive_retention_guard
"RetainedArchiveSource".flux_archive_retention_truncate
"UserArchiveAssetAccess".flux_archive_native_grant_guard
"UserArchiveAssetAccess".flux_archive_native_grant_truncate
```

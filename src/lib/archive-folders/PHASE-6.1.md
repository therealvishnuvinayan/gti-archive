# FLUX V2 — Phase 6.1: Archive categories, folders and navigation

**Historical Phase 6.1 report.** The still-unapplied candidate was extended by [Phase 6.2](../archive-verification/PHASE-6.2.md) and [Phase 6.3](../archive-sharing/PHASE-6.3.md). Its current combined SHA-256 is `5b7c6cd5e7a8b98dcbd4c0235df1d50899ea17a2bbce4bce7ed1390720ef8944`, with **117 migrations / 157 public tables** after application. The original checksum and 153-table result below describe the Phase 6.1-only rehearsal. All three Phase 6 flags remain off/unset.

Implemented locally on 23 October 2026. This package extends the existing Archive, preserves the reviewed Phase 1.5F permission contract, and remains disabled by default. No Neon migration, live storage operation, environment change, deployment, push, Phase 6.2 or Phase 7 work was performed.

## Architecture reviewed and retained

- `ArchiveCategory` already supports categories, category hierarchy, descriptions, allowlisted UI glyphs/custom icon handling, status and category ACLs. Its existing settings actions remain the category creation/edit/reorganization entry point. No replacement category database was introduced.
- `ProjectArchive` and `ArchivedProjectFile` retain native project/source attachment/revision, publisher, dates and object references. `ManualArchiveFile` retains upload ownership, metadata and storage identity. The existing `archives.ts` services and API routes continue handling uploads, previews, downloads, metadata, deletion, sharing and accepted native-project publication.
- Phase 1.5F's `runArchiveOperation`, current versioned session, central eligibility/resource policies, category ACLs and per-file `UserArchiveAssetAccess` grants remain authoritative. The new service joins the same Serializable authorization transaction.
- SharedFile distinguishes logical identity from immutable SharedFileVersion. SharedFileReference binds the exact native record/version; SharedFileProvenance retains existing native evidence. Folder movement writes none of these models. Legacy records without shared identities stay legacy; no inferred checksum, uploader, version or approval is manufactured.
- Native Stage 6 preparation/publication remains separate from final completion. Runtime completion still does not publish to Archives. Library retains its independent, narrower project/assignment/manual-uploader policies.

## Additive organization model

| Model | Purpose |
| --- | --- |
| `ArchiveFolder` | Category-bound hierarchy, name, description, allowlisted icon, revision and timestamps. Composite parent/category FK rejects cross-category hierarchy. |
| `ArchiveFilePlacement` | One optional organization mapping per existing manual or project Archive file, including a revision. A null folder means category root. Source identity/category are immutable on updates. |
| `ArchiveOrganizationCommand` | Immutable command receipt/history: unique command ID, actual actor, normalized request/hash, prior organization state and result. IDs retained in JSON survive an explicitly authorized native file deletion. |

Only inverse Prisma relations were added to existing models; no scalar columns were added to old tables. The migration creates three tables and their constraints/indexes/triggers. It updates or relocates no old records. Unmapped files appear at their existing category root. The placement FK cascades only when an existing authorized native file deletion succeeds; source/version deletion protections remain unchanged. Empty-folder deletion is Director-only; nonempty deletion is rejected.

Folder names are unique among siblings, ignoring case and surrounding spaces. Names, descriptions and icon identifiers have server-side limits. PostgreSQL checks enforce valid exact source/category associations, acyclic hierarchy, same-category references, positive advancing revisions and a maximum depth of 64 including the moved subtree. Organization writes require Serializable isolation. A transaction-scoped organization lock serializes writers; serialization conflicts and stale revisions are surfaced for refresh rather than silently overwriting another command. The receipt and organization write commit atomically. A repeated identical command by the same currently authorized actor returns its receipt; changed payloads or actors cannot reuse it.

Cross-category folder/file moves are deliberately rejected: changing the existing source category could change file grants. No folder has an inherited ACL, ownership or independent publication state.

## Workspace and navigation

With the flag enabled, category pages open the new folder workspace. Existing category cards and settings are reused. Category managers can also enter permitted empty categories; restricted file totals still represent only their granted files.

The workspace includes a sidebar hierarchy, URL-addressable folders, breadcrumbs, folder descriptions/icons, creation and editing dialogs, grid/list views, literal filename search within the current folder and database-side pagination of 50 files. It provides loading, empty, unavailable, conflict and confirmation states. HTML drag/drop and ordinary Move buttons use the same destination dialog; native dialog/select controls support keyboard operation. A drop requires confirmation. File/folder placement only updates after a successful server response and fresh read.

`All files & details` preserves the existing complete category workspace, including upload, file metadata, approved native source details, access grants, sharing and deletion controls. Existing `?search=` deep links retain that view. `Browse folders` returns to organization. File previews/downloads use the unchanged protected routes.

The read query applies file grants and stored source consistency before counts, filename matches, pagination and visible paths. A Designer sees only the ancestor paths of individually granted files, never unrelated folder names or sibling counts. Seeing a folder or breadcrumb grants no file authority. The API uses private/no-store responses, a bounded JSON body, the existing configured application-origin helper and fresh current-session authorization.

## Role behavior

| Role | Organization and navigation | Files |
| --- | --- | --- |
| Director | Global category/folder create, edit, move and empty-folder deletion; actual actor retained | Existing global management, eligible deletion and reviewed verification eligibility retained |
| Senior Project Manager | Global category/folder create, edit and move; no deletion | Existing global Archive operations and file organization; no file deletion or verification |
| Digital Lead | Existing permitted category create/update; create, edit and move folders only in permitted categories | Explicit grants plus category permission; no new file edit/move authority. Verification eligibility remains as reviewed; no verification workflow activated |
| Designer | Granted-file paths only; no folder/category mutations or broad browsing | Download/preview of individually granted files in permitted categories only |
| Junior Project Manager | No default Archive authority under the current policy | Denied |
| Technical-only administrator/unassigned | No automatic business Archive rights | Denied |

An independent business role on a technical account still follows that role. Director/SPM retain their reviewed global scope without fabricated project ownership. Empty category ACLs retain their old meaning and never substitute for restricted-role file grants.

## Migration and activation boundary

Candidate: `prisma/migrations/20261025010000_archive_folders/migration.sql`

Historical Phase 6.1-only SHA-256 (superseded): `66053e6d7d5de17a9c68e4f3d70db4a1180e56da587e68543ab99a0b59a11f59`

Historical Phase 6.1-only result: **117 successful migrations / 153 public tables**, from the reported **116 / 150** baseline. Table totals include `_prisma_migrations`.

The candidate was rehearsed on populated disposable PostgreSQL **14.19**, with every original table, row and migration ledger checksum unchanged. The three added tables initially contained zero records; Prisma schema drift was empty. This does not claim an independent PostgreSQL 18.6/Neon rehearsal or live record inventory. Neon was not contacted.

The only new switch is `FLUX_ARCHIVE_FOLDERS`, enabled only when exactly `1`. It defaults off; no actual `.env` or `.env.local` file or existing flag was changed. The current generated client and existing Archive reads/downloads were tested on the actual 116-migration schema with the feature off. New endpoints reject before querying missing organization tables. Test harnesses inject the flag only into isolated processes.

There is no automatic migration or backfill. Any later historical classification would need a separately reviewed mapping, permission-impact review and explicit operation plan. It should create organization mappings while retaining source categories and exact identities; this package proposes no mass relocation.

## Verification

- New integration rehearsal: category creation via existing actions; folders, nesting, breadcrumbs, metadata/icon validation, rename/move, root compatibility, pagination, literal search, cycle/self/subtree-depth rejection, cross-category/source attacks, all role policies, counts/path redaction, Library independence, same-actor replay, conflicting replay, simultaneous opposing folder/file moves, stale revisions, forced folder and file-placement transaction rollback, direct database guards, HTTP origin/session checks and command retention. Original native files, uploads, authors, exact READY versions/object-version IDs, references, users and file grants remain unchanged. Organization performs zero storage calls.
- Existing isolated regression runner: authorization invariants/runtime sessions, Archive Phase 1.5F, Library Phase 1.5G, native project read/write, governance and completion documents all passed, with fake storage and unchanged synthetic accounts.
- Existing Tasker/runtime regression runner: General, deliverables, concepts, Sisters, Stage Builder/publication, runtime stages, creation governance, runtime Tasker, exact-version provenance and final completion all passed through the 116-migration baseline. Its only harness adjustment explicitly excludes this later migration/schema when rehearsing earlier phases.
- Archive access-level, edit, direct-upload wizard, final permissions and Flux AI Archive finder static regressions passed.
- Full `pnpm exec tsc --noEmit --incremental false`: passed.
- Targeted ESLint over all changed/new executable TS/TSX/MJS files, `--max-warnings 0`: passed.
- Isolated production `pnpm build --webpack`: passed compilation, full build TypeScript and page generation. The source copy contains no environment files and uses an unreachable loopback build-only DB URL. Webpack reports an existing dynamic dependency warning from `keyv → got → ably`; the build succeeds.
- Isolated Chromium **153.0.8010.12** acceptance: **PASS**, eight scenario groups and 12 screenshots. Genuine logins exercised real persisted category/folder creation, nesting, rename, folder/file drag-and-drop, confirmation before persistence, refresh, breadcrumbs, grid/list, search/empty states, keyboard listbox movement, conflict feedback and role restrictions. Original files/grants and all nine account assignments remained unchanged; zero browser JavaScript errors and zero external requests. The fake S3 fixture received four read-only GETs. Disposable app/database/storage fixtures were removed. Final evidence: `/private/tmp/flux-phase61-browser-artifacts/result.json`.
- Preservation audit: all 116 historical migrations and 166 protected migration/environment/template/Library/shared-file foundation files were byte-identical. Git staging remained empty as it was at entry.

Logs: `/private/tmp/flux-phase61-integration.log`, `flux-phase61-regressions.log`, `flux-phase61-runtime.log`, `flux-phase61-types.log`, `flux-phase61-lint.log`, `flux-phase61-build.log`, `flux-phase61-browser.log`; baseline inventory and preservation evidence: `flux-phase61-before.json`, `flux-phase61-preservation.json` in the same directory. Build source/artifact location is recorded in `/private/tmp/flux-phase61-build-path`.

## Exact file manifest

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/run-universal-tasker-isolated.mjs`
- `src/app/(dashboard)/archives/page.tsx`
- `src/app/(dashboard)/archives/[slug]/page.tsx`

Created:

- `prisma/migrations/20261025010000_archive_folders/migration.sql`
- `scripts/archive-folders-browser-acceptance.mjs`
- `scripts/archive-folders-browser-check.mjs`
- `scripts/archive-folders-integration-check.ts`
- `scripts/archive-folders-schema-baseline.mjs`
- `scripts/run-archive-folders-isolated.mjs`
- `scripts/tsconfig.archive-folders.json`
- `src/app/api/archives/organization/route.ts`
- `src/components/archives/archive-folder-workspace.tsx`
- `src/lib/archive-folders/activation.ts`
- `src/lib/archive-folders/contracts.ts`
- `src/lib/archive-folders/service.ts`
- `src/lib/archive-folders/PHASE-6.1.md`

## Deferred work and recommendation

Detailed per-file/per-version verification and revocation, redesigned sharing/access grants, RuntimeProject-to-Archive integration, complete cross-project search/filtering and final Archive acceptance remain deferred. Existing working sharing, grants, native publication and search stay intact. Phase 5 candidate definitions, hashes and approval status are unchanged. No Tasker-to-stage gates or Phase 7 work was added.

Recommended Phase 6.2: define and implement verification/revocation against exact SharedFileVersion/native-source evidence, with immutable decisions/reasons, current central authorization and permission-safe UI. Preserve the reviewed Director/Digital Lead eligibility and SPM denial; do not reinterpret artwork `approvedBy` metadata as verification. Schema adoption and activation remain separate, explicit decisions. At the time of this original report, Phase 6.2 had not been started; see the superseding report linked above.

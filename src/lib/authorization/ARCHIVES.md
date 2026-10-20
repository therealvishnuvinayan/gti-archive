# Phase 1.5F — Archive authorization and security integration

Status: implemented and verified locally, 18 October 2026. Ready for Phase 1.5F sign-off within the scope below. Nothing was pushed, deployed or activated through a database change.

## Confirmed authority

The user confirmed **SPM global; Designer/Digital Lead use grants**. Current active V2 identity and versioned session are authoritative. Legacy `User.role`, permission profiles, `UserArchiveAccess.FULL`, project collaborator flags, and caller-supplied user objects cannot establish Archive authority.

| Role | Read/download scope | Upload/edit/share/access grants | Categories | Verification | Project publication |
| --- | --- | --- | --- | --- | --- |
| Director | Global | Allowed; file deletion allowed | Create/update/delete globally | Eligible; workflow deferred | Global project intervention; accepted sources only |
| SPM | Global | Allowed; file deletion denied | Create/update globally; deletion denied | Denied | Owned/co-owned project; accepted sources only |
| JPM | Denied pending approved Archive contract | Denied | Denied | Denied | Denied |
| Designer | Explicit file grant plus permitted category | Denied | Denied | Denied | Denied |
| Digital Lead | Explicit file grant plus permitted category | Denied | Create; update/organize permitted categories; no deletion or ACL changes | Eligible; workflow deferred | Denied |
| Technical-only administrator / unassigned | Denied | Denied | Denied | Denied | Denied |

Technical privileges add no business rights. A person independently holding an eligible business role uses that role's authority.

An empty category ACL retains its established unrestricted-category meaning. It does **not** give Designer/Digital Lead access to all files: they also need a `UserArchiveAssetAccess` row. A nonempty category ACL must include the restricted user. Director/SPM bypass both resource-grant requirements, as confirmed. No legacy grants or assignments were rewritten.

## Central enforcement and removed overrides

`runtimeAuthorization` registers Archive policies in the existing V2 evaluator. Canonical actions are `archive.view`, `archive.download`, `archive.upload`, `archive.editMetadata`, `archive.shareExternal`, `archive.category.create/update/delete`, `archive.manageAccess`, `archive.delete`, and `archive.publishFromProject`. The previous `archive.share` name uses the same file policy. Unknown actions and target/action mismatches deny.

The role eligibility contract includes `archive.verify` for Director/Digital Lead only. Its runtime policy stays unregistered until verification storage/audit transitions exist. The old coarse category capability is not a generic mutation grant; actual operations use granular category capabilities.

Services authenticate again and check the actual resource inside a Serializable transaction. Nested native queries/transactions join that transaction; native error results roll back, and partial transactions are not retried. Identity/session and ACL locks protect checks. File policies resolve stored category/source associations and reject mismatched projects, revisions or storage references, including for Director. Storage cleanup after an authorized deletion runs after database commit.

Removed/replaced:

- Unconditional authenticated-user Archive grants in the legacy resolver, effective permission set and profile snapshot.
- Legacy full-access projections and project owner/admin/collaborator Archive overrides.
- Visibility-as-edit/share/delete permission. Each now has its own central check.
- Category saves that silently cleared restrictions; omission preserves grants, and changes require `archive.manageAccess`.
- Legacy user-profile updates that granted FULL and deleted all per-file grants.
- Unscoped category lookups and foreign icon-key signing; icon drafts must belong to the actual category manager or an accessible stored category.
- Full project-read membership as a prerequisite for an explicitly granted archived file. Archive access never grants general project access.
- Broad artwork metadata in restricted readers' lists/search matches. Download-oriented readers receive file-locating metadata; full artwork detail/editing remains management-only.

The shared master-data cache is filtered against fresh category visibility before response. Technical user management does not expose Archive filenames through other users' grants. Flux AI's Archive results use the secured search service; its history stores the user's query strings, not cached Archive result bodies. Existing Library source-file access remains independently protected by project authorization; Library code was not changed.

## Secured boundaries and UI

Existing service guards cover Archive lists, category views, search, uploads/finalization, metadata updates, deletion, previews/downloads, external share creation/consumption, and Stage 6 preparation/publication. Existing routes/actions continue delegating to those guarded services:

- `/api/archives/upload-url`, `/api/archives/complete`.
- `/api/archives/files/[archivedFileId]/download`, `/preview`, `/share`.
- `/api/archive-download/[token]`, `/preview` and the public download page.
- `/api/archive-categories` and `/api/archive-category-icons/upload-url`, `/preview`.
- Archive metadata/delete server actions; category save/status/delete server actions.
- Stage 6 Archive preparation/save actions.
- New `/api/archives/access` GET/PUT, backed by the central `archive.manageAccess` service.

Director/SPM can use **Archives → category → File access** to grant/revoke individual Designer/Digital Lead downloads. Stored grantor is the actual session user. Category restrictions remain effective. Category management remains at `/archives/settings/categories`. Director/SPM can edit ACL selections there; Digital Lead category edits preserve them. File edit/share/delete and category controls project the same V2 eligibility as the server. The Stage 6 publication button uses V2 publication and project authority.

External share tokens remain hashed, expiring and revocable. Consumption rechecks the real issuer's current active business authority and exact one-file association; legacy links minted by now-ineligible issuers fail. A bearer link is not an application session or an impersonated Director. Existing authorized sharing infrastructure is retained.

## Publication and completion safeguards

Only Director/SPM can publish. The service locks the project, checks current project access, requires completed Stage 6 and accepted production-unit/approval conditions, validates the exact submitted source set, and runs the existing `project.viewFile` policy for each source. Foreign production-file associations fail instead of being silently skipped. Destination category must be active and permitted.

Bucket/key/revision/source IDs come from accepted database attachments, not caller storage fields. New rows retain the actual publisher and original uploader/approval attribution. Re-publication preserves existing file records, timestamps, source identity and metadata; it cannot remove omitted history or replace an existing source. Explicit file deletion remains Director-only.

Publication does not set final completion. The old combined completion/archive path remains closed, as in Phase 1.5D/E. Final completion still requires Director governance and all mandatory document/workflow gates. Category changes and file-grant changes do not broaden project permissions.

## Validation

All final checks passed:

| Check | Result |
| --- | --- |
| Full `pnpm exec tsc --noEmit --incremental false` | PASS |
| Targeted ESLint, zero warnings | PASS |
| Authorization foundation/database invariants | PASS |
| Assignment services and runtime authentication | PASS |
| Project read and write integration | PASS |
| Governance and completion-document integration | PASS |
| New Archive authorization integration | PASS |
| Archive access/edit/direct-wizard and final permission regressions | PASS |
| Flux AI Archive finder/query regressions | PASS |
| Production `pnpm build` | PASS |
| Isolated browser smoke tests | PASS |

The isolated integration runner uses a fresh private PostgreSQL 14.19 cluster, a whitelisted environment, all 105 existing migrations, versioned synthetic sessions and fake storage. Schema drift is empty. It checks all business roles, global SPM access, grants/category restrictions, legacy FULL rejection, direct APIs, metadata/sharing/deletion denials, grant/revoke, actual actor binding, uploads, search redaction, accepted publication, new-source attribution, cross-project rejection, history retention, session expiry and verification eligibility. Existing project/governance/document regressions remained intact.

Browser verification used Chromium 153.0.8010.12, genuine password logins, an isolated copy of the production build, private PostgreSQL and loopback S3 protocol fixtures. Five scenario groups passed: role-specific file controls/downloads; JPM/technical/ungranted denial; SPM grant persistence and Designer access; category-management separation; account/data/network preservation. Seven screenshots were captured. Zero browser JavaScript errors and zero external requests occurred. All nine synthetic account assignments remained unchanged; no browser-test projects were created. Fixture databases/apps/storage were removed afterward.

The initial sandboxed build could not bind Turbopack's local subprocess port. It passed with local execution permitted and live environment values blanked. `pnpm build` contains Prisma client generation and Next build, **not migration deployment**; `vercel-build` was not run. Browser harness timing assertions were corrected to await persisted grant refresh and Next's streamed redirect; server authorization was not relaxed.

Verification artifacts (local, outside repository):

- `/private/tmp/flux-phase15f-archives-final.log`
- `/private/tmp/flux-phase15f-regressions.log` (foundation/services/runtime/project read)
- `/private/tmp/flux-phase15f-regressions-remaining.log` (Archive/documents/governance/project write)
- `/private/tmp/flux-phase15f-types-final.log`, `/private/tmp/flux-phase15f-lint.log`
- `/private/tmp/flux-phase15f-build.log`, `/private/tmp/flux-phase15f-search.log`
- `/private/tmp/flux-phase15f-browser-artifacts/result.json` and screenshots/server log
- `/private/tmp/flux-phase15f-manifest.json`

The old Archive edit fixture suite asserted unconditional access with supplied user objects. Its compatibility entry point now invokes the genuine-session V2 integration suite; preservation checks for naming, metadata forms, previews, upload wizard and protected routes remain. The older standalone Flux AI database-mutation script loads `.env`; it was not run against Neon. Its pure query regressions and secured search behavior were exercised safely instead.

## Preservation, migration and limits

No migration or schema change is required. No Neon connection, existing account/password/role mutation, live Archive/Library deletion, S3 operation, external email, push or deployment was performed. Against the pre-edit 829-file SHA-256 inventory, all 122 protected schema/migration/Library/storage files remained byte-identical. No existing project or approval/audit history was changed.

Deferred intentionally:

- Verified/Unverified storage, immutable decisions/reasons/revocations and verification audit history. A future migration should introduce versioned verification evidence tied to exact Archive file/source versions; existing artwork `approvedBy` metadata must not be reused as verification.
- Nested folders and folder-level sharing.
- A comprehensive append-only Archive mutation/access audit ledger. Existing publisher/metadata/share/grant attribution is retained; grant revocations are logged to the application log, not a new durable event table.
- Changes to the existing upload/storage protocol. This phase preserves its mechanics rather than introducing sealed object versions or a new content-validation subsystem.

Revoking access or a share token prevents subsequent URL issuance; an already issued S3 URL remains usable until its existing expiry. No remaining authorization bypass was found in the exercised Archive boundaries. This is local implementation verification, not a claim of deployment or a fresh live-Neon inventory.

Recommended next milestone: a dedicated Library authorization/security integration review, followed separately by the planned Archive verification/redesign work. No next milestone was started.

## Exact file manifest

30 existing files modified; 12 files created, including this report.

### Modified

- `scripts/archive-access-level-checks.mjs`
- `scripts/archive-edit-permission-checks.mjs`
- `scripts/archive-edit-permission-integration-check.ts`
- `scripts/final-permissions-regression-checks.mjs`
- `scripts/run-archive-isolated-integration.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/archives/[slug]/page.tsx`
- `src/app/(dashboard)/archives/page.tsx`
- `src/app/(dashboard)/archives/settings/categories/page.tsx`
- `src/app/(dashboard)/settings/project-master-data/actions.ts`
- `src/app/(dashboard)/settings/project-master-data/page.tsx`
- `src/app/api/archive-category-icons/preview/route.ts`
- `src/app/api/archive-category-icons/upload-url/route.ts`
- `src/app/api/archives/upload-url/route.ts`
- `src/components/archives/archive-category-workspace.tsx`
- `src/components/settings/project-master-data-workspace.tsx`
- `src/components/users/users-workspace.tsx`
- `src/lib/archive-categories.ts`
- `src/lib/archives.ts`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/project-transaction.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/permissions/effective.ts`
- `src/lib/permissions/profiles.ts`
- `src/lib/permissions/resolver.ts`
- `src/lib/prisma.ts`
- `src/lib/project-master-data.ts`
- `src/lib/stage-six.ts`
- `src/lib/user-permissions.ts`

### Created

- `scripts/archives-authorization-integration-check.ts`
- `scripts/archives-browser-check.mjs`
- `scripts/tsconfig.archives.json`
- `src/app/api/archives/access/route.ts`
- `src/components/archives/archive-access-button.tsx`
- `src/lib/archive-access.ts`
- `src/lib/authorization/archive-policies.ts`
- `src/lib/authorization/archive-rules.ts`
- `src/lib/authorization/archive-share.ts`
- `src/lib/authorization/archive-transaction.ts`
- `src/lib/authorization/archive.ts`
- `src/lib/authorization/ARCHIVES.md`

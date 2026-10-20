# Phase 1.5G — Library authorization and security integration

Implemented and verified locally on 18 October 2026, relative to commit `a8dc3e2` (Phase 1.5F). The user explicitly confirmed **restrictive scoped SPM/JPM access**. No deployment, push, live database operation, live storage operation or next phase was performed.

The implementation is ready for review/sign-off within that restrictive contract. Broader manager permissions and manual-file sharing/grants require a separate business decision. Two older optional test commands remain incompatible, as recorded below; all required current V2, Library, Archive, build and browser checks passed.

## Authority and capability coverage

The existing V2 evaluator remains the only authorization engine. `library-policies.ts` is registered alongside the existing project and Archive policies. Services authenticate the actual current session, check the supplied user ID against that session, and load resource evidence inside a Serializable transaction. Native queries and nested operations share that transaction. Session/version/status checks, actual actor attribution, workflow integrity and history preservation remain mandatory. Legacy roles, profiles, Archive FULL flags and caller-supplied user fields cannot grant Library authority.

| Role | List, preview, download and own favorites | Upload/metadata/tags/delete |
| --- | --- | --- |
| Director | Global over valid Library resources; no project membership required | Upload and set upload metadata/tags; manage shared tag vocabulary; remove eligible assets. Reference/history and project lifecycle restrictions remain mandatory. |
| SPM/JPM | Project files authorized by existing project ownership/co-ownership or an explicit assigned task; own READY manual uploads | Denied for Library operations pending approved management rights. Existing independently authorized project upload workflows remain unchanged. |
| Designer/Digital Lead | Only individually readable assigned concept/task files; no unrelated project files, invoices or manual assets | Denied |
| Technical-only/unassigned | Denied, including legacy ADMIN/SUPER_ADMIN and stored task membership | Denied |

Technical privileges add no Library business authority. An independent eligible business role is evaluated separately. Director acquires no technical administration rights.

| Capability | Implemented boundary |
| --- | --- |
| `library.view` | Library page/list/search/filter/count scope; authorized manual/attachment preview |
| `library.download` | Exact authorized READY resource before signing |
| `library.accessProjectFile` | Valid project attachment plus canonical V2 project/task file authorization |
| `library.upload` | Director upload intent creation and uploader-bound finalization |
| `library.editMetadata` | Metadata bound at upload-intent creation; no standalone metadata editor existed or was added |
| `library.manageTags` | Upload tag assignment and shared asset-tag create/update/status/delete actions; Director only |
| `library.favorite` | Add/remove/toggle the actual user's favorite on an authorized resource |
| `library.delete` | Director-only soft removal, independently checked from view/download; project lifecycle and reference protections retained |
| `library.share` | Defined eligibility; runtime policy deliberately unregistered because no Library share/token/grant workflow exists |

There is no manual Library resource-grant or project-reference table. Archive grants never substitute for one. A legacy manual upload owned by a Designer/Digital Lead therefore does not become an explicit work grant. No broad rights or new sharing feature were invented.

## Corrected unsafe paths

- Manual list/search/filter/count results formerly included every READY manual asset for a legacy Library user. They now use Director-global or manager-uploader scope before DTOs, options, counts and search results are built.
- Manual preview, download and favorite services formerly accepted guessed IDs after a coarse legacy check. Each now runs the central resource policy before any URL or mutation.
- Upload completion formerly accepted a caller-selected key under the uploader prefix without a stored request. Upload initiation now persists an UPLOADING `ManualLibraryAsset` with actual uploader, exact file size/type, metadata and tags before returning a signed URL.
- Finalization requires the matching current uploader and an active intent, rejects expired intents, verifies exact object length/type and ETag, and copies the object conditionally to a separate `.sealed` key before READY. A still-valid staging PUT URL cannot replace the finalized object. Replays return the same asset without copying staging bytes again. Deleted/failed uploads cannot be resurrected.
- The former key-based completion protocol remains compatible only when it resolves a stored intent with identical metadata/tags. The browser now submits the issued asset ID. Unknown keys and metadata substitution fail.
- Legacy ADMIN/SUPER_ADMIN, uploader and project-owner deletion shortcuts no longer grant Library deletion. Project-backed removal also reuses the existing project-write lifecycle loader and rejects referenced, approved, historical, closed or archived resources.
- Library removal retains database rows and stored objects. It marks the eligible record DELETED, preserving source references and history instead of deleting bytes before a database commit. This phase performs no live removal.
- Shared asset-tag actions formerly used legacy administration permissions and could alter Library tags indirectly. They now require the central Director-only `library.manageTags` capability. Archive category/file/grant/share policies and Archive tag-assignment rights are unchanged. The shared tag-options endpoint remains available to authorized Archive uploaders as well as Director; this grants no Library file access.
- Project-backed Library items now include individually authorized task files. They suppress management-level project tags for task-only readers. Cross-project stage/concept/revision/comment associations fail closed.
- Library attachment download/preview/favorite routes apply Library scope and existing project-file authority. Existing project consumers and their APIs retain their own V2 guards.
- Legacy Library permission keys in navigation/UI now project trusted V2 eligibility. Profile snapshots cannot supply Library grants. Server services remain authoritative.

## Preserved features and protected entry points

The existing interface, uploads/downloads, file names and creator metadata, tag selections, favorites, date/type/tag/project/creator filtering, search, pagination, previews and project references remain. Current Library source types and Archive exclusion remain unchanged. READY legacy assets retain their stored key and metadata; only newly completed uploads receive a sealed key.

Protected services include all public Library list/upload/finalize/preview/download/delete functions, manual favorite mutations and new Library attachment favorite/signing functions. Raw favorite-ID queries remain internal helpers used after resource filtering; no route accepts a different favorite owner.

Routes and actions:

- `/library`, `/api/library`.
- `/api/library/upload-url`, `/api/library/complete`.
- `/api/library/manual-assets/[assetId]`, `/download`, `/preview`, `/favorite`.
- `/api/library/attachments/[attachmentId]`, plus new `/download`, `/preview`, `/favorite`.
- `/api/asset-tags` and shared `saveAssetTagAction`, `setAssetTagStatusAction`, `deleteAssetTagAction`.

Denied authenticated API requests return 403; missing authentication returns 401. UI flags do not replace these checks.

FLUX AI currently searches Archives, not Library. Its existing Archive search authorization was preserved. An isolated direct AI request attempting to select Library returns no manual Library results. No new AI source or broad search grant was added. Existing project AI requires its independent project policy.

Successful Library mutations emit structured post-commit logs with the real actor, capability and target. Existing uploader/favorite ownership persists in the database. This is not a new durable universal Library audit table.

## Verification

| Check | Result |
| --- | --- |
| Full TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint, zero warnings | PASS |
| V2 capability foundation and persistence checks | PASS |
| Disposable database invariants, assignment services and runtime sessions | PASS |
| Library integration | PASS |
| Project read and write regressions | PASS |
| Creation/completion governance and completion-document regressions | PASS |
| Archive integration, access/edit/direct-wizard/final-permission checks | PASS |
| FLUX AI Archive finder/query checks; actual isolated Archive search and Library-source exclusion | PASS |
| Production `pnpm build` | PASS |
| Isolated Chromium browser checks | PASS |

Integration tests use fresh private PostgreSQL 14.19 clusters, Unix sockets with TCP disabled, generated temporary Prisma clients, versioned fixture sessions and fake storage. All 105 existing migrations apply only to those disposable databases; schema diff is empty. No Neon connection is used. This is not a PostgreSQL 18.6 live activation test.

Library coverage includes every role, legacy ALL/FULL profiles, owned/co-owned and foreign projects, assigned and unrelated tasks, technical membership denial, missing/cross-user/cross-project IDs, scoped counts/search, URL issuance, metadata/tag actions, favorite ownership, upload intent mismatch, file size/type checks, expiry, replay, sealed objects, reference/closed-project deletion denial, direct API bypasses, AI source exclusion, revoked sessions and preservation of nine fixture accounts/roles and existing authorization/Archive history.

Browser verification uses the production build in a temporary application directory without `.env` files, nine fictional accounts with genuine password login, a fresh database and a loopback S3 protocol fixture. Both Node and browser traffic are restricted to loopback. Verified:

1. Director, SPM, JPM, Designer and Digital Lead Library screens, correct controls, downloads and previews.
2. Both technical administrators denied; unrelated Designer sees an empty Library and cannot guess a task file ID.
3. Assigned-task favorite add/remove and search/count filtering.
4. Director upload through the interface, fake PUT/HEAD/conditional COPY, stored real uploader, READY sealed asset, and unauthorized finalize denial.
5. All nine assignments and project fixtures unchanged; no Archive records changed; zero browser errors and zero external requests.

Seven screenshots and the browser result are in `/private/tmp/flux-phase15g-browser-artifacts/`. Main evidence logs are `/private/tmp/flux-phase15g-library-regressions.log`, `flux-phase15g-v2-regressions.log`, `flux-phase15g-build.log`, `flux-phase15g-types.log`, and `flux-phase15g-lint.log`.

Test maintenance performed without relaxing authorization:

- The old project-read test's empty-Library assumption is replaced by explicit technical/unassigned denial and positive assigned-Designer/negative unrelated-Digital-Lead assertions.
- The final-permission static check now verifies the central download boundary instead of a removed legacy permission string.
- A foundation assertion incorrectly expected SPM Archive category deletion. The identical failure was reproduced from untouched HEAD source; the test now asserts the existing Phase 1.5F denial. Archive role behavior was not changed.

### Remaining older test-command failures

- `pnpm user-role:foundation-check` fails because it still expects legacy effective permissions to grant Archive/Library access. Untouched HEAD independently fails on the retired Archive grants; Phase 1.5G also removes Library profile grants. That older compatibility suite was left unchanged rather than restoring unsafe rights. Current V2 role/resource and browser tests pass.
- The old `pnpm flux-ai:archive-search-integration-check` fails during module loading (`Cannot find module 'server-only'`), before its code loads `.env` or creates a Prisma client. Inspection also shows that harness loads application `.env` and is unsuitable for this phase's isolation requirement. It was not repaired or rerun against application data. The required search behavior passes through the current disposable Archive and Library integration suites. That older entry point should be replaced with a fully isolated harness in separate test maintenance.

## Preservation, migration and limitations

No migration is required. `prisma/schema.prisma` and all historical migration files are unchanged. The existing `ManualLibraryAsset` UPLOADING state provides the upload-intent storage. No reset, `db push`, Neon migration or production/development data mutation was performed. No existing user role, password, account, project or approval was changed. Archive authorization implementation, Library legacy records and live S3 objects were preserved. Nothing was pushed or deployed.

S3 and PostgreSQL do not share a distributed transaction. A failed database commit after a successful copy can leave an unreferenced sealed object; failed/abandoned staging objects and soft-deleted objects are retained. A future retention/cleanup policy needs separate approval. Previously issued signed URLs remain valid until their existing expiry.

Pending business decisions are broader SPM/JPM browsing and upload/edit/tag/share/delete rights, manual-file grants and project/task references, and a Library sharing lifecycle. The confirmed restrictive policy stays active until those decisions are approved. No standalone metadata editor, sharing UI, grant administration, durable Library audit schema or storage cleanup system was introduced.

Other legacy boundaries remain outside Phase 1.5G: account/profile/settings administration, shared master-data navigation and candidate selection, remaining legacy labels, and deferred task/realtime/tracker functionality documented by earlier phases. This report does not claim application-wide V2 migration. Director-only shared tag actions are secured even where legacy settings navigation may not expose them.

Recommended next step: review this Phase 1.5G implementation and confirm any broader Library privilege/grant contract before a separately approved milestone. Follow with the remaining legacy administration boundaries and obsolete test-harness maintenance. Do not infer the next phase has started.

## Exact files changed

The manifest below is relative to `a8dc3e2`; it includes this report and the current-coverage note in the historical entry-point inventory.

12 created; 28 modified (40 total).

Created:

- `scripts/library-authorization-integration-check.ts`
- `scripts/library-browser-check.mjs`
- `scripts/tsconfig.library.json`
- `src/app/api/library/attachments/[attachmentId]/download/route.ts`
- `src/app/api/library/attachments/[attachmentId]/favorite/route.ts`
- `src/app/api/library/attachments/[attachmentId]/preview/route.ts`
- `src/lib/authorization/LIBRARY.md`
- `src/lib/authorization/library-policies.ts`
- `src/lib/authorization/library-rules.ts`
- `src/lib/authorization/library-transaction.ts`
- `src/lib/authorization/library.ts`
- `src/lib/library-http.ts`

Modified:

- `package.json`
- `scripts/authorization-foundation-check.ts`
- `scripts/authorization-project-read-integration-check.ts`
- `scripts/final-permissions-regression-checks.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/settings/project-master-data/actions.ts`
- `src/app/api/asset-tags/route.ts`
- `src/app/api/library/attachments/[attachmentId]/route.ts`
- `src/app/api/library/complete/route.ts`
- `src/app/api/library/manual-assets/[assetId]/download/route.ts`
- `src/app/api/library/manual-assets/[assetId]/favorite/route.ts`
- `src/app/api/library/manual-assets/[assetId]/preview/route.ts`
- `src/app/api/library/manual-assets/[assetId]/route.ts`
- `src/app/api/library/route.ts`
- `src/app/api/library/upload-url/route.ts`
- `src/components/library/library-upload-button.tsx`
- `src/components/library/library-workspace.tsx`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/project-transaction.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/library.ts`
- `src/lib/manual-library-asset-favorites.ts`
- `src/lib/permissions/effective.ts`
- `src/lib/permissions/resolver.ts`
- `src/lib/prisma.ts`


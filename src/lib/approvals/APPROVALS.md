# Phase 2.2 — Reusable Approval Engine

Implemented for completion-document review. This is a local implementation and isolated verification report, not a record of Neon activation. No Neon connection or migration was performed during this phase. No real S3 objects, accounts, passwords, external emails, deployment or Git staging were changed.

The new engine adopts new, identity-backed submissions only when `FLUX_APPROVAL_ENGINE=1`. That flag has **not** been enabled in the local environment. The existing `.env.local`, including `FLUX_SHARED_FILE_IDENTITY=1`, is unchanged. The browser harness starts a fresh production application with both flags enabled, a disposable database and loopback fake storage; it does not reuse a stale development process or load local secrets.

## Existing authority audited and preserved

| Existing workflow | Authority and retained behavior |
| --- | --- |
| Completion documents | Director globally; SPM/JPM only as actual project Owner or Co-owner. Uploads remain pending until review. Rejections require reasons, revisions retain historical evidence, and external submitters retain their real email attribution without fictitious ownership. Existing permitted self-review is unchanged. |
| Project creation | Director direct creation; SPM creation only with an approved preset; JPM creation requires a Director decision and an eligible SPM Co-owner. No new preset publishing or implicit approval. |
| Final completion | Actual Owner requests completion; Director records the final decision after existing document and workflow gates. A document decision never completes or archives the whole project. |
| Stage 6 | Existing recipient, request status/version and final-decision rules remain authoritative. No new engine adapter or eligibility change. |
| Native file review | Existing submission review, version history and its self-review restrictions remain intact. The completion adapter uses the existing Phase 2.1 sealed version and provenance rather than inventing a parallel file. |
| V2 administration | Technical Administration grants no business approval authority. Designer, Digital Lead, unassigned and unrelated-manager requests remain denied. |

The centralized authorization sources, Stage 6 service, project-governance services and all 106 prior migration files were compared with the start-of-task hashes and remain byte-for-byte unchanged. Archive and Library rules were exercised through their existing regression suites; their implementation was not modified.

## Models and service boundary

| New model | Purpose |
| --- | --- |
| `ApprovalRequest` | Typed native subject and exact version, project, original submission event, real requester, immutable policy/subject snapshots and evidence hash; pending/approved/rejected/superseded state, revision, current step, optional expiry and retained supersession details. |
| `ApprovalStep` | Ordered, immutable server-configured eligibility. The current adapter uses one `DOCUMENT_REVIEWER` step. Trusted server plans can require subsequent `DIRECTOR` steps; clients cannot define plans or eligibility. |
| `ApprovalEvidence` | Foreign key to the exact `SharedFileVersion` and an immutable snapshot of its observed metadata and integrity evidence. |
| `ApprovalDecision` | Immutable outcome, reason, actual actor, business role, authorization version, session ID, timestamp, expected request revision, command ID and native decision-event link. Session tokens are never stored here. |
| `ApprovalEvent` | Append-only request, decision, supersession and stale-cleanup history, linked to native events and actual internal/external actors. |

`contracts.ts` defines typed outcomes, states, plans, strict decision expectations, canonical JSON hashing and ordered transitions. `service.ts` implements request creation, current-session authorization, locked decisions, replay handling and the adopted-evidence completion gate. `completion.ts` adapts native submission events, request supersession, stale rejection and safe review views. `activation.ts` separates new adoption from continued enforcement of already-adopted requests and fails closed if activation is requested before migration.

Only `COMPLETION_DOCUMENT_SUBMISSION` is currently an implemented subject. Reuse is deliberately typed: another module requires a reviewed native foreign key, resource policy and transactional adapter. There is no generic public endpoint accepting arbitrary subject IDs, callbacks or user-authored rules. Tasker and Custom Stage Builder are neither implemented nor activated.

## Evidence and transactional consistency

Every adopted request pins the submitted READY version through an `ApprovalEvidence` foreign key. Its native submission, submission event, project, requester, policy, source-evidence generation and version metadata are retained. Canonical SHA-256 hashes identify the database snapshots; they do **not** certify S3 bytes. An opaque ETag is not presented as a cryptographic checksum. Historical/unmapped files continue through native review without a fabricated verified identity or retroactive engine decision.

Revision creates a distinct version and request. Pending requests are superseded when their native document generation or requirement changes. They cannot subsequently approve. A permitted stale rejection can clean up the native pending submission while preserving engine state `SUPERSEDED` and an immutable `STALE_REJECTED` event. Prior accepted evidence and its historical approval are retained; they cannot approve a new submission.

`CompletionDocumentSubmission` and the existing completion workflow remain the authoritative native business records. The new engine is the immutable decision ledger for adopted submissions. Native terminal writes, accepted evidence, workflow projection, engine decision/state and both histories commit in the same existing V2 transaction. Deferred database triggers reject contradictory native/engine commits, including a native-only decision on an adopted submission. Intermediate ordered approvals keep the native submission pending. Mandatory-document checks additionally require an adopted request to be approved and bound to the same exact native file version.

The API rejects forged actor/plan fields and requires the server-issued request ID, step ID, revision and evidence hash plus a command ID. The service resolves the genuine current session inside the existing authorized project transaction, rechecks current business role and actual resource relationship, and requires appropriate step eligibility. Immutable decisions record the real current actor; neither a caller-supplied actor nor a technical privilege can confer approval authority. Current authorization is checked on identical retries too.

The adapted review UI retains acceptance, reasoned rejection, history and resubmission. Superseded evidence cannot be accepted. Download, preview and submission links still pass through existing resource authorization and the exact-version streaming service. Browser testing discovered that these three redirects used Next.js's internal request origin; they now resolve through the existing configured application URL, preserving the public origin behind a proxy or local `127.0.0.1` address. Legacy absolute signed links retain their existing destination.

## Migration submitted for separate approval

File: `prisma/migrations/20261020200000_reusable_approval_engine/migration.sql`

SHA-256: `05467dead3661bbe78a364ec7325ae8df9e6bef3b9bc2a607b897cb51934062f`

The additive transaction creates five tables, five enums, 19 explicit indexes (in addition to primary-key indexes), 15 foreign keys, five CHECK constraints, two trigger functions, five row-write guards, five truncate guards and six deferred consistency triggers. One consistency trigger attaches to the existing completion-submission table. Existing records are not backfilled, rewritten or deleted. Foreign keys retain referenced users, evidence and history.

Populated isolated migration verification upgrades **106 to 107 successful migrations** and **103 to 108 public tables**, including the Prisma migration ledger in both counts. It compares all pre-existing tables and earlier migration checksums, confirms the new tables are empty after migration, and verifies zero Prisma schema drift. The fixtures include nine accounts and roles, native approval evidence/history, shared versions/provenance, Archives and Library records.

The SQL was exercised on disposable PostgreSQL **14.19**. No claim is made that it has run on the approved Neon PostgreSQL 18.6 environment. Development activation still requires a fresh identity, recovery, checksum, pending-migration and drift preflight followed by separate explicit approval. DDL needs locks, including attachment of the native-table consistency trigger. There is no production down migration; ordinary database recovery procedures must be reviewed before activation. `pnpm build` runs `prisma generate && next build` and does not apply migrations; the separate `vercel-build` command must not be used for this approval checkpoint because it includes migration deployment.

## Verification

| Check | Result |
| --- | --- |
| Full TypeScript, `pnpm exec tsc --noEmit --incremental false` | PASS, including the final redirect fix. |
| Targeted ESLint with zero warnings | PASS, including the redirect fix and test harness. |
| Approval unit checks | PASS: canonical evidence hashes, strict expectations, trusted plan constraints and ordered state transitions. |
| Populated approval migration | PASS: 106/103 to 107/108, zero drift, unchanged pre-existing records and migration checksums. |
| Approval integration | PASS, including the final redirect fix and all replay/concurrency scenarios below. |
| Completion-document and Phase 2.1 file regressions | PASS; configured-public-origin coverage added to all three completion-document redirect entry points. |
| V2 foundation, assignment services, runtime/session, project read/write and governance | PASS. |
| Archive and Library regressions | PASS. |
| Production build | PASS: production bundling, TypeScript, static generation and route build. |
| Isolated Chromium acceptance | PASS: adapted review, final Director completion and all three authenticated file entry points; no page errors, failed network requests or external network attempts. |

Regression command:

```sh
node scripts/run-authorization-isolated-integration.mjs --approvals --file-identity --completion-documents --services --runtime --project-read --project-write --project-governance --archives --library
```

Focused commands:

```sh
pnpm approvals:unit-check
pnpm approvals:check
FLUX_APPROVAL_BROWSER=1 node scripts/completion-documents-browser-check.mjs
```

The integration runner creates a disposable PostgreSQL cluster with TCP disabled and uses fake storage. Browser acceptance uses a fresh production Next.js server, genuine sign-ins for synthetic users, Chromium 153.0.8010.12 and loopback-only fake storage; browser and Node network guards deny external destinations. The production build was invoked with all local environment secrets blanked in the child process and an unreachable loopback database, without changing either environment file.

Concurrency/security scenarios verified include:

- Duplicate request creation and conflicting policy/expiry replay; identical concurrent decisions create one decision and native event.
- Concurrent approve/reject produces one winner; conflicting command, evidence hash, revision, subject, step and forged actor are denied.
- Required rejection reason, immutable snapshots/decisions/events, update/delete/TRUNCATE denial and foreign-key retention.
- Superseded generation cannot approve; audited cleanup rejection retains supersession; revised files receive independent requests and cannot reuse old approval.
- Two trusted ordered steps, distinct actual actors, out-of-order denial and Director-only second step; an intermediate decision cannot accept a document or complete a project.
- Transaction failure after native and engine writes rolls everything back; a native-only adopted decision fails deferred consistency checks.
- Changed object version metadata is denied; unknown cryptographic evidence remains explicitly unknown.
- Expired approval request, removed membership, suspended account, old session after reactivation and deleted session are denied.
- Concurrent logout serializes with the authorized decision transaction; replay after logout fails.
- Turning adoption off preserves enforcement for existing requests; flag-off cutover and files without shared identity retain native review without fictitious approvals.

Browser scenarios include scoped SPM configuration/upload, JPM rejection/resubmission/acceptance, external copyright submission and revoked-link denial, invoice revision, direct denial for Designer/Digital Lead/technical-only/unrelated manager, actual Owner completion request and genuine Director final completion. Database assertions verify four approved and one rejected engine requests, exact file versions, actual JPM reviewer, real external submitter attribution, retained history and all nine fixture assignments. No archive is created. The final run also checks authenticated download, inline preview and submission streaming.

Issues found during verification were corrected: PL/pgSQL CASE grouping, UTC comparison of Prisma timestamps during session expiry checks, the public-origin redirect problem and an ambiguous browser alert selector. These changes do not alter business eligibility.

## Exact file manifest

Created (9):

- `prisma/migrations/20261020200000_reusable_approval_engine/migration.sql`
- `scripts/approval-engine-integration-check.ts`
- `scripts/approval-engine-unit-check.ts`
- `scripts/tsconfig.approval-unit.json`
- `src/lib/approvals/activation.ts`
- `src/lib/approvals/completion.ts`
- `src/lib/approvals/contracts.ts`
- `src/lib/approvals/service.ts`
- `src/lib/approvals/APPROVALS.md`

Modified (13):

- `package.json`
- `prisma/schema.prisma`
- `scripts/completion-documents-browser-check.mjs`
- `scripts/completion-documents-integration-check.ts`
- `scripts/file-identity-integration-check.ts`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/api/project-completion-documents/[documentId]/download/route.ts`
- `src/app/api/project-completion-documents/[documentId]/preview/route.ts`
- `src/app/api/project-completion-documents/reviews/route.ts`
- `src/app/api/project-completion-documents/submissions/[submissionId]/route.ts`
- `src/components/projects/completion-document-reviews.tsx`
- `src/lib/completion-documents/evidence.ts`
- `src/lib/completion-documents/service.ts`

## Remaining limits and next milestone

Phase 2.2 implementation and isolated acceptance are ready for review. No failing checks remain. Full development activation sign-off remains pending the separately approved migration and activation checks.

Development activation is pending separate approval; the live migration count has not changed in this task. There is no historical backfill, arbitrary subject support, public step configuration, task orchestration, Stage 6 adapter or template publishing change. The current completion UI uses the existing single-review policy; ordered steps are foundation capability validated through trusted isolated fixtures.

No live storage configuration or cryptographic S3 byte integrity was independently verified. The existing native object-sealing operation and PostgreSQL transaction cannot form one distributed atomic transaction; an object created before a later database rollback may require the existing storage cleanup process. This phase neither adds live cleanup nor claims otherwise. Browser verification uses synthetic accounts and fake storage, not the user's real development sessions or files.

After separately approved development activation and acceptance, recommend **Phase 2.3 — Shared Audit and Event Infrastructure**: typed append-only cross-module events, preserved native actor/evidence links, transactionally emitted outbox records, idempotent consumers and retention rules. Keep each native business workflow authoritative and integrate modules deliberately. Phase 2.3 has not been started.

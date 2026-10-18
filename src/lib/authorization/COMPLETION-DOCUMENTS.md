# FLUX V2 Phase 1.5E — completion documents and authorization

Implemented locally on 2026-10-18. Development activation is **pending** separate approval for the single migration below. No Neon connection, account change, live S3 operation, external email, push or deployment was performed.

This report supersedes the completion-document write exclusions in the earlier phase reports. Final project completion remains governed by Phase 1.5D. The two previously staged governance reports were preserved unchanged.

## Existing functionality reused

The existing project completion checklist, three document types (`AUTHORITY_APPROVAL_PROOF`, `COPYRIGHT_TRANSFER`, `INVOICE`), nullable required/optional configuration, sequential prerequisites, final-file selection, contact selection, upload/complete APIs and accepted-document download/preview routes remain in use. Stage invoices remain separate. No mandatory document type, project template or new completion engine was introduced.

The existing legacy approved revision/submission picker now also includes the final files held by ready V2 production units. A legacy native task stage is no longer necessary to prepare a document request. Merely opening an unconfigured checklist returns an in-memory projection and writes no rows. INTERNAL projects without configured requirements retain their exemption; explicitly configured INTERNAL requirements are honored.

The old contact-only upload checks and legacy permission resolver were removed from this workflow. The previous upload-time automatic acceptance and overwriting document upserts were replaced by explicit, attributed review and retained versions.

## Authorization and workflow

- All internal mutations enter the existing V2 `runProjectMutation` boundary with the server-owned operation allowlist and `project.edit` policy. It reauthenticates and locks current authorization/session state and the actual project in a serializable transaction.
- Director has global documentation authority. SPM/JPM can manage documents only as actual project Owners or Co-owners. Executors, Designers, Digital Leads, technical-only users and unrelated managers receive no general document read, upload or approval authority. Legacy ADMIN/SUPER_ADMIN never grants authority.
- Reads, accepted-document preview/download, submission downloads and review history require the existing full project-read policy. UI visibility is supplemental; direct APIs/services repeat authorization.
- A prepared required request authorizes document submission. Uploads are verified and become `SUBMITTED`, while the checklist remains `PENDING`. An authorized manager accepts or rejects with a reason. Accepted evidence records its actual submitter separately from the reviewer.
- Rejection retains the file, timestamp, actor and reason. A new submission can be reviewed. An audited revision of already accepted evidence retains all versions and reopens that requirement and subsequent required document steps. Finalized/archived projects reject document mutations.
- A pending required invoice cannot be marked optional as an escape from review. Existing choices remain available before a request starts. No exceptional bypass was added.
- Identical preparation retries retain the same request generation; duplicate upload completion and matching review retries do not create duplicate documents or audit events. Concurrent operations serialize or return a retryable database conflict without blind mutation retries.

## Upload integrity and external links

A durable ticket binds project, workflow, document type, request generation, submitter/capability, exact filename/type/size, bucket, random upload key and expiry. Completion checks the actual object metadata. An ETag-conditional server-side copy seals a distinct evidence key that is never given a presigned PUT grant. Replaying the original upload URL cannot overwrite reviewed evidence.

Approval proof also binds the selected final-file identities, metadata and object ETags and the production file associations. Changed source bytes, changed associations, missing objects and superseded requests cannot reuse an acceptance. Foreign keys, actor checks, immutable metadata/history triggers and a partial unique submission index enforce persistence integrity. Accepted document versions are inserted and retained, not overwritten.

Managers can issue a link for one prepared required document type and intended recipient email. Only a SHA-256 token hash is stored; the 256-bit bearer is shown once, in a URL fragment. Links expire after seven days. Replacement revokes prior links; explicit revocation and request-generation changes invalidate further submissions. The public endpoint derives the project and document type exclusively from the capability. It cannot read general project files, approve documents or finalize a project. Upload tickets expire after ten minutes, and expiry is rechecked before committing.

External attribution is recorded as an external recipient capability and email, with no fabricated User/session or substituted manager uploader. Possession of the bearer is not proof of the human recipient's identity. A manager still reviews the submitted evidence. Already submitted evidence can be reviewed after link expiry; revoked capabilities cannot obtain a new acceptance. Revoking a link after acceptance does not erase accepted evidence.

Links are shared manually; this phase sends no external invitation email. The public page has no-store/no-referrer/noindex/frame-denial headers. Internal review commands compare browser origin to server-owned application URL configuration, including behind a proxy.

## Director completion and Stage 7

The same `completionEvidence` function used by Phase 1.5D calls the shared document validator. New evidence must have an accepted submission, attributed review, current source hash and matching sealed object. Missing or unresolved required evidence blocks the Owner's completion request and the Director's final decision.

An actual SPM/JPM Owner requests final completion. Co-ownership alone still does not grant this right. The Director approves/rejects the immutable request; approval and final completion remain atomic. Document revisions invalidate the submitted evidence snapshot. The existing Stage 7 transition, production approvals, supervision sign-off and native work checks remain mandatory. `closeStageSevenProject` continues to delegate to shared Director governance. Archiving remains a separate, unchanged boundary.

Historical documents without a new submission record are retained as legacy accepted evidence; no reviewer, approval timestamp or object hash is invented retroactively. Their project/workflow association and actual object size/type/existence are verified. The observed ETag is included in the final-completion snapshot so changes between the Owner request and Director decision invalidate that request. New submission/review provenance applies to new and revised evidence.

## UI

The project overview reuses the checklist and displays submission review/history, reasons, actor identities, external-link issuance/revocation and audited revision controls. Upload messages correctly say that evidence awaits review. Reopening an invoice restores its request/upload step even though prior accepted versions remain in history. Director completion readiness and the existing decision inbox remain the final gate.

Navigation: project overview → **Project Completion** and **Completion document review**. Final decisions remain under `/projects/approvals`. External recipients open the issued `/completion-documents/submit#…` link.

## Migration and activation

Pending migration: `20261018190000_completion_documents`.

SHA-256: `51fdea852a1ca57d71b9e8169987624bb1e7adb2f12c1e28b2b9aca4fed58d84`.

It adds `CompletionDocumentAccess`, `CompletionDocumentSubmission`, `CompletionDocumentEvent` and the submission-status enum. Accepted documents gain nullable external attribution and a unique submission relation; their old per-type unique index becomes a normal index to preserve accepted versions. Workflow/project composite foreign keys and SQL history/actor/transition guards protect the new records. Existing migration files and data are not rewritten.

The expected schema becomes **105 migrations / 99 public tables**, including Prisma's ledger. Development provisioning's exact-count expectations were advanced accordingly; endpoint identity, checksum validation, signing, account allowlists and security checks are unchanged. No provisioning command ran against development.

`pnpm build` runs Prisma generation and Next compilation, with no migrations. `vercel-build` invokes migration deployment and was not run.

Before activation, separately reconfirm the authorized Neon target, exactly one pending migration, its reviewed checksum, current ledger, backup/recovery readiness and all nine roles. Apply only after explicit approval, then verify 105 successful migrations and zero drift. Live S3/IAM and development acceptance testing remain pending that activation.

## Verification

- Full TypeScript and repository ESLint: PASS.
- Foundation/persistence checks and final permission regression: PASS.
- Disposable PostgreSQL foundation, assignment services, runtime, project read/write, creation/completion governance and provisioning regressions: PASS.
- Completion-document integration: PASS, including all role denials, forged/cross-project actors and files, missing or changed objects, sealed uploads, idempotent and concurrent reviews, request retries/generations, token expiry/revocation, rejection/resubmission, immutable history, accepted revisions, source ETag changes, mandatory evidence, Owner requests, Director decisions, Stage 7 closure and INTERNAL requirements.
- Production build: PASS. Credentials were omitted or explicitly blanked and database URLs pointed to unreachable loopback port 9. No build migrations ran.
- Browser verification: PASS on Chromium 153.0.8010.12 against the production build. Genuine fictional SPM/JPM/Director logins exercised checklist configuration, all three uploads, manager rejection/resubmission/acceptance, external submission and revocation, accepted invoice revision, direct-route role denials, Owner completion request and Director final approval. No browser JavaScript errors or remote requests occurred.
- Migration validation: disposable PostgreSQL 14.19; 104 → 105 preserves nine fictional accounts/roles, existing accepted evidence and prior ledger checksums; Prisma drift is empty. This is not a claim of Neon activation or PostgreSQL 18 live testing.

The browser harness uses real sign-in forms for fictional users, a private PostgreSQL socket and a loopback S3 protocol fixture. Both browser and Node HTTP clients block external hosts. It never copies environment files or uses real service credentials. Fixtures are stopped and removed after each run.

A browser-discovered origin mismatch was corrected using the configured application origin. An obsolete read test was updated to assert the new in-memory checklist projection and zero persistence. An initial temporary-build dependency symlink was rejected by Turbopack; the subsequent isolated and final workspace builds passed. Local disk pressure was resolved by bounding disposable WAL, dropping each completed fixture database and clearing regenerable Next.js development cache. Browser harness selectors and secure-cookie checks were corrected without weakening authorization assertions. No error suppression or live-database workaround was used.

Verification artifacts (local): `/private/tmp/flux-phase15e-browser-artifacts/result.json`, screenshots and `server.log`; `/private/tmp/flux-phase15e-final-integrity.log`; `/private/tmp/flux-phase15e-evidence-regressions.log`; `/private/tmp/flux-phase15e-regressions-final.log`; `/private/tmp/flux-phase15e-regressions.log` (runtime/service PASS results before the subsequently corrected read expectation); `/private/tmp/flux-phase15e-foundation.log`; `/private/tmp/flux-phase15e-build-final.log`; `/private/tmp/flux-phase15e-tsc-final.log`; `/private/tmp/flux-phase15e-lint-final.log`.

Final local result: **PASS; no remaining failing checks.** 12 files created and 15 modified. Hash comparison confirmed that 139 historical migration, Archive/Library/Tasker and preset/workflow files, plus both previously staged governance reports, were unchanged. The shared S3 helper gained only an optional conditional-copy ETag; no live object was accessed.

## Remaining limits and next milestone

Development activation and live object-storage acceptance are pending separate approval. No assertion is made that Phase 1.5E is active on Neon. Historical reviews are not fabricated. Expired/failed staging uploads or an object copy followed by transaction rollback can leave unreferenced storage objects; this phase preserves them and does not add destructive cleanup. Prior URLs retain their configured short expiry.

Next: review this change and authorize controlled development activation, then perform Director/SPM/JPM acceptance against approved development records. Scope V2 archive authorization separately afterward; no next-phase implementation has begun.

## Exact file manifest

Relative to the Phase 1.5E starting workspace; generated outputs and temporary test artifacts are excluded.

Created:

- `prisma/migrations/20261018190000_completion_documents/migration.sql`
- `scripts/completion-documents-browser-check.mjs`
- `scripts/completion-documents-integration-check.ts`
- `scripts/tsconfig.completion-documents.json`
- `src/app/api/project-completion-documents/external/route.ts`
- `src/app/api/project-completion-documents/reviews/route.ts`
- `src/app/api/project-completion-documents/submissions/[submissionId]/route.ts`
- `src/app/completion-documents/submit/page.tsx`
- `src/components/projects/completion-document-reviews.tsx`
- `src/lib/authorization/COMPLETION-DOCUMENTS.md`
- `src/lib/completion-documents/evidence.ts`
- `src/lib/completion-documents/service.ts`

Modified:

- `next.config.ts`
- `package.json`
- `prisma/schema.prisma`
- `scripts/authorization-project-governance-integration-check.ts`
- `scripts/authorization-project-read-integration-check.ts`
- `scripts/development-provisioning/core.ts`
- `scripts/development-role-setup.mjs`
- `scripts/development-role-setup.test.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/projects/[slug]/page.tsx`
- `src/components/projects/project-completion-checklist.tsx`
- `src/lib/authorization/project-write-operations.ts`
- `src/lib/project-completion.ts`
- `src/lib/project-governance/completion.ts`
- `src/lib/storage/s3.ts`

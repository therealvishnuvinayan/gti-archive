# FLUX V2 — Phase 2.1: Shared File Identity and Provenance Foundation

Implemented and locally verified on 2026-10-19. **Production build: PASS.** This is a scoped foundation with one write adapter; it is not a migration of every file workflow or a reusable approval engine.

The pre-existing Phase 1.5I working changes were preserved. No connection to Neon, live S3 operation, account change, email, push or deployment was performed. All mutation tests used private disposable PostgreSQL and fake storage. New adoption remains off by default and requires separate migration approval and deliberate activation.

## Existing infrastructure assessment

| Existing component | Reused behavior and limits |
| --- | --- |
| `ProjectAttachment` | Stable native ID, real uploader, project/stage/revision/comment links, upload and review states, unique object key. These are business records, not durable S3 object-version pins. External attribution fields must not be confused with a sponsoring internal user. |
| `ProjectRevision` | Existing revision numbering, creator/reviewer and review state. A revision groups work; it does not itself identify exact object bytes. |
| `FlexibleProjectAttachment` | Native project/milestone/uploader and upload-state links. Existing HEAD checks do not establish sealed, immutable object versions. |
| `ArchivedProjectFile` | Retains source attachment/revision, publisher and original project links. Publication references the existing object; the publisher is not its original uploader. |
| `ManualArchiveFile` | Existing upload ownership, file grants and category ACLs. No historical checksum or versioning guarantee is inferred. |
| `ManualLibraryAsset` | Existing persisted upload intent, metadata validation, conditional copy to a server-only sealed key, and scoped Library policy. Its current flow does not persist S3 version/checksum evidence. |
| Completion documents | Existing upload intent, submitted/accepted/rejected history, external-access identity, conditional copy to a distinct evidence key, ETag checks, retained accepted documents and immutable events. This is the first write adapter because these lifecycle boundaries already exist. |
| Comparison and handoff | Existing attachment FKs in comparisons, concept starting/approved references, stage handoffs, checklists, production units and Archive publication remain the business links. They need no object copy merely to reference a file. |
| Storage and cleanup | Existing S3 clients, presigned uploads, conditional sealing copy, HEAD metadata and post-commit deletion utility remain. No cleanup sweep, object migration, bucket configuration change or legacy deletion was introduced. |

## Implemented design

Four additive relational models distinguish identity from a particular submission:

- `SharedFile`: stable logical identity and optional structured/flexible project, native task stage, concept folder, milestone or completion-workflow origin. Context associations are checked against their project. There is no invented Universal Tasker ID.
- `SharedFileVersion`: numbered version, real internal uploader or external identity (or explicit unknown for future legacy adapters), original filename/type/size, bucket/key, upload/finalization state, observed ETag, optional S3 VersionId and optional full-object SHA-256 evidence.
- `SharedFileReference`: one typed FK to an existing business record, with SOURCE, REFERENCE or ACCEPTED_EVIDENCE purpose. A business record identifies one precise version. References do not copy bytes or grant access.
- `SharedFileProvenance`: immutable FK to the native completion event and exact file version. The native event remains the authority for actor, action, time and decision; its data is not restated as a fabricated approval.

The completion adapter groups a workflow/document type into one logical identity. Rejection, resubmission and reopening append numbered versions; they do not replace old accepted evidence. Internal and external submitters come from persisted native submissions. Reviewers remain separate actors. The accepted document links to its exact submission version, never a floating “latest” version.

Native events and shared records commit in the same authorized transaction. Replayed events are idempotent. PostgreSQL enforces unique version numbers, one source per version, exactly one native reference target, uploader/context/object association, required finalization evidence, restrictive FKs and retained immutable origins, finalized versions, references and provenance. Failed versions remain as history. Unsupported accepted-evidence adapters fail closed.

An existing concurrency defect was fixed in the selected workflow: the project root lock did not refresh a waiting Serializable transaction's submission snapshot. Both transactions could copy to the evidence key before one database update aborted. Finalization now locks the submission row before any storage side effect. The regression demonstrates one sealing copy and one submitted event for concurrent finalizations of the same ticket.

## Integrity and access guarantees

An ETag is stored as an **opaque storage validator**, not labelled a cryptographic digest. AWS documents that multipart and certain encrypted-object ETags are not MD5 hashes. [AWS object metadata reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html).

Adopted completion versions use the existing separate evidence key, which is never an upload-ticket destination. The exact sealed object's non-null VersionId is recorded when returned; missing, empty or literal `null` versions are not treated as pins. Only a valid, explicitly FULL_OBJECT SHA-256 observation receives `S3_FULL_OBJECT_SHA256`; otherwise checksum evidence is UNKNOWN. Existing HEAD calls do not request checksum mode, so ordinary activation must not be described as enabling universal checksum verification. This code does not independently hash every downloaded body.

All three completion read paths—submission download, accepted-document download and accepted-document preview—route adopted versions through a server-side conditional GET. The S3 request carries `IfMatch` and, when available, the recorded VersionId. Returned metadata is checked before exposing the stream. This avoids HEAD followed by an unguarded presigned GET. S3 supports these conditions and explicit version reads. [AWS conditional reads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-reads.html), [AWS GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

The new route requires both the native business source and its exact version ID. It re-evaluates the existing V2 policy using the real current session and a consistent transaction snapshot. An ID alone, caller-supplied actor, unrelated source, moved source, or a more permissive alias cannot authorize the read. It does not expose raw storage keys, other source links or unrelated provenance through Archive/Library grants. Responses are private/no-store, nosniff and sandboxed; inline rendering is limited to PDF and common raster-image MIME types. Existing download names and supported preview behavior are retained.

Director global business authority remains intact. Project and task reads remain scoped; a native task assignment does not grant arbitrary destination-folder access. Archive adapters preserve global Director/SPM access, Designer/Digital Lead file-and-category grants and JPM denial. Library adapters preserve the approved restrictive scope. Technical privileges grant no business-file access. Existing submission policies still govern task uploads; this phase adds no generic upload or folder-grant endpoint.

Review and final-completion evidence checks also compare stored version evidence for adopted files. Director-only final completion and all existing mandatory-document/workflow conditions remain unchanged. Completion document review retains its existing scoped manager authority; it was not converted into a new Director-only document review policy.

## Migration and activation boundary

Candidate: `prisma/migrations/20261018210000_shared_file_identity/migration.sql`

SHA-256: `e80518f59871cfe620984615b7bdbd0b4f67728a9b1425b650724a646a436a05`

The transaction adds four tables, three enums, relational indexes/FKs, checks and four guard functions/triggers. Existing model fields and relationships are retained; schema additions on existing Prisma models are inverse relation fields, not new physical columns. There is no data backfill or rewrite of earlier migrations.

The populated disposable baseline had **105 successful migrations / 99 public tables**. Applying only this candidate produced **106 / 103**, identical contents for every old table and old migration row/checksum, no backfilled shared records, and an empty Prisma schema diff. Preserved fixtures include native approved revisions, source attachments, handoffs, Archive/Library/share rows, accounts and authorization audit history. The separate application integration fixtures preserve all nine synthetic account assignments and native completion decisions/history.

**Neon status: not applied or queried in this phase.** The user-reported live baseline remains distinct from local verification. Local PostgreSQL is **14.19**; compatibility was not independently exercised on the reported Neon **18.6** instance.

After separate approval, activation requires the controlled migration procedure and setting `FLUX_SHARED_FILE_IDENTITY=1` for new completion uploads. This implementation never runs a migration. Missing tables with adoption enabled cause writes to fail and roll back. Before migration, a read-only catalog check permits the existing workflows to continue without querying absent shared tables.

Turning new adoption off does **not** remove guards or provenance from an already adopted upload: later finalization, review, acceptance and downloads retain its exact version. A historical or pre-activation upload without a mapping stays legacy/unmapped with unknown integrity. There is no implicit backfill.

`pnpm build` is `prisma generate && next build`, and does not migrate. `vercel-build` invokes migration deployment and was not run.

## Verification

| Check | Result |
| --- | --- |
| Full TypeScript, `pnpm exec tsc --noEmit --incremental false` | PASS |
| Targeted ESLint on all 15 changed/new TS/MJS files, zero warnings | PASS |
| Production `pnpm build`: bundling, TypeScript, page generation | PASS |
| Authorization foundation, persistence and legacy-role compatibility checks | PASS |
| Assignment services and runtime/session regression suites | PASS |
| Project read, project write and creation/final-completion governance | PASS |
| Completion documents, with adoption off | PASS |
| Archives, Library, workspace/navigation and business administration | PASS |
| Populated 105-to-106 migration, checksums, row preservation and schema drift | PASS |
| `pnpm files:check`, native completion suite with adoption on plus shared-file checks | PASS |

The new suite covers stable identity across revisions; exact accepted-version references; internal/external uploader and reviewer attribution; immutable native and shared history; missing/invalid uploads; failed uploads; duplicate finalization; event/PUT replay; concurrent numbering/finalization; missing FKs and cross-project references; changed ETag/version/checksum denial; typed-source and API authorization; accepted-file preview/download redirects; adoption-off continuation; Archive category and file grants; restrictive Library access; assigned-task-only file reads; source reparenting; historical UNKNOWN integrity; and preservation of existing handoffs, accepted documents and all nine fixture assignments.

Storage is a deterministic in-memory fake, including conditional-copy/GET checks. No real object operation or email was performed. The production build blanked environment-file values and used unreachable loopback database URLs. It completed without relying on live credentials. No browser session was run for this phase; HTTP handlers, redirects, headers and response streams were exercised in isolated integration tests. No current failing required check remains.

Local evidence: `/private/tmp/flux-phase21-files.log`, `flux-phase21-regressions.log`, `flux-phase21-types.log`, `flux-phase21-lint.log`, `flux-phase21-unit.log`, `flux-phase21-build.log`.

## Limits and deferred integration

- This is application-level sealing and conditional-read protection. Bucket versioning, IAM write/delete controls, Object Lock, lifecycle retention, KMS access and recovery have not been inspected or changed. Missing objects fail closed; a database FK cannot recover a deleted S3 object. With no real VersionId or full-object checksum, an ETag is not collision-resistant proof of byte identity.
- S3 and PostgreSQL are not one atomic transaction. A failure after an uncommitted sealing copy can leave an orphan object. Existing cleanup behavior is unchanged; this phase adds no cleanup job. Once a submission commits, the finalization lock and immutable state prevent its upload ticket from resealing that accepted version.
- Protected downloads now stream through the application. Large-file throughput, hosting timeouts, range requests and live S3/KMS behavior need operational acceptance before deployment. No range-serving or storage infrastructure rebuild was added.
- Other native models have typed read adapters and FK slots, but their upload, approval, publication and deletion flows do not yet write shared identities. Legacy downloads and approvals outside the selected completion path retain their previous guarantees. Before adopting another path, its write finalizer, every read route, deletion lifecycle and actual origin/actor attribution must be integrated and tested together.
- No historical cryptographic verification, bulk import, Archive verification workflow, Library management expansion, Stage 6 replacement, Universal Tasker, sister-task creation or Custom Stage Builder was implemented. Existing concept/handoff references remain intact; future adapters can resolve their source attachment to a fixed version without duplicating storage.

## Phase 2.2 recommendation

Implement **Reusable Approval Engine — immutable request/decision contracts and one native adapter**. Require a typed business subject, explicit `SharedFileVersion` FKs, immutable request/evidence and policy snapshots, real requester/decision-maker attribution, and current V2 resource authority. Never resolve “latest file” when deciding or reusing approval. Include idempotency keys, expected-state/version concurrency checks, expiry/revocation, reasoned rejection/resubmission, stale-evidence denial and retained decision events.

Start by composing with the existing completion-document request/review service and maintaining its current reviewer and Director final-completion boundaries. Prove the engine in isolated fixtures before enabling an operator-facing adapter. Keep Stage 6 authoritative and unchanged until a separately scoped adapter is approved. Do not broaden this milestone into Universal Tasker, templates or Archive verification. Phase 2.2 has not been started.

## Exact Phase 2.1 change manifest

Measured against the working-tree contents at the start of this phase, including the pre-existing staged Phase 1.5I work: **8 files created; 11 modified**. No prior work was staged, reverted or included as a new Phase 2.1 change.

Created:

- `prisma/migrations/20261018210000_shared_file_identity/migration.sql`
- `scripts/file-identity-integration-check.ts`
- `src/app/api/file-versions/[versionId]/download/route.ts`
- `src/lib/files/FOUNDATION.md`
- `src/lib/files/access.ts`
- `src/lib/files/activation.ts`
- `src/lib/files/completion-adapter.ts`
- `src/lib/files/contracts.ts`

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/completion-documents-integration-check.ts`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/api/project-completion-documents/[documentId]/download/route.ts`
- `src/app/api/project-completion-documents/[documentId]/preview/route.ts`
- `src/app/api/project-completion-documents/submissions/[submissionId]/route.ts`
- `src/lib/completion-documents/evidence.ts`
- `src/lib/completion-documents/service.ts`
- `src/lib/project-completion.ts`
- `src/lib/storage/s3.ts`

Phase 2.1 is ready for scoped implementation review. Development activation remains pending separate migration approval and storage/environment acceptance. No later milestone was started.

## Phase 6.2 Archive deletion retention addendum

[Phase 6.2](../archive-verification/PHASE-6.2.md) adds one narrowly guarded lifecycle transition for an adopted Archive entry's existing Director-only deletion. Before native deletion, PostgreSQL saves its typed original source and exact reference snapshots in immutable `RetainedArchiveSource`, then clears only that reference's native Archive FK. The reference ID, version, role, timestamp, immutable READY version and provenance remain intact. Other reference updates/deletions remain forbidden. Tombstone creation requires the current Director session and existing deletion transaction; old source IDs cannot be reused. Downloads through the removed native source fail closed. Storage cleanup retains objects referenced by SharedFileVersion. This is not an adoption or backfill path and does not enable either Phase 6 flag.

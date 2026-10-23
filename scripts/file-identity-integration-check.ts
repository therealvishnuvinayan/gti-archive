/** Runs only through the existing guarded, disposable completion-document suite. */
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { captureFileIntegrity, parseFileSource, type FileObjectObservation } from "../src/lib/files/contracts";

type User = NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>;
type ObjectMetadata = FileObjectObservation & { ContentLength: number; ContentType: string; ETag: string };
export async function verifySharedFiles({ db, objects, storageCalls, user, fixture, load }: {
  db: PrismaClient; objects: Map<string, ObjectMetadata>; storageCalls: { copies: number; reads: number };
  user: (id: string) => Promise<User>; fixture: (id: string) => Promise<{ kind: "ARTWORK"; projectId: string }>;
  load: (name: string) => unknown;
}) {
  const files = load("src/lib/files/access.js") as typeof import("../src/lib/files/access");
  const adapter = load("src/lib/files/completion-adapter.js") as typeof import("../src/lib/files/completion-adapter");
  const docs = load("src/lib/project-completion.js") as typeof import("../src/lib/project-completion");
  const reviews = load("src/lib/completion-documents/service.js") as typeof import("../src/lib/completion-documents/service");
  const api = load("src/app/api/file-versions/[versionId]/download/route.js") as typeof import("../src/app/api/file-versions/[versionId]/download/route");
  const roles = await db.userAuthorization.findMany({ orderBy: { userId: "asc" } });
  const legacyLinks = await db.projectStageFileHandoff.findMany({ orderBy: { id: "asc" } });
  const accepted = await db.projectCompletionDocument.findMany({ where: { projectId: "documents-main" }, orderBy: { uploadedAt: "asc" } });
  const versions = await db.sharedFileVersion.findMany({ include: { references: { omit: { taskUploadId: true, runtimeSubmissionId: true } }, provenance: { omit: { taskEntryId: true }, include: { completionEvent: true } } }, orderBy: [{ fileId: "asc" }, { number: "asc" }] });
  assert.ok(versions.length >= 7);
  const invoices = await db.sharedFile.findFirstOrThrow({ omit: { taskId: true, runtimeStageId: true }, where: { projectId: "documents-main", completionDocumentType: "INVOICE" }, include: { versions: { orderBy: { number: "asc" } } } });
  assert.deepEqual(invoices.versions.map(v => v.number), [1, 2], "Reopened request preserves identity and appends a version");
  for (const version of versions) {
    assert.equal(version.references.filter(r => r.role === "SOURCE").length, 1);
    assert.equal(version.checksumEvidence, "UNKNOWN", "ETag alone is not a cryptographic checksum");
    assert.equal(version.objectVersionId, null, "No bucket versioning assumption");
    const source = version.references.find(r => r.completionSubmissionId)!;
    const submission = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { id: source.completionSubmissionId! } });
    assert.equal(version.uploadedById, submission.submittedById);
    assert.equal(version.externalUploaderEmail, submission.externalSubmitterEmail);
    assert.equal(version.storageKey, submission.storageKey);
    assert.notEqual(version.storageKey, submission.uploadKey);
    assert.equal(version.provenance.filter(p => p.completionEvent?.action === "UPLOAD_PREPARED").length, 1);
    if (version.status === "READY") assert.equal(version.provenance.filter(p => p.completionEvent?.action === "DOCUMENT_SUBMITTED").length, 1);
  }
  for (const document of accepted) {
    const reference = await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionDocumentId: document.id }, include: { version: true } });
    assert.equal(reference.role, "ACCEPTED_EVIDENCE");
    const source = await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionSubmissionId: document.submissionId! } });
    assert.equal(reference.versionId, source.versionId, "Accepted evidence is pinned to an exact submission, never latest");
    assert.equal(reference.version.uploadedById, document.uploadedById);
  }
  const external = versions.find(v => v.externalUploaderEmail === "replacement@example.invalid")!;
  assert.ok(external); assert.equal(external.uploadedById, null);
  assert.equal(external.provenance.find(p => p.completionEvent?.action === "DOCUMENT_ACCEPTED")?.completionEvent?.actorId, "jpm");
  assert.equal(external.provenance.find(p => p.completionEvent?.action === "DOCUMENT_SUBMITTED")?.completionEvent?.externalActorEmail, "replacement@example.invalid");
  const first = versions.find(v => v.status === "READY" && v.uploadedById === "spm")!;
  const firstSource = { kind: "completion-submission", id: first.references.find(r => r.completionSubmissionId)!.completionSubmissionId! } as const;
  await user("director");
  const publicIdentity = await files.getSharedFileIdentity(firstSource);
  assert.equal(publicIdentity.versionId, first.id);
  assert.equal(publicIdentity.integrity.checksumEvidence, "UNKNOWN");
  assert.ok(!("bucket" in publicIdentity) && !("storageKey" in publicIdentity) && !("externalUploaderEmail" in publicIdentity));
  const copiesBeforeRead = storageCalls.copies;
  const request = () => api.GET(new Request(`http://localhost/api/file-versions/${first.id}/download?kind=${firstSource.kind}&id=${firstSource.id}`), { params: Promise.resolve({ versionId: first.id }) });
  const response = await request(); assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, first.fileSize);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(response.headers.get("Content-Security-Policy")!, /sandbox/);
  const director = await user("director");
  const submissionRoute = load("src/app/api/project-completion-documents/submissions/[submissionId]/route.js") as typeof import("../src/app/api/project-completion-documents/submissions/[submissionId]/route");
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://flux-review.example.invalid";
  const redirect = await submissionRoute.GET(new Request("http://localhost/submission"), { params: Promise.resolve({ submissionId: firstSource.id }) });
  assert.equal(redirect.status, 307); assert.equal(new URL(redirect.headers.get("Location")!).origin, process.env.APP_URL);
  assert.match(new URL(redirect.headers.get("Location")!).pathname, /^\/api\/file-versions\//);
  const documentId = accepted[0].id;
  const downloadPath = await docs.getProjectCompletionDocumentDownloadUrlForUser(director, documentId);
  const previewPath = await docs.getProjectCompletionDocumentPreviewUrlForUser(director, documentId);
  assert.match(downloadPath, /kind=completion-document/); assert.match(previewPath, /disposition=inline/);
  const previewUrl = new URL(previewPath, "http://localhost");
  const documentReference = await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionDocumentId: documentId } });
  const preview = await api.GET(new Request(previewUrl), { params: Promise.resolve({ versionId: documentReference.versionId }) });
  assert.equal(preview.status, 200); assert.match(preview.headers.get("Content-Disposition")!, /^inline;/);
  const downloadRoute = load("src/app/api/project-completion-documents/[documentId]/download/route.js") as typeof import("../src/app/api/project-completion-documents/[documentId]/download/route");
  const previewRoute = load("src/app/api/project-completion-documents/[documentId]/preview/route.js") as typeof import("../src/app/api/project-completion-documents/[documentId]/preview/route");
  for (const route of [downloadRoute, previewRoute]) {
    const result = await route.GET(new Request("http://localhost/document"), { params: Promise.resolve({ documentId }) });
    assert.equal(result.status, 307); assert.equal(new URL(result.headers.get("Location")!).origin, process.env.APP_URL);
    assert.match(new URL(result.headers.get("Location")!).pathname, /^\/api\/file-versions\//);
  }
  if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl;
  for (const id of ["designer", "digital", "tech", "outsider", "unassigned"]) {
    await user(id); const reads = storageCalls.reads;
    await assert.rejects(files.getSharedFileIdentity(firstSource));
    assert.equal((await request()).status, 403);
    assert.equal(storageCalls.reads, reads, "Unauthorized request never reaches storage");
  }
  for (const id of ["spm", "jpm"]) { await user(id); assert.equal((await request()).status, 200); }
  await assert.rejects(files.openSharedFileVersion(firstSource, invoices.versions[1].id));
  await assert.rejects(files.openSharedFileVersion({ kind: "project-attachment", id: "documents-other-file" }, first.id));
  await assert.rejects(files.getSharedFileIdentity({ ...firstSource, actorId: "director" }));
  assert.equal((await api.GET(new Request(`http://localhost/api/file-versions/x/download?kind=completion-submission&id=x&id=y`), { params: Promise.resolve({ versionId: first.id }) })).status, 400);
  const stored = objects.get(first.storageKey)!;
  objects.set(first.storageKey, { ...stored, ETag: "changed-after-approval" });
  await assert.rejects(files.openSharedFileVersion(firstSource, first.id), /Conditional GET failed/);
  objects.set(first.storageKey, stored);
  // Disabling NEW adoption cannot strip guards from previously adopted evidence.
  delete process.env.FLUX_SHARED_FILE_IDENTITY;
  assert.equal((await files.getSharedFileIdentity(firstSource)).versionId, first.id);
  const spm = await user("spm");
  assert.match(await reviews.getCompletionSubmissionDownload(spm, firstSource.id), /^\/api\/file-versions\//);
  await db.$transaction(tx => adapter.assertCompletionFileObservation(tx, firstSource.id, stored));
  await assert.rejects(db.$transaction(tx => adapter.assertCompletionFileObservation(tx, firstSource.id, { ...stored, ETag: "changed" })));
  process.env.FLUX_SHARED_FILE_IDENTITY = "1";
  assert.equal(storageCalls.copies, copiesBeforeRead, "Reading/referencing versions never copies storage objects");
  console.log("PASS files: stable identity, exact accepted versions, real internal/external attribution, preserved native history, guarded API and current scope, overwrite denial, adoption-off integrity guards.");

  // Native event replay is idempotent; direct database writes cannot mutate history.
  const eventId = first.provenance.find(p => p.completionEvent?.action === "DOCUMENT_SUBMITTED")!.completionEventId!;
  const counts = [await db.sharedFileVersion.count(), await db.sharedFileProvenance.count(), await db.sharedFileReference.count()];
  await db.$transaction(tx => adapter.recordCompletionFileEvent(tx, eventId, stored));
  assert.deepEqual([await db.sharedFileVersion.count(), await db.sharedFileProvenance.count(), await db.sharedFileReference.count()], counts);
  await assert.rejects(db.sharedFileVersion.update({ where: { id: first.id }, data: { objectETag: "rewrite" } }));
  await assert.rejects(db.sharedFileVersion.delete({ where: { id: first.id } }));
  await assert.rejects(db.sharedFile.update({ omit: { taskId: true, runtimeStageId: true }, where: { id: first.fileId }, data: { projectId: "documents-other" } }));
  await assert.rejects(db.sharedFileReference.update({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { id: first.references[0].id }, data: { versionId: invoices.versions[1].id } }));
  await assert.rejects(db.sharedFileProvenance.delete({ omit: { taskEntryId: true }, where: { id: first.provenance[0].id } }));
  await assert.rejects(db.completionDocumentSubmission.delete({ where: { id: firstSource.id } }));
  await assert.rejects(db.sharedFileVersion.create({ data: { ...invoices.versions[0], id: "duplicate-number", status: "UPLOADING", observedAt: null, finalizedAt: null, objectETag: null } }));
  await assert.rejects(db.sharedFile.create({ omit: { taskId: true, runtimeStageId: true }, data: { projectId: "documents-other", stageId: "documents-main-stage" } }));
  await assert.rejects(db.sharedFileReference.create({ omit: { taskUploadId: true, runtimeSubmissionId: true }, data: { versionId: first.id, role: "REFERENCE", projectAttachmentId: "documents-other-file" } }));
  await assert.rejects(db.sharedFileReference.create({ omit: { taskUploadId: true, runtimeSubmissionId: true }, data: { versionId: first.id, role: "REFERENCE" } }));
  await assert.rejects(db.sharedFileReference.create({ omit: { taskUploadId: true, runtimeSubmissionId: true }, data: { versionId: first.id, role: "REFERENCE", projectAttachmentId: "missing-source" } }));
  console.log("PASS files: replay idempotency, immutable version/source/provenance, unique numbering, retained FKs, missing-source and cross-project reference denial.");

  const target = await fixture("file-races");
  await docs.configureProjectCompletionWorkflow(spm, { projectId: target.projectId, approvalRequired: true, copyrightRequired: false, invoiceRequired: false });
  await docs.prepareAuthorityApprovalRequest(spm, { projectId: target.projectId, contactUserId: "spm", selectedProjectFileIds: [`${target.projectId}-file`] });
  const meta = { projectId: target.projectId, documentType: "AUTHORITY_APPROVAL_PROOF" as const, originalFileName: "exact.pdf", mimeType: "application/pdf", fileSize: 8 };
  const pending = await docs.requestProjectCompletionDocumentUpload(spm, meta);
  const pendingSubmission = await db.completionDocumentSubmission.findUniqueOrThrow({ where: { uploadKey: pending.storageKey } });
  const pendingReference = await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionSubmissionId: pendingSubmission.id } });
  await assert.rejects(files.getSharedFileIdentity({ kind: "completion-submission", id: pendingSubmission.id }));
  await assert.rejects(docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: pending.storageKey }));
  objects.set(pending.storageKey, { ContentLength: 8, ContentType: "text/plain", ETag: "wrong-type" });
  await assert.rejects(docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: pending.storageKey }));
  assert.equal((await db.sharedFileVersion.findUniqueOrThrow({ where: { id: pendingReference.versionId } })).status, "UPLOADING");
  await docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: pending.storageKey, failed: true });
  await docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: pending.storageKey, failed: true });
  assert.equal((await db.sharedFileVersion.findUniqueOrThrow({ where: { id: pendingReference.versionId } })).status, "FAILED");
  const raced = await Promise.allSettled([docs.requestProjectCompletionDocumentUpload(spm, meta), docs.requestProjectCompletionDocumentUpload(spm, meta)]);
  assert.ok(raced.some(r => r.status === "fulfilled"));
  // Serializable retries may be exposed by native policy; every committed intent
  // must have a unique contiguous number, and failed transactions leave no shadow rows.
  const intents = await db.completionDocumentSubmission.findMany({ where: { projectId: target.projectId, status: "UPLOADING" } });
  const numbered = await db.sharedFileVersion.findMany({ where: { file: { projectId: target.projectId } }, orderBy: { number: "asc" } });
  assert.deepEqual(numbered.map(v => v.number), numbered.map((_, i) => i + 1));
  assert.equal(numbered.length, intents.length + 1);
  const chosen = intents[0];
  const exact = { ContentLength: 8, ContentType: "application/pdf", ETag: "multipart-opaque-2", VersionId: "real-s3-version-fixture", ChecksumType: "FULL_OBJECT", ChecksumSHA256: Buffer.alloc(32, 7).toString("base64") };
  objects.set(chosen.uploadKey, exact);
  const copiesBeforeFinalization = storageCalls.copies;
  const finalized = await Promise.allSettled([docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: chosen.uploadKey }), docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: chosen.uploadKey })]);
  assert.ok(finalized.some(r => r.status === "fulfilled"));
  await docs.finalizeProjectCompletionDocumentUpload(spm, { ...meta, storageKey: chosen.uploadKey });
  assert.equal(storageCalls.copies, copiesBeforeFinalization + 1);
  const chosenRef = await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionSubmissionId: chosen.id }, include: { version: true } });
  assert.equal(chosenRef.version.objectVersionId, exact.VersionId);
  assert.equal(chosenRef.version.checksumSha256, exact.ChecksumSHA256);
  assert.equal(chosenRef.version.checksumEvidence, "S3_FULL_OBJECT_SHA256");
  assert.equal(await db.completionDocumentEvent.count({ where: { submissionId: chosen.id, action: "DOCUMENT_SUBMITTED" } }), 1);
  const chosenSource = { kind: "completion-submission", id: chosen.id } as const;
  objects.set(chosen.storageKey, { ...exact, VersionId: "different-version-same-etag" });
  await assert.rejects(files.openSharedFileVersion(chosenSource, chosenRef.versionId));
  await assert.rejects(reviews.reviewCompletionDocument(spm, { projectId: target.projectId, submissionId: chosen.id, decision: "ACCEPT", reason: "Must reject changed version" }));
  objects.set(chosen.storageKey, { ...exact, ChecksumSHA256: Buffer.alloc(32, 8).toString("base64") });
  await assert.rejects(files.openSharedFileVersion(chosenSource, chosenRef.versionId));
  objects.set(chosen.storageKey, exact);
  delete process.env.FLUX_SHARED_FILE_IDENTITY;
  await reviews.reviewCompletionDocument(spm, { projectId: target.projectId, submissionId: chosen.id, decision: "ACCEPT", reason: "Exact submitted evidence checked" });
  const acceptedAfterDisabled = await db.projectCompletionDocument.findUniqueOrThrow({ where: { submissionId: chosen.id } });
  assert.equal((await db.sharedFileReference.findUniqueOrThrow({ omit: { taskUploadId: true, runtimeSubmissionId: true }, where: { completionDocumentId: acceptedAfterDisabled.id } })).versionId, chosenRef.versionId);
  assert.equal(await db.sharedFileProvenance.count({ where: { versionId: chosenRef.versionId, completionEvent: { action: "DOCUMENT_ACCEPTED" } } }), 1);
  process.env.FLUX_SHARED_FILE_IDENTITY = "1";
  objects.set(chosen.uploadKey, { ...exact, ETag: "replayed-put" });
  await files.openSharedFileVersion(chosenSource, chosenRef.versionId);
  console.log("PASS files: incomplete/wrong-type upload denial, failed-state replay, concurrent intent numbering and finalization, one native sealing copy, optional real VersionId/full-object checksum capture and mismatch denial.");

  // Existing paths remain unmapped and unknown; source adapters inherit their
  // own business policy rather than borrowing a permissive canonical alias.
  await db.archiveCategory.create({ data: { id: "file-category", name: "File fixture", slug: "file-fixture" } });
  await db.manualArchiveFile.create({ data: { id: "file-archive", archiveCategoryId: "file-category", fileName: "legacy.pdf", originalFileName: "legacy.pdf", mimeType: "application/pdf", fileSize: 1, bucket: "fixture-no-network", storageKey: "legacy/archive", uploadedById: "director", status: "READY" } });
  await db.manualLibraryAsset.create({ data: { id: "file-library", assetName: "legacy.pdf", originalFileName: "legacy.pdf", mimeType: "application/pdf", fileSize: 1, bucket: "fixture-no-network", storageKey: "legacy/library", uploadedById: "spm", status: "READY" } });
  const archive = { kind: "manual-archive-file", id: "file-archive" } as const;
  const library = { kind: "manual-library-asset", id: "file-library" } as const;
  for (const id of ["director", "spm"]) {
    await user(id);
    for (const source of [archive, library, { kind: "project-attachment", id: "documents-main-file" }]) {
      const legacy = await files.getSharedFileIdentity(source); assert.equal(legacy.adoption, "LEGACY_UNMAPPED"); assert.equal(legacy.integrity.checksumEvidence, "UNKNOWN");
    }
  }
  for (const id of ["jpm", "designer", "digital", "tech"]) {
    await user(id); await assert.rejects(files.getSharedFileIdentity(archive)); await assert.rejects(files.getSharedFileIdentity(library));
  }
  await db.userArchiveAssetAccess.create({ data: { userId: "designer", manualArchiveFileId: "file-archive", grantedById: "director" } });
  await user("designer"); assert.equal((await files.getSharedFileIdentity(archive)).adoption, "LEGACY_UNMAPPED");
  await assert.rejects(files.getSharedFileIdentity({ kind: "manual-library-asset", id: archive.id }));
  await db.archiveCategoryAccess.create({ data: { archiveCategoryId: "file-category", userId: "director", createdById: "director" } });
  await assert.rejects(files.getSharedFileIdentity(archive), "A per-file grant does not bypass a restrictive category ACL");
  await db.projectStage.create({ data: { id: "file-task", projectId: target.projectId, name: "Assigned existing task", order: 2, isTasker: true } });
  await db.projectConceptFolder.create({ data: { id: "file-concept", projectId: target.projectId, taskerStageId: "file-task", name: "Assigned task", normalizedName: "assigned-task", assignedExecutorId: "designer" } });
  await db.projectAttachment.create({ data: { id: "file-task-attachment", projectId: target.projectId, stageId: "file-task", uploadedById: "designer", fileName: "task.pdf", originalFileName: "task.pdf", mimeType: "application/pdf", fileSize: 1, bucket: "fixture-no-network", storageKey: "legacy/task", status: "READY", assetType: "STAGE_SUBMISSION" } });
  assert.equal((await files.getSharedFileIdentity({ kind: "project-attachment", id: "file-task-attachment" })).adoption, "LEGACY_UNMAPPED");
  assert.equal((await files.getSharedFileIdentity({ kind: "library-attachment", id: "file-task-attachment" })).adoption, "LEGACY_UNMAPPED");
  await assert.rejects(files.getSharedFileIdentity({ kind: "project-attachment", id: `${target.projectId}-file` }));
  // Schema-only fixture for a future native task adapter. No production write
  // adapter/backfill is enabled for this legacy path in Phase 2.1.
  const taskFile = await db.sharedFile.create({ omit: { taskId: true, runtimeStageId: true }, data: { projectId: target.projectId, stageId: "file-task", conceptFolderId: "file-concept" } });
  const taskData = { fileId: taskFile.id, originalFileName: "task.pdf", mimeType: "application/pdf", fileSize: 1, bucket: "fixture-no-network", storageKey: "legacy/task" };
  const wrongUploader = await db.sharedFileVersion.create({ data: { ...taskData, number: 1, uploadedById: "spm" } });
  await assert.rejects(db.sharedFileReference.create({ omit: { taskUploadId: true, runtimeSubmissionId: true }, data: { versionId: wrongUploader.id, role: "SOURCE", projectAttachmentId: "file-task-attachment" } }));
  const taskVersion = await db.sharedFileVersion.create({ data: { ...taskData, number: 2, uploadedById: "designer" } });
  await db.sharedFileReference.create({ omit: { taskUploadId: true, runtimeSubmissionId: true }, data: { versionId: taskVersion.id, role: "SOURCE", projectAttachmentId: "file-task-attachment" } });
  await assert.rejects(db.sharedFileVersion.update({ where: { id: taskVersion.id }, data: { status: "READY", observedAt: new Date(), finalizedAt: new Date() } }));
  await db.sharedFileVersion.update({ where: { id: taskVersion.id }, data: { status: "READY", objectETag: "fixture-task-observation", observedAt: new Date(), finalizedAt: new Date() } });
  assert.equal((await files.getSharedFileIdentity({ kind: "project-attachment", id: "file-task-attachment" })).versionId, taskVersion.id);
  await user("director");
  await db.projectAttachment.update({ where: { id: "file-task-attachment" }, data: { projectId: "documents-other", stageId: "documents-other-stage" } });
  await assert.rejects(files.getSharedFileIdentity({ kind: "project-attachment", id: "file-task-attachment" }), /FILE_ORIGIN_CHANGED/);
  await db.projectAttachment.update({ where: { id: "file-task-attachment" }, data: { projectId: target.projectId, stageId: "file-task" } });
  assert.deepEqual(await db.userAuthorization.findMany({ orderBy: { userId: "asc" } }), roles);
  assert.deepEqual(await db.projectStageFileHandoff.findMany({ where: { id: { in: legacyLinks.map(l => l.id) } }, orderBy: { id: "asc" } }), legacyLinks);
  assert.deepEqual(await db.projectCompletionDocument.findMany({ where: { projectId: "documents-main" }, orderBy: { uploadedAt: "asc" } }), accepted);
  assert.equal(await db.user.count(), 9);
  assert.throws(() => parseFileSource({ kind: "bucket", id: "arbitrary" }));
  assert.throws(() => captureFileIntegrity({ ...exact, ChecksumSHA256: "" }, { fileSize: 8, mimeType: "application/pdf" }));
  assert.equal(captureFileIntegrity({ ...exact, VersionId: "null", ChecksumType: "COMPOSITE" }, { fileSize: 8, mimeType: "application/pdf" }).checksumEvidence, "UNKNOWN");
  assert.equal(captureFileIntegrity({ ...exact, VersionId: "null" }, { fileSize: 8, mimeType: "application/pdf" }).objectVersionId, null);
  console.log("PASS files: Archive global/scoped/category rules, restrictive Library, assigned-task-only reads, historical integrity unknown, native handoffs/evidence and all nine roles preserved.");
}

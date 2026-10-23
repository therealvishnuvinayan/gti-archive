-- CreateTable
CREATE TABLE "UniversalTaskFamilyLink" (
    "taskId" TEXT NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "rootTaskId" TEXT NOT NULL,
    "createdEntryId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,

    CONSTRAINT "UniversalTaskFamilyLink_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "UniversalTaskInheritedEvidence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceUploadId" TEXT NOT NULL,
    "sourceEntryId" TEXT NOT NULL,
    "sourceReviewId" TEXT,
    "sourceState" TEXT NOT NULL,

    CONSTRAINT "UniversalTaskInheritedEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskFamilyLink_createdEntryId_key" ON "UniversalTaskFamilyLink"("createdEntryId");

-- CreateIndex
CREATE INDEX "UniversalTaskFamilyLink_sourceTaskId_idx" ON "UniversalTaskFamilyLink"("sourceTaskId");

-- CreateIndex
CREATE INDEX "UniversalTaskFamilyLink_rootTaskId_idx" ON "UniversalTaskFamilyLink"("rootTaskId");

-- CreateIndex
CREATE INDEX "UniversalTaskInheritedEvidence_sourceEntryId_idx" ON "UniversalTaskInheritedEvidence"("sourceEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskInheritedEvidence_taskId_versionId_key" ON "UniversalTaskInheritedEvidence"("taskId", "versionId");

-- AddForeignKey
ALTER TABLE "UniversalTaskFamilyLink" ADD CONSTRAINT "UniversalTaskFamilyLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskFamilyLink" ADD CONSTRAINT "UniversalTaskFamilyLink_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskFamilyLink" ADD CONSTRAINT "UniversalTaskFamilyLink_rootTaskId_fkey" FOREIGN KEY ("rootTaskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskFamilyLink" ADD CONSTRAINT "UniversalTaskFamilyLink_createdEntryId_fkey" FOREIGN KEY ("createdEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTaskFamilyLink"("taskId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_sourceUploadId_fkey" FOREIGN KEY ("sourceUploadId") REFERENCES "UniversalTaskUpload"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "UniversalTaskFamilyLink" ADD CONSTRAINT "UniversalTaskFamilyLink_shape" CHECK (
 "taskId"<>"sourceTaskId" AND "taskId"<>"rootTaskId" AND "sourceVersion">0 AND mode IN ('KEEP','MODIFY'));
ALTER TABLE "UniversalTaskInheritedEvidence" ADD CONSTRAINT "UniversalTaskInheritedEvidence_state" CHECK (
 "sourceState" IN ('SUPPORTING','SUBMITTED','APPROVED','REJECTED','SUPERSEDED'));

CREATE FUNCTION flux_task_family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a jsonb; t "UniversalTask"; s "UniversalTask"; e "UniversalTaskEntry"; root_id text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Task families are immutable and retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId" FOR SHARE;
 SELECT * INTO STRICT s FROM "UniversalTask" WHERE id=NEW."sourceTaskId" FOR SHARE;
 SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE id=NEW."createdEntryId";
 SELECT "rootTaskId" INTO root_id FROM "UniversalTaskFamilyLink" WHERE "taskId"=s.id;
 root_id:=coalesce(root_id,s.id);
 IF s.status<>'COMPLETED' OR s."deletedAt" IS NOT NULL OR s.version<>NEW."sourceVersion" OR
  t.status<>'OPEN' OR t.version<>1 OR t."deletedAt" IS NOT NULL OR t."ownerId"<>a->>'userId' OR
  (a->>'businessRole'<>'DIRECTOR' AND a->>'userId' NOT IN (s."ownerId",s."executorId")) OR
  t."projectId" IS DISTINCT FROM s."projectId" OR t."flexibleProjectId" IS DISTINCT FROM s."flexibleProjectId" OR
  NEW."rootTaskId"<>root_id OR e."taskId"<>t.id OR e.version<>1 OR e.action<>'CREATED' OR e."actorId"<>t."ownerId" OR
  e.snapshot->'sister'->>'sourceTaskId' IS DISTINCT FROM s.id OR e.snapshot->'sister'->>'rootTaskId' IS DISTINCT FROM root_id OR
  e.snapshot->'sister'->>'mode' IS DISTINCT FROM NEW.mode OR (e.snapshot->'sister'->>'sourceVersion')::int IS DISTINCT FROM s.version THEN
  RAISE EXCEPTION 'Fresh authorized task and completed same-project source required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_task_family_guard BEFORE INSERT OR UPDATE OR DELETE ON "UniversalTaskFamilyLink" FOR EACH ROW EXECUTE FUNCTION flux_task_family_guard();
CREATE TRIGGER flux_task_family_truncate BEFORE TRUNCATE ON "UniversalTaskFamilyLink" FOR EACH STATEMENT EXECUTE FUNCTION flux_task_family_guard();

CREATE FUNCTION flux_task_inherited_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE link "UniversalTaskFamilyLink"; t "UniversalTask"; e "UniversalTaskEntry"; u "UniversalTaskUpload";
 v "SharedFileVersion"; submission "UniversalTaskEntry"; review "UniversalTaskEntry"; expected_state text; a jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Historical evidence is immutable and retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 SELECT * INTO STRICT link FROM "UniversalTaskFamilyLink" WHERE "taskId"=NEW."taskId";
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=link."taskId";
 SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE id=link."createdEntryId";
 SELECT * INTO STRICT u FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId";
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=NEW."versionId";
 SELECT * INTO STRICT submission FROM "UniversalTaskEntry" WHERE id=NEW."sourceEntryId";
 SELECT * INTO review FROM "UniversalTaskEntry" WHERE "taskId"=link."sourceTaskId" AND action IN ('APPROVE','REJECT') AND snapshot->'evidence'->'submissionIds' ? submission.id ORDER BY version LIMIT 1;
 expected_state:=CASE WHEN submission.action='MESSAGE' THEN 'SUPPORTING' WHEN review.action='APPROVE' THEN 'APPROVED' WHEN review.action='REJECT' THEN 'REJECTED'
 WHEN EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=link."sourceTaskId" AND version>submission.version AND action IN ('SUBMIT','EDIT','CLOSE')) THEN 'SUPERSEDED' ELSE 'SUBMITTED' END;
 IF t.version<>1 OR t.status<>'OPEN' OR t."ownerId"<>a->>'userId' OR e."actorId"<>a->>'userId' OR
  u."taskId"<>link."sourceTaskId" OR u."versionId"<>v.id OR u."submittedEntryId" IS DISTINCT FROM submission.id OR
  submission."taskId"<>link."sourceTaskId" OR submission.action NOT IN ('MESSAGE','SUBMIT') OR submission."actorId"<>u."uploadedById" OR
  v.status<>'READY' OR v."objectETag" IS NULL OR NOT (v."applicationSealed" OR v."objectVersionId" IS NOT NULL) OR
  NOT coalesce(e.snapshot->'sister'->'evidenceVersionIds' ? v.id,false) OR NEW."sourceState"<>expected_state OR
  NEW."sourceReviewId" IS DISTINCT FROM (CASE WHEN submission.action='MESSAGE' THEN NULL ELSE review.id END) THEN
  RAISE EXCEPTION 'Exact completed-source submission and truthful review required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_task_inherited_guard BEFORE INSERT OR UPDATE OR DELETE ON "UniversalTaskInheritedEvidence" FOR EACH ROW EXECUTE FUNCTION flux_task_inherited_guard();
CREATE TRIGGER flux_task_inherited_truncate BEFORE TRUNCATE ON "UniversalTaskInheritedEvidence" FOR EACH STATEMENT EXECUTE FUNCTION flux_task_inherited_guard();

CREATE FUNCTION flux_task_family_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "UniversalTaskEntry"; link "UniversalTaskFamilyLink";
BEGIN
 IF TG_TABLE_NAME='UniversalTaskEntry' THEN e:=NEW;
 ELSE SELECT entry.* INTO STRICT e FROM "UniversalTaskEntry" entry JOIN "UniversalTaskFamilyLink" family ON family."createdEntryId"=entry.id WHERE family."taskId"=NEW."taskId"; END IF;
 IF e.action<>'CREATED' THEN RETURN NULL; END IF;
 IF e.snapshot ? 'sister' THEN
  SELECT * INTO link FROM "UniversalTaskFamilyLink" WHERE "createdEntryId"=e.id AND "taskId"=e."taskId";
  IF link."taskId" IS NULL OR jsonb_typeof(e.snapshot->'sister'->'evidenceVersionIds') IS DISTINCT FROM 'array' OR
   jsonb_array_length(e.snapshot->'sister'->'evidenceVersionIds')<>(SELECT count(*) FROM "UniversalTaskInheritedEvidence" WHERE "taskId"=e."taskId") OR
   EXISTS (SELECT 1 FROM "UniversalTaskInheritedEvidence" ev WHERE ev."taskId"=e."taskId" AND NOT EXISTS (
    SELECT 1 FROM "SharedFileProvenance" p WHERE p."taskEntryId"=e.id AND p."versionId"=ev."versionId")) THEN
   RAISE EXCEPTION 'Atomic family, selected evidence and provenance required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_task_family_entry_consistency AFTER INSERT ON "UniversalTaskEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_family_consistency();
CREATE CONSTRAINT TRIGGER flux_task_family_consistency AFTER INSERT ON "UniversalTaskFamilyLink" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_family_consistency();
CREATE CONSTRAINT TRIGGER flux_task_inherited_consistency AFTER INSERT ON "UniversalTaskInheritedEvidence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_family_consistency();

CREATE OR REPLACE FUNCTION flux_shared_file_provenance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."taskEntryId" IS NOT NULL THEN
   IF EXISTS (SELECT 1 FROM "UniversalTaskInheritedEvidence" evidence JOIN "UniversalTaskFamilyLink" family ON family."taskId"=evidence."taskId"
    JOIN "UniversalTaskEntry" entry ON entry.id=family."createdEntryId" WHERE entry.id=NEW."taskEntryId" AND evidence."versionId"=NEW."versionId"
    AND entry.action='CREATED' AND entry.snapshot->'sister'->'evidenceVersionIds' ? NEW."versionId") THEN RETURN NEW; END IF;
   IF EXISTS (SELECT 1 FROM "UniversalTaskReference" ref JOIN "UniversalTaskEntry" e ON e.id=ref."selectedEntryId"
    WHERE ref."versionId"=NEW."versionId" AND ref."selectedEntryId"=NEW."taskEntryId" AND e."taskId"=ref."taskId"
    AND e.action IN ('CREATED','SET_SOURCE') AND e.snapshot->'referenceVersionIds' ? NEW."versionId") THEN RETURN NEW; END IF;
   IF EXISTS (SELECT 1 FROM "UniversalTaskApplication" a JOIN "UniversalTaskPublication" p ON p."applicationId"=a.id
     JOIN "UniversalTaskEntry" e ON e.id=a."acceptedEntryId" WHERE a.state='APPLIED' AND e.action='APPROVE' AND e."taskId"=a."taskId"
     AND e.id=NEW."taskEntryId" AND NEW."versionId" IN (p."sourceVersionId",p."publishedVersionId")) THEN RETURN NEW; END IF;
   IF NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" e JOIN "UniversalTaskUpload" u ON u."taskId"=e."taskId" JOIN "SharedFileVersion" v ON v.id=u."versionId"
    WHERE e.id=NEW."taskEntryId" AND v.id=NEW."versionId" AND e.snapshot->'fileVersionIds' ? v.id AND
    ((e.action='PREPARE_UPLOAD' AND v.status='UPLOADING') OR (e.action IN ('FINALIZE_UPLOAD','MESSAGE','SUBMIT','REQUEST_COMPLETION') AND v.status='READY'))) THEN
    RAISE EXCEPTION 'Exact task event/version required' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "CompletionDocumentEvent" e
    JOIN "SharedFileReference" r ON r."completionSubmissionId" = e."submissionId"
    JOIN "SharedFileVersion" v ON v.id = r."versionId"
    WHERE e.id = NEW."completionEventId" AND v.id = NEW."versionId" AND
      ((e.action = 'UPLOAD_PREPARED' AND v.status = 'UPLOADING') OR
       (e.action = 'UPLOAD_FAILED' AND v.status = 'FAILED') OR
       (e.action IN ('DOCUMENT_SUBMITTED','DOCUMENT_ACCEPTED','DOCUMENT_REJECTED') AND v.status = 'READY'))) THEN
    RAISE EXCEPTION 'File provenance must reference a matching native event/version' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION flux_task_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; e "UniversalTaskEntry"; v "SharedFileVersion"; f "SharedFile";
 u "UniversalTaskUpload"; source "UniversalTask"; submission "UniversalTaskEntry"; review "UniversalTaskEntry"; a jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Task references are immutable and retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE id=NEW."selectedEntryId";
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=NEW."versionId";
 SELECT * INTO STRICT f FROM "SharedFile" WHERE id=v."fileId";
 IF t."deletedAt" IS NOT NULL OR t.status NOT IN ('OPEN','IN_PROGRESS') OR
  (a->>'businessRole'<>'DIRECTOR' AND a->>'userId'<>t."ownerId") OR
  e."taskId"<>t.id OR e.version<>t.version OR e."actorId"<>a->>'userId' OR
  e.action NOT IN ('CREATED','SET_SOURCE') OR NOT (e.snapshot->'referenceVersionIds' ? v.id) OR
  v.status<>'READY' OR v."objectETag" IS NULL OR NOT (v."applicationSealed" OR v."objectVersionId" IS NOT NULL) OR
  f."projectId" IS DISTINCT FROM t."projectId" OR f."flexibleProjectId" IS DISTINCT FROM t."flexibleProjectId" THEN
  RAISE EXCEPTION 'Exact sealed source and atomic authorized selection required' USING ERRCODE='23514'; END IF;
 IF NEW.kind='INSPECTION' THEN
  IF t.type<>'INSPECT_FILE' THEN RAISE EXCEPTION 'Inspection task required' USING ERRCODE='23514'; END IF;
  IF NEW."sourceUploadId" IS NOT NULL THEN
   IF NOT EXISTS (SELECT 1 FROM "UserAuthorization" WHERE "userId"=t."ownerId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL) THEN
    RAISE EXCEPTION 'Current source owner authority required' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS (SELECT 1 FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId" AND "taskId"=t.id AND "versionId"=v.id AND "uploadedById"=t."ownerId") AND NOT EXISTS (
    SELECT 1 FROM "UniversalTaskFamilyLink" family JOIN "UniversalTaskReference" ref ON ref."taskId"=family."sourceTaskId"
    JOIN "UniversalTaskUpload" upload ON upload.id=ref."sourceUploadId" JOIN "UniversalTask" original ON original.id=upload."taskId"
    WHERE family."taskId"=t.id AND family."createdEntryId"=e.id AND e.action='CREATED' AND ref.kind='INSPECTION' AND
    ref."versionId"=v.id AND upload.id=NEW."sourceUploadId" AND (a->>'businessRole'='DIRECTOR' OR original."ownerId"=a->>'userId')) THEN
    RAISE EXCEPTION 'Real owner source upload required' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT EXISTS (SELECT 1 FROM "ProjectAttachment" p JOIN "SharedFileReference" r ON r."projectAttachmentId"=p.id
    WHERE p.id=NEW."sourceAttachmentId" AND p."projectId"=t."projectId" AND p.status='READY' AND r."versionId"=v.id AND
    p.bucket=v.bucket AND p."storageKey"=v."storageKey" AND p."fileSize"=v."fileSize" AND p."mimeType"=v."mimeType") THEN
    RAISE EXCEPTION 'Exact native project file required' USING ERRCODE='23514'; END IF;
   -- Genuine source delegation is narrower than project management. Both actual
   -- owner and intervening selector must own the folder (or be Director).
   IF EXISTS (SELECT 1 FROM "UserAuthorization" auth WHERE auth."userId" IN (t."ownerId",a->>'userId') AND
    (auth."accountStatus"<>'ACTIVE' OR auth."businessRole" IS NULL OR (auth."businessRole"<>'DIRECTOR' AND NOT EXISTS (
     SELECT 1 FROM "ProjectAttachment" p JOIN "Project" project ON project.id=p."projectId"
     LEFT JOIN "ProjectPrivateFolder" pf ON pf.id=p."privateFolderId"
     LEFT JOIN "ProjectResearchFolderFile" rf ON rf."attachmentId"=p.id
     LEFT JOIN "ProjectResearchFolder" folder ON folder.id=rf."folderId"
     LEFT JOIN "ProjectResearchWorkspace" workspace ON workspace.id=folder."workspaceId"
     WHERE p.id=NEW."sourceAttachmentId" AND ((pf.id IS NOT NULL AND pf."ownerUserId"=auth."userId") OR (pf.id IS NULL AND workspace."ownerUserId"=project."ownerId" AND auth."businessRole" IN ('SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND (project."ownerId"=auth."userId" OR EXISTS (SELECT 1 FROM "ProjectCoOwner" WHERE "projectId"=project.id AND "userId"=auth."userId")))) AND
      (project."ownerId"=auth."userId" OR EXISTS (SELECT 1 FROM "ProjectCoOwner" WHERE "projectId"=project.id AND "userId"=auth."userId") OR
       EXISTS (SELECT 1 FROM "ProjectExecutor" WHERE "projectId"=project.id AND "userId"=auth."userId"))
    )))) THEN RAISE EXCEPTION 'Current folder delegation authority required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO STRICT u FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId";
  SELECT * INTO STRICT source FROM "UniversalTask" WHERE id=u."taskId" FOR SHARE;
  SELECT * INTO STRICT submission FROM "UniversalTaskEntry" WHERE id=NEW."sourceSubmissionId";
  IF t.type<>'FINAL_CONCEPT' OR e.action<>'CREATED' OR source.type<>'INITIAL_CONCEPT' OR source."deletedAt" IS NOT NULL OR source.status='CLOSED' OR
   source."projectId" IS DISTINCT FROM t."projectId" OR source."flexibleProjectId" IS DISTINCT FROM t."flexibleProjectId" OR
   (a->>'businessRole'<>'DIRECTOR' AND source."ownerId"<>a->>'userId') OR
   u."versionId"<>v.id OR u."submittedEntryId" IS DISTINCT FROM submission.id OR submission.action<>'SUBMIT' OR
   submission."taskId"<>source.id OR submission."actorId"<>u."uploadedById" OR NOT (submission.snapshot->'fileVersionIds' ? v.id) OR
   EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=source.id AND version>submission.version AND action IN ('SUBMIT','EDIT','REJECT','CLOSE')) THEN
   RAISE EXCEPTION 'Eligible exact Initial Concept submission required' USING ERRCODE='23514'; END IF;
  SELECT * INTO review FROM "UniversalTaskEntry" WHERE "taskId"=source.id AND action='APPROVE' AND snapshot->'evidence'->'submissionIds' ? submission.id;
  IF NEW."sourceReviewId" IS DISTINCT FROM review.id OR (NEW."sourceState"='APPROVED') IS DISTINCT FROM (review.id IS NOT NULL) THEN
   RAISE EXCEPTION 'Truthful original concept review required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

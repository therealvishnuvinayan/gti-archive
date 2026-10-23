# Phase 4.4F — Exact combined migration object inventory

Candidate: `20261024010000_runtime_integration`.

SHA-256: `0a7981b4ff8b3646a6e9acfca744ef4cd2c555698317c9a9ab469b6adff54bef`.

Derived from fresh PostgreSQL catalog snapshots immediately before and after the exact candidate, using the 115-migration schema and a disposable PostgreSQL 14.19 cluster. No Neon DDL was executed. Full definitions and before/after evidence are in `.tmp/phase44f/catalog-delta.json`, `disposable-before.json` and `disposable-after.json`; SQL is in [the candidate](../../../prisma/migrations/20261024010000_runtime_integration/migration.sql).

**16 new tables / 55 indexes including primary keys / 48 restrictive foreign keys / seven new-table CHECKs / 24 new functions / 67 enabled triggers. Twelve existing functions and nine existing CHECK definitions change; four values extend existing enums. No existing columns change and no existing objects are removed.**

| New table | Indexes incl. PK | FKs | CHECKs |
| --- | ---: | ---: | ---: |
| `RuntimeCompletionActivity` | 4 | 3 | 1 |
| `RuntimeCompletionDecision` | 5 | 3 | 1 |
| `RuntimeCompletionRequest` | 5 | 4 | 1 |
| `RuntimeCreationDecision` | 5 | 4 | 1 |
| `RuntimeCreationRequest` | 4 | 3 | 1 |
| `RuntimeDocumentFile` | 2 | 2 | 0 |
| `RuntimeDocumentPolicy` | 3 | 2 | 1 |
| `RuntimeDocumentProvenance` | 3 | 3 | 0 |
| `RuntimeDocumentReference` | 2 | 2 | 0 |
| `RuntimeDocumentSubmission` | 7 | 7 | 1 |
| `RuntimeTaskApplication` | 2 | 2 | 0 |
| `RuntimeTaskContext` | 3 | 3 | 0 |
| `RuntimeTaskEventContext` | 3 | 3 | 0 |
| `RuntimeTaskPublication` | 2 | 2 | 0 |
| `RuntimeTaskReference` | 3 | 3 | 0 |
| `RuntimeTaskTarget` | 2 | 2 | 0 |

**New indexes (55)**

| Table | Name | Definition |
| --- | --- | --- |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_actorId_commandId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionActivity_actorId_commandId_key" ON public."RuntimeCompletionActivity" USING btree ("actorId", "commandId")` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_eventId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionActivity_eventId_key" ON public."RuntimeCompletionActivity" USING btree ("eventId")` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_pkey` | `CREATE UNIQUE INDEX "RuntimeCompletionActivity_pkey" ON public."RuntimeCompletionActivity" USING btree (id)` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_projectId_sequence_key` | `CREATE UNIQUE INDEX "RuntimeCompletionActivity_projectId_sequence_key" ON public."RuntimeCompletionActivity" USING btree ("projectId", sequence)` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_activityId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionDecision_activityId_key" ON public."RuntimeCompletionDecision" USING btree ("activityId")` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_approved` | `CREATE UNIQUE INDEX "RuntimeCompletionDecision_approved" ON public."RuntimeCompletionDecision" USING btree ("projectId") WHERE (outcome = 'APPROVE'::text)` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_pkey` | `CREATE UNIQUE INDEX "RuntimeCompletionDecision_pkey" ON public."RuntimeCompletionDecision" USING btree (id)` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_projectId_idx` | `CREATE INDEX "RuntimeCompletionDecision_projectId_idx" ON public."RuntimeCompletionDecision" USING btree ("projectId")` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_requestId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionDecision_requestId_key" ON public."RuntimeCompletionDecision" USING btree ("requestId")` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_activityId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionRequest_activityId_key" ON public."RuntimeCompletionRequest" USING btree ("activityId")` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_pending` | `CREATE UNIQUE INDEX "RuntimeCompletionRequest_pending" ON public."RuntimeCompletionRequest" USING btree ("projectId") WHERE (state = 'PENDING'::text)` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_pkey` | `CREATE UNIQUE INDEX "RuntimeCompletionRequest_pkey" ON public."RuntimeCompletionRequest" USING btree (id)` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_projectId_revision_key` | `CREATE UNIQUE INDEX "RuntimeCompletionRequest_projectId_revision_key" ON public."RuntimeCompletionRequest" USING btree ("projectId", revision)` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_supersededActivityId_key` | `CREATE UNIQUE INDEX "RuntimeCompletionRequest_supersededActivityId_key" ON public."RuntimeCompletionRequest" USING btree ("supersededActivityId")` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_eventId_key` | `CREATE UNIQUE INDEX "RuntimeCreationDecision_eventId_key" ON public."RuntimeCreationDecision" USING btree ("eventId")` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_pkey` | `CREATE UNIQUE INDEX "RuntimeCreationDecision_pkey" ON public."RuntimeCreationDecision" USING btree (id)` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_projectId_key` | `CREATE UNIQUE INDEX "RuntimeCreationDecision_projectId_key" ON public."RuntimeCreationDecision" USING btree ("projectId")` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_requestId_key` | `CREATE UNIQUE INDEX "RuntimeCreationDecision_requestId_key" ON public."RuntimeCreationDecision" USING btree ("requestId")` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_reviewerId_commandId_key` | `CREATE UNIQUE INDEX "RuntimeCreationDecision_reviewerId_commandId_key" ON public."RuntimeCreationDecision" USING btree ("reviewerId", "commandId")` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_eventId_key` | `CREATE UNIQUE INDEX "RuntimeCreationRequest_eventId_key" ON public."RuntimeCreationRequest" USING btree ("eventId")` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_pkey` | `CREATE UNIQUE INDEX "RuntimeCreationRequest_pkey" ON public."RuntimeCreationRequest" USING btree (id)` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_requesterId_commandId_key` | `CREATE UNIQUE INDEX "RuntimeCreationRequest_requesterId_commandId_key" ON public."RuntimeCreationRequest" USING btree ("requesterId", "commandId")` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_requesterId_createdAt_id_idx` | `CREATE INDEX "RuntimeCreationRequest_requesterId_createdAt_id_idx" ON public."RuntimeCreationRequest" USING btree ("requesterId", "createdAt", id)` |
| `RuntimeDocumentFile` | `RuntimeDocumentFile_pkey` | `CREATE UNIQUE INDEX "RuntimeDocumentFile_pkey" ON public."RuntimeDocumentFile" USING btree ("fileId")` |
| `RuntimeDocumentFile` | `RuntimeDocumentFile_projectId_category_key` | `CREATE UNIQUE INDEX "RuntimeDocumentFile_projectId_category_key" ON public."RuntimeDocumentFile" USING btree ("projectId", category)` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_activityId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentPolicy_activityId_key" ON public."RuntimeDocumentPolicy" USING btree ("activityId")` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_pkey` | `CREATE UNIQUE INDEX "RuntimeDocumentPolicy_pkey" ON public."RuntimeDocumentPolicy" USING btree (id)` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_projectId_revision_key` | `CREATE UNIQUE INDEX "RuntimeDocumentPolicy_projectId_revision_key" ON public."RuntimeDocumentPolicy" USING btree ("projectId", revision)` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_activityId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentProvenance_activityId_key" ON public."RuntimeDocumentProvenance" USING btree ("activityId")` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_pkey` | `CREATE UNIQUE INDEX "RuntimeDocumentProvenance_pkey" ON public."RuntimeDocumentProvenance" USING btree ("provenanceId")` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_submissionId_idx` | `CREATE INDEX "RuntimeDocumentProvenance_submissionId_idx" ON public."RuntimeDocumentProvenance" USING btree ("submissionId")` |
| `RuntimeDocumentReference` | `RuntimeDocumentReference_pkey` | `CREATE UNIQUE INDEX "RuntimeDocumentReference_pkey" ON public."RuntimeDocumentReference" USING btree ("referenceId")` |
| `RuntimeDocumentReference` | `RuntimeDocumentReference_submissionId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentReference_submissionId_key" ON public."RuntimeDocumentReference" USING btree ("submissionId")` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_approvalRequestId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_approvalRequestId_key" ON public."RuntimeDocumentSubmission" USING btree ("approvalRequestId")` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_pkey` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_pkey" ON public."RuntimeDocumentSubmission" USING btree (id)` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_preparedActivityId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_preparedActivityId_key" ON public."RuntimeDocumentSubmission" USING btree ("preparedActivityId")` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_projectId_category_idx` | `CREATE INDEX "RuntimeDocumentSubmission_projectId_category_idx" ON public."RuntimeDocumentSubmission" USING btree ("projectId", category)` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_reviewedActivityId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_reviewedActivityId_key" ON public."RuntimeDocumentSubmission" USING btree ("reviewedActivityId")` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_submittedActivityId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_submittedActivityId_key" ON public."RuntimeDocumentSubmission" USING btree ("submittedActivityId")` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_versionId_key` | `CREATE UNIQUE INDEX "RuntimeDocumentSubmission_versionId_key" ON public."RuntimeDocumentSubmission" USING btree ("versionId")` |
| `RuntimeTaskApplication` | `RuntimeTaskApplication_activityId_key` | `CREATE UNIQUE INDEX "RuntimeTaskApplication_activityId_key" ON public."RuntimeTaskApplication" USING btree ("activityId")` |
| `RuntimeTaskApplication` | `RuntimeTaskApplication_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskApplication_pkey" ON public."RuntimeTaskApplication" USING btree ("applicationId")` |
| `RuntimeTaskContext` | `RuntimeTaskContext_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskContext_pkey" ON public."RuntimeTaskContext" USING btree ("taskId")` |
| `RuntimeTaskContext` | `RuntimeTaskContext_projectId_taskId_idx` | `CREATE INDEX "RuntimeTaskContext_projectId_taskId_idx" ON public."RuntimeTaskContext" USING btree ("projectId", "taskId")` |
| `RuntimeTaskContext` | `RuntimeTaskContext_sourceTaskId_idx` | `CREATE INDEX "RuntimeTaskContext_sourceTaskId_idx" ON public."RuntimeTaskContext" USING btree ("sourceTaskId")` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskEventContext_pkey" ON public."RuntimeTaskEventContext" USING btree ("eventId")` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_projectId_eventId_idx` | `CREATE INDEX "RuntimeTaskEventContext_projectId_eventId_idx" ON public."RuntimeTaskEventContext" USING btree ("projectId", "eventId")` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_taskId_idx` | `CREATE INDEX "RuntimeTaskEventContext_taskId_idx" ON public."RuntimeTaskEventContext" USING btree ("taskId")` |
| `RuntimeTaskPublication` | `RuntimeTaskPublication_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskPublication_pkey" ON public."RuntimeTaskPublication" USING btree ("publicationId")` |
| `RuntimeTaskPublication` | `RuntimeTaskPublication_submissionId_key` | `CREATE UNIQUE INDEX "RuntimeTaskPublication_submissionId_key" ON public."RuntimeTaskPublication" USING btree ("submissionId")` |
| `RuntimeTaskReference` | `RuntimeTaskReference_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskReference_pkey" ON public."RuntimeTaskReference" USING btree ("referenceId")` |
| `RuntimeTaskReference` | `RuntimeTaskReference_projectId_idx` | `CREATE INDEX "RuntimeTaskReference_projectId_idx" ON public."RuntimeTaskReference" USING btree ("projectId")` |
| `RuntimeTaskReference` | `RuntimeTaskReference_submissionId_idx` | `CREATE INDEX "RuntimeTaskReference_submissionId_idx" ON public."RuntimeTaskReference" USING btree ("submissionId")` |
| `RuntimeTaskTarget` | `RuntimeTaskTarget_pkey` | `CREATE UNIQUE INDEX "RuntimeTaskTarget_pkey" ON public."RuntimeTaskTarget" USING btree ("taskId")` |
| `RuntimeTaskTarget` | `RuntimeTaskTarget_stageId_idx` | `CREATE INDEX "RuntimeTaskTarget_stageId_idx" ON public."RuntimeTaskTarget" USING btree ("stageId")` |

**New relational constraints (48 FKs, 16 primary keys, seven CHECKs)**

All foreign keys use RESTRICT for update and delete. Deferred relationships are identified in the table. Partial unique constraints are implemented as indexes above.

| Table | Name | Kind | Initially deferred | Definition |
| --- | --- | --- | --- | --- |
| `BusinessEvent` | `flux_runtime_task_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_actorId_fkey` | f | false | `FOREIGN KEY ("actorId") REFERENCES "User"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_eventId_fkey` | f | true | `FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionActivity` | `RuntimeCompletionActivity_shape` | c | false | `CHECK (sequence > 0 AND "actorVersion" > 0 AND length("commandId") >= 8 AND length("commandId") <= 100 AND "commandHash" ~ '^[a-f0-9]{64}$'::text AND jsonb_typeof(snapshot) = 'object'::text AND jsonb_typeof(result) = 'object'::text AND (action = ANY (ARRAY['POLICY_APPROVED'::text, 'UPLOAD_PREPARED'::text, 'DOCUMENT_SUBMITTED'::text, 'UPLOAD_CANCELLED'::text, 'DOCUMENT_REVIEWED'::text, 'COMPLETION_REQUESTED'::text, 'COMPLETION_DECIDED'::text])))` |
| `RuntimeCompletionActivity` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_activityId_fkey` | f | true | `FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_requestId_fkey` | f | false | `FOREIGN KEY ("requestId") REFERENCES "RuntimeCompletionRequest"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionDecision` | `RuntimeCompletionDecision_shape` | c | false | `CHECK ((outcome = ANY (ARRAY['APPROVE'::text, 'REJECT'::text])) AND "snapshotHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000)` |
| `RuntimeCompletionDecision` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_activityId_fkey` | f | true | `FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_policyId_fkey` | f | false | `FOREIGN KEY ("policyId") REFERENCES "RuntimeDocumentPolicy"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_shape` | c | false | `CHECK ((state = 'SUPERSEDED'::text) = ("supersededActivityId" IS NOT NULL) AND revision > 0 AND (state = ANY (ARRAY['PENDING'::text, 'SUPERSEDED'::text, 'REJECTED'::text, 'APPROVED'::text])) AND "snapshotHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000 AND jsonb_typeof(snapshot) = 'object'::text)` |
| `RuntimeCompletionRequest` | `RuntimeCompletionRequest_supersededActivityId_fkey` | f | true | `FOREIGN KEY ("supersededActivityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCompletionRequest` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_eventId_fkey` | f | true | `FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_projectId_fkey` | f | true | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_requestId_fkey` | f | false | `FOREIGN KEY ("requestId") REFERENCES "RuntimeCreationRequest"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_reviewerId_fkey` | f | false | `FOREIGN KEY ("reviewerId") REFERENCES "User"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCreationDecision` | `RuntimeCreationDecision_shape` | c | false | `CHECK ("actorVersion" > 0 AND length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000 AND (outcome = ANY (ARRAY['APPROVE'::text, 'REJECT'::text])) AND (outcome = 'APPROVE'::text) = ("projectId" IS NOT NULL) AND "snapshotHash" ~ '^[a-f0-9]{64}$'::text AND "commandHash" ~ '^[a-f0-9]{64}$'::text)` |
| `RuntimeCreationDecision` | `flux_runtime_creation_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_eventId_fkey` | f | true | `FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_publishedVersionId_fkey` | f | false | `FOREIGN KEY ("publishedVersionId") REFERENCES "PublishedWorkflowVersion"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_requesterId_fkey` | f | false | `FOREIGN KEY ("requesterId") REFERENCES "User"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeCreationRequest` | `RuntimeCreationRequest_shape` | c | false | `CHECK ("actorVersion" > 0 AND length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000 AND "snapshotHash" ~ '^[a-f0-9]{64}$'::text AND "commandHash" ~ '^[a-f0-9]{64}$'::text AND jsonb_typeof(snapshot) = 'object'::text)` |
| `RuntimeDocumentFile` | `RuntimeDocumentFile_fileId_fkey` | f | false | `FOREIGN KEY ("fileId") REFERENCES "SharedFile"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentFile` | `RuntimeDocumentFile_pkey` | p | false | `PRIMARY KEY ("fileId")` |
| `RuntimeDocumentFile` | `RuntimeDocumentFile_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentFile` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentFile` | `flux_runtime_document_version_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_activityId_fkey` | f | true | `FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentPolicy` | `RuntimeDocumentPolicy_shape` | c | false | `CHECK (revision > 0 AND "snapshotHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim(reason)) >= 1 AND length(btrim(reason)) <= 2000 AND jsonb_typeof(settings) = 'object'::text AND settings ?& ARRAY['AUTHORITY_APPROVAL_PROOF'::text, 'COPYRIGHT_TRANSFER'::text, 'INVOICE'::text] AND (settings - ARRAY['AUTHORITY_APPROVAL_PROOF'::text, 'COPYRIGHT_TRANSFER'::text, 'INVOICE'::text]) = '{}'::jsonb AND ((settings -> 'AUTHORITY_APPROVAL_PROOF'::text) = ANY (ARRAY['"REQUIRED"'::jsonb, '"OPTIONAL"'::jsonb, '"NOT_APPLICABLE"'::jsonb])) AND ((settings -> 'COPYRIGHT_TRANSFER'::text) = ANY (ARRAY['"REQUIRED"'::jsonb, '"OPTIONAL"'::jsonb, '"NOT_APPLICABLE"'::jsonb])) AND ((settings -> 'INVOICE'::text) = ANY (ARRAY['"REQUIRED"'::jsonb, '"OPTIONAL"'::jsonb, '"NOT_APPLICABLE"'::jsonb])))` |
| `RuntimeDocumentPolicy` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_activityId_fkey` | f | true | `FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_pkey` | p | false | `PRIMARY KEY ("provenanceId")` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_provenanceId_fkey` | f | false | `FOREIGN KEY ("provenanceId") REFERENCES "SharedFileProvenance"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentProvenance` | `RuntimeDocumentProvenance_submissionId_fkey` | f | false | `FOREIGN KEY ("submissionId") REFERENCES "RuntimeDocumentSubmission"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentReference` | `RuntimeDocumentReference_pkey` | p | false | `PRIMARY KEY ("referenceId")` |
| `RuntimeDocumentReference` | `RuntimeDocumentReference_referenceId_fkey` | f | false | `FOREIGN KEY ("referenceId") REFERENCES "SharedFileReference"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentReference` | `RuntimeDocumentReference_submissionId_fkey` | f | false | `FOREIGN KEY ("submissionId") REFERENCES "RuntimeDocumentSubmission"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_approvalRequestId_fkey` | f | true | `FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_pkey` | p | false | `PRIMARY KEY (id)` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_policyId_fkey` | f | false | `FOREIGN KEY ("policyId") REFERENCES "RuntimeDocumentPolicy"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_preparedActivityId_fkey` | f | true | `FOREIGN KEY ("preparedActivityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_reviewedActivityId_fkey` | f | true | `FOREIGN KEY ("reviewedActivityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_shape` | c | false | `CHECK ((state = ANY (ARRAY['UPLOADING'::text, 'FAILED'::text, 'SUBMITTED'::text, 'ACCEPTED'::text, 'REJECTED'::text])) AND (state = 'UPLOADING'::text) = ("submittedActivityId" IS NULL) AND (state = ANY (ARRAY['SUBMITTED'::text, 'ACCEPTED'::text, 'REJECTED'::text])) = ("approvalRequestId" IS NOT NULL) AND (state = ANY (ARRAY['ACCEPTED'::text, 'REJECTED'::text])) = ("reviewedActivityId" IS NOT NULL))` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_submittedActivityId_fkey` | f | true | `FOREIGN KEY ("submittedActivityId") REFERENCES "RuntimeCompletionActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeDocumentSubmission` | `RuntimeDocumentSubmission_versionId_fkey` | f | false | `FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeDocumentSubmission` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeFileSubmission` | `flux_runtime_deliverable_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeProject` | `flux_runtime_completion_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeTaskApplication` | `RuntimeTaskApplication_activityId_fkey` | f | false | `FOREIGN KEY ("activityId") REFERENCES "RuntimeActivity"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskApplication` | `RuntimeTaskApplication_applicationId_fkey` | f | false | `FOREIGN KEY ("applicationId") REFERENCES "UniversalTaskApplication"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskApplication` | `RuntimeTaskApplication_pkey` | p | false | `PRIMARY KEY ("applicationId")` |
| `RuntimeTaskContext` | `RuntimeTaskContext_pkey` | p | false | `PRIMARY KEY ("taskId")` |
| `RuntimeTaskContext` | `RuntimeTaskContext_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskContext` | `RuntimeTaskContext_sourceTaskId_fkey` | f | false | `FOREIGN KEY ("sourceTaskId") REFERENCES "UniversalTask"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskContext` | `RuntimeTaskContext_taskId_fkey` | f | false | `FOREIGN KEY ("taskId") REFERENCES "UniversalTask"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskContext` | `flux_runtime_task_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_eventId_fkey` | f | false | `FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_pkey` | p | false | `PRIMARY KEY ("eventId")` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskEventContext` | `RuntimeTaskEventContext_taskId_fkey` | f | false | `FOREIGN KEY ("taskId") REFERENCES "RuntimeTaskContext"("taskId") ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskPublication` | `RuntimeTaskPublication_pkey` | p | false | `PRIMARY KEY ("publicationId")` |
| `RuntimeTaskPublication` | `RuntimeTaskPublication_publicationId_fkey` | f | false | `FOREIGN KEY ("publicationId") REFERENCES "UniversalTaskPublication"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskPublication` | `RuntimeTaskPublication_submissionId_fkey` | f | false | `FOREIGN KEY ("submissionId") REFERENCES "RuntimeFileSubmission"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskReference` | `RuntimeTaskReference_pkey` | p | false | `PRIMARY KEY ("referenceId")` |
| `RuntimeTaskReference` | `RuntimeTaskReference_projectId_fkey` | f | false | `FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskReference` | `RuntimeTaskReference_referenceId_fkey` | f | false | `FOREIGN KEY ("referenceId") REFERENCES "UniversalTaskReference"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskReference` | `RuntimeTaskReference_submissionId_fkey` | f | false | `FOREIGN KEY ("submissionId") REFERENCES "RuntimeFileSubmission"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskReference` | `flux_runtime_reference_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `RuntimeTaskTarget` | `RuntimeTaskTarget_pkey` | p | false | `PRIMARY KEY ("taskId")` |
| `RuntimeTaskTarget` | `RuntimeTaskTarget_stageId_fkey` | f | false | `FOREIGN KEY ("stageId") REFERENCES "RuntimeStage"(id) ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskTarget` | `RuntimeTaskTarget_taskId_fkey` | f | false | `FOREIGN KEY ("taskId") REFERENCES "UniversalTaskTarget"("taskId") ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `RuntimeTaskTarget` | `flux_runtime_deliverable_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `SharedFileProvenance` | `flux_runtime_document_bridge_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `SharedFileReference` | `flux_runtime_document_bridge_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `SharedFileVersion` | `flux_runtime_document_version_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `UniversalTask` | `flux_runtime_deliverable_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `UniversalTask` | `flux_runtime_task_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `UniversalTaskReference` | `flux_runtime_reference_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |
| `UniversalTaskTarget` | `flux_runtime_deliverable_consistency` | t | true | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |

**Existing CHECK replacements (9)**

| Table | Name | Candidate definition |
| --- | --- | --- |
| `ApprovalRequest` | `ApprovalRequest_values_check` | `CHECK ((("subjectType"::text = ANY (ARRAY['RUNTIME_STAGE'::text, 'RUNTIME_DOCUMENT'::text])) AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId", "externalRequesterEmail", "expiresAt") = 0 AND "requestedById" IS NOT NULL AND ("policyKey" = ANY (ARRAY['runtime-stage.ordered.v1'::text, 'runtime-document.manager.v1'::text])) OR "subjectType"::text = 'COMPLETION_DOCUMENT_SUBMISSION'::text AND "subjectId" = "completionSubmissionId" AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId") = 3 OR "subjectType"::text = 'WORKFLOW_DRAFT_REVISION'::text AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId", "externalRequesterEmail", "expiresAt") = 0 AND "requestedById" IS NOT NULL AND "policyKey" = 'workflow-publication.director.v1'::text) AND num_nonnulls("requestedById", "externalRequesterEmail") = 1 AND revision >= 0 AND "currentStep" > 0 AND "evidenceHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim("policyKey")) >= 3 AND length(btrim("policyKey")) <= 100 AND jsonb_typeof("policySnapshot") = 'object'::text AND jsonb_typeof("subjectSnapshot") = 'object'::text AND (state = 'SUPERSEDED'::"ApprovalRequestState" AND "supersededAt" IS NOT NULL AND length(btrim("supersessionReason")) > 0 OR state <> 'SUPERSEDED'::"ApprovalRequestState" AND "supersededAt" IS NULL AND "supersessionReason" IS NULL))` |
| `BusinessEvent` | `BusinessEvent_contract_check` | `CHECK ("schemaVersion" = 1 AND sequence > 0 AND "actorVersion" > 0 AND jsonb_typeof(payload) = 'object'::text AND (type::text = 'RUNTIME_ACTIVITY'::text AND "aggregateType" = 'RUNTIME_PROJECT'::text AND operation = 'runtimeStageCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR type::text = 'COMPLETION_DOCUMENT_REVIEW_DECIDED'::text AND "aggregateType" = 'COMPLETION_DOCUMENT_SUBMISSION'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND operation = 'reviewCompletionDocument'::text AND "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL OR type::text = 'TASK_ACTIVITY'::text AND "aggregateType" = 'UNIVERSAL_TASK'::text AND (operation = ANY (ARRAY['generalTaskCommand'::text, 'deliverableTaskCommand'::text, 'conceptTaskCommand'::text])) AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text, 'DESIGNER'::text, 'DIGITAL_LEAD'::text])) AND num_nonnulls("projectId", "flexibleProjectId") <= 1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL OR type::text = 'WORKFLOW_DRAFT_REVISED'::text AND "aggregateType" = 'WORKFLOW_DRAFT'::text AND operation = 'draftWorkflowCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR (type::text = ANY (ARRAY['WORKFLOW_PUBLICATION_SUBMITTED'::text, 'WORKFLOW_PUBLICATION_SUPERSEDED'::text, 'WORKFLOW_PUBLICATION_DECIDED'::text, 'WORKFLOW_VERSION_PUBLISHED'::text])) AND "aggregateType" = 'WORKFLOW_PUBLICATION_REQUEST'::text AND operation = 'workflowPublicationCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0) OR (type::text = ANY (ARRAY['RUNTIME_CREATION_REQUESTED'::text, 'RUNTIME_CREATION_DECIDED'::text])) AND "schemaVersion" = 1 AND "aggregateType" = 'RUNTIME_CREATION'::text AND operation = 'runtimeCreationCommand'::text AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR type::text = 'RUNTIME_COMPLETION_ACTIVITY'::text AND "schemaVersion" = 1 AND "aggregateType" = 'RUNTIME_COMPLETION'::text AND operation = 'runtimeCompletionCommand'::text AND sequence > 0 AND "actorVersion" > 0 AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0)` |
| `RuntimeProject` | `RuntimeProject_shape` | `CHECK ((state = ANY (ARRAY['ACTIVE'::text, 'COMPLETED'::text])) AND revision > 0 AND "versionNumber" > 0 AND "definitionHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim(title)) >= 1 AND length(btrim(title)) <= 160 AND length(description) <= 4000)` |
| `SharedFileProvenance` | `SharedFileProvenance_native_check` | `CHECK (num_nonnulls("completionEventId", "taskEntryId") <= 1)` |
| `SharedFileReference` | `SharedFileReference_one_record_check` | `CHECK (num_nonnulls("projectAttachmentId", "flexibleAttachmentId", "archivedProjectFileId", "manualArchiveFileId", "manualLibraryAssetId", "completionSubmissionId", "completionDocumentId", "taskUploadId", "runtimeSubmissionId") <= 1)` |
| `UniversalTask` | `UniversalTask_values` | `CHECK (((type <> ALL (ARRAY['FILE_UPLOAD'::"UniversalTaskType", 'DATA_INPUT'::"UniversalTaskType"])) OR "flexibleProjectId" IS NULL) AND (num_nonnulls("projectId", "flexibleProjectId") = 1 OR (type = ANY (ARRAY['GENERAL'::"UniversalTaskType", 'FILE_UPLOAD'::"UniversalTaskType", 'DATA_INPUT'::"UniversalTaskType", 'INSPECT_FILE'::"UniversalTaskType", 'INITIAL_CONCEPT'::"UniversalTaskType", 'FINAL_CONCEPT'::"UniversalTaskType"])) AND num_nonnulls("projectId", "flexibleProjectId") = 0) AND "ownerId" <> "executorId" AND version > 0 AND length(btrim(title)) >= 1 AND length(btrim(title)) <= 200 AND length(btrim(brief)) >= 1 AND length(btrim(brief)) <= 20000)` |
| `UniversalTaskPublication` | `UniversalTaskPublication_values` | `CHECK ("attachmentId" IS NULL OR "publishedVersionId" IS NOT NULL)` |
| `UniversalTaskReference` | `UniversalTaskReference_values` | `CHECK ((kind = ANY (ARRAY['INSPECTION'::text, 'INSPIRATION'::text])) AND num_nonnulls("sourceUploadId", "sourceAttachmentId") <= 1 AND (kind = 'INSPECTION'::text AND "sourceSubmissionId" IS NULL AND "sourceReviewId" IS NULL AND "sourceState" = 'SEALED'::text OR kind = 'INSPIRATION'::text AND "sourceUploadId" IS NOT NULL AND "sourceSubmissionId" IS NOT NULL AND ("sourceState" = ANY (ARRAY['SUBMITTED'::text, 'APPROVED'::text])) AND ("sourceState" = 'APPROVED'::text) = ("sourceReviewId" IS NOT NULL)))` |
| `UniversalTaskTarget` | `UniversalTaskTarget_values` | `CHECK ((kind = ANY (ARRAY['private-folder'::text, 'research-folder'::text, 'checklist'::text, 'runtime-file'::text, 'runtime-field'::text])) AND ("inputMode" = ANY (ARRAY['TEXT'::text, 'FILE'::text, 'TEXT_FILE'::text])) AND (kind = 'checklist'::text OR kind = 'runtime-field'::text AND "inputMode" = 'TEXT'::text OR (kind <> ALL (ARRAY['checklist'::text, 'runtime-field'::text])) AND "inputMode" = 'FILE'::text) AND "identityHash" ~ '^[a-f0-9]{64}$'::text AND "expectedHash" ~ '^[a-f0-9]{64}$'::text AND jsonb_typeof(identity) = 'object'::text AND jsonb_typeof("expectedState") = 'object'::text)` |

**Functions (24 new, 12 replaced)**

Full PL/pgSQL bodies are in the candidate and catalog evidence. `.tmp/phase44f/guard-replacements.diff` compares every replaced body with the applied 115 baseline.

| Change | Function | Arguments |
| --- | --- | --- |
| New | `flux_emit_runtime_completion_event` | `(none)` |
| New | `flux_emit_runtime_creation_event` | `(none)` |
| New | `flux_runtime_completed_task_guard` | `(none)` |
| New | `flux_runtime_completion_consistency` | `(none)` |
| New | `flux_runtime_completion_evidence` | `pid text` |
| New | `flux_runtime_completion_guard` | `(none)` |
| New | `flux_runtime_completion_ready` | `pid text` |
| New | `flux_runtime_creation_consistency` | `(none)` |
| New | `flux_runtime_creation_guard` | `(none)` |
| New | `flux_runtime_creation_valid` | `snapshot jsonb, requester text` |
| New | `flux_runtime_deliverable_consistency` | `(none)` |
| New | `flux_runtime_deliverable_guard` | `(none)` |
| New | `flux_runtime_document_approval_consistency` | `rid text` |
| New | `flux_runtime_document_approval_write` | `t text, op text, value jsonb, old_value jsonb` |
| New | `flux_runtime_document_bridge_consistency` | `(none)` |
| New | `flux_runtime_document_version_consistency` | `(none)` |
| New | `flux_runtime_document_version_guard` | `(none)` |
| New | `flux_runtime_reference_consistency` | `(none)` |
| New | `flux_runtime_reference_guard` | `(none)` |
| New | `flux_runtime_sister_guard` | `(none)` |
| New | `flux_runtime_source_authorized` | `uid text, pid text` |
| New | `flux_runtime_task_consistency` | `(none)` |
| New | `flux_runtime_task_guard` | `(none)` |
| New | `flux_runtime_task_import` | `sid text, cid text, vid text, uid text` |
| Replaced | `flux_approval_consistency_guard` | `(none)` |
| Replaced | `flux_approval_write_guard` | `(none)` |
| Replaced | `flux_emit_task_event` | `(none)` |
| Replaced | `flux_event_write_guard` | `(none)` |
| Replaced | `flux_runtime_consistency` | `(none)` |
| Replaced | `flux_runtime_guard` | `(none)` |
| Replaced | `flux_shared_file_provenance_guard` | `(none)` |
| Replaced | `flux_shared_file_reference_guard` | `(none)` |
| Replaced | `flux_task_application_consistency` | `(none)` |
| Replaced | `flux_task_deliverable_consistency` | `(none)` |
| Replaced | `flux_task_deliverable_guard` | `(none)` |
| Replaced | `flux_task_reference_guard` | `(none)` |

**New triggers (67)**

All are enabled with `tgenabled=O`; existing triggers are unchanged. The definitions preserve BEFORE/AFTER, row/statement and deferred timing.

| Table | Trigger | Definition |
| --- | --- | --- |
| `BusinessEvent` | `flux_runtime_task_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT ON "BusinessEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency()` |
| `RuntimeCompletionActivity` | `flux_emit_runtime_completion_event` | `CREATE TRIGGER flux_emit_runtime_completion_event AFTER INSERT ON "RuntimeCompletionActivity" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_completion_event()` |
| `RuntimeCompletionActivity` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeCompletionActivity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeCompletionActivity` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeCompletionActivity" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCompletionActivity` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeCompletionActivity" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCompletionDecision` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeCompletionDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeCompletionDecision` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeCompletionDecision" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCompletionDecision` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeCompletionDecision" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCompletionRequest` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeCompletionRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeCompletionRequest` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeCompletionRequest" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCompletionRequest` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeCompletionRequest" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeCreationDecision` | `flux_emit_runtime_creation_event` | `CREATE TRIGGER flux_emit_runtime_creation_event AFTER INSERT ON "RuntimeCreationDecision" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_creation_event()` |
| `RuntimeCreationDecision` | `flux_runtime_creation_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_creation_consistency AFTER INSERT ON "RuntimeCreationDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_creation_consistency()` |
| `RuntimeCreationDecision` | `flux_runtime_creation_guard` | `CREATE TRIGGER flux_runtime_creation_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeCreationDecision" FOR EACH ROW EXECUTE FUNCTION flux_runtime_creation_guard()` |
| `RuntimeCreationDecision` | `flux_runtime_creation_truncate` | `CREATE TRIGGER flux_runtime_creation_truncate BEFORE TRUNCATE ON "RuntimeCreationDecision" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_creation_guard()` |
| `RuntimeCreationRequest` | `flux_emit_runtime_creation_event` | `CREATE TRIGGER flux_emit_runtime_creation_event AFTER INSERT ON "RuntimeCreationRequest" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_creation_event()` |
| `RuntimeCreationRequest` | `flux_runtime_creation_guard` | `CREATE TRIGGER flux_runtime_creation_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeCreationRequest" FOR EACH ROW EXECUTE FUNCTION flux_runtime_creation_guard()` |
| `RuntimeCreationRequest` | `flux_runtime_creation_truncate` | `CREATE TRIGGER flux_runtime_creation_truncate BEFORE TRUNCATE ON "RuntimeCreationRequest" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_creation_guard()` |
| `RuntimeDocumentFile` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeDocumentFile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeDocumentFile` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeDocumentFile" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentFile` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeDocumentFile" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentFile` | `flux_runtime_document_version_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_document_version_consistency AFTER INSERT ON "RuntimeDocumentFile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_consistency()` |
| `RuntimeDocumentPolicy` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeDocumentPolicy" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeDocumentPolicy` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeDocumentPolicy" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentPolicy` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeDocumentPolicy" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentProvenance` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeDocumentProvenance" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentProvenance` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeDocumentProvenance" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentReference` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeDocumentReference" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentReference` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeDocumentReference" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentSubmission` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeDocumentSubmission" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeDocumentSubmission` | `flux_runtime_completion_guard` | `CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeDocumentSubmission" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeDocumentSubmission` | `flux_runtime_completion_truncate` | `CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON "RuntimeDocumentSubmission" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()` |
| `RuntimeFileSubmission` | `flux_runtime_deliverable_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT ON "RuntimeFileSubmission" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency()` |
| `RuntimeProject` | `flux_runtime_completion_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeProject" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()` |
| `RuntimeTaskApplication` | `flux_runtime_deliverable_guard` | `CREATE TRIGGER flux_runtime_deliverable_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskApplication" FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `RuntimeTaskApplication` | `flux_runtime_deliverable_truncate` | `CREATE TRIGGER flux_runtime_deliverable_truncate BEFORE TRUNCATE ON "RuntimeTaskApplication" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `RuntimeTaskContext` | `flux_runtime_task_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT ON "RuntimeTaskContext" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency()` |
| `RuntimeTaskContext` | `flux_runtime_task_guard` | `CREATE TRIGGER flux_runtime_task_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskContext" FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_guard()` |
| `RuntimeTaskContext` | `flux_runtime_task_truncate` | `CREATE TRIGGER flux_runtime_task_truncate BEFORE TRUNCATE ON "RuntimeTaskContext" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_task_guard()` |
| `RuntimeTaskEventContext` | `flux_runtime_task_guard` | `CREATE TRIGGER flux_runtime_task_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskEventContext" FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_guard()` |
| `RuntimeTaskEventContext` | `flux_runtime_task_truncate` | `CREATE TRIGGER flux_runtime_task_truncate BEFORE TRUNCATE ON "RuntimeTaskEventContext" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_task_guard()` |
| `RuntimeTaskPublication` | `flux_runtime_deliverable_guard` | `CREATE TRIGGER flux_runtime_deliverable_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskPublication" FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `RuntimeTaskPublication` | `flux_runtime_deliverable_truncate` | `CREATE TRIGGER flux_runtime_deliverable_truncate BEFORE TRUNCATE ON "RuntimeTaskPublication" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `RuntimeTaskReference` | `flux_runtime_reference_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_reference_consistency AFTER INSERT ON "RuntimeTaskReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_consistency()` |
| `RuntimeTaskReference` | `flux_runtime_reference_guard` | `CREATE TRIGGER flux_runtime_reference_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskReference" FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_guard()` |
| `RuntimeTaskReference` | `flux_runtime_reference_truncate` | `CREATE TRIGGER flux_runtime_reference_truncate BEFORE TRUNCATE ON "RuntimeTaskReference" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_reference_guard()` |
| `RuntimeTaskTarget` | `flux_runtime_deliverable_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT ON "RuntimeTaskTarget" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency()` |
| `RuntimeTaskTarget` | `flux_runtime_deliverable_guard` | `CREATE TRIGGER flux_runtime_deliverable_guard BEFORE INSERT OR DELETE OR UPDATE ON "RuntimeTaskTarget" FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `RuntimeTaskTarget` | `flux_runtime_deliverable_truncate` | `CREATE TRIGGER flux_runtime_deliverable_truncate BEFORE TRUNCATE ON "RuntimeTaskTarget" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_deliverable_guard()` |
| `SharedFileProvenance` | `flux_runtime_document_bridge_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_document_bridge_consistency AFTER INSERT ON "SharedFileProvenance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_bridge_consistency()` |
| `SharedFileReference` | `flux_runtime_document_bridge_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_document_bridge_consistency AFTER INSERT ON "SharedFileReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_bridge_consistency()` |
| `SharedFileVersion` | `flux_runtime_document_version_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_document_version_consistency AFTER INSERT OR UPDATE ON "SharedFileVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_consistency()` |
| `SharedFileVersion` | `flux_runtime_document_version_guard` | `CREATE TRIGGER flux_runtime_document_version_guard BEFORE INSERT OR UPDATE ON "SharedFileVersion" FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_guard()` |
| `UniversalTask` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTask" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTask` | `flux_runtime_deliverable_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency()` |
| `UniversalTask` | `flux_runtime_task_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency()` |
| `UniversalTaskApplication` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskApplication" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskEntry` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskEntry" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskFamilyLink` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskFamilyLink" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskFamilyLink` | `flux_runtime_sister_guard` | `CREATE TRIGGER flux_runtime_sister_guard BEFORE INSERT ON "UniversalTaskFamilyLink" FOR EACH ROW EXECUTE FUNCTION flux_runtime_sister_guard()` |
| `UniversalTaskInheritedEvidence` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskInheritedEvidence" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskReference` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskReference" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskReference` | `flux_runtime_reference_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_reference_consistency AFTER INSERT ON "UniversalTaskReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_consistency()` |
| `UniversalTaskSpectator` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskSpectator" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskTarget` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskTarget" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |
| `UniversalTaskTarget` | `flux_runtime_deliverable_consistency` | `CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT OR UPDATE ON "UniversalTaskTarget" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency()` |
| `UniversalTaskUpload` | `flux_runtime_completed_task_guard` | `CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON "UniversalTaskUpload" FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()` |

**Existing enum extensions (4)**

| Enum | Added label |
| --- | --- |
| `ApprovalSubjectType` | `RUNTIME_DOCUMENT` |
| `BusinessEventType` | `RUNTIME_CREATION_REQUESTED` |
| `BusinessEventType` | `RUNTIME_CREATION_DECIDED` |
| `BusinessEventType` | `RUNTIME_COMPLETION_ACTIVITY` |

No new enum type, historical backfill, automatic RuntimeProject, legacy Project conversion or synthetic audit event is installed. All sixteen new tables are empty immediately after migration.

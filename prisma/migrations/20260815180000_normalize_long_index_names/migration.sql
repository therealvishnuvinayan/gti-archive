-- PostgreSQL truncates identifiers to 63 bytes. Earlier migrations created
-- these indexes with long explicit names, while the live schema already uses
-- Prisma's current 63-byte names. Normalize clean replays without changing an
-- environment where the target name is already present.
DO $$
DECLARE
    source_name TEXT;
    target_name TEXT;
BEGIN
    FOR source_name, target_name IN
        SELECT *
        FROM (
            VALUES
                ('ProjectConceptFolder_projectId_workflowStageKey_assignedExec_id', 'ProjectConceptFolder_projectId_workflowStageKey_assignedExe_idx'),
                ('ProjectConceptFolder_projectId_workflowStageKey_normalizedName_', 'ProjectConceptFolder_projectId_workflowStageKey_normalizedN_key'),
                ('ProjectFileChecklistRequest_checklistId_fieldKey_requestedAt_id', 'ProjectFileChecklistRequest_checklistId_fieldKey_requestedA_idx'),
                ('ProjectStageFileHandoff_projectId_sourceAttachmentId_targetWork', 'ProjectStageFileHandoff_projectId_sourceAttachmentId_target_key'),
                ('ProjectStageFileHandoff_projectId_targetWorkflowStageKey_handed', 'ProjectStageFileHandoff_projectId_targetWorkflowStageKey_ha_idx')
        ) AS index_names(source_name, target_name)
    LOOP
        IF to_regclass(format('%I.%I', 'public', source_name)) IS NOT NULL THEN
            IF to_regclass(format('%I.%I', 'public', target_name)) IS NOT NULL THEN
                RAISE EXCEPTION 'Both source index % and target index % exist', source_name, target_name;
            END IF;

            EXECUTE format(
                'ALTER INDEX %I.%I RENAME TO %I',
                'public',
                source_name,
                target_name
            );
        ELSIF to_regclass(format('%I.%I', 'public', target_name)) IS NULL THEN
            RAISE EXCEPTION 'Neither source index % nor target index % exists', source_name, target_name;
        END IF;
    END LOOP;
END
$$;

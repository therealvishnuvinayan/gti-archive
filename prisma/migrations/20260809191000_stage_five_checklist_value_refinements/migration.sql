-- Preserve the old combined response as Tar. Existing deployments used this
-- field primarily for the tar value; Nicotine starts as its own pending item.
UPDATE "ProjectFileChecklistItem"
SET "fieldKey" = 'TAR'
WHERE "fieldKey" = 'TAR_NICOTINE';

UPDATE "ProjectFileChecklistRequest"
SET "fieldKey" = 'TAR'
WHERE "fieldKey" = 'TAR_NICOTINE';

-- Ensure every existing checklist can collect the two values independently.
INSERT INTO "ProjectFileChecklistItem" (
  "id",
  "checklistId",
  "fieldKey",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  's5-tar-' || md5(checklist."id"),
  checklist."id",
  'TAR',
  'PENDING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProjectFileChecklist" checklist
ON CONFLICT ("checklistId", "fieldKey") DO NOTHING;

INSERT INTO "ProjectFileChecklistItem" (
  "id",
  "checklistId",
  "fieldKey",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  's5-nicotine-' || md5(checklist."id"),
  checklist."id",
  'NICOTINE',
  'PENDING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProjectFileChecklist" checklist
ON CONFLICT ("checklistId", "fieldKey") DO NOTHING;

-- Compulsory Text and Marketing Copy now use the same additive list shape as
-- Printing Technology. Convert any previous textarea response into one list
-- entry without changing its status or audit metadata.
UPDATE "ProjectFileChecklistItem"
SET "value" =
  (COALESCE("value", '{}'::jsonb) - 'text' - 'values') ||
  CASE
    WHEN jsonb_typeof("value"->'values') = 'array'
      THEN jsonb_build_object('values', "value"->'values')
    WHEN NULLIF(BTRIM(COALESCE("value"->>'text', '')), '') IS NOT NULL
      THEN jsonb_build_object('values', jsonb_build_array(BTRIM("value"->>'text')))
    ELSE '{}'::jsonb
  END
WHERE "fieldKey" IN ('COMPULSORY_TEXT', 'MARKETING_COPY');

-- Preserve any already-configured Stage 6 sharing selections while moving
-- future sharing to the separate Tar field.
UPDATE "ProductionApprovalStep"
SET "sharedFieldKeys" = array_replace(
  "sharedFieldKeys",
  'TAR_NICOTINE'::"ProjectFileChecklistField",
  'TAR'::"ProjectFileChecklistField"
)
WHERE "sharedFieldKeys" @> ARRAY['TAR_NICOTINE'::"ProjectFileChecklistField"];

UPDATE "ProjectProductionHandover"
SET "sharedFieldKeys" = array_replace(
  "sharedFieldKeys",
  'TAR_NICOTINE'::"ProjectFileChecklistField",
  'TAR'::"ProjectFileChecklistField"
)
WHERE "sharedFieldKeys" @> ARRAY['TAR_NICOTINE'::"ProjectFileChecklistField"];

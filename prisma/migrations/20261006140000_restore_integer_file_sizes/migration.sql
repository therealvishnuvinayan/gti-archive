BEGIN;

-- The large-upload change was reverted in code after its database migration
-- changed these columns to DOUBLE PRECISION. Prisma still expects INTEGER.
-- Lock all affected tables so uploads cannot race the validation and conversion.
LOCK TABLE "ArchivedProjectFile", "FlexibleProjectAttachment", "ManualArchiveFile",
  "ManualLibraryAsset", "ProjectAttachment", "ProjectCompletionDocument"
  IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  size_table_name TEXT;
  invalid_sizes BOOLEAN;
BEGIN
  FOREACH size_table_name IN ARRAY ARRAY[
    'ArchivedProjectFile', 'FlexibleProjectAttachment', 'ManualArchiveFile',
    'ManualLibraryAsset', 'ProjectAttachment', 'ProjectCompletionDocument'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND information_schema.columns.table_name = size_table_name
        AND column_name = 'fileSize' AND data_type = 'double precision'
    ) THEN
      -- With an Int client and a float8 column, byte counts written through
      -- Prisma's binary protocol were stored as IEEE-754 subnormal numbers.
      -- Their raw bits retain the original integer. S3 metadata confirmed this
      -- recovery for every affected existing file before deploying this repair.
      EXECUTE format(
        'UPDATE %I SET "fileSize" = (''x'' || encode(float8send("fileSize"), ''hex''))::bit(64)::bigint
         WHERE "fileSize" > 0 AND "fileSize" < 1e-300::double precision
           AND (''x'' || encode(float8send("fileSize"), ''hex''))::bit(64)::bigint BETWEEN 1 AND 2147483647',
        size_table_name
      );
    END IF;

    -- Refuse to round fractional sizes or truncate real oversized files.
    -- Any failure rolls back the recovery and all column changes together.
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE "fileSize" < 0
         OR "fileSize" > 2147483647 OR "fileSize" <> trunc("fileSize"::numeric))',
      size_table_name
    ) INTO invalid_sizes;
    IF invalid_sizes THEN
      RAISE EXCEPTION 'Cannot restore integer file sizes: % has non-integer or out-of-range values', size_table_name;
    END IF;
  END LOOP;

  FOREACH size_table_name IN ARRAY ARRAY[
    'ArchivedProjectFile', 'FlexibleProjectAttachment', 'ManualArchiveFile',
    'ManualLibraryAsset', 'ProjectAttachment', 'ProjectCompletionDocument'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "fileSize" TYPE INTEGER USING "fileSize"::integer', size_table_name);
  END LOOP;
END $$;

COMMIT;

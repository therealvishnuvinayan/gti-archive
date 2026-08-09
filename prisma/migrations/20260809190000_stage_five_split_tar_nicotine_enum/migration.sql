-- Add the separate Stage 5 fields first so the following data migration can
-- safely use them after PostgreSQL commits these enum additions.
ALTER TYPE "ProjectFileChecklistField" ADD VALUE 'TAR' BEFORE 'TAR_NICOTINE';
ALTER TYPE "ProjectFileChecklistField" ADD VALUE 'NICOTINE' BEFORE 'TAR_NICOTINE';

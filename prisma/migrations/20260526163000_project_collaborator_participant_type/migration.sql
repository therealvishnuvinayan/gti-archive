DO $$
BEGIN
  CREATE TYPE "ProjectCollaboratorParticipantType" AS ENUM (
    'GTI_INTERNAL_CLIENT',
    'GTI_SISTER_COMPANY_INTERNAL_CLIENT',
    'EXTERNAL_FREELANCER',
    'EXTERNAL_AGENCY',
    'EXTERNAL_VENDOR',
    'CLIENT_OF_GTI'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ProjectCollaborator"
ADD COLUMN IF NOT EXISTS "participantType" "ProjectCollaboratorParticipantType";

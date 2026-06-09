ALTER TABLE "CalendarCollaborator"
ADD COLUMN IF NOT EXISTS "access" "CollaboratorAccess" NOT NULL DEFAULT 'LIMITED';

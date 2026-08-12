-- Stage 6 handover is optional. These fields capture the additional recipient
-- details required only when an approved production package is sent externally.
ALTER TABLE "ProjectProductionHandover"
ADD COLUMN "recipientCompany" TEXT,
ADD COLUMN "recipientPhone" TEXT;

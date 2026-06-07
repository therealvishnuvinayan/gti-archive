-- Add stage-level invoice settings and invoice attachment asset type.
ALTER TYPE "AttachmentAssetType" ADD VALUE IF NOT EXISTS 'STAGE_INVOICE';

ALTER TABLE "ProjectStage"
ADD COLUMN "invoiceRequired" BOOLEAN NOT NULL DEFAULT true;

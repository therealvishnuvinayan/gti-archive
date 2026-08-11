DROP INDEX IF EXISTS "ProjectInquiryParty_inquiryId_role_key";

ALTER TABLE "ProjectInquiryParty"
ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "ProjectInquiryParty_single_client_key"
ON "ProjectInquiryParty"("inquiryId")
WHERE "role" = 'CLIENT'::"ProjectInquiryPartyRole";

CREATE INDEX "ProjectInquiryParty_inquiryId_role_sequence_idx"
ON "ProjectInquiryParty"("inquiryId", "role", "sequence");

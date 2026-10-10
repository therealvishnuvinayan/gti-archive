ALTER TABLE "ContactDirectoryEntry"
ADD COLUMN "directoryRoles" "ProjectInquiryPartyRole"[] NOT NULL
  DEFAULT ARRAY['CLIENT', 'FINAL_BENEFICIARY']::"ProjectInquiryPartyRole"[],
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Classify existing entries using their actual project usage. Unused entries
-- remain shared, as the old directory did not store their purpose.
UPDATE "ContactDirectoryEntry" AS contact
SET "directoryRoles" = usage.roles
FROM (
  SELECT "contactId", array_agg(DISTINCT role) AS roles
  FROM "ProjectInquiryParty"
  WHERE "contactId" IS NOT NULL
  GROUP BY "contactId"
) AS usage
WHERE contact.id = usage."contactId";

CREATE INDEX "ContactDirectoryEntry_deletedAt_idx" ON "ContactDirectoryEntry"("deletedAt");

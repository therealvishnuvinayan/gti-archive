ALTER TABLE "Project"
ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "Project"
ALTER COLUMN "currency" TYPE TEXT
USING "currency"::text;

ALTER TABLE "Project"
ALTER COLUMN "currency" SET DEFAULT 'USD';

CREATE TABLE "ProjectCurrency" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectCurrency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectCurrency_code_key" ON "ProjectCurrency"("code");
CREATE UNIQUE INDEX "ProjectCurrency_name_key" ON "ProjectCurrency"("name");

INSERT INTO "ProjectCurrency" ("id", "name", "code", "isActive", "createdAt", "updatedAt")
VALUES
  ('currency_aed', 'UAE Dirham', 'AED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('currency_usd', 'US Dollar', 'USD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('currency_eur', 'Euro', 'EUR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('currency_inr', 'Indian Rupee', 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('currency_gbp', 'British Pound', 'GBP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

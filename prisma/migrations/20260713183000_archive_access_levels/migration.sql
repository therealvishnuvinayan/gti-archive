-- Replace the binary per-user archive grant with explicit access levels and
-- optional per-asset grants for partial archive access.
CREATE TYPE "ArchiveAccessLevel" AS ENUM ('NONE', 'FULL', 'PARTIAL');

ALTER TABLE "UserArchiveAccess"
  ADD COLUMN "level" "ArchiveAccessLevel" NOT NULL DEFAULT 'FULL';

CREATE TABLE "UserArchiveAssetAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "archivedProjectFileId" TEXT,
  "manualArchiveFileId" TEXT,
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserArchiveAssetAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserArchiveAssetAccess_single_asset_check"
    CHECK (
      (CASE WHEN "archivedProjectFileId" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "manualArchiveFileId" IS NULL THEN 0 ELSE 1 END) = 1
    )
);

CREATE UNIQUE INDEX "UserArchiveAssetAccess_userId_archivedProjectFileId_key"
  ON "UserArchiveAssetAccess"("userId", "archivedProjectFileId");

CREATE UNIQUE INDEX "UserArchiveAssetAccess_userId_manualArchiveFileId_key"
  ON "UserArchiveAssetAccess"("userId", "manualArchiveFileId");

CREATE INDEX "UserArchiveAssetAccess_userId_idx"
  ON "UserArchiveAssetAccess"("userId");

CREATE INDEX "UserArchiveAssetAccess_archivedProjectFileId_idx"
  ON "UserArchiveAssetAccess"("archivedProjectFileId");

CREATE INDEX "UserArchiveAssetAccess_manualArchiveFileId_idx"
  ON "UserArchiveAssetAccess"("manualArchiveFileId");

CREATE INDEX "UserArchiveAssetAccess_grantedById_idx"
  ON "UserArchiveAssetAccess"("grantedById");

ALTER TABLE "UserArchiveAssetAccess"
  ADD CONSTRAINT "UserArchiveAssetAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserArchiveAssetAccess"
  ADD CONSTRAINT "UserArchiveAssetAccess_archivedProjectFileId_fkey"
  FOREIGN KEY ("archivedProjectFileId") REFERENCES "ArchivedProjectFile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserArchiveAssetAccess"
  ADD CONSTRAINT "UserArchiveAssetAccess_manualArchiveFileId_fkey"
  FOREIGN KEY ("manualArchiveFileId") REFERENCES "ManualArchiveFile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserArchiveAssetAccess"
  ADD CONSTRAINT "UserArchiveAssetAccess_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

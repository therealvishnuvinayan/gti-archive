CREATE TABLE "ManualLibraryAssetFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "manualLibraryAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualLibraryAssetFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualLibraryAssetFavorite_userId_manualLibraryAssetId_key" ON "ManualLibraryAssetFavorite"("userId", "manualLibraryAssetId");
CREATE INDEX "ManualLibraryAssetFavorite_userId_idx" ON "ManualLibraryAssetFavorite"("userId");
CREATE INDEX "ManualLibraryAssetFavorite_manualLibraryAssetId_idx" ON "ManualLibraryAssetFavorite"("manualLibraryAssetId");
CREATE INDEX "ManualLibraryAssetFavorite_userId_createdAt_idx" ON "ManualLibraryAssetFavorite"("userId", "createdAt");

ALTER TABLE "ManualLibraryAssetFavorite" ADD CONSTRAINT "ManualLibraryAssetFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualLibraryAssetFavorite" ADD CONSTRAINT "ManualLibraryAssetFavorite_manualLibraryAssetId_fkey" FOREIGN KEY ("manualLibraryAssetId") REFERENCES "ManualLibraryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

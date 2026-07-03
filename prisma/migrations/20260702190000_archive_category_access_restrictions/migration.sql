CREATE TABLE "ArchiveCategoryAccess" (
    "archiveCategoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ArchiveCategoryAccess_pkey" PRIMARY KEY ("archiveCategoryId","userId")
);

CREATE INDEX "ArchiveCategoryAccess_userId_idx" ON "ArchiveCategoryAccess"("userId");
CREATE INDEX "ArchiveCategoryAccess_archiveCategoryId_idx" ON "ArchiveCategoryAccess"("archiveCategoryId");
CREATE INDEX "ArchiveCategoryAccess_createdById_idx" ON "ArchiveCategoryAccess"("createdById");

ALTER TABLE "ArchiveCategoryAccess" ADD CONSTRAINT "ArchiveCategoryAccess_archiveCategoryId_fkey" FOREIGN KEY ("archiveCategoryId") REFERENCES "ArchiveCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchiveCategoryAccess" ADD CONSTRAINT "ArchiveCategoryAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArchiveCategoryAccess" ADD CONSTRAINT "ArchiveCategoryAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

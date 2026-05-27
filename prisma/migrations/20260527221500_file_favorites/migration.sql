CREATE TABLE "FileFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileFavorite_userId_attachmentId_key" ON "FileFavorite"("userId", "attachmentId");
CREATE INDEX "FileFavorite_userId_idx" ON "FileFavorite"("userId");
CREATE INDEX "FileFavorite_attachmentId_idx" ON "FileFavorite"("attachmentId");
CREATE INDEX "FileFavorite_userId_createdAt_idx" ON "FileFavorite"("userId", "createdAt");

ALTER TABLE "FileFavorite"
ADD CONSTRAINT "FileFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileFavorite"
ADD CONSTRAINT "FileFavorite_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

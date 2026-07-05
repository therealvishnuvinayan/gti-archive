-- Per-user Archive module access grants.
CREATE TABLE "UserArchiveAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserArchiveAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserArchiveAccess_userId_key" ON "UserArchiveAccess"("userId");
CREATE INDEX "UserArchiveAccess_grantedById_idx" ON "UserArchiveAccess"("grantedById");

ALTER TABLE "UserArchiveAccess"
  ADD CONSTRAINT "UserArchiveAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserArchiveAccess"
  ADD CONSTRAINT "UserArchiveAccess_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

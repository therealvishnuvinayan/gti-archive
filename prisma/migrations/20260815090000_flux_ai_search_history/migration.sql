-- CreateTable
CREATE TABLE "FluxAiSearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" VARCHAR(240) NOT NULL,
    "normalizedQuery" VARCHAR(240) NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FluxAiSearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FluxAiSearchHistory_userId_normalizedQuery_key"
ON "FluxAiSearchHistory"("userId", "normalizedQuery");

-- CreateIndex
CREATE INDEX "FluxAiSearchHistory_userId_searchedAt_idx"
ON "FluxAiSearchHistory"("userId", "searchedAt");

-- AddForeignKey
ALTER TABLE "FluxAiSearchHistory"
ADD CONSTRAINT "FluxAiSearchHistory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

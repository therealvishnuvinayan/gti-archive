CREATE TYPE "FluxAiConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "FluxAiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM_EVENT');

CREATE TABLE "FluxAiConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "FluxAiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FluxAiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FluxAiMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "FluxAiMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "responseType" TEXT,
  "structuredPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FluxAiMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FluxAiConversation"
ADD CONSTRAINT "FluxAiConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FluxAiMessage"
ADD CONSTRAINT "FluxAiMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "FluxAiConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FluxAiConversation_userId_status_lastMessageAt_idx"
ON "FluxAiConversation"("userId", "status", "lastMessageAt");

CREATE INDEX "FluxAiConversation_userId_createdAt_idx"
ON "FluxAiConversation"("userId", "createdAt");

CREATE INDEX "FluxAiMessage_conversationId_createdAt_idx"
ON "FluxAiMessage"("conversationId", "createdAt");

CREATE INDEX "FluxAiMessage_conversationId_role_createdAt_idx"
ON "FluxAiMessage"("conversationId", "role", "createdAt");

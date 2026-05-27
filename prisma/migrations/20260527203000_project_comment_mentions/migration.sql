ALTER TYPE "NotificationType" ADD VALUE 'MENTION';

CREATE TABLE "ProjectCommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCommentMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectCommentMention_commentId_mentionedUserId_key"
ON "ProjectCommentMention"("commentId", "mentionedUserId");

CREATE INDEX "ProjectCommentMention_mentionedUserId_createdAt_idx"
ON "ProjectCommentMention"("mentionedUserId", "createdAt");

CREATE INDEX "ProjectCommentMention_commentId_createdAt_idx"
ON "ProjectCommentMention"("commentId", "createdAt");

ALTER TABLE "ProjectCommentMention"
ADD CONSTRAINT "ProjectCommentMention_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "ProjectComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCommentMention"
ADD CONSTRAINT "ProjectCommentMention_mentionedUserId_fkey"
FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

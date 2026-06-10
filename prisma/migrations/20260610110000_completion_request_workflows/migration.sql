ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_REQUESTED';

ALTER TABLE "ProjectCompletionWorkflow"
ADD COLUMN "invoiceContactUserId" TEXT,
ADD COLUMN "invoiceNote" TEXT,
ADD COLUMN "invoiceRequestedAt" TIMESTAMP(3);

CREATE INDEX "ProjectCompletionWorkflow_invoiceContactUserId_idx" ON "ProjectCompletionWorkflow"("invoiceContactUserId");

ALTER TABLE "ProjectCompletionWorkflow"
ADD CONSTRAINT "ProjectCompletionWorkflow_invoiceContactUserId_fkey"
FOREIGN KEY ("invoiceContactUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

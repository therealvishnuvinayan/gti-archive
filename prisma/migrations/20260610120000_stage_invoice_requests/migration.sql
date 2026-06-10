DO $$
BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_REQUESTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "StageInvoiceRequest" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedFromId" TEXT NOT NULL,
  "note" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StageInvoiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StageInvoiceRequest_stageId_key" ON "StageInvoiceRequest"("stageId");
CREATE INDEX "StageInvoiceRequest_projectId_createdAt_idx" ON "StageInvoiceRequest"("projectId", "createdAt");
CREATE INDEX "StageInvoiceRequest_requestedById_idx" ON "StageInvoiceRequest"("requestedById");
CREATE INDEX "StageInvoiceRequest_requestedFromId_idx" ON "StageInvoiceRequest"("requestedFromId");
CREATE INDEX "StageInvoiceRequest_fulfilledAt_idx" ON "StageInvoiceRequest"("fulfilledAt");

ALTER TABLE "StageInvoiceRequest"
ADD CONSTRAINT "StageInvoiceRequest_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageInvoiceRequest"
ADD CONSTRAINT "StageInvoiceRequest_stageId_fkey"
FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StageInvoiceRequest"
ADD CONSTRAINT "StageInvoiceRequest_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StageInvoiceRequest"
ADD CONSTRAINT "StageInvoiceRequest_requestedFromId_fkey"
FOREIGN KEY ("requestedFromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

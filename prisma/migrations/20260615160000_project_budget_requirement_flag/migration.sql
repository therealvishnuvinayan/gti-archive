-- Add an explicit project-level budget requirement flag and allow projects
-- to represent "no budget amount" directly.
ALTER TABLE "Project" ADD COLUMN "budgetRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ALTER COLUMN "budget" DROP NOT NULL;

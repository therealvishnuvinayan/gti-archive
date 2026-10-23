import type { Prisma } from "@prisma/client";
// Explicit Phase 2.1 columns keep existing native adapters operational before
// the separately approved Phase 3.1 migration adds task source/origin columns.
export const nativeReferenceSelect = { id: true, versionId: true, role: true, version: true } as const satisfies Prisma.SharedFileReferenceSelect;
export const nativeFileSelect = { id: true, projectId: true, flexibleProjectId: true, stageId: true, conceptFolderId: true,
  milestoneId: true, completionWorkflowId: true, completionDocumentType: true, createdAt: true } as const satisfies Prisma.SharedFileSelect;

export const taskFileSelect = { ...nativeFileSelect, taskId: true } as const satisfies Prisma.SharedFileSelect;

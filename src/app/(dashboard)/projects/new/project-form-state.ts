import type { ProjectCollaboratorParticipantType } from "@/lib/project-collaborator-participant-types";
import type { ProjectExecutorRole } from "@prisma/client";

export type ProjectFormFieldErrors = {
  name?: string;
  category?: string;
  executorName?: string;
  executorUserId?: string;
  priority?: string;
  tag?: string;
  description?: string;
  budget?: string;
  budgetSummary?: string;
  currency?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  stageNames?: Array<string | undefined>;
  stageBudgets?: Array<string | undefined>;
  stageDescriptions?: Array<string | undefined>;
  stageStartDates?: Array<string | undefined>;
  stageDueDates?: Array<string | undefined>;
};

export type ProjectFormState = {
  error?: string;
  projectId?: string;
  initialBriefStageId?: string;
  initialBriefCommentId?: string;
  createdStageIds?: string[];
  fieldErrors?: ProjectFormFieldErrors;
};

export const initialProjectFormState: ProjectFormState = {};

export type ProjectEditorInitialStage = {
  id: string;
  name: string;
  budget: string;
  description: string;
  plannedStartAt: string;
  plannedDueAt: string;
  attachments: ProjectEditorInitialAttachment[];
};

export type ProjectEditorInitialAttachment = {
  id: string;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  previewPath: string;
  downloadPath: string;
  isFavoritedByCurrentUser: boolean;
};

export type ProjectEditorInitialCollaborator = {
  id: string;
  name: string;
  email?: string;
  role: string;
  group: "internal" | "external";
  participantType: ProjectCollaboratorParticipantType | null;
  access: "owner" | "view";
  removable?: boolean;
};

export type ProjectEditorInitialExecutor = {
  id: string;
  name: string;
  email?: string;
  role: ProjectExecutorRole;
  roleLabel: string;
  group: "internal" | "external";
};

export type ProjectEditorInitialValues = {
  id: string;
  name: string;
  category: string;
  executorName: string;
  executorUserId?: string | null;
  executors: ProjectEditorInitialExecutor[];
  tag: string;
  description: string;
  budget: string;
  currency: string | null;
  canViewBudget: boolean;
  status: "ONGOING" | "ON_HOLD" | "PENDING" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startDate: string;
  endDate: string;
  stages: ProjectEditorInitialStage[];
  collaborators: ProjectEditorInitialCollaborator[];
  attachments: ProjectEditorInitialAttachment[];
};

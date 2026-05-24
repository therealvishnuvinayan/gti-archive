export type ProjectFormFieldErrors = {
  name?: string;
  category?: string;
  tag?: string;
  description?: string;
  budget?: string;
  currency?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  stageNames?: Array<string | undefined>;
  stageBudgets?: Array<string | undefined>;
  stageDescriptions?: Array<string | undefined>;
};

export type ProjectFormState = {
  error?: string;
  projectId?: string;
  fieldErrors?: ProjectFormFieldErrors;
};

export const initialProjectFormState: ProjectFormState = {};

export type ProjectEditorInitialStage = {
  id: string;
  name: string;
  budget: string;
  description: string;
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
};

export type ProjectEditorInitialValues = {
  id: string;
  name: string;
  category: string;
  tag: string;
  description: string;
  budget: string;
  currency: "USD" | "AED" | "EUR" | "GBP" | "INR";
  status: "ONGOING" | "ON_HOLD" | "PENDING" | "COMPLETED";
  startDate: string;
  endDate: string;
  stages: ProjectEditorInitialStage[];
  attachments: ProjectEditorInitialAttachment[];
};

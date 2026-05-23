export type ProjectFormState = {
  error?: string;
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

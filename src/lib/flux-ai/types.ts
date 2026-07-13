import type { ProjectCollaboratorParticipantType } from "@/lib/project-collaborator-participant-types";

export const fluxAIIntentValues = [
  "project_search",
  "project_count_summary",
  "project_status_summary",
  "archive_blockers",
  "archive_search",
  "overdue_stages",
  "ready_for_archive",
  "draft_project_create",
  "unknown",
] as const;

export type FluxAIIntent = (typeof fluxAIIntentValues)[number];

export type FluxAIResponseType =
  | "message"
  | "project_results"
  | "archive_results"
  | "draft_project"
  | "status_summary"
  | "missing_fields"
  | "created_project"
  | "error";

export type FluxAIProjectStageResult = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
};

export type FluxAIProjectResult = {
  id: string;
  slug: string;
  name: string;
  href: string;
  category: string;
  status: string;
  statusGroup: string | null;
  currentStage: string;
  owner: string;
  executor: string;
  deadline: string;
  budgetLabel?: string | null;
  overdueStages?: FluxAIProjectStageResult[];
  archiveBlockers?: string[];
  blockersSummary?: string | null;
  readyForArchive?: boolean;
};

export type FluxAIArchiveAssetResult = {
  id: string;
  recordType: "FINAL_ARCHIVE_FILE" | "MANUAL_ARCHIVE_FILE";
  title: string;
  fileName: string;
  originalFileName: string;
  artworkId: string | null;
  archiveCategory: string;
  brandSubBrand: string | null;
  fileType: string;
  mimeType: string;
  fileSize: string;
  linkedProject: string | null;
  archivedAt: string;
  status: string;
  viewHref: string;
  downloadHref?: string | null;
};

export type FluxAIStatusSummary = {
  total: number;
  active: number;
  pending: number;
  onHold: number;
  completed: number;
  archived: number;
  cancelled: number;
};

export type FluxAIDraftProject = {
  projectName: string;
  executionType: "INTERNAL" | "EXTERNAL" | null;
  category: string;
  tags: string[];
  budgetRequired: boolean | null;
  budget: number | null;
  currency: string | null;
  projectBrief: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  statusId?: string | null;
  statusName?: string | null;
  startDate: string | null;
  endDate: string | null;
  mainExecutor: string | null;
  mainExecutorMatch?: FluxAIPersonMatch | null;
  collaborators: string[];
  collaboratorMatches?: FluxAIPersonMatch[];
  stages: FluxAIStageDraft[];
  clientName: string | null;
  budgetCategory: string | null;
  missingFields?: string[];
  warnings?: string[];
  canCreate?: boolean;
};

export type FluxAIStageDraft = {
  name: string;
  brief: string;
  budget: number | null;
  startDate: string | null;
  dueDate: string | null;
  invoiceRequired: boolean | null;
};

export type FluxAICollaboratorPermissions = {
  canInteract: boolean;
  canAddCaptions: boolean;
  canDownloadFiles: boolean;
  canViewBudget: boolean;
  canViewVendorInfo: boolean;
  canAccessProjectArchives: boolean;
};

export type FluxAIPersonCandidate = {
  id: string;
  name: string;
  email: string;
  type: ProjectCollaboratorParticipantType;
  typeLabel: string;
  typeGroup: "internal" | "external";
};

export type FluxAIPersonMatch = {
  requestedName: string;
  status: "matched" | "multiple" | "not_found" | "missing";
  selectedUserId: string | null;
  selectedName: string | null;
  selectedEmail: string | null;
  candidates: FluxAIPersonCandidate[];
  permissions?: FluxAICollaboratorPermissions | null;
};

export type FluxAIProjectStatusSummary = {
  projectId: string;
  projectName: string;
  href: string;
  currentStage: string;
  stageStatus: string;
  pendingReviewCount: number;
  pendingReviewLabel: string;
  approvalStatus: string;
  copyrightStatus: string;
  invoiceStatus: string;
  archiveReadiness: "ready" | "blocked" | "completed" | "restricted" | "not_ready";
  blockers: string[];
  nextRecommendedAction: string;
};

export type FluxAIChatResponse = {
  type: FluxAIResponseType;
  intent?: FluxAIIntent;
  assistantMessage: string;
  conversationId?: string;
  conversationTitle?: string;
  savedMessages?: FluxAIConversationMessage[];
  createdProjectId?: string;
  createdProjectHref?: string;
  projects?: FluxAIProjectResult[];
  archiveAssets?: FluxAIArchiveAssetResult[];
  draftProject?: FluxAIDraftProject | null;
  statusSummary?: FluxAIStatusSummary;
  projectStatus?: FluxAIProjectStatusSummary | null;
  blockers?: string[];
  missingFields?: string[];
  warnings?: string[];
  suggestions?: string[];
};

export type FluxAIConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FluxAIConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  responseType: string | null;
  structuredPayload: FluxAIChatResponse | null;
  createdAt: string;
};

export type FluxAIConversationDetail = {
  conversation: FluxAIConversationSummary;
  messages: FluxAIConversationMessage[];
  latestResponse: FluxAIChatResponse | null;
};

export type FluxAIConversationsListResponse = {
  conversations: FluxAIConversationSummary[];
  latestConversationId: string | null;
};

export type FluxAIIntentDetection = {
  intent: FluxAIIntent;
  confidence: number;
  query: string | null;
  projectName: string | null;
  executorName: string | null;
  ownerName: string | null;
  collaboratorName: string | null;
  status: string | null;
  category: string | null;
  tag: string | null;
  stageStatus: string | null;
  completionBlocker: string | null;
  deadlineState: string | null;
  limit: number | null;
  draftProject: FluxAIDraftProject | null;
  assistantMessage: string;
};

// Browser-safe contracts. Adapters keep storage paths and workflow state on the server.
export type TaskProjectType = "STRUCTURED" | "FLEXIBLE";
export type TaskKind = "FIELD_INPUT" | "FILE_REQUEST" | "GENERAL";
export type TaskStatus = "ASSIGNED" | "IN_PROGRESS" | "IN_REVIEW" | "CORRECTIONS_REQUESTED" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type TaskValue = null | string | number | boolean | TaskValue[] | { [key: string]: TaskValue };
export type TaskOption = { id: string; label: string };
export type TaskField = {
  id: string;
  label: string;
  stageRef: string;
  control: "text" | "textarea" | "date" | "number" | "select" | "multi-select" | "list" | "boolean" | "files" | "checklist";
  options?: TaskOption[];
  checklistControl?: string;
  acceptsFiles?: boolean;
  maxFiles?: number;
  required?: boolean;
  help?: string;
};
export type TaskProjectRef = { projectType: TaskProjectType; projectId: string };
export type TaskSource = { type: "TASK" | "CONCEPT"; id: string };
export type TaskCreateOptions = TaskProjectRef & {
  name: string;
  people: TaskOption[];
  stages: TaskOption[];
  fields: TaskField[];
  destinations: TaskOption[];
  showStages: boolean;
};
export type TaskCreateInput = TaskProjectRef & {
  dependencyOf?: { source: TaskSource; requestPause: boolean; reason: string };
  sisterOf?: TaskSource;
  kind: TaskKind;
  title: string;
  brief: string;
  assigneeId: string;
  coOwnerId?: string | null;
  participantIds?: string[];
  stageRef?: string | null;
  targetId?: string | null;
  destinationId?: string | null;
  dueAt?: string | null;
  reminderIntervalHours?: number | null;
};
export type TaskListItem = {
  dependencyState?: { paused: boolean; pendingPauses: number };
  family?: { id: string; sisterNumber: number };
  id: string;
  title: string;
  kind: TaskKind | "CONCEPT";
  status: TaskStatus;
  project: TaskProjectRef & { name: string };
  stageLabel?: string;
  owner: TaskOption;
  assignee: TaskOption;
  coOwner: TaskOption | null;
  dueAt: string | null;
  updatedAt: string;
  href: string;
  viewOnly: boolean;
  unavailableParticipants?: string[];
};
export type TaskFileRecord = { id: string; name: string; mimeType: string; size: number; status: string; submissionId: string | null };
export type TaskDetail = TaskListItem & {
  reminder: { intervalHours: number | null; nextAt: string | null; lastAt: string | null };
  projectBrief?: string;
  deliverables?: string[];
  referenceFolders?: Array<TaskOption & { href: string }>;
  version: number;
  brief: string;
  field: TaskField | null;
  currentValue: TaskValue;
  conflictToken: string | null;
  hasConflict: boolean;
  destination: string | null;
  canManage: boolean;
  canReview: boolean;
  canSubmit: boolean;
  canDelete: boolean;
  canCancel: boolean;
  canRecover: boolean;
  people: TaskOption[];
  participantIds: string[];
  submissions: { id: string; note: string; value: TaskValue; createdAt: string; submittedBy: TaskOption; files: TaskFileRecord[] }[];
  pendingFiles: TaskFileRecord[];
  history: { id: string; action: string; note: string; createdAt: string; actor: TaskOption }[];
};
export type TaskMutation = {
  action: "START" | "DECLINE" | "SUBMIT" | "ACCEPT" | "REJECT" | "CORRECTIONS" | "CANCEL" | "REASSIGN" | "MANAGE" | "COMMENT" | "DELETE" | "RECOVER";
  version: number;
  note?: string;
  value?: TaskValue;
  fileIds?: string[];
  assigneeId?: string;
  ownerId?: string;
  coOwnerId?: string | null;
  participantIds?: string[];
  dueAt?: string | null;
  reminderIntervalHours?: number | null;
  conflictToken?: string;
};
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ASSIGNED: "Assigned", IN_PROGRESS: "In progress", IN_REVIEW: "Awaiting review",
  CORRECTIONS_REQUESTED: "Corrections requested", COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export const TASK_KIND_LABELS = { FIELD_INPUT: "Field input", FILE_REQUEST: "File request", GENERAL: "General task", CONCEPT: "Concept task" };

export type TaskFamilyFile = {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  source: TaskSource;
  taskTitle: string;
  revisionLabel: string;
  submittedAt: string;
  canSelect: boolean;
};
export type TaskFamilyDetail = {
  source: TaskSource;
  project: TaskProjectRef & { name: string };
  version: number;
  original: TaskListItem | null;
  children: TaskListItem[];
  files: TaskFamilyFile[];
  finalFile: TaskFamilyFile | null;
  canSelectFinal: boolean;
  canDecideCycle: boolean;
  cycleDecision: "PENDING" | "REQUIRED" | "NOT_REQUIRED" | null;
  importDestinations: TaskOption[];
  imports: { id: string; fileName: string; sourceLabel: string; destinationLabel: string; importedBy: string; createdAt: string; href: string | null }[];
  history: { id: string; action: string; note: string; actor: TaskOption; createdAt: string; fileName: string | null }[];
};
export type TaskFamilyMutation = {
  action: "SELECT_FINAL" | "DECIDE_CYCLE" | "IMPORT_FINAL";
  version: number;
  fileKey?: string;
  destinationId?: string;
  decision?: "REQUIRED" | "NOT_REQUIRED";
  note?: string;
};

export type TaskDependencyLink = {
  id: string;
  version: number;
  direction: "REQUIRES" | "REQUIRED_BY";
  relatedTask: { title: string; href: string } | null;
  pauseStatus: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
  reason: string;
  reviewNote: string | null;
  outcome: string | null;
  canRequestPause: boolean;
  canReviewPause: boolean;
  history: { id: string; action: string; note: string; actor: string; createdAt: string }[];
};
export type TaskDependencyDetail = {
  source: TaskSource;
  project: TaskProjectRef;
  title: string;
  href: string;
  paused: boolean;
  pendingPauses: number;
  canCreate: boolean;
  links: TaskDependencyLink[];
  availableTasks: { source: TaskSource; title: string }[];
};
export type TaskDependencyMutation =
  | { action: "LINK"; required: TaskSource; requestPause: boolean; reason: string }
  | { action: "REQUEST_PAUSE" | "APPROVE_PAUSE" | "REJECT_PAUSE"; dependencyId: string; version: number; note: string };

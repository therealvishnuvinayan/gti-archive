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
};
export type TaskListItem = {
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
};
export type TaskFileRecord = { id: string; name: string; size: number; status: string; submissionId: string | null };
export type TaskDetail = TaskListItem & {
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
  people: TaskOption[];
  participantIds: string[];
  submissions: { id: string; note: string; value: TaskValue; createdAt: string; submittedBy: TaskOption; files: TaskFileRecord[] }[];
  pendingFiles: TaskFileRecord[];
  history: { id: string; action: string; note: string; createdAt: string; actor: TaskOption }[];
};
export type TaskMutation = {
  action: "START" | "DECLINE" | "SUBMIT" | "ACCEPT" | "REJECT" | "CORRECTIONS" | "CANCEL" | "REASSIGN" | "MANAGE" | "COMMENT" | "DELETE";
  version: number;
  note?: string;
  value?: TaskValue;
  fileIds?: string[];
  assigneeId?: string;
  coOwnerId?: string | null;
  participantIds?: string[];
  dueAt?: string | null;
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
  history: { id: string; action: string; note: string; actor: TaskOption; createdAt: string; fileName: string | null }[];
};
export type TaskFamilyMutation = {
  action: "SELECT_FINAL" | "DECIDE_CYCLE";
  version: number;
  fileKey?: string;
  decision?: "REQUIRED" | "NOT_REQUIRED";
  note?: string;
};

"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, Download, Loader2, Paperclip, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import {
  saveProjectCategoryAction,
  saveProjectTagAction,
} from "@/app/(dashboard)/settings/project-master-data/actions";
import {
  createProjectAction,
  updateProjectAction,
} from "@/app/(dashboard)/projects/new/actions";
import {
  initialProjectFormState,
  type ProjectEditorInitialAttachment,
  type ProjectEditorInitialCollaborator,
  type ProjectEditorInitialValues,
  type ProjectFormFieldErrors,
  type ProjectFormState,
} from "@/app/(dashboard)/projects/new/project-form-state";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { DateTimePicker } from "@/components/calendar/date-time-picker";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { CollaboratorPickerDialog } from "@/components/collaboration/collaborator-picker-dialog";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { AttachmentFavoriteButton } from "@/components/projects/attachment-favorite-button";
import {
  getDefaultProjectCollaboratorParticipantType,
  getProjectCollaboratorTypeMeta,
  projectCollaboratorParticipantTypes,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { CollaboratorRecord } from "@/lib/collaboration";
import {
  DEFAULT_PROJECT_PRIORITY,
  formatProjectPriority,
  isProjectPriority,
  projectPriorityOptions,
  type ProjectPriorityValue,
} from "@/lib/project-priority";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from "@/lib/toast";

const projectStatusOptions = [
  { value: "ONGOING", label: "Ongoing" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
] as const;

type ProjectStatusValue = (typeof projectStatusOptions)[number]["value"];

type StageForm = {
  id: string;
  persistedId?: string;
  name: string;
  budget: string;
  description: string;
  plannedStartAt: string;
  plannedDueAt: string;
};

type MonthPickerProps = {
  label: string;
  value: Date | null;
  onSelect: (date: Date) => void;
  month: Date;
  onMonthChange: (date: Date) => void;
};

type CreateProjectWorkspaceProps = {
  availableCollaborators: CollaboratorRecord[];
  categoryOptions?: string[];
  tagOptions?: string[];
  currencyOptions?: Array<{
    code: string;
    name: string;
  }>;
  canManageProjectMasterData?: boolean;
  canInviteExecutor?: boolean;
  mode?: "create" | "edit";
  initialValues?: ProjectEditorInitialValues;
  action?: (
    previousState: ProjectFormState,
    formData: FormData,
  ) => Promise<ProjectFormState>;
};

type ExecutorOption = {
  id: string;
  name: string;
  email: string;
  type: CollaboratorRecord["type"];
};

type UploadAssetResponse = {
  attachmentId?: string;
  uploadUrl?: string;
  error?: string;
};

type QuickAddMasterDataKind = "category" | "tag";

function getLocalFileTypeLabel(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : "FILE";
}

function formatLocalFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeInputValue(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeBudgetInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function parseBudgetInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!normalized || !/^\d+$/.test(normalized)) {
    return NaN;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatBudgetDisplay(value: number, currencyCode: string) {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

  return `${formatted} ${currencyCode}`.trim();
}

function formatBudgetDifference(value: number, currencyCode: string) {
  if (value < 0) {
    return `${formatBudgetDisplay(Math.abs(value), currencyCode)} over budget`;
  }

  if (value > 0) {
    return `${formatBudgetDisplay(value, currencyCode)} unallocated`;
  }

  return formatBudgetDisplay(0, currencyCode);
}

function getStartOfDay(date: Date) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
}

function getEndOfDay(date: Date) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(23, 59, 59, 999);
  return normalizedDate;
}

function parseStageDateTimeValue(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDefaultProjectCurrencyCode(
  currencyOptions: Array<{
    code: string;
    name: string;
  }>,
) {
  return (
    currencyOptions.find((currency) => currency.code === "USD")?.code ??
    currencyOptions[0]?.code ??
    ""
  );
}

function getDefaultExecutorInviteForm(): CollaboratorForm {
  return {
    name: "",
    email: "",
    type: "Internal",
    permissions: {
      project: "full",
      calendar: "none",
      library: "none",
      archive: "none",
    },
  };
}

function buildAssignedCollaboratorRecord(
  collaborator: CollaboratorRecord,
): ProjectEditorInitialCollaborator {
  return {
    id: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    role:
      collaborator.type === "External"
        ? "External Collaborator"
        : "Collaborator",
    group: collaborator.type === "External" ? "external" : "internal",
    participantType: getDefaultProjectCollaboratorParticipantType(
      collaborator.type === "External" ? "external" : "internal",
    ),
    access: "view",
    removable: true,
  };
}

function upsertCollaboratorRecord(
  collaborators: CollaboratorRecord[],
  collaborator: CollaboratorRecord,
) {
  const existingIndex = collaborators.findIndex((item) => item.id === collaborator.id);

  if (existingIndex === -1) {
    return [...collaborators, collaborator];
  }

  return collaborators.map((item, index) =>
    index === existingIndex ? collaborator : item,
  );
}

function upsertAssignedCollaboratorRecord(
  collaborators: ProjectEditorInitialCollaborator[],
  collaborator: CollaboratorRecord,
) {
  if (collaborators.some((item) => item.id === collaborator.id)) {
    return collaborators;
  }

  return [...collaborators, buildAssignedCollaboratorRecord(collaborator)];
}

function mergeUniqueTextOptions(current: string[], incoming: string[]) {
  const merged = [...current];

  incoming.forEach((value) => {
    const normalizedValue = value.trim();

    if (
      normalizedValue &&
      !merged.some(
        (existing) =>
          existing.trim().toLowerCase() === normalizedValue.toLowerCase(),
      )
    ) {
      merged.push(normalizedValue);
    }
  });

  return merged.sort((left, right) => left.localeCompare(right));
}

function MonthPicker({
  label,
  value,
  onSelect,
  month,
  onMonthChange,
}: MonthPickerProps) {
  return (
    <div>
      <h3 className="mb-2 text-[16px] font-[600] text-brand">{label}</h3>
      <Card className="rounded-[20px] shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
        <CardContent className="p-4">
          <CalendarMonthGrid
            month={month}
            selectedDate={value ?? month}
            onMonthChange={onMonthChange}
            onSelect={onSelect}
            compact
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-[16px] font-[600] text-brand">
      {children} <span className="text-[#d3554d]">*</span>
    </span>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-[16px] font-[600] text-brand">{children}</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-[12px] font-medium text-[#ba3f31]">{message}</p>;
}

function formatExecutorTypeLabel(type: CollaboratorRecord["type"]) {
  return type === "External" ? "External Collaborator" : "Internal Collaborator";
}

function QuickAddMasterDataDialog({
  isOpen,
  kind,
  value,
  error,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  isOpen: boolean;
  kind: QuickAddMasterDataKind;
  value: string;
  error?: string;
  saving: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const label = kind === "category" ? "Category" : "Tag";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <Card className="w-full max-w-[440px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                Add New {label}
              </h2>
              <p className="mt-1 text-[14px] text-[#6a706b]">
                Create a reusable project {label.toLowerCase()} without leaving this form.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="shrink-0 border border-line"
              aria-label={`Close add ${label.toLowerCase()} dialog`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <label className="space-y-2">
            <span className="block text-[13px] font-[600] text-[#2d372f]">
              {label} Name <span className="text-[#d3554d]">*</span>
            </span>
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={`Enter ${label.toLowerCase()} name`}
              className="rounded-2xl border border-line"
              autoFocus
            />
          </label>

          {error ? (
            <div className="mt-4 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
              {error}
            </div>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={saving}>
              {saving ? `Saving ${label}...` : `Save ${label}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteExecutorDialog({
  isOpen,
  form,
  error,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  isOpen: boolean;
  form: CollaboratorForm;
  error?: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <Card className="w-full max-w-[520px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                Invite Executor
              </h2>
              <p className="mt-1 text-[14px] text-[#6a706b]">
                Create or reuse a collaborator and select them as the project executor.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="shrink-0 border border-line"
              aria-label="Close invite executor dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="block text-[13px] font-[600] text-[#2d372f]">
                Name <span className="text-[#d3554d]">*</span>
              </span>
              <Input
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Executor name"
                className="rounded-2xl border border-line"
                autoFocus
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="block text-[13px] font-[600] text-[#2d372f]">
                Email <span className="text-[#d3554d]">*</span>
              </span>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="user@gulbahartobacco.com"
                className="rounded-2xl border border-line"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="block text-[13px] font-[600] text-[#2d372f]">
                Collaborator Type <span className="text-[#d3554d]">*</span>
              </span>
              <Select
                value={form.type}
                onValueChange={(value) => onChange("type", value as CollaboratorForm["type"])}
              >
                <SelectTrigger className="rounded-2xl border border-line">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="External">External</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#dde7de] bg-[#f7fbf7] px-4 py-3 text-[12px] text-[#5d6a61]">
            New executors are invited as collaborators with project access enabled.
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={saving}>
              {saving ? "Saving Executor..." : "Save Executor"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateProjectSubmitButton({
  mode,
  uploadPhase,
}: {
  mode: "create" | "edit";
  uploadPhase?: "uploading-assets" | null;
}) {
  const { pending } = useFormStatus();
  const isBusy = pending || uploadPhase === "uploading-assets";

  const busyLabel =
    uploadPhase === "uploading-assets"
      ? "Uploading Assets..."
      : mode === "edit"
        ? "Saving..."
        : "Creating Project...";

  return (
    <Button
      type="submit"
      disabled={isBusy}
      className={`mt-8 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-all duration-200 ${
        isBusy
          ? "cursor-not-allowed bg-[linear-gradient(90deg,#5aa07a,#2c6d4b)] shadow-[0_10px_20px_rgba(34,102,70,0.14)]"
          : "cursor-pointer bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(34,102,70,0.26)]"
      }`}
    >
      {isBusy ? (
        <>
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
          </span>
          {busyLabel}
        </>
      ) : (
        mode === "edit" ? "Save Changes" : "Create Project"
      )}
    </Button>
  );
}

function getDefaultCollaboratorForm(): CollaboratorForm {
  return {
    name: "",
    email: "",
    type: "Internal",
    permissions: {
      project: "none",
      calendar: "none",
      library: "none",
      archive: "none",
    },
  };
}

export function CreateProjectWorkspace({
  availableCollaborators,
  categoryOptions = [],
  tagOptions = [],
  currencyOptions = [],
  canManageProjectMasterData = false,
  canInviteExecutor = false,
  mode = "create",
  initialValues,
  action = mode === "edit" ? updateProjectAction : createProjectAction,
}: CreateProjectWorkspaceProps) {
  const router = useRouter();
  const [formState, formAction] = useActionState<ProjectFormState, FormData>(
    action,
    initialProjectFormState,
  );
  const initialExecutorOption =
    availableCollaborators.find(
      (collaborator) =>
        collaborator.id === initialValues?.executorUserId ||
        ((!initialValues?.executorUserId && initialValues?.executorName
          ? collaborator.name.trim().toLowerCase() === initialValues.executorName.trim().toLowerCase() ||
            collaborator.email.trim().toLowerCase() === initialValues.executorName.trim().toLowerCase()
          : false)),
    ) ?? null;
  const [projectName, setProjectName] = useState(initialValues?.name ?? "");
  const [availableCategoryOptions, setAvailableCategoryOptions] =
    useState<string[]>(categoryOptions);
  const [availableTagOptions, setAvailableTagOptions] = useState<string[]>(tagOptions);
  const [projectCategory, setProjectCategory] = useState(initialValues?.category ?? "");
  const [projectExecutor, setProjectExecutor] = useState(
    initialExecutorOption?.name ?? initialValues?.executorName ?? "",
  );
  const [projectExecutorUserId, setProjectExecutorUserId] = useState(
    initialExecutorOption?.id ?? initialValues?.executorUserId ?? "",
  );
  const [projectTag, setProjectTag] = useState(initialValues?.tag ?? "");
  const [projectBudget, setProjectBudget] = useState(initialValues?.budget ?? "");
  const [projectCurrency, setProjectCurrency] = useState<string>(
    initialValues?.currency ?? getDefaultProjectCurrencyCode(currencyOptions),
  );
  const [projectPriority, setProjectPriority] = useState<ProjectPriorityValue>(
    initialValues?.priority && isProjectPriority(initialValues.priority)
      ? initialValues.priority
      : DEFAULT_PROJECT_PRIORITY,
  );
  const [projectBrief, setProjectBrief] = useState(initialValues?.description ?? "");
  const [projectStatus, setProjectStatus] = useState<ProjectStatusValue>(
    initialValues?.status ?? "ONGOING",
  );
  const [startDate, setStartDate] = useState<Date | null>(
    initialValues?.startDate ? new Date(initialValues.startDate) : null,
  );
  const [endDate, setEndDate] = useState<Date | null>(
    initialValues?.endDate ? new Date(initialValues.endDate) : null,
  );
  const [startMonth, setStartMonth] = useState(
    initialValues?.startDate ? new Date(initialValues.startDate) : new Date(),
  );
  const [endMonth, setEndMonth] = useState(
    initialValues?.endDate ? new Date(initialValues.endDate) : new Date(),
  );
  const [stages, setStages] = useState<StageForm[]>(
    initialValues?.stages.length
        ? initialValues.stages.map((stage) => ({
          id: stage.id,
          persistedId: stage.id,
          name: stage.name,
          budget: stage.budget,
          description: stage.description,
          plannedStartAt: stage.plannedStartAt,
          plannedDueAt: stage.plannedDueAt,
        }))
      : [
          {
            id: "stage-1",
            name: "Stage 1",
            budget: "",
            description: "",
            plannedStartAt: "",
            plannedDueAt: "",
          },
        ],
  );
  const [availableCollaboratorRecords, setAvailableCollaboratorRecords] =
    useState<CollaboratorRecord[]>(availableCollaborators);
  const [assignedCollaborators, setAssignedCollaborators] = useState<ProjectEditorInitialCollaborator[]>(
    initialValues?.collaborators ?? [],
  );
  const [projectAttachments, setProjectAttachments] = useState<ProjectEditorInitialAttachment[]>(
    initialValues?.attachments ?? [],
  );
  const [pendingProjectFiles, setPendingProjectFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorForm>(
    getDefaultCollaboratorForm(),
  );
  const [collaboratorError, setCollaboratorError] = useState<string>();
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [budgetConflictDialogOpen, setBudgetConflictDialogOpen] = useState(false);
  const [executorPickerOpen, setExecutorPickerOpen] = useState(false);
  const [executorSearch, setExecutorSearch] = useState("");
  const [quickAddMasterDataKind, setQuickAddMasterDataKind] =
    useState<QuickAddMasterDataKind | null>(null);
  const [quickAddMasterDataName, setQuickAddMasterDataName] = useState("");
  const [quickAddMasterDataError, setQuickAddMasterDataError] = useState<string>();
  const [quickAddMasterDataSaving, setQuickAddMasterDataSaving] = useState(false);
  const [executorInviteOpen, setExecutorInviteOpen] = useState(false);
  const [executorInviteForm, setExecutorInviteForm] = useState<CollaboratorForm>(
    getDefaultExecutorInviteForm(),
  );
  const [executorInviteError, setExecutorInviteError] = useState<string>();
  const [executorInviteSaving, setExecutorInviteSaving] = useState(false);
  const [dirtyFieldKeys, setDirtyFieldKeys] = useState<Set<string>>(() => new Set());
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const executorPickerRef = useRef<HTMLDivElement | null>(null);
  const handledCreatedProjectIdRef = useRef<string | null>(null);
  const handledEditProjectIdRef = useRef<string | null>(null);
  const lastFormToastKeyRef = useRef<string | null>(null);
  const [, startRefresh] = useTransition();
  const isCreateUploadPhase = mode === "create" && Boolean(formState.projectId) && isUploadingAttachments;
  const canViewBudget = mode === "create" ? true : (initialValues?.canViewBudget ?? true);
  const fieldErrors: ProjectFormFieldErrors = formState.fieldErrors ?? {};
  const parsedProjectBudget = useMemo(() => parseBudgetInput(projectBudget), [projectBudget]);
  const parsedStageBudgets = useMemo(
    () => stages.map((stage) => parseBudgetInput(stage.budget)),
    [stages],
  );
  const totalStageBudget = useMemo(
    () =>
      parsedStageBudgets.reduce(
        (sum, budget) => sum + (Number.isFinite(budget) ? budget : 0),
        0,
      ),
    [parsedStageBudgets],
  );
  const hasInvalidBudgetInputs = useMemo(
    () =>
      canViewBudget &&
      (projectBudget.trim().length > 0
        ? !Number.isFinite(parsedProjectBudget) || parsedProjectBudget <= 0
        : false),
    [canViewBudget, parsedProjectBudget, projectBudget],
  );
  const hasInvalidStageBudgetInputs = useMemo(
    () =>
      canViewBudget &&
      stages.some((stage, index) => {
        if (!stage.budget.trim()) {
          return false;
        }

        const budget = parsedStageBudgets[index];
        return !Number.isFinite(budget) || budget <= 0;
      }),
    [canViewBudget, parsedStageBudgets, stages],
  );
  const hasMissingStageBudgetInputs = useMemo(
    () => canViewBudget && stages.some((stage) => !stage.budget.trim()),
    [canViewBudget, stages],
  );
  const remainingStageBudget = useMemo(() => {
    if (!canViewBudget || !Number.isFinite(parsedProjectBudget)) {
      return null;
    }

    return parsedProjectBudget - totalStageBudget;
  }, [canViewBudget, parsedProjectBudget, totalStageBudget]);
  const hasBudgetConflict = useMemo(
    () =>
      canViewBudget &&
      Number.isFinite(parsedProjectBudget) &&
      !hasMissingStageBudgetInputs &&
      !hasInvalidStageBudgetInputs &&
      totalStageBudget !== parsedProjectBudget,
    [
      canViewBudget,
      hasInvalidStageBudgetInputs,
      hasMissingStageBudgetInputs,
      parsedProjectBudget,
      totalStageBudget,
    ],
  );
  const selectedCollaboratorIds = useMemo(
    () => assignedCollaborators.map((collaborator) => collaborator.id),
    [assignedCollaborators],
  );
  const categorySelectOptions = useMemo(
    () =>
      projectCategory && !availableCategoryOptions.includes(projectCategory)
        ? [projectCategory, ...availableCategoryOptions]
        : availableCategoryOptions,
    [availableCategoryOptions, projectCategory],
  );
  const tagSelectOptions = useMemo(
    () =>
      projectTag && !availableTagOptions.includes(projectTag)
        ? [projectTag, ...availableTagOptions]
        : availableTagOptions,
    [availableTagOptions, projectTag],
  );
  const currencySelectOptions = useMemo(() => {
    if (
      projectCurrency &&
      !currencyOptions.some((currency) => currency.code === projectCurrency)
    ) {
      return [{ code: projectCurrency, name: projectCurrency }, ...currencyOptions];
    }

    return currencyOptions;
  }, [currencyOptions, projectCurrency]);
  const executorOptions = useMemo<ExecutorOption[]>(
    () =>
      availableCollaboratorRecords.map((collaborator) => ({
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email,
        type: collaborator.type,
      })),
    [availableCollaboratorRecords],
  );
  const selectedExecutorOption = useMemo(
    () => executorOptions.find((option) => option.id === projectExecutorUserId) ?? null,
    [executorOptions, projectExecutorUserId],
  );
  const filteredExecutorOptions = useMemo(() => {
    const query = executorSearch.trim().toLowerCase();

    if (!query) {
      return executorOptions;
    }

    return executorOptions.filter((option) =>
      [option.name, option.email, option.type, formatExecutorTypeLabel(option.type)].some(
        (value) => value.toLowerCase().includes(query),
      ),
    );
  }, [executorOptions, executorSearch]);
  const overview = useMemo(
    () => ({
      budget: canViewBudget
        ? Number.isFinite(parsedProjectBudget)
          ? formatBudgetDisplay(parsedProjectBudget, projectCurrency ?? "")
          : projectBudget
            ? `${projectBudget} ${projectCurrency ?? ""}`.trim()
            : "—"
        : "Restricted",
      allocatedStageBudget:
        canViewBudget && Number.isFinite(totalStageBudget)
          ? formatBudgetDisplay(totalStageBudget, projectCurrency ?? "")
          : "—",
      remainingStageBudget:
        canViewBudget && remainingStageBudget !== null
          ? formatBudgetDifference(remainingStageBudget, projectCurrency ?? "")
          : "—",
      stages: stages.length,
      started: startDate ? formatDateValue(startDate) : "—",
      deadline: endDate ? formatDateValue(endDate) : "—",
      executor: projectExecutor || "—",
      tag: projectTag || "—",
      status:
        projectStatusOptions.find((option) => option.value === projectStatus)?.label || "—",
      priority: formatProjectPriority(projectPriority),
    }),
    [
      canViewBudget,
      projectBudget,
      projectCurrency,
      projectExecutor,
      projectTag,
      projectPriority,
      projectStatus,
      parsedProjectBudget,
      remainingStageBudget,
      stages.length,
      startDate,
      endDate,
      totalStageBudget,
    ],
  );
  const clientStageDateErrors = useMemo(() => {
    const stageStartDates = stages.map((stage) => parseStageDateTimeValue(stage.plannedStartAt));
    const stageDueDates = stages.map((stage) => parseStageDateTimeValue(stage.plannedDueAt));
    const stageStartDateErrors: Array<string | undefined> = Array.from(
      { length: stages.length },
      () => undefined,
    );
    const stageDueDateErrors: Array<string | undefined> = Array.from(
      { length: stages.length },
      () => undefined,
    );

    if (!startDate || !endDate) {
      return {
        stageStartDateErrors,
        stageDueDateErrors,
        hasConflict: false,
      };
    }

    const projectStartBoundary = getStartOfDay(startDate);
    const projectEndBoundary = getEndOfDay(endDate);

    stageStartDates.forEach((stageStart, index) => {
      if (!stageStart) {
        return;
      }

      if (stageStart < projectStartBoundary || stageStart > projectEndBoundary) {
        stageStartDateErrors[index] = "Stage start must be within the project date range.";
      }
    });

    stageDueDates.forEach((stageDue, index) => {
      if (!stageDue) {
        return;
      }

      const stageStart = stageStartDates[index];

      if (stageDue < projectStartBoundary || stageDue > projectEndBoundary) {
        stageDueDateErrors[index] = "Stage due must be within the project date range.";
        return;
      }

      if (stageStart && stageDue <= stageStart) {
        stageDueDateErrors[index] = "Stage due must be after the stage start.";
      }
    });

    return {
      stageStartDateErrors,
      stageDueDateErrors,
      hasConflict:
        stageStartDateErrors.some(Boolean) || stageDueDateErrors.some(Boolean),
    };
  }, [endDate, startDate, stages]);

  function updateStage(id: string, patch: Partial<StageForm>) {
    setStages((current) =>
      current.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
    );
  }

  function clearFieldError(fieldKey: string) {
    setDirtyFieldKeys((current) => {
      if (current.has(fieldKey)) {
        return current;
      }

      const next = new Set(current);
      next.add(fieldKey);
      return next;
    });
  }

  function clearStageFieldError(
    fieldKey: "stageNames" | "stageBudgets" | "stageDescriptions" | "stageStartDates" | "stageDueDates",
    index: number,
  ) {
    clearFieldError(`${fieldKey}.${index}`);
  }

  function getFieldError(
    fieldKey: keyof ProjectFormFieldErrors,
    message: string | undefined,
  ) {
    if (!message) {
      return undefined;
    }

    return dirtyFieldKeys.has(fieldKey) ? undefined : message;
  }

  function getStageFieldError(
    fieldKey: "stageNames" | "stageBudgets" | "stageDescriptions" | "stageStartDates" | "stageDueDates",
    index: number,
    message?: string,
  ) {
    if (!message) {
      return undefined;
    }

    return dirtyFieldKeys.has(`${fieldKey}.${index}`) ? undefined : message;
  }

  function addStage() {
    setStages((current) => [
      ...current,
      {
        id: `stage-${Date.now()}`,
        name: `Stage ${current.length + 1}`,
        budget: "",
        description: "",
        plannedStartAt: formatDateTimeInputValue(startDate),
        plannedDueAt: formatDateTimeInputValue(endDate),
      },
    ]);
  }

  function setCollaboratorFormValue<K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) {
    setCollaboratorForm((current) => ({ ...current, [field]: value }));
  }

  function setCollaboratorPermissionValue(
    area: keyof CollaboratorForm["permissions"],
    value: CollaboratorForm["permissions"][keyof CollaboratorForm["permissions"]],
  ) {
    setCollaboratorForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [area]: value },
    }));
  }

  function setExecutorInviteFormValue<K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) {
    setExecutorInviteForm((current) => ({ ...current, [field]: value }));
  }

  function openQuickAddMasterData(kind: QuickAddMasterDataKind) {
    setQuickAddMasterDataKind(kind);
    setQuickAddMasterDataName("");
    setQuickAddMasterDataError(undefined);
  }

  function closeQuickAddMasterData() {
    setQuickAddMasterDataKind(null);
    setQuickAddMasterDataName("");
    setQuickAddMasterDataError(undefined);
  }

  function openExecutorInvite(prefillValue = "") {
    const nextForm = getDefaultExecutorInviteForm();
    const trimmedPrefill = prefillValue.trim();

    if (trimmedPrefill) {
      if (trimmedPrefill.includes("@")) {
        nextForm.email = trimmedPrefill;
      } else {
        nextForm.name = trimmedPrefill;
      }
    }

    setExecutorInviteForm(nextForm);
    setExecutorInviteError(undefined);
    setExecutorPickerOpen(false);
    setExecutorInviteOpen(true);
  }

  function openCollaboratorInvite() {
    setCollaboratorForm(getDefaultCollaboratorForm());
    setCollaboratorError(undefined);
    setDialogOpen(true);
  }

  function toggleAssignedCollaborator(collaboratorId: string) {
    const availableCollaborator = availableCollaboratorRecords.find(
      (collaborator) => collaborator.id === collaboratorId,
    );

    if (!availableCollaborator) {
      return;
    }

    setAssignedCollaborators((current) => {
      const exists = current.some((collaborator) => collaborator.id === collaboratorId);

      if (exists) {
        return current.filter((collaborator) => collaborator.id !== collaboratorId);
      }

      return [
        ...current,
        buildAssignedCollaboratorRecord(availableCollaborator),
      ];
    });
  }

  async function handleCollaboratorInvite() {
    if (!collaboratorForm.name.trim() || !collaboratorForm.email.trim()) {
      setCollaboratorError("Enter both collaborator name and email.");
      return;
    }

    setCollaboratorSaving(true);
    setCollaboratorError(undefined);

    try {
      const result = await saveCollaboratorAction(collaboratorForm);

      if ("error" in result) {
        setCollaboratorError(result.error);
        return;
      }

      setAvailableCollaboratorRecords((current) =>
        upsertCollaboratorRecord(current, result.collaborator),
      );
      setAssignedCollaborators((current) =>
        upsertAssignedCollaboratorRecord(current, result.collaborator),
      );
      setDialogOpen(false);
      setPickerOpen(false);
    } catch {
      setCollaboratorError("Unable to save the collaborator right now. Please try again.");
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleQuickAddMasterData() {
    const normalizedName = quickAddMasterDataName.trim();

    if (!quickAddMasterDataKind) {
      return;
    }

    if (!normalizedName) {
      const message = `${
        quickAddMasterDataKind === "category" ? "Category" : "Tag"
      } name is required.`;
      setQuickAddMasterDataError(message);
      showErrorToast("Unable to save value.", message);
      return;
    }

    setQuickAddMasterDataSaving(true);
    setQuickAddMasterDataError(undefined);

    try {
      const result =
        quickAddMasterDataKind === "category"
          ? await saveProjectCategoryAction({
              name: normalizedName,
              description: "",
              color: "",
              isActive: true,
            })
          : await saveProjectTagAction({
              name: normalizedName,
              description: "",
              color: "",
              isActive: true,
            });

      if ("error" in result) {
        setQuickAddMasterDataError(result.error);
        showErrorToast(
          `Unable to add ${quickAddMasterDataKind}.`,
          result.error,
        );
        return;
      }

      const createdName = result.item?.name ?? normalizedName;

      if (quickAddMasterDataKind === "category") {
        setProjectCategory(createdName);
        setAvailableCategoryOptions((current) =>
          mergeUniqueTextOptions(current, [createdName]),
        );
        clearFieldError("category");
        showSuccessToast("Category added.");
      } else {
        setProjectTag(createdName);
        setAvailableTagOptions((current) => mergeUniqueTextOptions(current, [createdName]));
        clearFieldError("tag");
        showSuccessToast("Tag added.");
      }

      closeQuickAddMasterData();
    } catch {
      const message = `Unable to add ${
        quickAddMasterDataKind === "category" ? "category" : "tag"
      } right now. Please try again.`;
      setQuickAddMasterDataError(message);
      showErrorToast("Unable to save value.", message);
    } finally {
      setQuickAddMasterDataSaving(false);
    }
  }

  async function handleExecutorInvite() {
    if (!executorInviteForm.name.trim() || !executorInviteForm.email.trim()) {
      const message = "Enter both executor name and email.";
      setExecutorInviteError(message);
      showErrorToast("Unable to invite executor.", message);
      return;
    }

    setExecutorInviteSaving(true);
    setExecutorInviteError(undefined);

    try {
      const result = await saveCollaboratorAction({
        ...executorInviteForm,
        permissions: {
          project: "full",
          calendar: "none",
          library: "none",
          archive: "none",
        },
        allowExistingUser: true,
      });

      if ("error" in result) {
        setExecutorInviteError(result.error);
        showErrorToast("Unable to invite executor.", result.error);
        return;
      }

      setAvailableCollaboratorRecords((current) =>
        upsertCollaboratorRecord(current, result.collaborator),
      );
      setProjectExecutorUserId(result.collaborator.id);
      setProjectExecutor(result.collaborator.name);
      setExecutorInviteOpen(false);
      setExecutorPickerOpen(false);
      setExecutorSearch("");
      clearFieldError("executorUserId");
      clearFieldError("executorName");
      showSuccessToast("Executor invited.");

      if (result.warning) {
        showWarningToast("Executor saved with warning.", result.warning);
      }
    } catch {
      const message = "Unable to save the executor right now. Please try again.";
      setExecutorInviteError(message);
      showErrorToast("Unable to invite executor.", message);
    } finally {
      setExecutorInviteSaving(false);
    }
  }

  function handleBudgetChange(value: string) {
    setProjectBudget(normalizeBudgetInput(value));
    clearFieldError("budget");
    clearFieldError("currency");
    clearFieldError("budgetSummary");
  }

  function handleStageBudgetChange(stageId: string, value: string) {
    const stageIndex = stages.findIndex((stage) => stage.id === stageId);
    updateStage(stageId, {
      budget: normalizeBudgetInput(value),
    });
    if (stageIndex >= 0) {
      clearStageFieldError("stageBudgets", stageIndex);
    }
    clearFieldError("budgetSummary");
  }

  function handleProjectFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    setDirtyFieldKeys(new Set());

    if (clientStageDateErrors.hasConflict) {
      event.preventDefault();
      showErrorToast(
        "Stage date conflict.",
        "Each stage must stay within the project date range.",
      );
      return;
    }

    if (!canViewBudget) {
      return;
    }

    if (hasBudgetConflict) {
      event.preventDefault();
      showWarningToast(
        "Budget conflict.",
        "Project budget must equal the total stage budgets.",
      );
      setBudgetConflictDialogOpen(true);
    }
  }

  function refreshProjectData() {
    startRefresh(() => {
      router.refresh();
    });
  }

  function updateAssignedCollaboratorParticipantType(
    collaboratorId: string,
    participantType: ProjectCollaboratorParticipantType,
  ) {
    setAssignedCollaborators((current) =>
      current.map((collaborator) =>
        collaborator.id === collaboratorId
          ? { ...collaborator, participantType }
          : collaborator,
      ),
    );
  }

  async function uploadProjectAsset(
    file: File,
    projectId: string,
    options?: {
      stageId?: string | null;
      commentId?: string | null;
    },
  ): Promise<ProjectEditorInitialAttachment> {
    if (!projectId) {
      throw new Error("Save the project first before uploading attachments.");
    }

    const uploadRequest = await fetch("/api/project-assets/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        stageId: options?.stageId ?? null,
        commentId: options?.commentId ?? null,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        assetType: "GENERAL_PROJECT_ASSET",
      }),
    });

    const uploadPayload = (await uploadRequest.json()) as UploadAssetResponse;

    if (!uploadRequest.ok || !uploadPayload.attachmentId || !uploadPayload.uploadUrl) {
      throw new Error(uploadPayload.error || "Unable to prepare the attachment upload.");
    }

    try {
      const putResponse = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed for ${file.name}.`);
      }

      const completeResponse = await fetch("/api/project-assets/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attachmentId: uploadPayload.attachmentId,
          projectId,
        }),
      });

      const completePayload = (await completeResponse.json()) as { error?: string };

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the attachment upload.");
      }

      return {
        id: uploadPayload.attachmentId,
        originalFileName: file.name,
        fileTypeLabel: getLocalFileTypeLabel(file.name),
        mimeType: file.type || "application/octet-stream",
        fileSizeLabel: formatLocalFileSize(file.size),
        uploadedBy: "You",
        uploadedAt: "Just now",
        previewPath: `/api/project-assets/${uploadPayload.attachmentId}/preview`,
        downloadPath: `/api/project-assets/${uploadPayload.attachmentId}/download`,
        isFavoritedByCurrentUser: false,
      };
    } catch (error) {
      await fetch("/api/project-assets/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attachmentId: uploadPayload.attachmentId,
          failed: true,
          projectId,
        }),
      }).catch(() => undefined);

      throw error;
    }
  }

  async function handleAttachmentSelection(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setAttachmentError(undefined);

    if (mode === "create") {
      setPendingProjectFiles((current) => [...current, ...selectedFiles]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
      return;
    }

    if (!initialValues?.id) {
      setAttachmentError("Save the project first before uploading attachments.");
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
      return;
    }

    setIsUploadingAttachments(true);
    setPendingProjectFiles((current) => [...current, ...selectedFiles]);

    try {
      for (const file of selectedFiles) {
        const attachment = await uploadProjectAsset(file, initialValues.id);
        setProjectAttachments((current) =>
          current.some((item) => item.id === attachment.id)
            ? current
            : [...current, attachment],
        );
        setPendingProjectFiles((current) =>
          current.filter((pendingFile) => pendingFile !== file),
        );
      }
      refreshProjectData();
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to upload the project attachments right now.",
      );
      setPendingProjectFiles((current) =>
        current.filter((pendingFile) => !selectedFiles.includes(pendingFile)),
      );
    } finally {
      setIsUploadingAttachments(false);

      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    }
  }

  function removePendingProjectFile(index: number) {
    setPendingProjectFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  useEffect(() => {
    if (!executorPickerOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        executorPickerRef.current &&
        !executorPickerRef.current.contains(event.target as Node)
      ) {
        setExecutorPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [executorPickerOpen]);

  useEffect(() => {
    if (!formState.error) {
      return;
    }

    const toastKey = `${mode}:${formState.error}:${fieldErrors.budgetSummary ?? ""}`;

    if (lastFormToastKeyRef.current === toastKey) {
      return;
    }

    lastFormToastKeyRef.current = toastKey;

    if (fieldErrors.budgetSummary) {
      showWarningToast("Budget conflict.", fieldErrors.budgetSummary);
      return;
    }

    showErrorToast(
      mode === "edit" ? "Unable to update project." : "Unable to create project.",
      formState.error === "Please correct the highlighted fields." ||
        formState.error === "Please correct the highlighted stage fields."
        ? "Please review the highlighted fields."
        : formState.error,
    );
  }, [fieldErrors.budgetSummary, formState.error, mode]);

  useEffect(() => {
    if (mode !== "create" || !formState.projectId) {
      return;
    }

    if (handledCreatedProjectIdRef.current === formState.projectId) {
      return;
    }

    handledCreatedProjectIdRef.current = formState.projectId;

    const projectId = formState.projectId;
    const initialBriefStageId = formState.initialBriefStageId ?? null;
    const initialBriefCommentId = formState.initialBriefCommentId ?? null;

    if (pendingProjectFiles.length === 0) {
      showSuccessToast("Project created successfully.");
      router.replace(`/projects/${projectId}`);
      return;
    }

    let cancelled = false;

    async function completeQueuedUploads() {
      setIsUploadingAttachments(true);
      setAttachmentError(undefined);

      try {
        for (const file of pendingProjectFiles) {
          await uploadProjectAsset(file, projectId, {
            stageId: initialBriefStageId,
            commentId: initialBriefCommentId,
          });
        }

        if (cancelled) {
          return;
        }

        setPendingProjectFiles([]);
        showSuccessToast("Project created successfully.");
        router.replace(`/projects/${projectId}`);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAttachmentError(
          error instanceof Error
            ? `${error.message} The project was created, but the attachment upload did not finish. You can retry from edit mode.`
            : "The project was created, but the attachment upload did not finish. You can retry from edit mode.",
        );
        showErrorToast(
          "Project created, but attachment upload failed.",
          "You can retry the attachment upload from edit mode.",
        );
        router.replace(`/projects/${projectId}/edit`);
      } finally {
        if (!cancelled) {
          setIsUploadingAttachments(false);
        }
      }
    }

    void completeQueuedUploads();

    return () => {
      cancelled = true;
    };
  }, [
    formState.initialBriefCommentId,
    formState.initialBriefStageId,
    formState.projectId,
    mode,
    pendingProjectFiles,
    router,
  ]);

  useEffect(() => {
    if (mode !== "edit" || !formState.projectId) {
      return;
    }

    if (handledEditProjectIdRef.current === formState.projectId) {
      return;
    }

    handledEditProjectIdRef.current = formState.projectId;
    showSuccessToast("Project updated successfully.");
    router.replace(`/projects/${formState.projectId}`);
  }, [formState.projectId, mode, router]);

  async function removeProjectAttachment(attachmentId: string) {
    if (!initialValues?.id) {
      return;
    }

    setDeletingAttachmentId(attachmentId);
    setAttachmentError(undefined);

    try {
      const response = await fetch(
        `/api/project-assets/${attachmentId}?projectId=${encodeURIComponent(initialValues.id)}`,
        {
          method: "DELETE",
        },
      );

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete the attachment right now.");
      }

      setProjectAttachments((current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      );
      refreshProjectData();
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to delete the attachment right now.",
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1420px]">
    <form
      action={formAction}
      onSubmit={handleProjectFormSubmit}
      className="flex w-full min-w-0 flex-col gap-4 xl:flex-row xl:items-start"
    >
      <input type="hidden" name="startDate" value={startDate ? formatDateValue(startDate) : ""} />
      <input type="hidden" name="endDate" value={endDate ? formatDateValue(endDate) : ""} />
      <input type="hidden" name="category" value={projectCategory} />
      <input type="hidden" name="executorName" value={projectExecutor} />
      <input type="hidden" name="executorUserId" value={projectExecutorUserId} />
      <input type="hidden" name="tag" value={projectTag} />
      <input type="hidden" name="currency" value={projectCurrency} />
      <input type="hidden" name="status" value={projectStatus} />
      <input type="hidden" name="priority" value={projectPriority} />
      {assignedCollaborators.map((collaborator) => (
        <div key={collaborator.id}>
          <input type="hidden" name="collaboratorIds" value={collaborator.id} />
          <input
            type="hidden"
            name="collaboratorParticipantTypes"
            value={collaborator.participantType ?? ""}
          />
        </div>
      ))}
      {mode === "edit" && initialValues ? (
        <input type="hidden" name="projectId" value={initialValues.id} />
      ) : null}
      <input
        type="hidden"
        name="currentStageName"
        value={stages[0]?.name?.trim() || "Stage 1"}
      />
      <input type="hidden" name="stageCount" value={String(stages.length)} />

      <MotionSection className="min-w-0 w-full flex-1">
      <Card className="w-full bg-surface">
        <CardHeader>
          <div className="rounded-[20px] bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-4 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
            <CardTitle className="text-[18px] font-[700] tracking-[-0.02em] text-white">
              {mode === "edit" ? "Edit project" : "Create a project"}
            </CardTitle>
          </div>
        </CardHeader>

        {formState.error && !formState.fieldErrors ? (
          <p className="mt-5 rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[13px] font-medium text-[#ba3f31]">
            {formState.error}
          </p>
        ) : null}

        <CardContent className="space-y-6 pt-2">
          <MotionStaggerGroup
            className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
            stagger={0.05}
          >
            <MotionItem y={8}>
            <div className="space-y-4">
              <label className="block">
                <RequiredLabel>Project Name</RequiredLabel>
                <Input
                  value={projectName}
                  onChange={(event) => {
                    setProjectName(event.target.value);
                    clearFieldError("name");
                  }}
                  name="name"
                  required
                  placeholder="Enter Project Name....."
                  className="h-[42px] text-[12px]"
                />
                <FieldError message={getFieldError("name", fieldErrors.name)} />
              </label>

              <label className="block">
                <RequiredLabel>Project Category</RequiredLabel>
                <Select
                  key={`project-category-${projectCategory || "empty"}-${categorySelectOptions.join("\u001f")}`}
                  value={projectCategory}
                  onValueChange={(nextValue) => {
                    if (nextValue === "__add_category__") {
                      openQuickAddMasterData("category");
                      return;
                    }

                    setProjectCategory(nextValue);
                    clearFieldError("category");
                  }}
                  disabled={
                    categorySelectOptions.length === 0 && !canManageProjectMasterData
                  }
                >
                  <SelectTrigger className="h-[42px] text-[12px] font-medium">
                    <SelectValue
                      placeholder={
                        categorySelectOptions.length === 0 && !canManageProjectMasterData
                          ? "No categories available"
                          : "Select project category"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categorySelectOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                    {canManageProjectMasterData ? (
                      <>
                        <Separator className="my-1" />
                        <SelectItem value="__add_category__">+ Add new category</SelectItem>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
                <FieldError message={getFieldError("category", fieldErrors.category)} />
              </label>

              <label className="block">
                <RequiredLabel>Project Executor</RequiredLabel>
                <div ref={executorPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setExecutorPickerOpen((current) => !current);
                      setExecutorSearch("");
                    }}
                    className="flex h-[42px] w-full items-center justify-between rounded-full border border-line bg-white px-4 text-left text-[12px] font-medium text-[#111712] shadow-[0_6px_16px_rgba(16,29,21,0.04)]"
                    aria-haspopup="listbox"
                    aria-expanded={executorPickerOpen}
                  >
                    <span className="truncate">
                      {selectedExecutorOption?.name ||
                        projectExecutor ||
                        "Search and select executor"}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#7b857d]" />
                  </button>

                  {executorPickerOpen ? (
                    <div className="absolute z-30 mt-2 w-full rounded-[20px] border border-[#dde6de] bg-white p-3 shadow-[0_24px_50px_rgba(17,31,23,0.12)]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a948c]" />
                        <Input
                          value={executorSearch}
                          onChange={(event) => setExecutorSearch(event.target.value)}
                          placeholder="Search and select executor"
                          className="h-10 pl-9 text-[12px]"
                          autoFocus
                        />
                      </div>

                      <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                        {filteredExecutorOptions.length > 0 ? (
                          filteredExecutorOptions.map((option) => {
                            const isSelected = option.id === projectExecutorUserId;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setProjectExecutorUserId(option.id);
                                  setProjectExecutor(option.name);
                                  setExecutorPickerOpen(false);
                                  setExecutorSearch("");
                                  clearFieldError("executorUserId");
                                  clearFieldError("executorName");
                                }}
                                className={`flex w-full items-start gap-3 rounded-[16px] px-3 py-2 text-left transition ${
                                  isSelected
                                    ? "bg-[#eef7ef]"
                                    : "bg-[#fbfcfa] hover:bg-[#f3f8f3]"
                                }`}
                              >
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                                  {isSelected ? (
                                    <Check className="h-4 w-4 text-brand" />
                                  ) : (
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#d6dfd8]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-[700] text-[#162019]">
                                    {option.name}
                                  </p>
                                  <p className="truncate text-[11px] text-[#6f796f]">
                                    {option.email}
                                  </p>
                                  <p className="mt-1 text-[10px] font-[700] uppercase tracking-[0.08em] text-brand">
                                    {formatExecutorTypeLabel(option.type)}
                                  </p>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-[16px] border border-dashed border-[#d7dfd7] bg-[#fbfcfa] px-4 py-5 text-center text-[12px] text-[#7a837b]">
                            No executor found.
                          </div>
                        )}
                      </div>

                      {canInviteExecutor ? (
                        <>
                          <Separator className="my-3" />
                          <button
                            type="button"
                            onClick={() => openExecutorInvite(executorSearch)}
                            className="flex w-full items-center justify-center rounded-[16px] border border-[#dbe7dc] bg-[#f7fbf7] px-3 py-2 text-[13px] font-[700] text-brand transition hover:bg-[#eef8ef]"
                          >
                            + Invite new executor
                          </button>
                        </>
                      ) : null}

                      {!selectedExecutorOption && projectExecutor ? (
                        <p className="mt-3 text-[11px] text-[#7a837b]">
                          Current saved executor: <span className="font-[700] text-[#243028]">{projectExecutor}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <FieldError
                  message={
                    getFieldError("executorUserId", fieldErrors.executorUserId) ||
                    getFieldError("executorName", fieldErrors.executorName)
                  }
                />
              </label>

              <label className="block">
                <RequiredLabel>Project Budget</RequiredLabel>
                {canViewBudget ? (
                  <div className="flex gap-2">
                    <Input
                      value={projectBudget}
                      onChange={(event) => handleBudgetChange(event.target.value)}
                      name="budget"
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Enter Project Budget...."
                      className="h-[42px] min-w-0 flex-1 text-[12px]"
                    />
                    <Select
                      value={projectCurrency}
                      onValueChange={(nextValue) => {
                        setProjectCurrency(nextValue);
                        clearFieldError("currency");
                        clearFieldError("budgetSummary");
                      }}
                      disabled={currencySelectOptions.length === 0}
                    >
                      <SelectTrigger className="h-[42px] w-[108px] text-[12px] font-medium">
                        <SelectValue
                          placeholder={
                            currencySelectOptions.length === 0
                              ? "No currencies available"
                              : "Select currency"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {currencySelectOptions.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-[#dfe5df] bg-[#f7faf7] px-4 py-3 text-[12px] font-medium text-[#6f786f]">
                    Budget is restricted to the project owner.
                  </div>
                )}
                {canViewBudget ? (
                  <>
                    <FieldError
                      message={
                        getFieldError("budget", fieldErrors.budget) ||
                        getFieldError("currency", fieldErrors.currency) ||
                        (hasInvalidBudgetInputs
                          ? "Enter a valid project budget greater than zero."
                          : undefined)
                      }
                    />
                    {getFieldError(
                      "budgetSummary",
                      fieldErrors.budgetSummary,
                    ) ? (
                      <div className="mt-3 rounded-[16px] border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[12px] font-medium text-[#ba3f31]">
                        {getFieldError(
                          "budgetSummary",
                          fieldErrors.budgetSummary,
                        )}
                      </div>
                    ) : hasBudgetConflict && remainingStageBudget !== null ? (
                      <div className="mt-3 rounded-[16px] border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[12px] font-medium text-[#ba3f31]">
                        Project budget must equal the total stage budgets. Difference:{" "}
                        {formatBudgetDifference(remainingStageBudget, projectCurrency || "")}.
                      </div>
                    ) : null}
                  </>
                ) : null}
              </label>

              <label className="block">
                <FieldLabel>Project Tag</FieldLabel>
                <Select
                  key={`project-tag-${projectTag || "empty"}-${tagSelectOptions.join("\u001f")}`}
                  value={projectTag || "__no_tag__"}
                  onValueChange={(nextValue) => {
                    if (nextValue === "__add_tag__") {
                      openQuickAddMasterData("tag");
                      return;
                    }

                    setProjectTag(nextValue === "__no_tag__" ? "" : nextValue);
                    clearFieldError("tag");
                  }}
                >
                  <SelectTrigger className="h-[42px] text-[12px] font-medium">
                    <SelectValue placeholder="Select project tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__no_tag__">No tag</SelectItem>
                    {tagSelectOptions.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                    {canManageProjectMasterData ? (
                      <>
                        <Separator className="my-1" />
                        <SelectItem value="__add_tag__">+ Add new tag</SelectItem>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
                <FieldError message={getFieldError("tag", fieldErrors.tag)} />
              </label>

              <label className="block">
                <RequiredLabel>Project Status</RequiredLabel>
                <Select
                  value={projectStatus}
                  onValueChange={(nextValue) => {
                    setProjectStatus(nextValue as ProjectStatusValue);
                    clearFieldError("status");
                  }}
                >
                  <SelectTrigger className="h-[42px] text-[12px] font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={getFieldError("status", fieldErrors.status)} />
              </label>

              <label className="block">
                <FieldLabel>Project Priority</FieldLabel>
                <Select
                  value={projectPriority}
                  onValueChange={(nextValue) => {
                    setProjectPriority(nextValue as ProjectPriorityValue);
                    clearFieldError("priority");
                  }}
                >
                  <SelectTrigger className="h-[42px] text-[12px] font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectPriorityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={getFieldError("priority", fieldErrors.priority)} />
              </label>
            </div>
            </MotionItem>

            <MotionItem y={8}>
            <div>
              <label className="block">
                <RequiredLabel>Project Brief</RequiredLabel>
                <div className="relative">
                  <Textarea
                    value={projectBrief}
                    onChange={(event) => {
                      setProjectBrief(event.target.value);
                      clearFieldError("description");
                    }}
                    name="description"
                    required
                  placeholder="Enter Project Brief......."
                  className="min-h-[236px] pr-12 text-[12px]"
                />
                  <label className="absolute bottom-3 right-3 cursor-pointer text-[#b4bbb5] transition-colors hover:text-brand">
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      className="cursor-pointer"
                      aria-label="Add project attachment files"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                  </label>
                </div>
                <FieldError message={getFieldError("description", fieldErrors.description)} />
              </label>

              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleAttachmentSelection(event.target.files);
                }}
              />

              {attachmentError ? (
                <div className="mt-3 rounded-[16px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[12px] text-[#bb4d49]">
                  {attachmentError}
                </div>
              ) : null}

              {projectAttachments.length > 0 ||
              pendingProjectFiles.length > 0 ||
              mode === "edit" ? (
                <Card className="mt-3 rounded-[16px] border border-[#dce6dd] shadow-none">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-brand">
                        Project Attachments
                      </p>
                      <div className="flex items-center gap-2">
                        {isUploadingAttachments ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#7a837b]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Uploading...
                          </span>
                        ) : null}
                        <Badge variant="secondary">
                          {projectAttachments.length + pendingProjectFiles.length}
                        </Badge>
                      </div>
                    </div>
                    {projectAttachments.length > 0 || pendingProjectFiles.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {projectAttachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7faf7] px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#dce6dd] bg-white text-[11px] font-semibold text-brand">
                              {attachment.fileTypeLabel}
                            </div>
                            <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-[#243028]">
                              {attachment.originalFileName}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#7a837b]">
                              <span>{attachment.fileSizeLabel}</span>
                              <span>·</span>
                              <span>{attachment.uploadedBy}</span>
                              <span>·</span>
                              <span>{attachment.uploadedAt}</span>
                            </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <AssetPreviewButton
                              fileName={attachment.originalFileName}
                              mimeType={attachment.mimeType}
                              previewPath={attachment.previewPath}
                              downloadPath={attachment.downloadPath}
                              triggerClassName="size-8 text-brand"
                            />
                            <AttachmentFavoriteButton
                              attachmentId={attachment.id}
                              initialIsFavorited={attachment.isFavoritedByCurrentUser}
                              className="size-8 text-[#7a847d] hover:bg-[#fff4f5]"
                            />
                            <Button
                              asChild
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-brand"
                            >
                              <a
                                href={attachment.downloadPath}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Download ${attachment.originalFileName}`}
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                void removeProjectAttachment(attachment.id);
                              }}
                              disabled={deletingAttachmentId === attachment.id}
                              className="cursor-pointer text-[#9aa49c] transition-colors hover:text-[#cf4f44] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Remove ${attachment.originalFileName}`}
                            >
                              {deletingAttachmentId === attachment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </li>
                        ))}
                        {pendingProjectFiles.map((file, index) => (
                          <li
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-[12px] border border-dashed border-[#d7dfd7] bg-[#fdfefd] px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#d7dfd7] bg-white text-[11px] font-semibold text-brand">
                                {getLocalFileTypeLabel(file.name)}
                              </div>
                              <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-[#243028]">
                                {file.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#7a837b]">
                                <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                                <span>·</span>
                                <span>{mode === "create" ? "Pending" : "Pending upload"}</span>
                              </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePendingProjectFile(index)}
                              className="cursor-pointer text-[#9aa49c] transition-colors hover:text-[#cf4f44]"
                              aria-label={`Remove ${file.name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[11px] text-[#7a837b]">
                        No project-level attachments uploaded yet.
                      </p>
                    )}
                    <div className="mt-3 flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={isUploadingAttachments}
                        className="shrink-0 text-[12px]"
                      >
                        <Paperclip className="h-4 w-4" />
                        Add files
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
            </MotionItem>
          </MotionStaggerGroup>

          <MotionStaggerGroup className="grid gap-4 2xl:grid-cols-2" stagger={0.05}>
            <MotionItem y={8}>
              <MonthPicker
                label="Project Start Date *"
                value={startDate}
                onSelect={(date) => {
                  setStartDate(date);
                  clearFieldError("startDate");
                }}
                month={startMonth}
                onMonthChange={setStartMonth}
              />
              <FieldError
                message={getFieldError(
                  "startDate",
                  fieldErrors.startDate,
                )}
              />
            </MotionItem>
            <MotionItem y={8}>
              <MonthPicker
                label="Project End Date *"
                value={endDate}
                onSelect={(date) => {
                  setEndDate(date);
                  clearFieldError("endDate");
                }}
                month={endMonth}
                onMonthChange={setEndMonth}
              />
              <FieldError
                message={getFieldError(
                  "endDate",
                  fieldErrors.endDate,
                )}
              />
            </MotionItem>
          </MotionStaggerGroup>

          <MotionSection y={8}>
          <div>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[16px] font-[600] text-brand">
                Project Stages <span className="text-[#d3554d]">*</span>
              </h3>
              <Button
                type="button"
                onClick={addStage}
                variant="outline"
                size="sm"
                className="text-[12px]"
              >
                <Plus className="h-4 w-4" />
                Add Stage
              </Button>
            </div>

            {canViewBudget ? (
              <div
                className={`mt-3 grid gap-2 rounded-[18px] border px-4 py-3 text-[12px] sm:grid-cols-3 ${
                  hasBudgetConflict
                    ? "border-[#f5c7c2] bg-[#fff4f3]"
                    : "border-[#dbe7dd] bg-[#f7fbf7]"
                }`}
              >
                <div>
                  <p className="text-[10px] font-[800] uppercase tracking-[0.12em] text-[#7a837b]">
                    Project Budget
                  </p>
                  <p className="mt-1 font-[700] text-[#173120]">
                    {Number.isFinite(parsedProjectBudget)
                      ? formatBudgetDisplay(parsedProjectBudget, projectCurrency || "")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-[800] uppercase tracking-[0.12em] text-[#7a837b]">
                    Stage Total
                  </p>
                  <p className="mt-1 font-[700] text-[#173120]">
                    {formatBudgetDisplay(totalStageBudget, projectCurrency || "")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-[800] uppercase tracking-[0.12em] text-[#7a837b]">
                    Difference
                  </p>
                  <p
                    className={`mt-1 font-[700] ${
                      hasBudgetConflict ? "text-[#ba3f31]" : "text-brand"
                    }`}
                  >
                    {remainingStageBudget !== null
                      ? formatBudgetDifference(remainingStageBudget, projectCurrency || "")
                      : "—"}
                  </p>
                </div>
              </div>
            ) : null}

            {canViewBudget && hasBudgetConflict && remainingStageBudget !== null ? (
              <div className="mt-3 rounded-[18px] border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[12px] text-[#ba3f31]">
                <p className="font-[700]">Budget conflict</p>
                <p className="mt-1">
                  Project budget must equal the total stage budgets before saving.
                </p>
                <dl className="mt-2 space-y-1">
                  <div>
                    <dt className="inline font-[700]">Project Budget:</dt>{" "}
                    <dd className="inline">
                      {Number.isFinite(parsedProjectBudget)
                        ? formatBudgetDisplay(parsedProjectBudget, projectCurrency || "")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-[700]">Total Stage Budgets:</dt>{" "}
                    <dd className="inline">
                      {formatBudgetDisplay(totalStageBudget, projectCurrency || "")}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-[700]">Difference:</dt>{" "}
                    <dd className="inline">
                      {formatBudgetDifference(remainingStageBudget, projectCurrency || "")}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <MotionStaggerGroup
              className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
              stagger={0.04}
            >
              {stages.map((stage, index) => (
                <MotionItem key={stage.id} y={8} layout>
                <Card className="rounded-[18px] shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
                  <CardContent className="p-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Name <span className="text-[#d3554d]">*</span>
                    </p>
                    <input type="hidden" name="stageIds" value={stage.persistedId ?? ""} />
                    <Input
                      value={stage.name}
                      onChange={(event) => {
                        updateStage(stage.id, { name: event.target.value });
                        clearStageFieldError("stageNames", index);
                      }}
                      name="stageNames"
                      required
                      className="min-h-[38px] border-brand text-center text-[14px] font-[500] text-brand"
                    />
                    <FieldError
                      message={getStageFieldError("stageNames", index, fieldErrors.stageNames?.[index])}
                    />
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Budget <span className="text-[#d3554d]">*</span>
                    </p>
                    {canViewBudget ? (
                      <Input
                        value={stage.budget}
                        onChange={(event) => handleStageBudgetChange(stage.id, event.target.value)}
                        name="stageBudgets"
                        required
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder={`Stage ${index + 1} Budget...`}
                        className="mt-3 h-[38px] bg-[#f7faf7] text-[12px]"
                      />
                    ) : (
                      <div className="mt-3 rounded-[14px] border border-[#dfe5df] bg-[#f7faf7] px-3 py-2 text-[11px] font-medium text-[#6f786f]">
                        Restricted
                      </div>
                    )}
                    {canViewBudget ? (
                      <FieldError
                        message={
                          getStageFieldError("stageBudgets", index, fieldErrors.stageBudgets?.[index]) ||
                          (stage.budget.trim().length > 0 &&
                          (!Number.isFinite(parsedStageBudgets[index]) ||
                            parsedStageBudgets[index] <= 0)
                            ? "Enter a valid stage budget greater than zero."
                            : undefined)
                        }
                      />
                    ) : null}
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Start <span className="text-[#d3554d]">*</span>
                    </p>
                    <DateTimePicker
                      name="stageStartDates"
                      value={stage.plannedStartAt}
                      minDate={startDate}
                      maxDate={endDate}
                      onChange={(value) => {
                        updateStage(stage.id, { plannedStartAt: value });
                        clearStageFieldError("stageStartDates", index);
                      }}
                    />
                    <FieldError
                      message={
                        getStageFieldError(
                          "stageStartDates",
                          index,
                          fieldErrors.stageStartDates?.[index],
                        ) || clientStageDateErrors.stageStartDateErrors[index]
                      }
                    />
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Due <span className="text-[#d3554d]">*</span>
                    </p>
                    <DateTimePicker
                      name="stageDueDates"
                      value={stage.plannedDueAt}
                      minDate={startDate}
                      maxDate={endDate}
                      onChange={(value) => {
                        updateStage(stage.id, { plannedDueAt: value });
                        clearStageFieldError("stageDueDates", index);
                      }}
                    />
                    <FieldError
                      message={
                        getStageFieldError(
                          "stageDueDates",
                          index,
                          fieldErrors.stageDueDates?.[index],
                        ) || clientStageDateErrors.stageDueDateErrors[index]
                      }
                    />
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Description <span className="text-[#d3554d]">*</span>
                    </p>
                    <Textarea
                      value={stage.description}
                      onChange={(event) => {
                        updateStage(stage.id, { description: event.target.value });
                        clearStageFieldError("stageDescriptions", index);
                      }}
                      name="stageDescriptions"
                      required
                      placeholder={`Stage ${index + 1} Description...`}
                      className="mt-3 min-h-[84px] bg-[#f7faf7] text-[12px]"
                    />
                    <FieldError
                      message={getStageFieldError("stageDescriptions", index, fieldErrors.stageDescriptions?.[index])}
                    />
                  </CardContent>
                </Card>
                </MotionItem>
              ))}
            </MotionStaggerGroup>
          </div>
          </MotionSection>

          <div className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf7] px-4 pb-4 pt-1">
            <CreateProjectSubmitButton
              mode={mode}
              uploadPhase={isCreateUploadPhase ? "uploading-assets" : null}
            />
          </div>
        </CardContent>
      </Card>
      </MotionSection>

      <MotionStaggerGroup className="min-w-0 space-y-4 xl:w-[340px] xl:shrink-0" stagger={0.05}>
        <MotionItem y={10}>
        <Card className="border border-brand/40">
          <CardHeader className="pb-3">
          <CardTitle className="text-[21px] text-brand">
            Project Overview
          </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
          <dl className="mt-3 space-y-1.5 text-[13px] text-[#242b26]">
            <div>
              <dt className="inline font-[700]">Budget :</dt>{" "}
              <dd className="inline">{overview.budget}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Allocated to Stages :</dt>{" "}
              <dd className="inline">{overview.allocatedStageBudget}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Remaining :</dt>{" "}
              <dd
                className={`inline ${
                  hasBudgetConflict ? "font-[700] text-[#ba3f31]" : ""
                }`}
              >
                {overview.remainingStageBudget}
              </dd>
            </div>
            <div>
              <dt className="inline font-[700]">Stages :</dt>{" "}
              <dd className="inline">{overview.stages}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Started :</dt>{" "}
              <dd className="inline">{overview.started}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Deadline :</dt>{" "}
              <dd className="inline">{overview.deadline}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Executor :</dt>{" "}
              <dd className="inline">{overview.executor}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Tag :</dt>{" "}
              <dd className="inline">{overview.tag}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Status :</dt>{" "}
              <dd className="inline">{overview.status}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Priority :</dt>{" "}
              <dd className="inline">{overview.priority}</dd>
            </div>
          </dl>
          </CardContent>
        </Card>
        </MotionItem>
        <MotionItem y={10}>
        <Card>
          <CardHeader className="pb-3">
          <CardTitle className="text-[20px] text-[#111712]">
            Project Collaborators
          </CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
          <div className="space-y-3">
            {assignedCollaborators.length > 0 ? (
              assignedCollaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="rounded-[16px] border border-[#e3e8e2] bg-[#fbfcfa] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-[600] text-[#1f2923]">
                        {collaborator.name}
                      </p>
                      <p className="truncate text-[11px] text-[#7f877f]">
                        {collaborator.email ?? collaborator.role}
                      </p>
                      <div className="mt-2">
                        <Badge
                          variant="secondary"
                          className={getProjectCollaboratorTypeMeta(
                            collaborator.participantType,
                          ).badgeClassName}
                        >
                          {getProjectCollaboratorTypeMeta(collaborator.participantType).label}
                        </Badge>
                      </div>
                      <div className="mt-3 max-w-[260px]">
                        <p className="mb-1 text-[11px] font-[600] text-[#7f877f]">
                          Collaborator Type
                        </p>
                        <Select
                          value={
                            collaborator.participantType ??
                            getDefaultProjectCollaboratorParticipantType(collaborator.group)
                          }
                          onValueChange={(value) =>
                            updateAssignedCollaboratorParticipantType(
                              collaborator.id,
                              value as ProjectCollaboratorParticipantType,
                            )
                          }
                        >
                          <SelectTrigger className="h-9 rounded-full border border-line bg-white text-[12px] font-medium">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {projectCollaboratorParticipantTypes.map((participantType) => (
                              <SelectItem key={participantType} value={participantType}>
                                {getProjectCollaboratorTypeMeta(participantType).label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 ${
                        collaborator.group === "external"
                          ? "border border-[#f1dfcf] bg-[#fff4ea] text-[#ca7b3b]"
                          : "border border-[#d7ead7] bg-[#eef8ef] text-[#2f8d5d]"
                      }`}
                    >
                      {collaborator.group === "external" ? "External" : "Internal"}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-[#7a837b]">
                No collaborators added yet.
              </p>
            )}

            <Button
              type="button"
              onClick={() => setPickerOpen(true)}
              variant="ghost"
              size="sm"
              className="px-0 text-[14px] font-[600] text-brand"
            >
              Add Collaborator
            </Button>
          </div>

          </CardContent>
        </Card>
        </MotionItem>
      </MotionStaggerGroup>

      <CollaboratorPickerDialog
        isOpen={pickerOpen}
        collaborators={availableCollaboratorRecords}
        selectedIds={selectedCollaboratorIds}
        onToggle={toggleAssignedCollaborator}
        onClose={() => setPickerOpen(false)}
        onConfirm={() => setPickerOpen(false)}
        onInviteFallback={openCollaboratorInvite}
        confirmLabel="Apply Selection"
      />
      <CollaboratorDialog
        isOpen={dialogOpen}
        mode="invite"
        form={collaboratorForm}
        error={collaboratorError}
        saving={collaboratorSaving}
        onClose={() => {
          setCollaboratorError(undefined);
          setDialogOpen(false);
        }}
        onSubmit={handleCollaboratorInvite}
        onChange={setCollaboratorFormValue}
        onPermissionChange={setCollaboratorPermissionValue}
      />
      <QuickAddMasterDataDialog
        isOpen={quickAddMasterDataKind !== null}
        kind={quickAddMasterDataKind ?? "category"}
        value={quickAddMasterDataName}
        error={quickAddMasterDataError}
        saving={quickAddMasterDataSaving}
        onClose={closeQuickAddMasterData}
        onChange={(value) => {
          setQuickAddMasterDataName(value);
          setQuickAddMasterDataError(undefined);
        }}
        onSubmit={handleQuickAddMasterData}
      />
      <InviteExecutorDialog
        isOpen={executorInviteOpen}
        form={executorInviteForm}
        error={executorInviteError}
        saving={executorInviteSaving}
        onClose={() => {
          setExecutorInviteError(undefined);
          setExecutorInviteOpen(false);
        }}
        onSubmit={handleExecutorInvite}
        onChange={(field, value) => {
          setExecutorInviteError(undefined);
          setExecutorInviteFormValue(field, value);
        }}
      />
      <ConfirmationDialog
        isOpen={budgetConflictDialogOpen}
        title="Budget conflict"
        description="Project budget must equal the total stage budgets before saving."
        confirmLabel="Review Budget"
        cancelLabel="Close"
        onClose={() => setBudgetConflictDialogOpen(false)}
        onConfirm={() => setBudgetConflictDialogOpen(false)}
        error={
          canViewBudget && hasBudgetConflict && remainingStageBudget !== null
            ? `Project Budget: ${
                Number.isFinite(parsedProjectBudget)
                  ? formatBudgetDisplay(parsedProjectBudget, projectCurrency || "")
                  : "—"
              }\nTotal Stage Budgets: ${formatBudgetDisplay(
                totalStageBudget,
                projectCurrency || "",
              )}\nDifference: ${formatBudgetDisplay(
                Math.abs(remainingStageBudget),
                projectCurrency || "",
              )} ${
                remainingStageBudget < 0 ? "over budget" : "unallocated"
              }`
            : undefined
        }
      />
    </form>
    </section>
  );
}

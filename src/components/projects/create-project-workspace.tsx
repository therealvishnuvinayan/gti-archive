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
import { Download, Loader2, Paperclip, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import {
  createProjectAction,
  updateProjectAction,
} from "@/app/(dashboard)/projects/new/actions";
import {
  initialProjectFormState,
  type ProjectEditorInitialAttachment,
  type ProjectEditorInitialValues,
  type ProjectFormFieldErrors,
  type ProjectFormState,
} from "@/app/(dashboard)/projects/new/project-form-state";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
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

const currencyOptions = ["USD", "AED", "EUR", "GBP", "INR"] as const;

const projectStatusOptions = [
  { value: "ONGOING", label: "Ongoing" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
] as const;

type ProjectStatusValue = (typeof projectStatusOptions)[number]["value"];

type StageForm = {
  id: string;
  name: string;
  budget: string;
  description: string;
};

type CurrencyValue = (typeof currencyOptions)[number];

type MonthPickerProps = {
  label: string;
  value: Date | null;
  onSelect: (date: Date) => void;
  month: Date;
  onMonthChange: (date: Date) => void;
};

type CreateProjectWorkspaceProps = {
  initialCollaborators: CollaboratorRecord[];
  mode?: "create" | "edit";
  initialValues?: ProjectEditorInitialValues;
  action?: (
    previousState: ProjectFormState,
    formData: FormData,
  ) => Promise<ProjectFormState>;
};

type UploadAssetResponse = {
  attachmentId?: string;
  uploadUrl?: string;
  error?: string;
};

function getLocalFileTypeLabel(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : "FILE";
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-[12px] font-medium text-[#ba3f31]">{message}</p>;
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
      project: "full",
      calendar: "limited",
      library: "full",
      archive: "limited",
    },
  };
}

export function CreateProjectWorkspace({
  initialCollaborators,
  mode = "create",
  initialValues,
  action = mode === "edit" ? updateProjectAction : createProjectAction,
}: CreateProjectWorkspaceProps) {
  const router = useRouter();
  const [formState, formAction] = useActionState<ProjectFormState, FormData>(
    action,
    initialProjectFormState,
  );
  const [projectName, setProjectName] = useState(initialValues?.name ?? "");
  const [projectCategory, setProjectCategory] = useState(initialValues?.category ?? "");
  const [projectTag, setProjectTag] = useState(initialValues?.tag ?? "");
  const [projectBudget, setProjectBudget] = useState(initialValues?.budget ?? "");
  const [projectCurrency, setProjectCurrency] = useState<CurrencyValue>(
    initialValues?.currency ?? "USD",
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
          name: stage.name,
          budget: stage.budget,
          description: stage.description,
        }))
      : [{ id: "stage-1", name: "Stage 1", budget: "", description: "" }],
  );
  const [collaborators, setCollaborators] =
    useState<CollaboratorRecord[]>(initialCollaborators);
  const [projectAttachments, setProjectAttachments] = useState<ProjectEditorInitialAttachment[]>(
    initialValues?.attachments ?? [],
  );
  const [pendingProjectFiles, setPendingProjectFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorForm>(
    getDefaultCollaboratorForm(),
  );
  const [collaboratorError, setCollaboratorError] = useState<string>();
  const [collaboratorNotice, setCollaboratorNotice] = useState<string>();
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const handledCreatedProjectIdRef = useRef<string | null>(null);
  const [, startRefresh] = useTransition();
  const isCreateUploadPhase = mode === "create" && Boolean(formState.projectId) && isUploadingAttachments;
  const fieldErrors: ProjectFormFieldErrors = formState.fieldErrors ?? {};

  const overview = useMemo(
    () => ({
      budget: projectBudget ? `${projectBudget} ${projectCurrency}` : "—",
      stages: stages.length,
      started: startDate ? formatDateValue(startDate) : "—",
      deadline: endDate ? formatDateValue(endDate) : "—",
      tag: projectTag || "—",
      status:
        projectStatusOptions.find((option) => option.value === projectStatus)?.label || "—",
      priority: "Medium",
    }),
    [projectBudget, projectCurrency, projectTag, projectStatus, stages.length, startDate, endDate],
  );

  function updateStage(id: string, patch: Partial<StageForm>) {
    setStages((current) =>
      current.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
    );
  }

  function addStage() {
    setStages((current) => [
      ...current,
      {
        id: `stage-${Date.now()}`,
        name: `Stage ${current.length + 1}`,
        budget: "",
        description: "",
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

  function openCollaboratorInvite() {
    setCollaboratorForm(getDefaultCollaboratorForm());
    setCollaboratorError(undefined);
    setDialogOpen(true);
  }

  async function handleCollaboratorInvite() {
    if (!collaboratorForm.name.trim() || !collaboratorForm.email.trim()) {
      setCollaboratorError("Enter both collaborator name and email.");
      return;
    }

    setCollaboratorSaving(true);
    setCollaboratorError(undefined);
    setCollaboratorNotice(undefined);

    try {
      const result = await saveCollaboratorAction(collaboratorForm);

      if ("error" in result) {
        setCollaboratorError(result.error);
        return;
      }

      setCollaborators((current) => [...current, result.collaborator]);
      setCollaboratorNotice(
        result.warning || "Collaborator created and invite processing completed.",
      );
      setDialogOpen(false);
    } catch {
      setCollaboratorError("Unable to save the collaborator right now. Please try again.");
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function handleBudgetChange(value: string) {
    setProjectBudget(value.replace(/[^\d]/g, ""));
  }

  function refreshProjectData() {
    startRefresh(() => {
      router.refresh();
    });
  }

  async function uploadProjectAsset(file: File, projectId: string) {
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

    try {
      for (const file of selectedFiles) {
        await uploadProjectAsset(file, initialValues.id);
      }
      refreshProjectData();
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to upload the project attachments right now.",
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
    if (mode !== "create" || !formState.projectId) {
      return;
    }

    if (handledCreatedProjectIdRef.current === formState.projectId) {
      return;
    }

    handledCreatedProjectIdRef.current = formState.projectId;

    const projectId = formState.projectId;

    if (pendingProjectFiles.length === 0) {
      router.replace(`/projects/${projectId}`);
      return;
    }

    let cancelled = false;

    async function completeQueuedUploads() {
      setIsUploadingAttachments(true);
      setAttachmentError(undefined);

      try {
        for (const file of pendingProjectFiles) {
          await uploadProjectAsset(file, projectId);
        }

        if (cancelled) {
          return;
        }

        setPendingProjectFiles([]);
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
  }, [formState.projectId, mode, pendingProjectFiles, router]);

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
    <form
      action={formAction}
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"
    >
      <input type="hidden" name="startDate" value={startDate ? formatDateValue(startDate) : ""} />
      <input type="hidden" name="endDate" value={endDate ? formatDateValue(endDate) : ""} />
      <input type="hidden" name="currency" value={projectCurrency} />
      <input type="hidden" name="status" value={projectStatus} />
      {mode === "edit" && initialValues ? (
        <input type="hidden" name="projectId" value={initialValues.id} />
      ) : null}
      <input
        type="hidden"
        name="currentStageName"
        value={stages[0]?.name?.trim() || "Stage 1"}
      />
      <input type="hidden" name="stageCount" value={String(stages.length)} />

      <MotionSection>
      <Card className="bg-surface">
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
                  onChange={(event) => setProjectName(event.target.value)}
                  name="name"
                  required
                  placeholder="Enter Project Name....."
                  className="h-[42px] text-[12px]"
                />
                <FieldError message={fieldErrors.name} />
              </label>

              <label className="block">
                <RequiredLabel>Project Category</RequiredLabel>
                <Input
                  value={projectCategory}
                  onChange={(event) => setProjectCategory(event.target.value)}
                  name="category"
                  required
                  placeholder="Enter Project Category....."
                  className="h-[42px] text-[12px]"
                />
                <FieldError message={fieldErrors.category} />
              </label>

              <label className="block">
                <RequiredLabel>Project Budget</RequiredLabel>
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
                    onValueChange={(nextValue) => setProjectCurrency(nextValue as CurrencyValue)}
                  >
                    <SelectTrigger className="h-[42px] w-[108px] text-[12px] font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldError message={fieldErrors.budget || fieldErrors.currency} />
              </label>

              <label className="block">
                <RequiredLabel>Project Tag</RequiredLabel>
                <Input
                  value={projectTag}
                  onChange={(event) => setProjectTag(event.target.value)}
                  name="tag"
                  required
                  placeholder="Enter Project Tag....."
                  className="h-[42px] text-[12px]"
                />
                <FieldError message={fieldErrors.tag} />
              </label>

              <label className="block">
                <RequiredLabel>Project Status</RequiredLabel>
                <Select
                  value={projectStatus}
                  onValueChange={(nextValue) =>
                    setProjectStatus(nextValue as ProjectStatusValue)
                  }
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
                <FieldError message={fieldErrors.status} />
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
                    onChange={(event) => setProjectBrief(event.target.value)}
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
                <FieldError message={fieldErrors.description} />
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
                onSelect={setStartDate}
                month={startMonth}
                onMonthChange={setStartMonth}
              />
              <FieldError message={fieldErrors.startDate} />
            </MotionItem>
            <MotionItem y={8}>
              <MonthPicker
                label="Project End Date *"
                value={endDate}
                onSelect={setEndDate}
                month={endMonth}
                onMonthChange={setEndMonth}
              />
              <FieldError message={fieldErrors.endDate} />
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
                    <Input
                      value={stage.name}
                      onChange={(event) =>
                        updateStage(stage.id, { name: event.target.value })
                      }
                      name="stageNames"
                      required
                      className="min-h-[38px] border-brand text-center text-[14px] font-[500] text-brand"
                    />
                    <FieldError message={fieldErrors.stageNames?.[index]} />
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Budget <span className="text-[#d3554d]">*</span>
                    </p>
                    <Input
                      value={stage.budget}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          budget: event.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      name="stageBudgets"
                      required
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={`Stage ${index + 1} Budget...`}
                      className="mt-3 h-[38px] bg-[#f7faf7] text-[12px]"
                    />
                    <FieldError message={fieldErrors.stageBudgets?.[index]} />
                    <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                      Stage Description <span className="text-[#d3554d]">*</span>
                    </p>
                    <Textarea
                      value={stage.description}
                      onChange={(event) =>
                        updateStage(stage.id, { description: event.target.value })
                      }
                      name="stageDescriptions"
                      required
                      placeholder={`Stage ${index + 1} Description...`}
                      className="mt-3 min-h-[84px] bg-[#f7faf7] text-[12px]"
                    />
                    <FieldError message={fieldErrors.stageDescriptions?.[index]} />
                  </CardContent>
                </Card>
                </MotionItem>
              ))}
            </MotionStaggerGroup>
          </div>
          </MotionSection>
        </CardContent>
      </Card>
      </MotionSection>

      <MotionStaggerGroup className="space-y-4" stagger={0.05}>
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
          {collaboratorNotice ? (
            <div className="mb-4 rounded-[16px] border border-[#d8e7d9] bg-[#f6fbf7] px-4 py-3 text-[12px] text-brand">
              {collaboratorNotice}
            </div>
          ) : null}

          <div className="space-y-3">
            {collaborators.length > 0 ? (
              collaborators.map((collaborator) => (
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
                        {collaborator.email}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {collaborator.type}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-[#7a837b]">
                No collaborators invited yet.
              </p>
            )}

            <Button
              type="button"
              onClick={openCollaboratorInvite}
              variant="ghost"
              size="sm"
              className="px-0 text-[14px] font-[600] text-brand"
            >
              Invite+
            </Button>
          </div>

          <Separator className="mt-6" />
          <CreateProjectSubmitButton
            mode={mode}
            uploadPhase={isCreateUploadPhase ? "uploading-assets" : null}
          />
          </CardContent>
        </Card>
        </MotionItem>
      </MotionStaggerGroup>

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
    </form>
  );
}

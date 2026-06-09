"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  libraryUploadCategoryOptions,
  type LibraryUploadCategory,
  type LibraryUploadMetadata,
  type LibraryUploadProjectOption,
} from "@/lib/library-shared";
import { dismissToast, showErrorToast, showWarningToast } from "@/lib/toast";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

const ACCEPTED_FILE_TYPES = PROJECT_ASSET_ALLOWED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "uploaded"
  | "error";

type PendingFile = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
};

type UploadAssetsButtonProps = {
  canUploadAssets: boolean;
  disabledReason?: string;
  projects: LibraryUploadProjectOption[];
};

type UploadAssetResponse = {
  attachmentId?: string;
  uploadUrl?: string;
  error?: string;
} & Partial<UploadFileTypeErrorPayload>;

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function getStatusLabel(status: UploadStatus) {
  switch (status) {
    case "preparing":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "finalizing":
      return "Saving";
    case "uploaded":
      return "Uploaded";
    case "error":
      return "Failed";
    default:
      return "Ready";
  }
}

function buildArchiveViewHref() {
  return "/archives";
}

export function UploadAssetsButton({
  canUploadAssets,
  disabledReason,
  projects,
}: UploadAssetsButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LibraryUploadCategory | "">("");
  const [note, setNote] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string>();

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const hasProjects = projects.length > 0;
  const normalizedProjectQuery = projectSearch.trim().toLowerCase();
  const filteredProjects = normalizedProjectQuery
    ? projects.filter((project) =>
        [project.label, project.tag ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedProjectQuery),
      )
    : projects;

  const queuedFiles = pendingFiles.filter((item) => item.status !== "uploaded");
  const completedCount = pendingFiles.filter((item) => item.status === "uploaded").length;

  function closeModal() {
    if (isUploading) {
      return;
    }

    setIsOpen(false);
    setProjectPickerOpen(false);
    setProjectSearch("");
    setSelectedProjectId("");
    setSelectedCategory("");
    setNote("");
    setPendingFiles([]);
    setFormError(undefined);
    setIsDragging(false);
  }

  function addFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);

    if (nextFiles.length === 0) {
      return;
    }

    setPendingFiles((current) => {
      const existingKeys = new Set(
        current.map((item) => `${item.file.name}-${item.file.size}-${item.file.lastModified}`),
      );

      const additions = nextFiles
        .filter((file) => {
          const key = `${file.name}-${file.size}-${file.lastModified}`;
          return !existingKeys.has(key);
        })
        .map((file) => ({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: "queued" as const,
        }));

      return [...current, ...additions];
    });
  }

  function updatePendingFile(
    pendingFileId: string,
    updater: (current: PendingFile) => PendingFile,
  ) {
    setPendingFiles((current) =>
      current.map((item) => (item.id === pendingFileId ? updater(item) : item)),
    );
  }

  function removePendingFile(pendingFileId: string) {
    if (isUploading) {
      return;
    }

    setPendingFiles((current) => current.filter((item) => item.id !== pendingFileId));
  }

  async function uploadSingleFile(
    pendingFile: PendingFile,
    metadata: LibraryUploadMetadata,
  ) {
    updatePendingFile(pendingFile.id, (current) => ({
      ...current,
      status: "preparing",
      error: undefined,
    }));

    const uploadRequest = await fetch("/api/archives/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: selectedProjectId,
        originalFileName: pendingFile.file.name,
        mimeType: pendingFile.file.type || "application/octet-stream",
        fileSize: pendingFile.file.size,
      }),
    });

    const uploadPayload = (await uploadRequest.json()) as UploadAssetResponse;

    if (!uploadRequest.ok || !uploadPayload.attachmentId || !uploadPayload.uploadUrl) {
      throw new Error(
        getUploadErrorMessage(uploadPayload, "Unable to prepare the archive upload."),
      );
    }

    try {
      updatePendingFile(pendingFile.id, (current) => ({
        ...current,
        status: "uploading",
      }));

      const putResponse = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": pendingFile.file.type || "application/octet-stream",
        },
        body: pendingFile.file,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed for ${pendingFile.file.name}.`);
      }

      updatePendingFile(pendingFile.id, (current) => ({
        ...current,
        status: "finalizing",
      }));

      const completeResponse = await fetch("/api/archives/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attachmentId: uploadPayload.attachmentId,
          projectId: selectedProjectId,
          metadata,
        }),
      });

      const completePayload = (await completeResponse.json()) as { error?: string };

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the archive upload.");
      }

      updatePendingFile(pendingFile.id, (current) => ({
        ...current,
        status: "uploaded",
      }));
    } catch (error) {
      await fetch("/api/archives/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attachmentId: uploadPayload.attachmentId,
          failed: true,
          projectId: selectedProjectId,
        }),
      }).catch(() => undefined);

      throw error;
    }
  }

  async function handleUpload() {
    if (!selectedProjectId) {
      setFormError("Project is required.");
      return;
    }

    if (!selectedCategory) {
      setFormError("File category is required.");
      return;
    }

    if (queuedFiles.length === 0) {
      setFormError("Please select at least one file.");
      return;
    }

    setFormError(undefined);
    setIsUploading(true);

    const loadingToastId = toast.loading("Uploading to Archive...", {
      description: `Preparing ${queuedFiles.length} file${queuedFiles.length === 1 ? "" : "s"}.`,
    });

    const metadata: LibraryUploadMetadata = {
      source: "dashboard-archive-upload",
      category: selectedCategory,
      note: note.trim() || undefined,
    };

    let uploadedCount = 0;
    let failedCount = 0;

    for (const pendingFile of queuedFiles) {
      try {
        await uploadSingleFile(pendingFile, metadata);
        uploadedCount += 1;
      } catch (error) {
        failedCount += 1;
        updatePendingFile(pendingFile.id, (current) => ({
          ...current,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Unable to upload this file right now.",
        }));
      }
    }

    dismissToast(loadingToastId);
    setIsUploading(false);

    if (uploadedCount > 0 && failedCount === 0) {
      closeModal();
      toast.success(
        `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded to Archive.`,
        {
          description: selectedProject
            ? `Files were added to ${selectedProject.label} in Archives.`
            : "Files were added to Archives successfully.",
          action: {
            label: "View Archives",
            onClick: () => router.push(buildArchiveViewHref()),
          },
        },
      );
      return;
    }

    if (uploadedCount > 0) {
      showWarningToast(
        "Some files were uploaded.",
        `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} succeeded and ${failedCount} failed.`,
      );
      return;
    }

    showErrorToast(
      "Upload failed.",
      failedCount > 0
        ? "None of the selected files were uploaded. Review the errors and try again."
        : "Unable to upload the selected files right now.",
    );
  }

  return (
    <>
      <div title={!canUploadAssets ? disabledReason : "Upload to Archive"}>
        <Button
          type="button"
          size="lg"
          onClick={() => {
            if (!canUploadAssets) {
              return;
            }

            setIsOpen(true);
          }}
          disabled={!canUploadAssets}
          variant="secondary"
          className="min-h-[54px] rounded-full border border-brand bg-white px-8 text-[17px] font-medium text-brand transition-colors hover:bg-brand-soft"
        >
          + Upload to Archive
        </Button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[920px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardContent className="p-6 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                    Upload to Archive
                  </h2>
                  <p className="mt-1 text-[14px] text-[#6a706b]">
                    Add files directly to an existing project archive.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={closeModal}
                  disabled={isUploading}
                  className="shrink-0 border border-line"
                  aria-label="Close upload to archive dialog"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {formError ? (
                <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[16px] font-[600] text-brand">
                      Project <span className="text-[#d3554d]">*</span>
                    </label>
                    {hasProjects ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setProjectPickerOpen((current) => !current)}
                          disabled={isUploading}
                          className="flex min-h-[48px] w-full items-center justify-between rounded-[20px] border border-line bg-white px-4 text-left text-[14px] shadow-[0_10px_24px_rgba(18,34,25,0.04)]"
                        >
                          <span className={selectedProject ? "text-[#18211a]" : "text-[#8d968f]"}>
                            {selectedProject
                              ? selectedProject.tag
                                ? `${selectedProject.label} • ${selectedProject.tag}`
                                : selectedProject.label
                              : "Select project"}
                          </span>
                          <FolderOpen className="h-4 w-4 text-[#6d766f]" />
                        </button>

                        {projectPickerOpen ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-10 rounded-[24px] border border-[#dfe7df] bg-white p-4 shadow-[0_24px_60px_rgba(16,30,22,0.12)]">
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e978f]" />
                              <Input
                                value={projectSearch}
                                onChange={(event) => setProjectSearch(event.target.value)}
                                placeholder="Search projects..."
                                className="rounded-2xl border border-line pl-11"
                                disabled={isUploading}
                              />
                            </div>

                            <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                              {filteredProjects.length > 0 ? (
                                filteredProjects.map((project) => (
                                  <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedProjectId(project.id);
                                      setProjectPickerOpen(false);
                                      setProjectSearch("");
                                      setFormError(undefined);
                                    }}
                                    className={`w-full rounded-[18px] border px-4 py-3 text-left transition-colors ${
                                      selectedProjectId === project.id
                                        ? "border-brand bg-[#f4faf6]"
                                        : "border-[#e3e8e2] bg-white hover:bg-[#fbfcfa]"
                                    }`}
                                  >
                                    <p className="text-[14px] font-[600] text-[#1f2923]">
                                      {project.label}
                                    </p>
                                    <p className="mt-1 text-[12px] text-[#7f877f]">
                                      {project.tag ? project.tag : "Archived project"}
                                    </p>
                                  </button>
                                ))
                              ) : (
                                <div className="rounded-[18px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-4 py-6 text-center text-[13px] text-[#748078]">
                                  No matching projects found.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-5 py-6 text-[14px] text-[#657068]">
                        No archived projects available. Complete and archive a project before uploading files.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-[16px] font-[600] text-brand">
                      File Category <span className="text-[#d3554d]">*</span>
                    </label>
                    <Select
                      value={selectedCategory}
                      onValueChange={(value) => {
                        setSelectedCategory(value as LibraryUploadCategory);
                        setFormError(undefined);
                      }}
                      disabled={isUploading}
                    >
                      <SelectTrigger className="rounded-2xl border border-line">
                        <SelectValue placeholder="Select file category" />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        {libraryUploadCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[16px] font-[600] text-brand">
                      Optional Note / Description
                    </label>
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add a short note about these files."
                      className="min-h-[108px] rounded-[20px] border border-line"
                      disabled={isUploading}
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[16px] font-[600] text-brand">
                      Files <span className="text-[#d3554d]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!isUploading) {
                          setIsDragging(true);
                        }
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setIsDragging(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDragging(false);

                        if (isUploading) {
                          return;
                        }

                        addFiles(event.dataTransfer.files);
                        setFormError(undefined);
                      }}
                      disabled={isUploading}
                      className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-[26px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
                        isDragging
                          ? "border-brand bg-[#f3faf5]"
                          : "border-[#d8e3d8] bg-[#fbfcfa] hover:bg-[#f7faf7]"
                      }`}
                    >
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-[#edf4ee] text-brand">
                        <Upload className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-[16px] font-[700] text-[#162019]">
                        Drag and drop files here
                      </p>
                      <p className="mt-2 text-[13px] leading-6 text-[#748078]">
                        Or click to select multiple files for Archive upload.
                      </p>
                      <p className="mt-3 text-[12px] text-[#8b948d]">
                        Supported: PNG, JPG, GIF, WEBP, PDF, AI, PSD, ZIP, DOC, XLS, PPT
                      </p>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files) {
                          addFiles(event.target.files);
                          setFormError(undefined);
                        }

                        event.target.value = "";
                      }}
                    />
                  </div>

                  <div className="rounded-[22px] border border-[#e4ebe4] bg-white p-4 shadow-[0_12px_30px_rgba(18,34,25,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-[700] text-[#18211a]">
                          Selected files
                        </p>
                        <p className="mt-1 text-[12px] text-[#7a847c]">
                          {pendingFiles.length > 0
                            ? `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} selected`
                            : "No files selected yet."}
                        </p>
                      </div>
                      {isUploading ? (
                        <span className="rounded-full border border-[#d5e6d8] bg-[#f4faf6] px-3 py-1 text-[11px] font-[700] uppercase tracking-[0.08em] text-[#2f8d5d]">
                          {completedCount}/{pendingFiles.length} uploaded
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 max-h-[280px] space-y-3 overflow-y-auto pr-1">
                      {pendingFiles.length > 0 ? (
                        pendingFiles.map((pendingFile) => (
                          <div
                            key={pendingFile.id}
                            className="rounded-[18px] border border-[#e5ebe5] bg-[#fbfcfa] px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-[600] text-[#1c2620]">
                                  {pendingFile.file.name}
                                </p>
                                <p className="mt-1 text-[12px] text-[#7d887f]">
                                  {formatFileSize(pendingFile.file.size)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-[700] uppercase tracking-[0.08em] ${
                                    pendingFile.status === "uploaded"
                                      ? "bg-[#e9f7ed] text-[#2f8d5d]"
                                      : pendingFile.status === "error"
                                        ? "bg-[#fff1ef] text-[#c2463c]"
                                        : "bg-[#eef2ed] text-[#5f6b63]"
                                  }`}
                                >
                                  {getStatusLabel(pendingFile.status)}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removePendingFile(pendingFile.id)}
                                  disabled={isUploading}
                                  className="h-8 w-8 rounded-full"
                                  aria-label={`Remove ${pendingFile.file.name}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            {pendingFile.error ? (
                              <p className="mt-2 text-[12px] text-[#bb4d49]">
                                {pendingFile.error}
                              </p>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-4 py-8 text-center text-[13px] text-[#748078]">
                          Add files to start the upload.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={isUploading}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || !hasProjects}
                >
                  {isUploading ? "Uploading..." : "Upload to Archive"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

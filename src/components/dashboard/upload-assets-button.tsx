"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AssetTagSelector } from "@/components/assets/asset-tag-selector";
import {
  ArchiveMetadataIdentificationStep,
  ArchiveMetadataReviewList,
  ArchiveMetadataTechnicalStep,
  type ArchiveMetadataWizardFile,
} from "@/components/archives/archive-artwork-metadata-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  archiveDirectUploadWizardSteps,
  buildDirectArchiveArtworkMetadataDraft,
  getArchiveArtworkMetadataMissingCount,
  getArchiveMetadataFileExtension,
  type ArchiveArtworkMetadataDraft,
  type ArchiveArtworkMetadataFieldKey,
} from "@/lib/archive-artwork-metadata";
import { dismissToast, showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

const ACCEPTED_FILE_TYPES = PROJECT_ASSET_ALLOWED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

type ArchiveCategoryOption = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parentName: string | null;
};

type ArchiveUploadButtonProps = {
  canUploadAssets: boolean;
  disabledReason?: string;
  defaultCategoryId?: string;
  buttonLabel?: string;
  currentUserDisplayName?: string;
};

type ArchiveUploadResponse = {
  archiveFileId?: string;
  uploadUrl?: string;
  archiveCategorySlug?: string;
  error?: string;
} & Partial<UploadFileTypeErrorPayload>;

type ArchiveCategoriesResponse = {
  categories?: ArchiveCategoryOption[];
  error?: string;
};

type DirectArchiveWizardStep = 0 | 1 | 2 | 3;

type DirectArchiveFile = {
  id: string;
  file: File;
  finalArchiveFileName: string;
  metadata: ArchiveArtworkMetadataDraft;
};

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileNameError(input: {
  originalFileName: string;
  finalArchiveFileName: string;
  duplicateNames: Set<string>;
}) {
  const finalName = input.finalArchiveFileName.trim();

  if (!finalName) {
    return "Archive file name is required.";
  }

  const originalExtension = getArchiveMetadataFileExtension(input.originalFileName);
  const nextExtension = getArchiveMetadataFileExtension(finalName);

  if (originalExtension && nextExtension !== originalExtension) {
    return `Keep the .${originalExtension.toLowerCase()} extension for this file.`;
  }

  if (!originalExtension && nextExtension) {
    return "Use the original file extension format for this archive file.";
  }

  const normalized = finalName.toLowerCase();

  if (input.duplicateNames.has(normalized)) {
    return "Archive file names must be unique.";
  }

  input.duplicateNames.add(normalized);
  return null;
}

function buildWizardFile(file: DirectArchiveFile): ArchiveMetadataWizardFile {
  return {
    id: file.id,
    originalFileName: file.file.name,
    metadata: file.metadata,
  };
}

export function ArchiveUploadButton({
  canUploadAssets,
  defaultCategoryId,
  buttonLabel = "Upload to Archive",
  currentUserDisplayName = "Current user",
}: ArchiveUploadButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<DirectArchiveWizardStep>(0);
  const [categories, setCategories] = useState<ArchiveCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId ?? "",
  );
  const [assetTagIds, setAssetTagIds] = useState<string[]>([]);
  const [files, setFiles] = useState<DirectArchiveFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string>();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function loadCategories() {
      setCategoriesLoading(true);

      try {
        const response = await fetch("/api/archive-categories", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ArchiveCategoriesResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load archive categories.");
        }

        if (!cancelled) {
          const nextCategories = payload.categories ?? [];
          setCategories(nextCategories);
          setSelectedCategoryId((current) => {
            if (current && nextCategories.some((category) => category.id === current)) {
              return current;
            }

            return defaultCategoryId &&
              nextCategories.some((category) => category.id === defaultCategoryId)
              ? defaultCategoryId
              : "";
          });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load archive categories.";
          setFormError(message);
        }
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [defaultCategoryId, isOpen]);

  const wizardFiles = useMemo(() => files.map(buildWizardFile), [files]);
  const fileNameErrors = useMemo(() => {
    const duplicateNames = new Set<string>();

    return Object.fromEntries(
      files.map((archiveFile) => [
        archiveFile.id,
        getFileNameError({
          originalFileName: archiveFile.file.name,
          finalArchiveFileName: archiveFile.finalArchiveFileName,
          duplicateNames,
        }),
      ]),
    ) as Record<string, string | null>;
  }, [files]);
  const hasFileNameErrors = Object.values(fileNameErrors).some(Boolean);
  const missingMetadataCount = files.reduce(
    (count, archiveFile) =>
      count + getArchiveArtworkMetadataMissingCount(archiveFile.metadata),
    0,
  );
  const canContinueFromFiles =
    files.length > 0 &&
    Boolean(selectedCategoryId) &&
    !hasFileNameErrors &&
    categories.length > 0;
  const canArchive =
    canContinueFromFiles && missingMetadataCount === 0 && !isUploading && !categoriesLoading;

  if (!canUploadAssets) {
    return null;
  }

  function openModal() {
    if (!canUploadAssets) {
      return;
    }

    setSelectedCategoryId(defaultCategoryId ?? "");
    setIsOpen(true);
  }

  function closeModal(force = false) {
    if (isUploading && !force) {
      return;
    }

    setIsOpen(false);
    setWizardStep(0);
    setSelectedCategoryId(defaultCategoryId ?? "");
    setAssetTagIds([]);
    setFiles([]);
    setIsDragging(false);
    setFormError(undefined);
  }

  function addFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);

    if (nextFiles.length === 0) {
      return;
    }

    const uploadedAt = new Date();

    setFiles((current) => [
      ...current,
      ...nextFiles.map((file) => ({
        id: createLocalId(),
        file,
        finalArchiveFileName: file.name,
        metadata: buildDirectArchiveArtworkMetadataDraft({
          fileName: file.name,
          uploadedAt,
          createdByName: currentUserDisplayName,
        }),
      })),
    ]);
    setFormError(undefined);
  }

  function removeFile(fileId: string) {
    setFiles((current) => current.filter((file) => file.id !== fileId));
  }

  function updateFileName(fileId: string, nextName: string) {
    setFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? {
              ...file,
              finalArchiveFileName: nextName,
            }
          : file,
      ),
    );
  }

  function updateArchiveMetadataField(
    fileId: string,
    field: ArchiveArtworkMetadataFieldKey,
    value: string,
  ) {
    setFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? {
              ...file,
              metadata: {
                ...file.metadata,
                [field]: value,
              },
            }
          : file,
      ),
    );
  }

  async function uploadArchiveFile(archiveFile: DirectArchiveFile) {
    const uploadRequest = await fetch("/api/archives/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: archiveFile.finalArchiveFileName,
        originalFileName: archiveFile.file.name,
        mimeType: archiveFile.file.type || "application/octet-stream",
        fileSize: archiveFile.file.size,
        projectName:
          archiveFile.metadata.campaignProject || archiveFile.metadata.titleWorkingName,
        projectCreatedBy: archiveFile.metadata.createdByName,
        archiveCategoryId: selectedCategoryId,
        assetTagIds,
        projectDate: archiveFile.metadata.creationDate,
      }),
    });

    const uploadPayload = (await uploadRequest.json()) as ArchiveUploadResponse;

    if (!uploadRequest.ok || !uploadPayload.archiveFileId || !uploadPayload.uploadUrl) {
      throw new Error(
        getUploadErrorMessage(uploadPayload, "Unable to prepare the archive upload."),
      );
    }

    try {
      const putResponse = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": archiveFile.file.type || "application/octet-stream",
        },
        body: archiveFile.file,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed for ${archiveFile.file.name}.`);
      }

      const completeResponse = await fetch("/api/archives/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveFileId: uploadPayload.archiveFileId,
          finalArchiveFileName: archiveFile.finalArchiveFileName,
          archiveCategoryId: selectedCategoryId,
          artworkMetadata: archiveFile.metadata,
        }),
      });

      const completePayload = (await completeResponse.json()) as ArchiveUploadResponse;

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the archive upload.");
      }

      return completePayload.archiveCategorySlug;
    } catch (error) {
      await fetch("/api/archives/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveFileId: uploadPayload.archiveFileId,
          failed: true,
        }),
      }).catch(() => undefined);

      throw error;
    }
  }

  async function handleArchiveUpload() {
    if (!canArchive) {
      if (files.length === 0) {
        setFormError("Choose at least one file to archive.");
      } else if (!selectedCategoryId) {
        setFormError("Choose an archive category before uploading.");
      } else if (hasFileNameErrors) {
        setFormError("Fix the archive file names before uploading.");
      } else if (missingMetadataCount > 0) {
        setFormError("Complete required archive metadata before uploading.");
      }
      return;
    }

    setFormError(undefined);
    setIsUploading(true);

    const loadingToastId = toast.loading("Uploading to Archive...", {
      description:
        files.length === 1 ? files[0].file.name : `${files.length} archive files`,
    });
    let archiveCategorySlug: string | undefined;

    try {
      for (const archiveFile of files) {
        const slug = await uploadArchiveFile(archiveFile);
        archiveCategorySlug = slug ?? archiveCategorySlug;
      }

      dismissToast(loadingToastId);
      closeModal(true);
      router.refresh();
      showSuccessToast(
        "Uploaded to Archive.",
        files.length === 1
          ? `${files[0].finalArchiveFileName.trim()} is now available in Archives.`
          : `${files.length} files are now available in Archives.`,
      );
    } catch (error) {
      dismissToast(loadingToastId);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to upload these files right now.";
      setFormError(message);
      showErrorToast("Upload failed.", message);
      return;
    } finally {
      setIsUploading(false);
    }

    if (archiveCategorySlug) {
      router.push(`/archives/${archiveCategorySlug}`);
    }
  }

  function renderFilesStep() {
    return (
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 rounded-[20px] border border-line bg-[#fbfcfa] p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
              Direct Archive Upload
            </p>
            <p className="mt-1 text-[16px] font-semibold text-[#111712]">
              Upload final or historical files directly to Archives.
            </p>
            <p className="mt-1 text-[13px] leading-5 text-[#687269]">
              Direct uploads do not require project completion, but they still require
              archive permission, category, valid file names, and Artwork Legend metadata.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
              Archive Category *
            </p>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
              disabled={isUploading || categoriesLoading || categories.length === 0}
            >
              <SelectTrigger className="h-11 rounded-[14px] border border-line">
                <SelectValue
                  placeholder={
                    categoriesLoading
                      ? "Loading categories..."
                      : categories.length === 0
                        ? "No categories available"
                        : "Choose archive category"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.parentName
                      ? `${category.parentName} / ${category.name}`
                      : category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
            Files <span className="text-[#d3554d]">*</span>
          </span>
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

              if (!isUploading) {
                addFiles(event.dataTransfer.files);
              }
            }}
            disabled={isUploading}
            className={`flex min-h-[150px] w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-5 py-6 text-center transition-colors ${
              isDragging
                ? "border-brand bg-[#f3faf5]"
                : "border-[#d8e3d8] bg-[#fbfcfa] hover:bg-[#f7faf7]"
            }`}
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[#edf4ee] text-brand">
              <FileUp className="h-5 w-5" />
            </div>
            <p className="mt-3 text-[15px] font-[700] text-[#162019]">
              Drop files here or click to browse
            </p>
            <p className="mt-1 text-[12px] text-[#748078]">
              Supported: JPG, PNG, WebP, GIF, PDF, AI, PSD, ZIP, RAR, DOCX, XLSX, PPTX
            </p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
              }
              event.target.value = "";
            }}
          />
        </div>

        {files.length > 0 ? (
          <div className="space-y-3">
            {files.map((archiveFile) => {
              const inlineError = fileNameErrors[archiveFile.id];

              return (
                <div
                  key={archiveFile.id}
                  className="rounded-[20px] border border-[#dbe4dc] bg-white p-4 shadow-[0_10px_26px_rgba(16,26,20,0.05)]"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-[#edf7ef] px-2 text-[10px] font-semibold text-[#24744e]">
                          {getArchiveMetadataFileExtension(archiveFile.file.name) || "FILE"}
                        </span>
                        <p className="truncate text-[14px] font-semibold text-[#111712]">
                          {archiveFile.file.name}
                        </p>
                      </div>
                      <p className="mt-2 text-[12px] text-[#667168]">
                        {formatFileSize(archiveFile.file.size)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#70806f]">
                        Final Archive File Name *
                      </p>
                      <Input
                        value={archiveFile.finalArchiveFileName}
                        onChange={(event) =>
                          updateFileName(archiveFile.id, event.target.value)
                        }
                        disabled={isUploading}
                        className={`h-11 rounded-[14px] border ${
                          inlineError ? "border-[#df6f66]" : "border-line"
                        }`}
                      />
                      <p
                        className={`text-[11px] ${
                          inlineError ? "text-[#c14f46]" : "text-[#7a837b]"
                        }`}
                      >
                        {inlineError ?? "Keep the original file extension when renaming."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => removeFile(archiveFile.id)}
                      disabled={isUploading}
                      aria-label={`Remove ${archiveFile.file.name}`}
                      className="border border-line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-[20px] border border-line bg-[#fbfcfa] p-4">
          <AssetTagSelector
            value={assetTagIds}
            onChange={setAssetTagIds}
            disabled={isUploading}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div title={buttonLabel}>
        <Button
          type="button"
          size="lg"
          onClick={openModal}
          variant="secondary"
          className="min-h-[54px] rounded-full border border-brand bg-white px-8 text-[17px] font-medium text-brand transition-colors hover:bg-brand-soft"
        >
          <Upload className="h-4.5 w-4.5" />
          {buttonLabel}
        </Button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="flex h-full max-h-[88vh] w-full max-w-[1080px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
                  Upload to Archive
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Upload files directly to Archives with the same Artwork Legend
                  metadata used by final project archive.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => closeModal()}
                disabled={isUploading}
                className="shrink-0 border border-line"
                aria-label="Close upload to archive dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
                {formError ? (
                  <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                    {formError}
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-4">
                  {archiveDirectUploadWizardSteps.map((step, index) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setWizardStep(index as DirectArchiveWizardStep)}
                      className={`rounded-[16px] border px-3 py-3 text-left transition ${
                        wizardStep === index
                          ? "border-brand bg-[#eef8f0] text-[#173120]"
                          : "border-[#dce6dd] bg-white text-[#5f6b62] hover:border-brand/50"
                      }`}
                      disabled={isUploading}
                    >
                      <span className="block text-[10px] font-[800] uppercase tracking-[0.08em]">
                        Step {index + 1}
                      </span>
                      <span className="mt-1 block text-[13px] font-[800]">{step}</span>
                    </button>
                  ))}
                </div>

                {wizardStep === 0 ? renderFilesStep() : null}

                {wizardStep === 1 ? (
                  <div className="mt-5">
                    <ArchiveMetadataIdentificationStep
                      files={wizardFiles}
                      onChange={updateArchiveMetadataField}
                      disabled={isUploading}
                      title="Identification & Classification"
                      description="Complete Artwork Legend identification for each direct archive file."
                    />
                  </div>
                ) : null}

                {wizardStep === 2 ? (
                  <div className="mt-5">
                    <ArchiveMetadataTechnicalStep
                      files={wizardFiles}
                      onChange={updateArchiveMetadataField}
                      disabled={isUploading}
                    />
                  </div>
                ) : null}

                {wizardStep === 3 ? (
                  <div className="mt-5">
                    <ArchiveMetadataReviewList
                      files={wizardFiles}
                      getFinalFileName={(file) =>
                        files.find((candidate) => candidate.id === file.id)
                          ?.finalArchiveFileName ?? file.originalFileName
                      }
                      onEditMetadata={() => setWizardStep(1)}
                      missingMetadataCount={missingMetadataCount}
                      fileCountLabel={`${files.length} direct files`}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 border-t border-[#e3ebe4] bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <p className="text-[12px] leading-5 text-[#687269]">
                  Direct uploads are stored as archive records. Project completion
                  blockers only apply to project final archive mode.
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => closeModal()}
                    disabled={isUploading}
                  >
                    Cancel
                  </Button>
                  {wizardStep > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isUploading}
                      onClick={() =>
                        setWizardStep(
                          (current) =>
                            Math.max(0, current - 1) as DirectArchiveWizardStep,
                        )
                      }
                    >
                      Previous
                    </Button>
                  ) : null}
                  {wizardStep < 3 ? (
                    <Button
                      type="button"
                      disabled={
                        isUploading ||
                        categoriesLoading ||
                        (wizardStep === 0 && !canContinueFromFiles)
                      }
                      onClick={() =>
                        setWizardStep(
                          (current) =>
                            Math.min(3, current + 1) as DirectArchiveWizardStep,
                        )
                      }
                    >
                      Next
                    </Button>
                  ) : null}
                  {wizardStep === 3 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        void handleArchiveUpload();
                      }}
                      disabled={!canArchive}
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Archive Upload
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

export { ArchiveUploadButton as UploadAssetsButton };

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileUp, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AssetTagSelector } from "@/components/assets/asset-tag-selector";
import {
  CalendarMonthGrid,
  formatCalendarDateValue,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
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
import { dismissToast, showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

const ACCEPTED_FILE_TYPES = PROJECT_ASSET_ALLOWED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");
const NO_CATEGORY = "__no_archive_category__";

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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function getNameWithoutExtension(fileName: string) {
  const extensionStart = fileName.lastIndexOf(".");
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
}

function getDatePickerMonth(value: string) {
  if (!value) {
    return new Date();
  }

  const date = parseCalendarDateValue(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateDisplay(value: string) {
  if (!value) {
    return "Select date";
  }

  const date = parseCalendarDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return "Select date";
  }

  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function ArchiveProjectDateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => getDatePickerMonth(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDate = getDatePickerMonth(value);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-slot^="select-"]')) {
        return;
      }

      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const nextMonth = getDatePickerMonth(value);
          setMonth(nextMonth);
          setOpen((current) => !current);
        }}
        disabled={disabled}
        className="h-11 w-full justify-between rounded-2xl border border-line bg-white px-4 text-left text-[14px] font-normal text-[#18211a] shadow-none hover:bg-white"
      >
        <span className={value ? "text-[#18211a]" : "text-[#9aa39b]"}>
          {formatDateDisplay(value)}
        </span>
        <CalendarDays className="h-4 w-4 text-brand" />
      </Button>

      {open ? (
        <Card className="absolute left-0 top-[calc(100%+8px)] z-[140] w-[320px] max-w-[calc(100vw-64px)] rounded-[22px] border border-line p-4 shadow-[0_20px_50px_rgba(23,39,28,0.16)]">
          <CalendarMonthGrid
            month={month}
            selectedDate={selectedDate}
            onMonthChange={setMonth}
            onSelect={(date) => {
              onChange(formatCalendarDateValue(date));
              setMonth(date);
              setOpen(false);
            }}
            compact
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-[12px] text-[#6a706b]"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-[12px]"
              onClick={() => {
                const today = new Date();
                onChange(formatCalendarDateValue(today));
                setMonth(today);
                setOpen(false);
              }}
            >
              Today
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function ArchiveUploadButton({
  canUploadAssets,
  disabledReason,
  defaultCategoryId,
  buttonLabel = "Upload to Archive",
}: ArchiveUploadButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectCreatedBy, setProjectCreatedBy] = useState("");
  const [categories, setCategories] = useState<ArchiveCategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId ?? NO_CATEGORY,
  );
  const [assetTagIds, setAssetTagIds] = useState<string[]>([]);
  const [projectDate, setProjectDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
          setCategories(payload.categories ?? []);
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
  }, [isOpen]);

  function openModal() {
    if (!canUploadAssets) {
      return;
    }

    setSelectedCategoryId(defaultCategoryId ?? NO_CATEGORY);
    setIsOpen(true);
  }

  function closeModal(force = false) {
    if (isUploading && !force) {
      return;
    }

    setIsOpen(false);
    setFileName("");
    setProjectName("");
    setProjectCreatedBy("");
    setSelectedCategoryId(defaultCategoryId ?? NO_CATEGORY);
    setAssetTagIds([]);
    setProjectDate("");
    setSelectedFile(null);
    setIsDragging(false);
    setFormError(undefined);
  }

  function setUploadFile(file: File | null) {
    setSelectedFile(file);
    setFormError(undefined);

    if (file && !fileName.trim()) {
      setFileName(getNameWithoutExtension(file.name));
    }
  }

  async function handleUpload() {
    if (!fileName.trim()) {
      setFormError("File name is required.");
      return;
    }

    if (!selectedFile) {
      setFormError("File upload is required.");
      return;
    }

    setFormError(undefined);
    setIsUploading(true);

    const loadingToastId = toast.loading("Uploading to Archive...", {
      description: selectedFile.name,
    });
    let archiveFileId: string | undefined;
    let archiveCategorySlug: string | undefined;

    try {
      const uploadRequest = await fetch("/api/archives/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName,
          originalFileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          projectName,
          projectCreatedBy,
          archiveCategoryId:
            selectedCategoryId === NO_CATEGORY ? undefined : selectedCategoryId,
          assetTagIds,
          projectDate,
        }),
      });

      const uploadPayload = (await uploadRequest.json()) as ArchiveUploadResponse;

      if (!uploadRequest.ok || !uploadPayload.archiveFileId || !uploadPayload.uploadUrl) {
        throw new Error(
          getUploadErrorMessage(uploadPayload, "Unable to prepare the archive upload."),
        );
      }

      archiveFileId = uploadPayload.archiveFileId;

      const putResponse = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!putResponse.ok) {
        throw new Error(`Upload failed for ${selectedFile.name}.`);
      }

      const completeResponse = await fetch("/api/archives/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveFileId,
        }),
      });

      const completePayload = (await completeResponse.json()) as ArchiveUploadResponse;

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the archive upload.");
      }

      archiveCategorySlug = completePayload.archiveCategorySlug;
      dismissToast(loadingToastId);
      closeModal(true);
      router.refresh();
      showSuccessToast(
        "Uploaded to Archive.",
        `${fileName.trim()} is now available in Archives.`,
      );
    } catch (error) {
      if (archiveFileId) {
        await fetch("/api/archives/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            archiveFileId,
            failed: true,
          }),
        }).catch(() => undefined);
      }

      dismissToast(loadingToastId);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to upload this file right now.";
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

  return (
    <>
      <div title={!canUploadAssets ? disabledReason : buttonLabel}>
        <Button
          type="button"
          size="lg"
          onClick={openModal}
          disabled={!canUploadAssets}
          variant="secondary"
          className="min-h-[54px] rounded-full border border-brand bg-white px-8 text-[17px] font-medium text-brand transition-colors hover:bg-brand-soft"
        >
          <Upload className="h-4.5 w-4.5" />
          {buttonLabel}
        </Button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[760px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardContent className="p-6 sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-[700] text-[#111712]">
                    Upload to Archive
                  </h2>
                  <p className="mt-1 text-[14px] text-[#6a706b]">
                    Add a final or historical file directly to Archives.
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
              </div>

              {formError ? (
                <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    File name <span className="text-[#d3554d]">*</span>
                  </span>
                  <Input
                    value={fileName}
                    onChange={(event) => setFileName(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Final artwork"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Archive category
                  </span>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={setSelectedCategoryId}
                    disabled={isUploading || categoriesLoading}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border border-line">
                      <SelectValue
                        placeholder={
                          categoriesLoading
                            ? "Loading categories..."
                            : "Select archive category"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.parentName
                            ? `${category.parentName} / ${category.name}`
                            : category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Project name
                  </span>
                  <Input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Project created by
                  </span>
                  <Input
                    value={projectCreatedBy}
                    onChange={(event) => setProjectCreatedBy(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Optional"
                  />
                </label>

                <AssetTagSelector
                  value={assetTagIds}
                  onChange={setAssetTagIds}
                  disabled={isUploading}
                />

                <div>
                  <span className="mb-2 flex items-center gap-1.5 text-[13px] font-[700] text-[#2d372f]">
                    <CalendarDays className="h-3.5 w-3.5 text-brand" />
                    Date of project
                  </span>
                  <ArchiveProjectDateField
                    value={projectDate}
                    onChange={setProjectDate}
                    disabled={isUploading}
                  />
                </div>
              </div>

              <div className="mt-5">
                <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                  File upload <span className="text-[#d3554d]">*</span>
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
                      setUploadFile(event.dataTransfer.files.item(0));
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
                    {selectedFile ? selectedFile.name : "Drop a file here or click to browse"}
                  </p>
                  <p className="mt-1 text-[12px] text-[#748078]">
                    {selectedFile
                      ? formatFileSize(selectedFile.size)
                      : "Supported: JPG, PNG, WebP, GIF, PDF, AI, PSD, ZIP, RAR, DOCX, XLSX, PPTX"}
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={(event) => {
                    setUploadFile(event.target.files?.item(0) ?? null);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => closeModal()}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleUpload} disabled={isUploading}>
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

export { ArchiveUploadButton as UploadAssetsButton };

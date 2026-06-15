"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload, X } from "lucide-react";
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
} from "@/lib/library-shared";
import { dismissToast, showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

const ACCEPTED_FILE_TYPES = PROJECT_ASSET_ALLOWED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

type LibraryUploadButtonProps = {
  canUploadAssets: boolean;
  disabledReason?: string;
  onUploaded?: () => void | Promise<void>;
};

type LibraryUploadResponse = {
  assetId?: string;
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

function getNameWithoutExtension(fileName: string) {
  const extensionStart = fileName.lastIndexOf(".");
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
}

export function LibraryUploadButton({
  canUploadAssets,
  disabledReason,
  onUploaded,
}: LibraryUploadButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [createdByName, setCreatedByName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LibraryUploadCategory>("PROJECT_ASSET");
  const [tag, setTag] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string>();

  function closeModal(force = false) {
    if (isUploading && !force) {
      return;
    }

    setIsOpen(false);
    setAssetName("");
    setCreatedByName("");
    setDescription("");
    setCategory("PROJECT_ASSET");
    setTag("");
    setSelectedFile(null);
    setIsDragging(false);
    setFormError(undefined);
  }

  function setUploadFile(file: File | null) {
    setSelectedFile(file);
    setFormError(undefined);

    if (file && !assetName.trim()) {
      setAssetName(getNameWithoutExtension(file.name));
    }
  }

  async function handleUpload() {
    if (!assetName.trim()) {
      setFormError("Asset name is required.");
      return;
    }

    if (!selectedFile) {
      setFormError("File upload is required.");
      return;
    }

    setFormError(undefined);
    setIsUploading(true);

    const loadingToastId = toast.loading("Uploading to Library...", {
      description: selectedFile.name,
    });
    let assetId: string | undefined;

    try {
      const uploadRequest = await fetch("/api/library/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetName,
          originalFileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          createdByName,
          description,
          category,
          tag,
        }),
      });

      const uploadPayload = (await uploadRequest.json()) as LibraryUploadResponse;

      if (!uploadRequest.ok || !uploadPayload.assetId || !uploadPayload.uploadUrl) {
        throw new Error(
          getUploadErrorMessage(uploadPayload, "Unable to prepare the library upload."),
        );
      }

      assetId = uploadPayload.assetId;

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

      const completeResponse = await fetch("/api/library/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetId,
        }),
      });

      const completePayload = (await completeResponse.json()) as LibraryUploadResponse;

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the library upload.");
      }

      dismissToast(loadingToastId);
      closeModal(true);
      router.refresh();
      await onUploaded?.();
      showSuccessToast("Uploaded to Library.", `${assetName.trim()} is now available in Library.`);
    } catch (error) {
      if (assetId) {
        await fetch("/api/library/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assetId,
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
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <div title={!canUploadAssets ? disabledReason : "Upload to Library"}>
        <Button
          type="button"
          size="lg"
          onClick={() => {
            if (canUploadAssets) {
              setIsOpen(true);
            }
          }}
          disabled={!canUploadAssets}
          className="min-h-[48px] px-6 text-[15px]"
        >
          <Upload className="h-4.5 w-4.5" />
          Upload Asset
        </Button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[760px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardContent className="p-6 sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                    Upload Asset
                  </h2>
                  <p className="mt-1 text-[14px] text-[#6a706b]">
                    Add a working asset directly to Library.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => closeModal()}
                  disabled={isUploading}
                  className="shrink-0 border border-line"
                  aria-label="Close upload asset dialog"
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
                    Asset name <span className="text-[#d3554d]">*</span>
                  </span>
                  <Input
                    value={assetName}
                    onChange={(event) => setAssetName(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Working asset"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Category
                  </span>
                  <Select
                    value={category}
                    onValueChange={(value) => setCategory(value as LibraryUploadCategory)}
                    disabled={isUploading}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border border-line">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      {libraryUploadCategoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Created by / Who done
                  </span>
                  <Input
                    value={createdByName}
                    onChange={(event) => setCreatedByName(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Tag
                  </span>
                  <Input
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                    disabled={isUploading}
                    className="h-11 rounded-2xl border border-line"
                    placeholder="Optional"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="mb-2 block text-[13px] font-[700] text-[#2d372f]">
                    Description
                  </span>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={isUploading}
                    className="min-h-[88px] rounded-2xl border border-line"
                    placeholder="Optional"
                  />
                </label>
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
                  className={`flex min-h-[140px] w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-5 py-6 text-center transition-colors ${
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
                  {isUploading ? "Uploading..." : "Upload Asset"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

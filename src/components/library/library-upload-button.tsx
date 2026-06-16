"use client";

import { useRef, useState } from "react";
import { FileUp, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { AssetTagSelector } from "@/components/assets/asset-tag-selector";
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
  type LibraryItemRecord,
  type LibraryUploadCategory,
} from "@/lib/library-shared";
import type { AssetTagRecord } from "@/lib/asset-tags";
import {
  getDevTimingDurationMs,
  getDevTimingNow,
  logDevTiming,
} from "@/lib/dev-timing";
import {
  dismissToast,
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from "@/lib/toast";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

const ACCEPTED_FILE_TYPES = PROJECT_ASSET_ALLOWED_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");
const SMALL_UPLOAD_RETRY_MAX_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_RETRIES = 2;

type UploadEndpointMode = "regional" | "accelerate";
type LibraryUploadPhase =
  | "requesting-upload-url"
  | "uploading"
  | "stalled"
  | "retrying"
  | "completing"
  | "completed"
  | "failed";

type LibraryUploadState = {
  phase: LibraryUploadPhase;
  attemptNumber: number;
  endpointMode?: UploadEndpointMode;
  uploadHost?: string;
  stalledDurationMs?: number;
  progressPercent: number;
};

type LibraryUploadButtonProps = {
  canUploadAssets: boolean;
  disabledReason?: string;
  assetTagOptions?: AssetTagRecord[];
  onUploaded?: (asset?: LibraryItemRecord | null) => void | Promise<void>;
};

type LibraryUploadResponse = {
  assetId?: string;
  asset?: LibraryItemRecord | null;
  storageKey?: string;
  assetName?: string;
  originalFileName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadUrl?: string;
  uploadHost?: string;
  uploadEndpointMode?: UploadEndpointMode;
  uploadRegion?: string;
  uploadExpiresInSeconds?: number;
  uploadExpectedHeaders?: {
    "Content-Type"?: string;
  };
  error?: string;
} & Partial<UploadFileTypeErrorPayload>;

class UploadZeroProgressStallError extends Error {
  readonly stalledDurationMs: number;
  readonly endpointMode?: UploadEndpointMode;
  readonly uploadHost: string;
  readonly attemptNumber: number;

  constructor({
    stalledDurationMs,
    endpointMode,
    uploadHost,
    attemptNumber,
  }: {
    stalledDurationMs: number;
    endpointMode?: UploadEndpointMode;
    uploadHost: string;
    attemptNumber: number;
  }) {
    super("Upload stalled before any data was sent.");
    this.name = "UploadZeroProgressStallError";
    this.stalledDurationMs = stalledDurationMs;
    this.endpointMode = endpointMode;
    this.uploadHost = uploadHost;
    this.attemptNumber = attemptNumber;
  }
}

function isUploadZeroProgressStallError(
  error: unknown,
): error is UploadZeroProgressStallError {
  return error instanceof UploadZeroProgressStallError;
}

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

function getUploadEndpointModeOverride(): UploadEndpointMode | undefined {
  const value = window.localStorage.getItem("gti:s3-upload-endpoint-mode");

  return value === "regional" || value === "accelerate" ? value : undefined;
}

function getAlternateEndpointMode(endpointMode?: UploadEndpointMode): UploadEndpointMode {
  return endpointMode === "regional" ? "accelerate" : "regional";
}

function getUploadStateLabel(uploadState: LibraryUploadState | null) {
  if (!uploadState) {
    return null;
  }

  if (uploadState.phase === "requesting-upload-url") {
    return "Preparing upload...";
  }

  if (uploadState.phase === "uploading") {
    return `${uploadState.progressPercent}% uploaded`;
  }

  if (uploadState.phase === "stalled" || uploadState.phase === "retrying") {
    return "Upload connection is slow. Retrying...";
  }

  if (uploadState.phase === "completing") {
    return "Finishing upload...";
  }

  if (uploadState.phase === "completed") {
    return "Upload complete";
  }

  if (uploadState.phase === "failed") {
    return "Upload failed";
  }

  return null;
}

function getUploadTimeoutMs(fileSize: number) {
  if (fileSize < SMALL_UPLOAD_RETRY_MAX_BYTES) {
    return 60_000;
  }

  const fileSizeMb = Math.ceil(fileSize / (1024 * 1024));

  return Math.max(60_000, fileSizeMb * 15_000);
}

function getUploadStallWarningMs(fileSize: number) {
  if (fileSize < SMALL_UPLOAD_RETRY_MAX_BYTES) {
    return 15_000;
  }

  const fileSizeMb = Math.ceil(fileSize / (1024 * 1024));

  return Math.max(15_000, fileSizeMb * 5_000);
}

function getZeroProgressRetryMs(fileSize: number) {
  if (fileSize < 1024 * 1024) {
    return 6_000;
  }

  if (fileSize < SMALL_UPLOAD_RETRY_MAX_BYTES) {
    return 12_000;
  }

  const fileSizeMb = Math.ceil(fileSize / (1024 * 1024));

  return Math.max(30_000, fileSizeMb * 8_000);
}

function uploadFileToSignedUrl({
  uploadUrl,
  uploadHost,
  endpointMode,
  attemptNumber,
  file,
  mimeType,
  onProgress,
  onWarning,
  onStateChange,
}: {
  uploadUrl: string;
  uploadHost: string;
  endpointMode?: UploadEndpointMode;
  attemptNumber: number;
  file: File;
  mimeType: string;
  onProgress: (progress: number) => void;
  onWarning: (message: string) => void;
  onStateChange: (state: LibraryUploadState) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const startedAt = getDevTimingNow();
    const progressMarks = [25, 50, 75, 100];
    const loggedMarks = new Set<number>();
    const timeoutMs = getUploadTimeoutMs(file.size);
    const stallWarningMs = getUploadStallWarningMs(file.size);
    const zeroProgressRetryMs = getZeroProgressRetryMs(file.size);
    let lastProgressAt = startedAt;
    let lastProgressPercent = 0;
    let firstProgressLogged = false;
    let stallWarningShown = false;
    let uploadBodyCompleteAt: number | null = null;
    let stallTimerId: number | null = null;
    let zeroProgressRetryTimerId: number | null = null;
    let settled = false;
    let abortingForRetry = false;

    function clearStallTimer() {
      if (stallTimerId) {
        window.clearTimeout(stallTimerId);
        stallTimerId = null;
      }
    }

    function clearZeroProgressRetryTimer() {
      if (zeroProgressRetryTimerId) {
        window.clearTimeout(zeroProgressRetryTimerId);
        zeroProgressRetryTimerId = null;
      }
    }

    function armStallTimer() {
      clearStallTimer();

      stallTimerId = window.setTimeout(() => {
        if (stallWarningShown) {
          return;
        }

        stallWarningShown = true;
        const now = getDevTimingNow();
        const message =
          file.size < SMALL_UPLOAD_RETRY_MAX_BYTES
            ? "Small file upload is taking longer than expected."
            : "Upload is taking longer than expected.";

        logDevTiming("[library:upload]", "upload stall warning", {
          elapsedMs: Math.round(now - startedAt),
          sinceLastProgressMs: Math.round(now - lastProgressAt),
          progressPercent: lastProgressPercent,
          fileSize: file.size,
          uploadHost,
          endpointMode,
        });
        onStateChange({
          phase: "stalled",
          attemptNumber,
          endpointMode,
          uploadHost,
          stalledDurationMs: Math.round(now - lastProgressAt),
          progressPercent: lastProgressPercent,
        });
        onWarning(message);
      }, stallWarningMs);
    }

    function armZeroProgressRetryTimer() {
      clearZeroProgressRetryTimer();

      zeroProgressRetryTimerId = window.setTimeout(() => {
        if (settled || lastProgressPercent > 0) {
          return;
        }

        const now = getDevTimingNow();
        const stalledDurationMs = Math.round(now - startedAt);
        const retryError = new UploadZeroProgressStallError({
          stalledDurationMs,
          endpointMode,
          uploadHost,
          attemptNumber,
        });

        logDevTiming("[library:upload]", "zero progress stall retry abort", {
          attemptNumber,
          stalledDurationMs,
          progressPercent: lastProgressPercent,
          fileSize: file.size,
          uploadHost,
          endpointMode,
        });
        onStateChange({
          phase: "stalled",
          attemptNumber,
          endpointMode,
          uploadHost,
          stalledDurationMs,
          progressPercent: lastProgressPercent,
        });
        abortingForRetry = true;
        request.abort();
        settle(retryError);
      }, zeroProgressRetryMs);
    }

    function settle(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      clearStallTimer();
      clearZeroProgressRetryTimer();

      if (error) {
        reject(error);
        return;
      }

      resolve();
    }

    request.open("PUT", uploadUrl);
    request.timeout = timeoutMs;
    request.setRequestHeader("Content-Type", mimeType);
    armStallTimer();
    armZeroProgressRetryTimer();

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      const now = getDevTimingNow();
      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      lastProgressAt = now;
      lastProgressPercent = progress;
      armStallTimer();
      if (progress > 0) {
        clearZeroProgressRetryTimer();
      }
      onStateChange({
        phase: "uploading",
        attemptNumber,
        endpointMode,
        uploadHost,
        progressPercent: progress,
      });

      if (!firstProgressLogged) {
        firstProgressLogged = true;
        logDevTiming("[library:upload]", "upload first progress", {
          durationMs: Math.round(now - startedAt),
          loadedBytes: event.loaded,
          totalBytes: event.total,
          progressPercent: progress,
          uploadHost,
          endpointMode,
        });
      }

      progressMarks.forEach((mark) => {
        if (progress >= mark && !loggedMarks.has(mark)) {
          loggedMarks.add(mark);
          logDevTiming("[library:upload]", "upload progress mark", {
            mark,
            durationMs: Math.round(now - startedAt),
            loadedBytes: event.loaded,
            totalBytes: event.total,
            uploadHost,
            endpointMode,
          });
        }
      });

      onProgress(progress);
    };
    request.upload.onload = () => {
      uploadBodyCompleteAt = getDevTimingNow();
      lastProgressAt = uploadBodyCompleteAt;
      lastProgressPercent = 100;
      clearZeroProgressRetryTimer();
      onProgress(100);
      onStateChange({
        phase: "uploading",
        attemptNumber,
        endpointMode,
        uploadHost,
        progressPercent: 100,
      });
      if (!loggedMarks.has(100)) {
        loggedMarks.add(100);
        logDevTiming("[library:upload]", "upload progress mark", {
          mark: 100,
          durationMs: Math.round(uploadBodyCompleteAt - startedAt),
          loadedBytes: file.size,
          totalBytes: file.size,
          uploadHost,
          endpointMode,
        });
      }
      logDevTiming("[library:upload]", "upload body sent", {
        durationMs: Math.round(uploadBodyCompleteAt - startedAt),
        fileSize: file.size,
        uploadHost,
        endpointMode,
      });
    };
    request.onload = () => {
      const responseReceivedAt = getDevTimingNow();
      logDevTiming("[library:upload]", "upload response received", {
        durationMs: Math.round(responseReceivedAt - startedAt),
        responseWaitMs: uploadBodyCompleteAt
          ? Math.round(responseReceivedAt - uploadBodyCompleteAt)
          : null,
        status: request.status,
        uploadHost,
        endpointMode,
      });

      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        settle();
        return;
      }

      settle(new Error(`Upload failed for ${file.name}.`));
    };
    request.onerror = () => {
      settle(new Error(`Upload failed for ${file.name}.`));
    };
    request.onabort = () => {
      if (abortingForRetry) {
        return;
      }

      settle(new Error(`Upload cancelled for ${file.name}.`));
    };
    request.ontimeout = () => {
      settle(
        new Error(
          `Upload timed out for ${file.name} after ${Math.round(timeoutMs / 1000)} seconds.`,
        ),
      );
    };
    request.send(file);
  });
}

export function LibraryUploadButton({
  canUploadAssets,
  disabledReason,
  assetTagOptions,
  onUploaded,
}: LibraryUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [createdByName, setCreatedByName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LibraryUploadCategory>("PROJECT_ASSET");
  const [assetTagIds, setAssetTagIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<LibraryUploadState | null>(null);
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
    setAssetTagIds([]);
    setSelectedFile(null);
    setIsDragging(false);
    setUploadProgress(null);
    setUploadState(null);
    setFormError(undefined);
  }

  function setUploadFile(file: File | null) {
    setSelectedFile(file);
    setFormError(undefined);

    if (file && !assetName.trim()) {
      setAssetName(getNameWithoutExtension(file.name));
    }

    if (file) {
      logDevTiming("[library:upload]", "file selected", {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
      });
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
    setUploadProgress(0);
    const totalStartedAt = getDevTimingNow();
    logDevTiming("[library:upload]", "upload started", {
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      mimeType: selectedFile.type || "application/octet-stream",
      assetTagCount: assetTagIds.length,
    });

    const loadingToastId = toast.loading("Uploading to Library...", {
      description: selectedFile.name,
    });
    let completedUploadPayload: LibraryUploadResponse | null = null;

    try {
      const uploadEndpointModeOverride = getUploadEndpointModeOverride();
      let requestedEndpointMode = uploadEndpointModeOverride;

      for (let attemptNumber = 1; attemptNumber <= MAX_UPLOAD_RETRIES + 1; attemptNumber += 1) {
        const isRetryAttempt = attemptNumber > 1;
        setUploadProgress(0);
        setUploadState({
          phase: isRetryAttempt ? "retrying" : "requesting-upload-url",
          attemptNumber,
          endpointMode: requestedEndpointMode,
          progressPercent: 0,
        });

        if (isRetryAttempt) {
          toast.loading("Upload connection is slow. Retrying...", {
            id: loadingToastId,
            description: `Attempt ${attemptNumber} of ${MAX_UPLOAD_RETRIES + 1}`,
          });
        }

        const uploadUrlStartedAt = getDevTimingNow();
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
            assetTagIds,
            uploadEndpointMode: requestedEndpointMode,
          }),
        });
        logDevTiming("[library:upload]", "upload-url API time", {
          durationMs: getDevTimingDurationMs(uploadUrlStartedAt),
          status: uploadRequest.status,
          attemptNumber,
          requestedEndpointMode,
        });

        const uploadPayload = (await uploadRequest.json()) as LibraryUploadResponse;

        if (!uploadRequest.ok || !uploadPayload.storageKey || !uploadPayload.uploadUrl) {
          throw new Error(
            getUploadErrorMessage(uploadPayload, "Unable to prepare the library upload."),
          );
        }

        const uploadHost = uploadPayload.uploadHost ?? new URL(uploadPayload.uploadUrl).host;
        const endpointMode = uploadPayload.uploadEndpointMode ?? requestedEndpointMode;
        const expectedContentType =
          uploadPayload.uploadExpectedHeaders?.["Content-Type"] ||
          selectedFile.type ||
          "application/octet-stream";

        setUploadState({
          phase: "uploading",
          attemptNumber,
          endpointMode,
          uploadHost,
          progressPercent: 0,
        });
        logDevTiming("[library:upload]", "upload target received", {
          attemptNumber,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type || "application/octet-stream",
          uploadHost,
          endpointMode,
          region: uploadPayload.uploadRegion,
          expiresInSeconds: uploadPayload.uploadExpiresInSeconds,
          expectedHeaders: uploadPayload.uploadExpectedHeaders,
          sentHeaders: {
            "Content-Type": expectedContentType,
          },
          devOverride: uploadEndpointModeOverride,
        });

        const storageUploadStartedAt = getDevTimingNow();
        try {
          await uploadFileToSignedUrl({
            uploadUrl: uploadPayload.uploadUrl,
            uploadHost,
            endpointMode,
            attemptNumber,
            file: selectedFile,
            mimeType: expectedContentType,
            onProgress: setUploadProgress,
            onStateChange: setUploadState,
            onWarning: (message) => {
              showWarningToast(
                message,
                "The upload is still in progress. Check DevTools Network timing for stalled, request sent, and waiting phases.",
              );
            },
          });
          logDevTiming("[library:upload]", "actual storage upload time", {
            durationMs: getDevTimingDurationMs(storageUploadStartedAt),
            fileSize: selectedFile.size,
            uploadHost,
            endpointMode,
            attemptNumber,
          });
          completedUploadPayload = uploadPayload;
          break;
        } catch (nextError) {
          if (
            isUploadZeroProgressStallError(nextError) &&
            attemptNumber <= MAX_UPLOAD_RETRIES
          ) {
            const nextEndpointMode =
              attemptNumber === 1
                ? endpointMode
                : getAlternateEndpointMode(endpointMode);

            requestedEndpointMode = nextEndpointMode;
            setUploadState({
              phase: "retrying",
              attemptNumber: attemptNumber + 1,
              endpointMode: nextEndpointMode,
              uploadHost,
              stalledDurationMs: nextError.stalledDurationMs,
              progressPercent: 0,
            });
            showWarningToast(
              "Upload connection is slow. Retrying...",
              `Attempt ${attemptNumber + 1} will use the ${nextEndpointMode} endpoint.`,
            );
            logDevTiming("[library:upload]", "upload retry scheduled", {
              failedAttempt: attemptNumber,
              nextAttempt: attemptNumber + 1,
              previousEndpointMode: endpointMode,
              nextEndpointMode,
              uploadHost,
              stalledDurationMs: nextError.stalledDurationMs,
            });
            continue;
          }

          if (isUploadZeroProgressStallError(nextError)) {
            throw new Error(
              "Upload failed due to a slow storage connection. Please try again.",
            );
          }

          throw nextError;
        }
      }

      if (!completedUploadPayload?.storageKey) {
        throw new Error(
          "Upload failed due to a slow storage connection. Please try again.",
        );
      }

      const completeStartedAt = getDevTimingNow();
      setUploadState((current) => ({
        phase: "completing",
        attemptNumber: current?.attemptNumber ?? 1,
        endpointMode: current?.endpointMode,
        uploadHost: current?.uploadHost,
        progressPercent: 100,
      }));
      const completeResponse = await fetch("/api/library/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storageKey: completedUploadPayload.storageKey,
          assetName,
          originalFileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          createdByName,
          description,
          category,
          assetTagIds,
        }),
      });
      logDevTiming("[library:upload]", "complete API time", {
        durationMs: getDevTimingDurationMs(completeStartedAt),
        status: completeResponse.status,
      });

      const completePayload = (await completeResponse.json()) as LibraryUploadResponse;

      if (!completeResponse.ok) {
        throw new Error(completePayload.error || "Unable to complete the library upload.");
      }

      dismissToast(loadingToastId);
      setUploadState((current) => ({
        phase: "completed",
        attemptNumber: current?.attemptNumber ?? 1,
        endpointMode: current?.endpointMode,
        uploadHost: current?.uploadHost,
        progressPercent: 100,
      }));
      closeModal(true);
      showSuccessToast("Uploaded to Library.", `${assetName.trim()} is now available in Library.`);
      void onUploaded?.(completePayload.asset);
      logDevTiming("[library:upload]", "total perceived upload time", {
        durationMs: getDevTimingDurationMs(totalStartedAt),
        includesBlockingRefetch: false,
      });
    } catch (error) {
      dismissToast(loadingToastId);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to upload this file right now.";
      setUploadState((current) => ({
        phase: "failed",
        attemptNumber: current?.attemptNumber ?? 1,
        endpointMode: current?.endpointMode,
        uploadHost: current?.uploadHost,
        progressPercent: current?.progressPercent ?? 0,
      }));
      setFormError(message);
      showErrorToast("Upload failed.", message);
      logDevTiming("[library:upload]", "upload failed", {
        durationMs: getDevTimingDurationMs(totalStartedAt),
        error: message,
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
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

                <AssetTagSelector
                  value={assetTagIds}
                  onChange={setAssetTagIds}
                  disabled={isUploading}
                  initialOptions={assetTagOptions}
                />

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
                    {isUploading && uploadState
                      ? getUploadStateLabel(uploadState)
                    : isUploading && uploadProgress !== null
                      ? `${uploadProgress}% uploaded`
                      : selectedFile
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
                  {isUploading
                    ? uploadState?.phase === "retrying" || uploadState?.phase === "stalled"
                      ? "Retrying..."
                      : uploadState?.phase === "completing"
                      ? "Finishing..."
                      : uploadProgress !== null
                      ? `Uploading ${uploadProgress}%...`
                      : "Uploading..."
                    : "Upload Asset"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

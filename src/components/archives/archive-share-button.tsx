"use client";

import { useState } from "react";
import { Check, Clock3, Copy, Loader2, Share2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const expiryOptions = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

type ShareLinkResponse = {
  sharePath?: string;
  shareUrl?: string;
  expiresAt?: string;
  error?: string;
};

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ArchiveShareButton({
  archivedFileId,
  fileName,
}: {
  archivedFileId: string;
  fileName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [isCreating, setIsCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function closeDialog() {
    if (isCreating) return;
    setIsOpen(false);
    setError("");
    setCopied(false);
  }

  async function createShareLink() {
    setIsCreating(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch(
        `/api/archives/files/${encodeURIComponent(archivedFileId)}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiryDays }),
        },
      );
      const payload = (await response.json()) as ShareLinkResponse;

      if (!response.ok || !payload.expiresAt || (!payload.sharePath && !payload.shareUrl)) {
        throw new Error(payload.error || "Unable to create the share link.");
      }

      const nextShareUrl = payload.sharePath
        ? new URL(payload.sharePath, window.location.origin).toString()
        : payload.shareUrl!;

      setShareUrl(nextShareUrl);
      setExpiresAt(payload.expiresAt);
      toast.success("Archive share link created.");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create the share link.";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function copyShareLink() {
    try {
      await copyText(shareUrl);
      setCopied(true);
      toast.success("Share link copied.");
    } catch {
      setError("Unable to copy the link. Select and copy it manually.");
    }
  }

  const dialog =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[210] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-share-title"
          >
            <div className="w-full max-w-[560px] rounded-[28px] border border-[#dfe7df] bg-white p-6 shadow-[0_35px_90px_rgba(11,26,18,0.22)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-[800] uppercase tracking-[0.12em] text-brand">
                    Secure archive download
                  </p>
                  <h2 id="archive-share-title" className="mt-1 text-[24px] font-[700] text-[#111712]">
                    Create shareable link
                  </h2>
                  <p className="mt-2 truncate text-[13px] text-[#687269]" title={fileName}>
                    {fileName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={closeDialog}
                  disabled={isCreating}
                  aria-label="Close share dialog"
                  className="shrink-0"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="mt-6">
                <p className="text-[13px] font-[700] text-[#263129]">Link expires after</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.days}
                      type="button"
                      onClick={() => {
                        setExpiryDays(option.days);
                        setShareUrl("");
                        setExpiresAt("");
                        setCopied(false);
                      }}
                      disabled={isCreating}
                      aria-pressed={expiryDays === option.days}
                      className={`h-9 rounded-full border px-4 text-[12px] font-[700] transition ${
                        expiryDays === option.days
                          ? "border-brand bg-[#edf7ef] text-brand"
                          : "border-[#dce5dc] bg-white text-[#566259] hover:bg-[#f7faf7]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {shareUrl ? (
                <div className="mt-6 rounded-[18px] border border-[#dce8de] bg-[#f7fbf7] p-4">
                  <label htmlFor={`archive-share-url-${archivedFileId}`} className="text-[12px] font-[700] text-[#405047]">
                    Download link
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={`archive-share-url-${archivedFileId}`}
                      value={shareUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-[13px] border-[#dce5dc] bg-white text-[12px]"
                    />
                    <Button type="button" onClick={() => void copyShareLink()} className="shrink-0">
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#647068]">
                    <Clock3 className="size-3.5 text-brand" />
                    Expires {formatExpiry(expiresAt)}
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="mt-4 rounded-[14px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[12px] text-[#b74742]">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={closeDialog} disabled={isCreating}>
                  Close
                </Button>
                <Button type="button" onClick={() => void createShareLink()} disabled={isCreating}>
                  {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                  {isCreating ? "Creating link..." : shareUrl ? "Create new link" : "Create link"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className="h-10 min-w-[94px] justify-center rounded-full border border-[#ecefed] bg-white px-3 text-[13px] font-[600] text-[#3a443d] shadow-[0_8px_20px_rgba(16,26,20,0.08)]"
      >
        <Share2 className="h-4 w-4 text-brand" />
        Share
      </Button>
      {dialog}
    </>
  );
}

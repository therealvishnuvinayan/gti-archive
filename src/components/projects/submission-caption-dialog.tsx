"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageSquarePlus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectAttachmentRecord } from "@/lib/projects";
import {
  stageSubmissionCaptionHelpText,
  type SubmissionCaptionRecord,
} from "@/lib/comparison-utils";

export type CaptionDialogAttachment = Pick<
  ProjectAttachmentRecord,
  "id" | "originalFileName" | "mimeType" | "previewPath"
>;

type CaptionDialogResponse = {
  attachment: {
    id: string;
    originalFileName: string;
    mimeType: string;
    previewPath: string;
  };
  canAddCaption: boolean;
  readOnlyReason: string | null;
  captions: SubmissionCaptionRecord[];
};

type PendingCaptionPosition = {
  xPercent: number;
  yPercent: number;
};

type SubmissionCaptionDialogProps = {
  attachment: CaptionDialogAttachment | null;
  open: boolean;
  initialCaptionId?: string | null;
  onClose: () => void;
  onCaptionCreated?: () => void;
};

function clampPercent(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function getPopoverPosition(position: { xPercent: number; yPercent: number }) {
  return {
    left: `${clampPercent(position.xPercent, 14, 86)}%`,
    top: `${clampPercent(position.yPercent, 12, 82)}%`,
  };
}

export function SubmissionCaptionDialog({
  attachment,
  open,
  initialCaptionId,
  onClose,
  onCaptionCreated,
}: SubmissionCaptionDialogProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<CaptionDialogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [pendingCaption, setPendingCaption] = useState<PendingCaptionPosition | null>(
    null,
  );
  const [captionDraft, setCaptionDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCaptionId, setActiveCaptionId] = useState<string | null>(
    initialCaptionId ?? null,
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !attachment) {
      return;
    }

    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setLoading(true);
      setError(null);
      setData(null);
      setPendingCaption(null);
      setCaptionDraft("");
      setAddMode(false);
      setActiveCaptionId(initialCaptionId ?? null);
    }, 0);

    fetch(`/api/project-assets/${attachment.id}/captions`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "Unable to load captions for this submission.",
          );
        }

        return payload as CaptionDialogResponse;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load captions for this submission.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [attachment, initialCaptionId, open]);

  if (!open || !attachment) {
    return null;
  }

  const activeCaption =
    data?.captions.find((caption) => caption.id === activeCaptionId) ?? null;
  const canAddCaption = Boolean(data?.canAddCaption);
  const previewPath = data?.attachment.previewPath ?? attachment.previewPath;
  const fileName = data?.attachment.originalFileName ?? attachment.originalFileName;

  function handleFrameClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!addMode || !canAddCaption || saving) {
      return;
    }

    if ((event.target as HTMLElement).closest("[data-caption-interactive='true']")) {
      return;
    }

    const rect = frameRef.current?.getBoundingClientRect();

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    setPendingCaption({
      xPercent: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      yPercent: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    });
    setActiveCaptionId(null);
  }

  async function saveCaption() {
    if (!pendingCaption || !captionDraft.trim() || !attachment) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/project-assets/${attachment.id}/captions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          xPercent: pendingCaption.xPercent,
          yPercent: pendingCaption.yPercent,
          body: captionDraft.trim(),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to add the caption right now.",
        );
      }

      const caption = payload.caption as SubmissionCaptionRecord;

      setData((current) =>
        current
          ? {
              ...current,
              captions: [...current.captions, caption],
            }
          : current,
      );
      setActiveCaptionId(caption.id);
      setPendingCaption(null);
      setCaptionDraft("");
      setAddMode(false);
      onCaptionCreated?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add the caption right now.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
      <Card className="flex h-full max-h-[88vh] w-full max-w-[1120px] flex-col rounded-[24px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-5 sm:p-6">
          <div className="min-w-0">
            <CardTitle className="truncate text-[22px] font-semibold tracking-tight text-[#111712]">
              Captions
            </CardTitle>
            <p className="mt-1 truncate text-[13px] text-[#6f786f]">{fileName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canAddCaption ? (
              <Button
                type="button"
                size="sm"
                variant={addMode ? "secondary" : "default"}
                className="rounded-full"
                onClick={() => {
                  setAddMode((current) => !current);
                  setPendingCaption(null);
                  setCaptionDraft("");
                  setError(null);
                }}
                disabled={saving}
              >
                <MessageSquarePlus className="h-4 w-4" />
                {addMode ? "Cancel" : "Add Caption"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="border border-line"
              aria-label="Close captions"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid min-h-0 flex-1 gap-4 px-5 pb-5 pt-0 sm:px-6 sm:pb-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-h-0 overflow-hidden rounded-[18px] border border-[#e3e8e2] bg-[#f8fbf8] p-3">
            <div
              ref={frameRef}
              className={`relative mx-auto h-full max-h-full max-w-full overflow-hidden rounded-[14px] bg-white ${
                addMode && canAddCaption ? "cursor-crosshair" : "cursor-default"
              }`}
              style={{
                aspectRatio: imageAspectRatio ?? 1,
              }}
              onClick={handleFrameClick}
            >
              {loading ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-white/80">
                  <Loader2 className="h-5 w-5 animate-spin text-brand" />
                </div>
              ) : null}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPath}
                alt={fileName}
                onLoad={(event) => {
                  const ratio =
                    event.currentTarget.naturalWidth > 0 &&
                    event.currentTarget.naturalHeight > 0
                      ? event.currentTarget.naturalWidth /
                        event.currentTarget.naturalHeight
                      : null;

                  setImageAspectRatio(ratio);
                }}
                className="h-full w-full object-contain"
                draggable={false}
              />

              {data?.captions.map((caption, index) => {
                const isActive = activeCaptionId === caption.id;

                return (
                  <button
                    key={caption.id}
                    type="button"
                    data-caption-interactive="true"
                    className={`absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[11px] font-[800] shadow-[0_12px_22px_rgba(16,33,23,0.16)] transition ${
                      isActive
                        ? "border-[#1f7a4b] bg-[#1f7a4b] text-white"
                        : "border-white/90 bg-[#fff8ed] text-[#8a4e14]"
                    }`}
                    style={{
                      left: `${caption.xPercent}%`,
                      top: `${caption.yPercent}%`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingCaption(null);
                      setAddMode(false);
                      setActiveCaptionId(isActive ? null : caption.id);
                    }}
                    aria-label={`Open caption ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}

              {activeCaption ? (
                <div
                  data-caption-interactive="true"
                  className="absolute z-30 w-[min(18rem,calc(100%-1rem))] -translate-x-1/2 rounded-[16px] border border-[#d8e5d9] bg-white p-3 shadow-[0_18px_36px_rgba(14,31,20,0.14)]"
                  style={getPopoverPosition(activeCaption)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-[700] text-[#111712]">
                        {activeCaption.author}
                      </p>
                      <p className="text-[10px] text-[#7b847d]">
                        {activeCaption.role} · {activeCaption.createdAt}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[#7d847e] transition hover:text-[#27322b]"
                      onClick={() => setActiveCaptionId(null)}
                      aria-label="Close caption"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-[1.45] text-[#111712]">
                    {activeCaption.body}
                  </p>
                </div>
              ) : null}

              {pendingCaption ? (
                <div
                  data-caption-interactive="true"
                  className="absolute z-30 w-[min(19rem,calc(100%-1rem))] -translate-x-1/2 rounded-[16px] border border-[#d8e5d9] bg-white p-3 shadow-[0_20px_38px_rgba(14,31,20,0.16)]"
                  style={getPopoverPosition(pendingCaption)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Textarea
                    value={captionDraft}
                    onChange={(event) => setCaptionDraft(event.target.value)}
                    placeholder="Caption"
                    className="min-h-[90px] rounded-[12px] border border-[#dce6de] bg-[#f8fbf8] text-[13px]"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setPendingCaption(null);
                        setCaptionDraft("");
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      onClick={saveCaption}
                      disabled={saving || !captionDraft.trim()}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto rounded-[18px] border border-[#e1e8e2] bg-white p-4">
            <p className="text-[12px] leading-5 text-[#5f6b62]">
              {stageSubmissionCaptionHelpText}
            </p>

            {error ? (
              <div className="mt-4 rounded-[14px] border border-[#f0c9c7] bg-[#fff2f1] px-3 py-2 text-[12px] text-[#bb4d49]">
                {error}
              </div>
            ) : null}

            {data?.readOnlyReason ? (
              <div className="mt-4 rounded-[14px] border border-[#eadfc7] bg-[#fff9ed] px-3 py-2 text-[12px] text-[#866025]">
                {data.readOnlyReason}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {data?.captions.length ? (
                data.captions.map((caption, index) => (
                  <button
                    key={caption.id}
                    type="button"
                    className={`w-full rounded-[14px] border px-3 py-2 text-left transition ${
                      activeCaptionId === caption.id
                        ? "border-[#1f7a4b] bg-[#f2faf4]"
                        : "border-[#e1e8e2] bg-[#fbfcfb] hover:bg-[#f7fbf7]"
                    }`}
                    onClick={() => {
                      setPendingCaption(null);
                      setAddMode(false);
                      setActiveCaptionId(caption.id);
                    }}
                  >
                    <p className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#2c8b58]">
                      Caption {index + 1}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#253029]">
                      {caption.body}
                    </p>
                    <p className="mt-1 text-[10px] text-[#7b847d]">
                      {caption.author} · {caption.createdAt}
                    </p>
                  </button>
                ))
              ) : !loading ? (
                <p className="rounded-[14px] border border-dashed border-[#d7e3d8] bg-[#fbfcfb] px-3 py-4 text-center text-[12px] text-[#6f786f]">
                  {data?.readOnlyReason ?? "No captions yet."}
                </p>
              ) : null}
            </div>
          </aside>
        </CardContent>
      </Card>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;
}

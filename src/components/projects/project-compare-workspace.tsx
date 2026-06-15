"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Expand,
  Eye,
  EyeOff,
  Hand,
  Loader2,
  MessageSquarePlus,
  MousePointer2,
  Send,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  createComparisonCommentAction,
  removeProjectCollaboratorAction,
  setProjectCollaboratorChatVisibilityAction,
} from "@/app/(dashboard)/projects/actions";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  ProjectAttachmentRecord,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";
import {
  type ComparisonCommentRecord,
  getStageSubmissionAttachments,
  resolveComparisonSelection,
} from "@/lib/comparison-utils";

type ProjectCompareWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string | null;
  history: StageHistoryRecord;
  initialBaseAttachmentId?: string | null;
  initialCompareAttachmentId?: string | null;
  initialComments: ComparisonCommentRecord[];
  canManageCollaborators: boolean;
  canManageChatVisibility: boolean;
  currentUserId: string;
};

type ImageDimensions = {
  width: number;
  height: number;
};

type PendingCommentPosition = {
  xPercent: number;
  yPercent: number;
  displayXPercent: number;
  displayYPercent: number;
};

type CompareZoomMode = "fit" | "width" | "zoom";
type CompareToolMode = "view" | "pan" | "comment";

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatZoomPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clampPercent(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function formatSubmissionLabel(submission: ProjectAttachmentRecord) {
  return submission.submissionNumber
    ? `Submission ${submission.submissionNumber}`
    : "Submission";
}

function buildCompareHref(
  projectId: string,
  stageId: string | null | undefined,
  baseAttachmentId: string,
  compareAttachmentId: string,
) {
  const searchParams = new URLSearchParams();

  if (stageId) {
    searchParams.set("stage", stageId);
  }

  searchParams.set("base", baseAttachmentId);
  searchParams.set("compare", compareAttachmentId);

  return `/projects/${projectId}/compare?${searchParams.toString()}`;
}

function getFallbackComparisonId(
  submissions: ProjectAttachmentRecord[],
  excludedId: string,
  preferredId?: string | null,
) {
  if (preferredId && preferredId !== excludedId) {
    return preferredId;
  }

  return submissions.find((submission) => submission.id !== excludedId)?.id ?? null;
}

function ComparisonSelectionCard({
  label,
  submission,
  submissions,
  disabled,
  onValueChange,
}: {
  label: string;
  submission: ProjectAttachmentRecord | null;
  submissions: ProjectAttachmentRecord[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Card className="rounded-[20px] border border-[#dbe4dc] bg-white/92 p-4 shadow-[0_10px_24px_rgba(18,35,23,0.05)]">
      <p className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#718074]">
        {label}
      </p>
      <div className="mt-3">
        <Select
          value={submission?.id}
          onValueChange={onValueChange}
          disabled={disabled || submissions.length === 0}
        >
          <SelectTrigger className="rounded-[16px] border border-[#dce6de] bg-[#f8fbf8] text-[13px] font-[700]">
            <SelectValue placeholder="Select submission" />
          </SelectTrigger>
          <SelectContent>
            {submissions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {formatSubmissionLabel(item)} · {item.originalFileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {submission ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] leading-none text-[#2b8b56]">
              {formatSubmissionLabel(submission)}
            </span>
            <p className="truncate text-[14px] font-[700] text-[#111712]">
              {submission.originalFileName}
            </p>
          </div>
          <div className="grid gap-1 text-[12px] text-[#5f685f]">
            <p>
              <span className="font-[700] text-[#242b26]">Uploaded by :</span>{" "}
              {submission.uploadedBy}
            </p>
            <p>
              <span className="font-[700] text-[#242b26]">Uploaded at :</span>{" "}
              {submission.uploadedAt}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AssetPreviewButton
              fileName={submission.originalFileName}
              mimeType={submission.mimeType}
              previewPath={submission.previewPath}
              downloadPath={submission.downloadPath}
              triggerClassName="h-9 rounded-full border border-[#d6dfd7] px-3 text-brand hover:bg-[#f5f8f5]"
              iconOnly={false}
            />
            <Button asChild type="button" variant="secondary" size="sm" className="rounded-full">
              <a
                href={submission.downloadPath}
                target="_blank"
                rel="noreferrer"
                aria-label={`Download ${submission.originalFileName}`}
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ComparisonCommentsPanel({
  comments,
  activeCommentId,
  onSelectComment,
}: {
  comments: ComparisonCommentRecord[];
  activeCommentId: string | null;
  onSelectComment: (commentId: string) => void;
}) {
  return (
    <Card className="flex min-h-0 flex-col rounded-[24px] border border-[#dbe4dc] bg-white/95 p-5 shadow-[0_12px_28px_rgba(18,35,23,0.05)]">
      <CardTitle className="shrink-0 text-[22px] font-semibold tracking-tight text-brand">
        Comments
      </CardTitle>
      {comments.length > 0 ? (
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {comments.map((comment, index) => {
            const isActive = activeCommentId === comment.id;

            return (
              <button
                key={comment.id}
                type="button"
                className={`flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-brand/45 bg-[#f4fbf5] shadow-[0_10px_22px_rgba(18,35,23,0.05)]"
                    : "border-[#e0e7e1] bg-white hover:border-brand/25"
                }`}
                onClick={() => onSelectComment(comment.id)}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf7ef] text-[12px] font-[800] text-[#2b8b56]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-[700] text-[#111712]">
                    {comment.author}
                  </span>
                  <span className="block text-[10px] text-[#7d867f]">
                    {comment.role} · {comment.createdAt}
                  </span>
                  <span className="mt-1 block text-[13px] leading-[1.45] text-[#2b342d]">
                    {comment.body}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[#6f786f]">
          No comparison comments yet. Use Comment mode, then double-click the artwork to add a pinned note.
        </p>
      )}
    </Card>
  );
}

function ComparisonViewerSurface({
  baseSubmission,
  compareSubmission,
  comments,
  opacity,
  onOpacityChange,
  activeCommentId,
  onActiveCommentChange,
  pendingComment,
  commentDraft,
  onCommentDraftChange,
  onSaveComment,
  onCancelComment,
  onCreatePendingComment,
  isSavingComment,
  commentError,
  onBaseImageLoad,
  onCompareImageLoad,
  comparisonAspectRatio,
  onToggleFullscreen,
  commentsVisible,
  onToggleCommentsVisible,
  fullscreenMode = false,
}: {
  baseSubmission: ProjectAttachmentRecord;
  compareSubmission: ProjectAttachmentRecord;
  comments: ComparisonCommentRecord[];
  opacity: number;
  onOpacityChange: (value: number) => void;
  activeCommentId: string | null;
  onActiveCommentChange: (commentId: string | null) => void;
  pendingComment: PendingCommentPosition | null;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onSaveComment: () => void;
  onCancelComment: () => void;
  onCreatePendingComment: (position: PendingCommentPosition) => void;
  isSavingComment: boolean;
  commentError: string | null;
  onBaseImageLoad: (dimensions: ImageDimensions) => void;
  onCompareImageLoad: (dimensions: ImageDimensions) => void;
  comparisonAspectRatio: number;
  onToggleFullscreen: () => void;
  commentsVisible: boolean;
  onToggleCommentsVisible: () => void;
  fullscreenMode?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [zoomMode, setZoomMode] = useState<CompareZoomMode>("fit");
  const [zoomScale, setZoomScale] = useState(1.25);
  const [toolMode, setToolMode] = useState<CompareToolMode>("view");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const activeComment = comments.find((comment) => comment.id === activeCommentId) ?? null;
  const baseOpacity = 1 - opacity / 100;
  const compareOpacity = opacity / 100;
  const isFitMode = zoomMode === "fit";
  const currentZoomLabel =
    zoomMode === "fit" ? "Fit" : zoomMode === "width" ? "Fill" : formatZoomPercent(zoomScale);
  const isPresetZoom = ZOOM_PRESETS.some((preset) => Math.abs(preset - zoomScale) < 0.001);
  const zoomSelectValue =
    zoomMode === "fit"
      ? "fit"
      : zoomMode === "width"
        ? "width"
        : isPresetZoom
          ? String(zoomScale)
          : `custom-${zoomScale}`;
  const fitWidth = `min(100%, ${Math.max(18, comparisonAspectRatio * (fullscreenMode ? 72 : 64))}dvh, ${Math.max(
    220,
    Math.round(comparisonAspectRatio * (fullscreenMode ? 920 : 700)),
  )}px)`;
  const frameWidth =
    zoomMode === "fit"
      ? fitWidth
      : zoomMode === "width"
        ? "100%"
        : `${Math.round(100 * zoomScale)}%`;
  const baseLabelStrong = baseOpacity >= compareOpacity;
  const compareLabelStrong = compareOpacity >= baseOpacity;
  const panLimit = Math.max(120, Math.round(360 * zoomScale));

  function getPopoverPosition(comment: {
    xPercent: number;
    yPercent: number;
  }) {
    return {
      left: `${clampPercent(comment.xPercent, 14, 86)}%`,
      top: `${clampPercent(comment.yPercent, 12, 82)}%`,
    };
  }

  function handleFrameDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-comment-interactive='true']")) {
      return;
    }

    if (toolMode !== "comment") {
      return;
    }

    const rect = frameRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const xPercent = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const yPercent = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    onActiveCommentChange(null);
    onCreatePendingComment({
      xPercent,
      yPercent,
      displayXPercent: clampPercent(xPercent, 18, 82),
      displayYPercent: clampPercent(yPercent, 14, 80),
    });
  }

  function setFitMode() {
    setZoomMode("fit");
    setZoomScale(1.25);
    setPanOffset({ x: 0, y: 0 });
  }

  function setWidthMode() {
    setZoomMode("width");
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }

  function setZoomPreset(nextScale: number) {
    setZoomMode("zoom");
    setZoomScale(nextScale);
  }

  function zoomOut() {
    setZoomMode("zoom");
    setZoomScale((current) => Math.max(0.25, Number((current - 0.25).toFixed(2))));
  }

  function zoomIn() {
    setZoomMode("zoom");
    setZoomScale((current) => Math.min(3, Number((current + 0.25).toFixed(2))));
  }

  function handlePanPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (toolMode !== "pan" || event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("[data-comment-interactive='true']")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
    setIsPanning(true);
  }

  function handlePanPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isPanning || !panStartRef.current) {
      return;
    }

    const nextX =
      panStartRef.current.offsetX + event.clientX - panStartRef.current.pointerX;
    const nextY =
      panStartRef.current.offsetY + event.clientY - panStartRef.current.pointerY;

    setPanOffset({
      x: Math.max(-panLimit, Math.min(panLimit, nextX)),
      y: Math.max(-panLimit, Math.min(panLimit, nextY)),
    });
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    panStartRef.current = null;
    setIsPanning(false);
  }

  return (
    <Card
      className={`flex min-h-0 flex-col border bg-white/95 p-4 shadow-[0_16px_36px_rgba(17,34,24,0.08)] sm:p-5 ${
        fullscreenMode
          ? "h-full rounded-none border-[#303832] bg-[#151a17] text-white shadow-none"
          : "h-[min(82dvh,900px)] rounded-[24px] border-[#dbe4dc]"
      }`}
    >
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={`text-[16px] font-[700] ${fullscreenMode ? "text-white" : "text-[#111712]"}`}>
            {fullscreenMode ? "Detailed Submission Review" : "Submission Overlay Viewer"}
          </p>
          <p className={`mt-1 text-[12px] ${fullscreenMode ? "text-white/62" : "text-[#6a736b]"}`}>
            View normally, drag in Pan mode, or use Comment mode and double-click to pin a note.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={toolMode === "view" ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            onClick={() => setToolMode("view")}
          >
            <MousePointer2 className="h-4 w-4" />
            View
          </Button>
          <Button
            type="button"
            variant={toolMode === "pan" ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            onClick={() => setToolMode("pan")}
          >
            <Hand className="h-4 w-4" />
            Pan
          </Button>
          <Button
            type="button"
            variant={toolMode === "comment" ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            onClick={() => setToolMode("comment")}
          >
            <MessageSquarePlus className="h-4 w-4" />
            Comment
          </Button>
          <Button
            type="button"
            variant={zoomMode === "fit" ? "default" : "secondary"}
            size="sm"
            className="rounded-full"
            onClick={setFitMode}
          >
            Fit
          </Button>
          <Select
            value={zoomSelectValue}
            onValueChange={(value) => {
              if (value === "fit") {
                setFitMode();
                return;
              }

              if (value === "width") {
                setWidthMode();
                return;
              }

              if (value.startsWith("custom-")) {
                return;
              }

              setZoomPreset(Number(value));
            }}
          >
            <SelectTrigger className="h-9 w-[136px] rounded-full border border-[#d8dfd8] bg-white px-3 text-[12px] font-[700] text-[#152019]">
              <SelectValue placeholder={`Zoom: ${currentZoomLabel}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit</SelectItem>
              <SelectItem value="width">Fill width</SelectItem>
              {!isPresetZoom && zoomMode === "zoom" ? (
                <SelectItem value={zoomSelectValue} disabled>
                  {formatZoomPercent(zoomScale)}
                </SelectItem>
              ) : null}
              {ZOOM_PRESETS.map((preset) => (
                <SelectItem key={preset} value={String(preset)}>
                  {formatZoomPercent(preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 rounded-full"
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 rounded-full"
            onClick={zoomIn}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={onToggleCommentsVisible}
          >
            {commentsVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {commentsVisible ? "Hide comments" : "Show comments"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={onToggleFullscreen}
          >
            {fullscreenMode ? <X className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            {fullscreenMode ? "Close Fullscreen" : "Maximize"}
          </Button>
        </div>
      </div>

      <div
        className={`min-h-0 flex-1 border p-4 shadow-[inset_0_0_0_1px_rgba(225,234,226,0.7)] ${
          fullscreenMode
            ? "rounded-none border-[#2b332e] bg-[#0f1311]"
            : "rounded-[28px] border-brand/25 bg-[radial-gradient(circle_at_top,rgba(89,158,106,0.08),transparent_55%),linear-gradient(180deg,#fcfdfb,#f4f8f4)]"
        } ${
          isFitMode || toolMode === "pan" ? "overflow-hidden" : "overflow-auto"
        }`}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className={`flex min-h-full min-w-full ${
            isFitMode || toolMode === "pan" ? "items-center justify-center" : "items-start justify-start"
          }`}
        >
          <div
            ref={frameRef}
            className={`relative shrink-0 overflow-hidden rounded-[22px] bg-white/35 ${
              toolMode === "pan"
                ? isPanning
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : toolMode === "comment"
                  ? "cursor-crosshair"
                  : "cursor-default"
            }`}
            style={{
              aspectRatio: comparisonAspectRatio,
              width: frameWidth,
              maxWidth: isFitMode ? "100%" : undefined,
              maxHeight: isFitMode ? "100%" : undefined,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanning ? "none" : "transform 120ms ease",
            }}
            onDoubleClick={handleFrameDoubleClick}
          >
            <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-[#235f3d] shadow-[0_8px_18px_rgba(19,34,24,0.08)]">
                Base · {formatSubmissionLabel(baseSubmission)}
              </span>
              <span className="rounded-full bg-[#eef8f1]/95 px-3 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-[#2c8b58] shadow-[0_8px_18px_rgba(19,34,24,0.08)]">
                Compare · {formatSubmissionLabel(compareSubmission)}
              </span>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={baseSubmission.previewPath}
              alt={baseSubmission.originalFileName}
              onLoad={(event) =>
                onBaseImageLoad({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="absolute inset-0 h-full w-full object-contain select-none"
              style={{ opacity: baseOpacity }}
              draggable={false}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={compareSubmission.previewPath}
              alt={compareSubmission.originalFileName}
              onLoad={(event) =>
                onCompareImageLoad({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="absolute inset-0 h-full w-full object-contain select-none"
              style={{ opacity: compareOpacity }}
              draggable={false}
            />

            {commentsVisible ? comments.map((comment, index) => {
              const isActive = activeCommentId === comment.id;

              return (
                <button
                  key={comment.id}
                  type="button"
                  data-comment-interactive="true"
                  className={`absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[11px] font-[800] shadow-[0_12px_22px_rgba(16,33,23,0.16)] transition ${
                    isActive
                      ? "border-[#1f7a4b] bg-[#1f7a4b] text-white"
                      : "border-white/90 bg-[#fff8ed] text-[#8a4e14]"
                  }`}
                  style={{
                    left: `${comment.xPercent}%`,
                    top: `${comment.yPercent}%`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelComment();
                    onActiveCommentChange(isActive ? null : comment.id);
                  }}
                  aria-label={`Open comment ${index + 1}`}
                >
                  {index + 1}
                </button>
              );
            }) : null}

            {commentsVisible && activeComment ? (
              <div
                data-comment-interactive="true"
                className="absolute z-30 w-[min(18rem,calc(100%-1rem))] -translate-x-1/2 rounded-[18px] border border-[#d8e5d9] bg-white p-3 shadow-[0_18px_36px_rgba(14,31,20,0.14)]"
                style={getPopoverPosition(activeComment)}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-[700] text-[#111712]">{activeComment.author}</p>
                    <p className="text-[10px] text-[#7b847d]">
                      {activeComment.role} · {activeComment.createdAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[#7d847e] transition hover:text-[#27322b]"
                    onClick={() => onActiveCommentChange(null)}
                    aria-label="Close comment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-[12px] leading-[1.45] text-[#111712]">{activeComment.body}</p>
              </div>
            ) : null}

            {pendingComment ? (
              <div
                data-comment-interactive="true"
                className="absolute z-30 w-[min(19rem,calc(100%-1rem))] -translate-x-1/2 rounded-[20px] border border-[#d8e5d9] bg-white p-3 shadow-[0_20px_38px_rgba(14,31,20,0.16)]"
                style={{
                  left: `${pendingComment.displayXPercent}%`,
                  top: `${pendingComment.displayYPercent}%`,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <p className="text-[12px] font-[800] uppercase tracking-[0.08em] text-[#2c8b58]">
                  New Message
                </p>
                <Textarea
                  value={commentDraft}
                  onChange={(event) => onCommentDraftChange(event.target.value)}
                  placeholder="Type your comparison message"
                  className="mt-3 min-h-[90px] rounded-[16px] border border-[#dce6de] bg-[#f8fbf8] text-[13px]"
                />
                {commentError ? (
                  <p className="mt-2 text-[12px] text-[#bd554f]">{commentError}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    onClick={onCancelComment}
                    disabled={isSavingComment}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full"
                    onClick={onSaveComment}
                    disabled={isSavingComment}
                  >
                    {isSavingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Message
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 shrink-0 rounded-[20px] border border-[#dde6de] bg-[#f8fbf8] px-4 py-3">
        <div className="grid gap-3">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <p
                className={`truncate text-[12px] font-[800] ${
                  baseLabelStrong ? "text-[#173120]" : "text-[#7c887f]"
                }`}
                title={baseSubmission.originalFileName}
              >
                Artwork 1: {baseSubmission.originalFileName}
              </p>
            </div>
            <div className="inline-flex min-w-[170px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#3e9e69)] px-4 py-1.5 text-[12px] font-[700] text-white">
              Blend: {100 - opacity}% / {opacity}%
            </div>
            <div className="min-w-0 text-left lg:text-right">
              <p
                className={`truncate text-[12px] font-[800] ${
                  compareLabelStrong ? "text-[#173120]" : "text-[#7c887f]"
                }`}
                title={compareSubmission.originalFileName}
              >
                Artwork 2: {compareSubmission.originalFileName}
              </p>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#d9dfda] accent-brand"
            aria-label="Adjust compare submission opacity"
          />
        </div>
      </div>
    </Card>
  );
}

export function ProjectCompareWorkspace({
  project,
  stageId,
  history,
  initialBaseAttachmentId,
  initialCompareAttachmentId,
  initialComments,
  canManageCollaborators,
  canManageChatVisibility,
  currentUserId,
}: ProjectCompareWorkspaceProps) {
  const router = useRouter();
  const [isSelectionPending, startSelectionTransition] = useTransition();
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [comments, setComments] = useState<ComparisonCommentRecord[]>(initialComments);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(
    initialComments[0]?.id ?? null,
  );
  const [pendingComment, setPendingComment] = useState<PendingCommentPosition | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(true);
  const [opacity, setOpacity] = useState(100);
  const [baseImageDimensions, setBaseImageDimensions] = useState<ImageDimensions | null>(null);
  const [compareImageDimensions, setCompareImageDimensions] = useState<ImageDimensions | null>(
    null,
  );
  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        project.stageCards.find((stage) => stage.id === project.currentStageId) ??
        project.stageCards[0]
      );
    }

    return project.stageCards.find((stage) => stage.id === stageId) ?? project.stageCards[0];
  }, [project.currentStageId, project.stageCards, stageId]);
  const submissions = useMemo(
    () => getStageSubmissionAttachments(history.entries),
    [history.entries],
  );
  const { baseSubmission, compareSubmission } = useMemo(
    () =>
      resolveComparisonSelection(
        submissions,
        initialBaseAttachmentId,
        initialCompareAttachmentId,
      ),
    [initialBaseAttachmentId, initialCompareAttachmentId, submissions],
  );
  const comparisonAspectRatio = useMemo(() => {
    const maxWidth = Math.max(baseImageDimensions?.width ?? 1, compareImageDimensions?.width ?? 1);
    const maxHeight = Math.max(
      baseImageDimensions?.height ?? 1,
      compareImageDimensions?.height ?? 1,
    );

    return maxHeight > 0 ? maxWidth / maxHeight : 1;
  }, [baseImageDimensions, compareImageDimensions]);

  useEffect(() => {
    if (!viewerFullscreen && !pendingComment && !activeCommentId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (viewerFullscreen) {
      document.body.style.overflow = "hidden";
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (pendingComment) {
        setPendingComment(null);
        setCommentDraft("");
        setCommentError(null);
        return;
      }

      if (activeCommentId) {
        setActiveCommentId(null);
        return;
      }

      setViewerFullscreen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (viewerFullscreen) {
        document.body.style.overflow = previousOverflow;
      }

      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCommentId, pendingComment, viewerFullscreen]);

  function applyUpdatedCollaborators(updatedCollaborators: ProjectCollaboratorRecord[]) {
    setCollaborators((current) => {
      const owner = current.find((collaborator) => collaborator.access === "owner");
      return owner ? [owner, ...updatedCollaborators] : updatedCollaborators;
    });
  }

  async function removeCollaborator(id: string) {
    setCollaboratorSaving(true);

    try {
      const result = await removeProjectCollaboratorAction(project.id, id);

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyUpdatedCollaborators(result.collaborators);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleCollaboratorChatVisibilityToggle(
    collaboratorId: string,
    paused: boolean,
  ) {
    setCollaboratorSaving(true);

    try {
      const result = await setProjectCollaboratorChatVisibilityAction({
        projectId: project.id,
        collaboratorId,
        paused,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyUpdatedCollaborators(result.collaborators);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function updateComparisonSelection(kind: "base" | "compare", nextAttachmentId: string) {
    if (!baseSubmission || !compareSubmission) {
      return;
    }

    let nextBaseAttachmentId = baseSubmission.id;
    let nextCompareAttachmentId = compareSubmission.id;

    if (kind === "base") {
      nextBaseAttachmentId = nextAttachmentId;

      if (nextCompareAttachmentId === nextAttachmentId) {
        nextCompareAttachmentId =
          getFallbackComparisonId(submissions, nextAttachmentId, baseSubmission.id) ??
          nextCompareAttachmentId;
      }
    } else {
      nextCompareAttachmentId = nextAttachmentId;

      if (nextBaseAttachmentId === nextAttachmentId) {
        nextBaseAttachmentId =
          getFallbackComparisonId(submissions, nextAttachmentId, compareSubmission.id) ??
          nextBaseAttachmentId;
      }
    }

    if (
      !nextBaseAttachmentId ||
      !nextCompareAttachmentId ||
      nextBaseAttachmentId === nextCompareAttachmentId
    ) {
      return;
    }

    startSelectionTransition(() => {
      router.replace(
        buildCompareHref(
          project.id,
          stageId,
          nextBaseAttachmentId,
          nextCompareAttachmentId,
        ),
        { scroll: false },
      );
    });
  }

  async function handleSaveComment() {
    if (!baseSubmission || !compareSubmission || !pendingComment) {
      return;
    }

    const body = commentDraft.trim();

    if (!body) {
      setCommentError("Enter a message before sending.");
      return;
    }

    if (!stageId) {
      setCommentError("This stage could not be resolved for comparison comments.");
      return;
    }

    setCommentError(null);
    setIsSavingComment(true);

    try {
      const result = await createComparisonCommentAction({
        projectId: project.id,
        stageId,
        baseAttachmentId: baseSubmission.id,
        compareAttachmentId: compareSubmission.id,
        xPercent: pendingComment.xPercent,
        yPercent: pendingComment.yPercent,
        body,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      setComments((current) => [...current, result.comment]);
      setActiveCommentId(result.comment.id);
      setPendingComment(null);
      setCommentDraft("");
      router.refresh();
    } catch (error) {
      setCommentError(
        error instanceof Error
          ? error.message
          : "Unable to send the comparison message right now.",
      );
    } finally {
      setIsSavingComment(false);
    }
  }

  function selectComparisonComment(commentId: string) {
    setPendingComment(null);
    setCommentDraft("");
    setCommentError(null);
    setActiveCommentId(commentId);
  }

  const hasEnoughSubmissions = submissions.length >= 2;
  const insufficientSubmissionMessage =
    submissions.length === 0
      ? "No image submissions available for comparison."
      : submissions.length === 1
        ? "Upload another image revision to compare changes."
        : null;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[24px] border-none bg-[linear-gradient(135deg,#2f8d5d,#46a470)] p-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold tracking-tight">
                  Compare Submissions
                </h1>
                <p className="mt-2 max-w-[620px] text-[14px] text-white/82">
                  Overlay any two submission images from this stage, review changes with live
                  opacity, and pin proofing comments directly on the artwork.
                </p>
                <div className="mt-4 flex flex-wrap gap-6 text-[13px]">
                  <div>
                    <p className="font-[700] text-[#d3f7ca]">Project</p>
                    <p>{project.title}</p>
                  </div>
                  <div>
                    <p className="font-[700] text-[#d3f7ca]">Stage</p>
                    <p>{activeStage?.label ?? project.currentStageName}</p>
                  </div>
                  <div>
                    <p className="font-[700] text-[#d3f7ca]">Submissions</p>
                    <p>{submissions.length}</p>
                  </div>
                </div>
              </div>

              <Button
                asChild
                size="sm"
                className="min-w-[160px] bg-[#184d34] text-[13px] hover:bg-[#123f2a]"
              >
                <Link href={`/projects/${project.id}/chat?stage=${stageId ?? ""}`}>
                  Back to stage chat
                </Link>
              </Button>
            </div>
          </Card>

          {!hasEnoughSubmissions ? (
            <Card className="rounded-[20px] border border-dashed border-[#d7e3d8] bg-white p-6 text-center shadow-[0_12px_28px_rgba(19,28,22,0.04)]">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-[#111712]">
                {insufficientSubmissionMessage}
              </CardTitle>
              <p className="mt-2 text-[13px] text-[#6f786f]">
                Only same-stage PNG, JPG, JPEG, and WebP submissions are supported here.
              </p>
            </Card>
          ) : null}

          {hasEnoughSubmissions ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <ComparisonSelectionCard
                label="Base Submission"
                submission={baseSubmission}
                submissions={submissions}
                disabled={!hasEnoughSubmissions || isSelectionPending}
                onValueChange={(value) => updateComparisonSelection("base", value)}
              />
              <ComparisonSelectionCard
                label="Compare Submission"
                submission={compareSubmission}
                submissions={submissions}
                disabled={!hasEnoughSubmissions || isSelectionPending}
                onValueChange={(value) => updateComparisonSelection("compare", value)}
              />
            </div>
          ) : null}

          {isSelectionPending ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe6da] bg-[#f7fbf6] px-3 py-1.5 text-[12px] font-[600] text-[#31523f]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating comparison pair
            </div>
          ) : null}

          {hasEnoughSubmissions && baseSubmission && compareSubmission ? (
            <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <ComparisonViewerSurface
                baseSubmission={baseSubmission}
                compareSubmission={compareSubmission}
                comments={comments}
                opacity={opacity}
                onOpacityChange={setOpacity}
                activeCommentId={activeCommentId}
                onActiveCommentChange={setActiveCommentId}
                pendingComment={pendingComment}
                commentDraft={commentDraft}
                onCommentDraftChange={setCommentDraft}
                onSaveComment={handleSaveComment}
                onCancelComment={() => {
                  setPendingComment(null);
                  setCommentDraft("");
                  setCommentError(null);
                }}
                onCreatePendingComment={setPendingComment}
                isSavingComment={isSavingComment}
                commentError={commentError}
                onBaseImageLoad={setBaseImageDimensions}
                onCompareImageLoad={setCompareImageDimensions}
                comparisonAspectRatio={comparisonAspectRatio}
                onToggleFullscreen={() => setViewerFullscreen(true)}
                commentsVisible={commentsVisible}
                onToggleCommentsVisible={() => setCommentsVisible((current) => !current)}
              />

              <ComparisonCommentsPanel
                comments={comments}
                activeCommentId={activeCommentId}
                onSelectComment={selectComparisonComment}
              />
            </div>
          ) : null}

          {submissions.length > 0 ? (
            <Card className="rounded-[24px] border border-[#dbe4dc] bg-white/95 p-5 shadow-[0_12px_28px_rgba(18,35,23,0.05)]">
              <CardTitle className="text-[22px] font-semibold tracking-tight text-brand">Available Submissions</CardTitle>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-[18px] border border-[#e1e8e2] bg-[#fbfcfb] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] leading-none text-[#2b8b56]">
                        {formatSubmissionLabel(submission)}
                      </span>
                      <p className="truncate text-[13px] font-[700] text-[#111712]">
                        {submission.originalFileName}
                      </p>
                    </div>
                    <p className="mt-2 text-[12px] text-[#5f685f]">
                      {submission.uploadedBy} · {submission.uploadedAt}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <AssetPreviewButton
                        fileName={submission.originalFileName}
                        mimeType={submission.mimeType}
                        previewPath={submission.previewPath}
                        downloadPath={submission.downloadPath}
                        triggerClassName="h-9 rounded-full border border-[#d6dfd7] px-3 text-brand hover:bg-[#f5f8f5]"
                        iconOnly={false}
                      />
                      <Button
                        asChild
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                      >
                        <a
                          href={submission.downloadPath}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Download ${submission.originalFileName}`}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="rounded-[20px] border border-brand/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-brand">Stage Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="space-y-1.5 text-[13px] text-[#242b26]">
                <div>
                  <dt className="inline font-semibold">Execution Type :</dt>{" "}
                  <dd className="inline">{project.executionTypeLabel}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Budget :</dt>{" "}
                  <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Revisions :</dt>{" "}
                  <dd className="inline">
                    {history.entries.filter((entry) => entry.kind === "revision").length}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Stage Started :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedStartAt ?? project.startDate}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Stage Deadline :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedDueAt ?? project.endDate}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            currentUserId={currentUserId}
            onRemove={
              canManageCollaborators ? (collaboratorId) => removeCollaborator(collaboratorId) : undefined
            }
            onToggleChatVisibility={
              canManageChatVisibility
                ? (collaboratorId, paused) =>
                    handleCollaboratorChatVisibilityToggle(collaboratorId, paused)
                : undefined
            }
            saving={collaboratorSaving}
          />
        </div>
      </div>

      {viewerFullscreen && hasEnoughSubmissions && baseSubmission && compareSubmission ? (
        <div className="fixed inset-0 z-[100] bg-[#0f1311]">
          <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#0f1311] p-3 text-white sm:p-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div>
                <p className="text-[22px] font-semibold tracking-tight text-white">Compare Submissions</p>
                <p className="text-[13px] text-white/62">
                  {formatSubmissionLabel(baseSubmission)} vs {formatSubmissionLabel(compareSubmission)}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setViewerFullscreen(false)}
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <ComparisonViewerSurface
                  baseSubmission={baseSubmission}
                  compareSubmission={compareSubmission}
                  comments={comments}
                  opacity={opacity}
                  onOpacityChange={setOpacity}
                  activeCommentId={activeCommentId}
                  onActiveCommentChange={setActiveCommentId}
                  pendingComment={pendingComment}
                  commentDraft={commentDraft}
                  onCommentDraftChange={setCommentDraft}
                  onSaveComment={handleSaveComment}
                  onCancelComment={() => {
                    setPendingComment(null);
                    setCommentDraft("");
                    setCommentError(null);
                  }}
                  onCreatePendingComment={setPendingComment}
                  isSavingComment={isSavingComment}
                  commentError={commentError}
                  onBaseImageLoad={setBaseImageDimensions}
                  onCompareImageLoad={setCompareImageDimensions}
                  comparisonAspectRatio={comparisonAspectRatio}
                  onToggleFullscreen={() => setViewerFullscreen(false)}
                  commentsVisible={commentsVisible}
                  onToggleCommentsVisible={() => setCommentsVisible((current) => !current)}
                  fullscreenMode
                />

                <ComparisonCommentsPanel
                  comments={comments}
                  activeCommentId={activeCommentId}
                  onSelectComment={selectComparisonComment}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ComparisonViewerSurface } from "@/components/projects/comparison-viewer-surface";
import { Button } from "@/components/ui/button";
import { TaskSelect } from "./tasker-form-controls";

export type TaskViewFile = { id: string; name: string; mimeType: string; label: string; path: string };
const imageType = (type: string) => /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(type);
const modePath = (path: string, mode: string) => `${path}&mode=${mode}`;
const noop = () => {};

export function TaskFileTools({ file }: { file: TaskViewFile }) {
  const previewable = imageType(file.mimeType) || file.mimeType === "application/pdf" || file.mimeType.startsWith("text/");
  return <div className="flex shrink-0 items-center gap-1">
    {previewable && <AssetPreviewButton fileName={file.name} mimeType={file.mimeType} previewPath={modePath(file.path, "preview")} textContentPath={file.mimeType.startsWith("text/") ? modePath(file.path, "text") : null} downloadPath={modePath(file.path, "download")} iconOnly={false} />}
    <Button asChild variant="ghost" size="sm"><a href={modePath(file.path, "download")} aria-label={`Download ${file.name}`}><Download className="h-4 w-4" />Download</a></Button>
  </div>;
}

export function TaskFileComparison({ files }: { files: TaskViewFile[] }) {
  const images = files.filter((f) => imageType(f.mimeType));
  const [open, setOpen] = useState(false);
  const [baseId, setBaseId] = useState(""), [compareId, setCompareId] = useState("");
  const [opacity, setOpacity] = useState(50), [fullscreen, setFullscreen] = useState(false);
  const [tool, setTool] = useState<"view" | "pan" | "comment">("view");
  const [ratio, setRatio] = useState(1);
  const base = images.find((f) => f.id === baseId) ?? images[0];
  const compare = images.find((f) => f.id === compareId && f.id !== base?.id) ?? images.find((f) => f.id !== base?.id);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); };
  }, [fullscreen]);
  if (!base || !compare) return null;
  const selection = <>{[["Base file", base.id, (id: string) => setBaseId(id)], ["Compare file", compare.id, (id: string) => setCompareId(id)]] .map(([label, value, change]) => <TaskSelect key={String(label)} label={String(label)} value={String(value)} onChange={change as (id: string) => void} options={images.filter((f) => label === "Base file" || f.id !== base.id).map((f) => ({ id: f.id, label: f.label }))} />)}</>;
  const viewer = <ComparisonViewerSurface key={`${base.id}:${compare.id}`} baseSubmission={{ originalFileName: base.name, previewPath: modePath(base.path, "preview"), submissionNumber: undefined }} compareSubmission={{ originalFileName: compare.name, previewPath: modePath(compare.path, "preview"), submissionNumber: undefined }} comments={[]} opacity={opacity} onOpacityChange={setOpacity} activeCommentId={null} onActiveCommentChange={noop} pendingComment={null} commentDraft="" onCommentDraftChange={noop} onSaveComment={noop} onCancelComment={noop} onCreatePendingComment={noop} isSavingComment={false} commentError={null} onBaseImageLoad={({ width, height }) => setRatio(width / height || 1)} onCompareImageLoad={noop} comparisonAspectRatio={ratio} onToggleFullscreen={() => setFullscreen(!fullscreen)} commentsVisible={false} onToggleCommentsVisible={noop} canAddCaptions={false} toolMode={tool} onToolModeChange={setTool} selectionControls={selection} isSelectionPending={false} captionsPanelOpen={false} onToggleCaptionsPanel={noop} fullscreenMode={fullscreen} showCaptionControls={false} />;
  return <div className="mt-4 grid gap-3"><Button className="w-fit" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close comparison" : "Compare files"}</Button>{open && (fullscreen ? createPortal(<div role="dialog" aria-modal="true" aria-label="Compare task files" className="fixed inset-0 z-[120] bg-[#eef2ed] p-3">{viewer}</div>, document.body) : viewer)}</div>;
}

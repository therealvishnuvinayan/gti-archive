"use client";

import { useState } from "react";
import { Download, Eye, FileText, ImageIcon, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type AssetPreviewButtonProps = {
  fileName: string;
  mimeType: string;
  previewPath: string;
  downloadPath: string;
  triggerClassName?: string;
  iconOnly?: boolean;
};

function isPreviewableAsset(fileName: string, mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return true;
  }

  if (mimeType === "application/pdf") {
    return true;
  }

  return fileName.toLowerCase().endsWith(".pdf");
}

function PreviewLoadingState({ mimeType }: { mimeType: string }) {
  const isImage = mimeType.startsWith("image/");

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(248,251,248,0.96),rgba(243,248,243,0.96))] p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(74,148,84,0.08),transparent_48%)]" />
      <div className="relative flex w-full max-w-[720px] flex-col items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border border-[#d8e5d9] bg-white/85 px-3 py-1.5 text-[12px] font-medium text-[#5b685d] shadow-[0_8px_22px_rgba(22,38,29,0.06)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
          Preparing preview
        </div>

        <div className="relative w-full overflow-hidden rounded-[18px] border border-[#dfe9e0] bg-white/92 p-4 shadow-[0_18px_40px_rgba(22,38,29,0.06)]">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-[12px] bg-[#eef6ef] text-brand">
              {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-40 rounded-full" />
              <Skeleton className="mt-1 h-2.5 w-24 rounded-full" />
            </div>
          </div>

          {isImage ? (
            <div className="space-y-3">
              <Skeleton className="aspect-[16/10] w-full rounded-[14px]" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-14 rounded-[12px]" />
                <Skeleton className="h-14 rounded-[12px]" />
                <Skeleton className="h-14 rounded-[12px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full rounded-[12px]" />
              <Skeleton className="h-8 w-[92%] rounded-[12px]" />
              <Skeleton className="h-8 w-[88%] rounded-[12px]" />
              <Skeleton className="h-8 w-[95%] rounded-[12px]" />
              <Skeleton className="h-8 w-[84%] rounded-[12px]" />
              <Skeleton className="h-8 w-[90%] rounded-[12px]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AssetPreviewButton({
  fileName,
  mimeType,
  previewPath,
  downloadPath,
  triggerClassName,
  iconOnly = true,
}: AssetPreviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!isPreviewableAsset(fileName, mimeType)) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? "icon" : "sm"}
        className={triggerClassName}
        onClick={() => {
          setLoading(true);
          setOpen(true);
        }}
        aria-label={`View ${fileName}`}
      >
        <Eye className="h-4 w-4" />
        {iconOnly ? null : <span>View</span>}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="flex h-full max-h-[86vh] w-full max-w-[1080px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div className="min-w-0">
                <CardTitle className="truncate text-[22px] font-[700] tracking-[-0.03em] text-[#111712]">
                  {fileName}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild type="button" variant="secondary" size="icon" className="border border-line">
                  <a
                    href={downloadPath}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Download ${fileName}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setOpen(false)}
                  className="border border-line"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              <div className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden rounded-[20px] border border-[#e3e8e2] bg-[#f8fbf8]">
                {loading ? <PreviewLoadingState mimeType={mimeType} /> : null}
                {mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewPath}
                    alt={fileName}
                    onLoad={() => setLoading(false)}
                    onError={() => setLoading(false)}
                    className="h-full max-h-full w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={previewPath}
                    title={fileName}
                    onLoad={() => setLoading(false)}
                    className="h-full w-full bg-white"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

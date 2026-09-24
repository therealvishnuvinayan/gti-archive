import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import {
  Archive,
  Clock3,
  Download,
  Eye,
  FileQuestion,
  FolderKanban,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSharedArchiveFilePageData } from "@/lib/archives";
import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Secure Archive Download | GTI Archive",
  robots: { index: false, follow: false, nocache: true },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function getPreviewKind(fileName: string, mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

export default async function ArchiveDownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(requestHeaders),
    scope: "verify",
    limit: 30,
  });
  const data = rateLimit.allowed
    ? await getSharedArchiveFilePageData(token)
    : ({ state: "unavailable" } as const);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fbf7_0,#edf3ed_52%,#e5ece6_100%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="mb-5 flex items-center justify-between px-1">
          <div>
            <p className="text-[13px] font-[800] uppercase tracking-[0.18em] text-[#295f43]">
              GTI Archive
            </p>
            <p className="mt-1 text-[11px] text-[#738078]">Secure archive delivery</p>
          </div>
          <ShieldCheck className="h-7 w-7 text-[#397653]" />
        </div>

        <section className="overflow-hidden rounded-[26px] border border-[#dce5dd] bg-white shadow-[0_28px_80px_rgba(18,35,23,0.1)]">
          {data.state === "active" ? (
            <>
              <div className="border-b border-[#e4ebe4] bg-[#f7faf7] px-6 py-8 sm:px-9 sm:py-10">
                <p className="flex items-center gap-2 text-[11px] font-[800] uppercase tracking-[0.14em] text-[#397653]">
                  <Archive className="h-4 w-4" /> Archive file
                </p>
                <h1 className="mt-4 break-words text-[28px] font-[750] leading-tight text-[#111712] sm:text-[36px]">
                  {data.fileName}
                </h1>
                <p className="mt-3 break-words text-[13px] text-[#6b766e]">
                  Original: {data.originalFileName}
                </p>
              </div>

              <div className="px-6 py-7 sm:px-9 sm:py-9">
                <div className="mb-7">
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-[800] uppercase tracking-[0.12em] text-[#397653]">
                    <Eye className="h-4 w-4" /> File preview
                  </p>
                  <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[20px] border border-[#dfe7df] bg-[#f2f6f2] sm:min-h-[420px]">
                    {getPreviewKind(data.fileName, data.mimeType) === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.previewPath}
                        alt={`Preview of ${data.fileName}`}
                        className="max-h-[680px] w-full object-contain"
                      />
                    ) : getPreviewKind(data.fileName, data.mimeType) === "pdf" ? (
                      <iframe
                        src={data.previewPath}
                        title={`Preview of ${data.fileName}`}
                        className="h-[68vh] min-h-[520px] w-full bg-white"
                      />
                    ) : getPreviewKind(data.fileName, data.mimeType) === "video" ? (
                      <video
                        src={data.previewPath}
                        controls
                        preload="metadata"
                        className="max-h-[680px] w-full bg-black"
                      >
                        Your browser does not support this video preview.
                      </video>
                    ) : getPreviewKind(data.fileName, data.mimeType) === "audio" ? (
                      <div className="w-full px-6 py-16 text-center">
                        <p className="mb-5 text-[13px] font-[650] text-[#3f4d43]">
                          Audio preview
                        </p>
                        <audio
                          src={data.previewPath}
                          controls
                          preload="metadata"
                          className="mx-auto w-full max-w-[560px]"
                        >
                          Your browser does not support this audio preview.
                        </audio>
                      </div>
                    ) : (
                      <div className="px-6 py-16 text-center">
                        <FileQuestion className="mx-auto h-9 w-9 text-[#718078]" />
                        <p className="mt-4 text-[14px] font-[700] text-[#263129]">
                          Preview is not available for this file type
                        </p>
                        <p className="mt-1 text-[12px] text-[#748078]">
                          Download the file to open it in a compatible application.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {data.projectName ? (
                    <div className="rounded-[16px] border border-[#e0e8e0] bg-[#fafcfa] px-4 py-3.5">
                      <p className="flex items-center gap-1.5 text-[10px] font-[800] uppercase tracking-[0.1em] text-[#758078]">
                        <FolderKanban className="h-3.5 w-3.5" /> Project
                      </p>
                      <p className="mt-1.5 text-[14px] font-[700] text-[#172019]">{data.projectName}</p>
                    </div>
                  ) : null}
                  <div className="rounded-[16px] border border-[#e0e8e0] bg-[#fafcfa] px-4 py-3.5">
                    <p className="text-[10px] font-[800] uppercase tracking-[0.1em] text-[#758078]">Archive category</p>
                    <p className="mt-1.5 text-[14px] font-[700] text-[#172019]">{data.archiveCategory}</p>
                  </div>
                  <div className="rounded-[16px] border border-[#e0e8e0] bg-[#fafcfa] px-4 py-3.5">
                    <p className="text-[10px] font-[800] uppercase tracking-[0.1em] text-[#758078]">File details</p>
                    <p className="mt-1.5 text-[14px] font-[700] text-[#172019]">
                      {data.fileTypeLabel} · {data.fileSizeLabel}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-[#e0e8e0] bg-[#fafcfa] px-4 py-3.5">
                    <p className="text-[10px] font-[800] uppercase tracking-[0.1em] text-[#758078]">Shared by</p>
                    <p className="mt-1.5 text-[14px] font-[700] text-[#172019]">{data.sharedBy}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-[18px] border border-[#cfe3d2] bg-[#f3f9f4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-[12px] font-[700] text-[#2d6748]">
                      <Clock3 className="h-4 w-4" /> Link expires {formatDate(data.expiresAt)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#6d786f]">
                      Shared {formatDate(data.sharedAt)}
                    </p>
                  </div>
                  <Button asChild className="min-w-[190px]">
                    <a href={data.downloadPath}>
                      <Download className="h-4 w-4" /> Download archive file
                    </a>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-16 text-center sm:px-10 sm:py-20">
              {data.state === "expired" ? (
                <Clock3 className="mx-auto h-10 w-10 text-[#397653]" />
              ) : (
                <FileQuestion className="mx-auto h-10 w-10 text-[#748078]" />
              )}
              <h1 className="mt-5 text-[28px] font-[750] text-[#111712]">
                {data.state === "expired" ? "Archive link expired" : "Archive link unavailable"}
              </h1>
              <p className="mx-auto mt-2 max-w-[480px] text-[13px] leading-6 text-[#68746c]">
                {data.state === "expired"
                  ? "Contact the sender to request a new secure download link."
                  : "This link is invalid, unavailable, or has been removed."}
              </p>
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-[11px] text-[#758179]">
          Only the archive file explicitly shared with you is available on this page.
        </p>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  LockKeyhole,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FolderData = NonNullable<
  Awaited<ReturnType<typeof import("@/lib/project-research").getProjectResearchFolderPageData>>
>;

type PendingUpload = {
  key: string;
  name: string;
  progress: number;
  status: "preparing" | "uploading" | "completing" | "complete" | "failed";
  error?: string;
};

type UploadRequestPayload = {
  attachmentId: string;
  uploadUrl: string;
  uploadExpectedHeaders?: Record<string, string>;
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return <FileArchive className="h-5 w-5" />;
  if (mimeType.startsWith("text/") || mimeType.includes("pdf")) return <FileText className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

function putFile(
  uploadUrl: string,
  file: globalThis.File,
  headers: Record<string, string>,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The storage upload was not accepted."));
    };
    request.onerror = () => reject(new Error("The storage upload could not be completed."));
    request.send(file);
  });
}

export function StageTwoFolderWorkspace({
  data,
  currentUserId,
}: {
  data: FolderData;
  currentUserId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [deletingId, setDeletingId] = useState<string>();
  const baseApi = `/api/projects/${data.project.id}/research/folders/${data.folder.id}`;

  function updateUpload(key: string, patch: Partial<PendingUpload>) {
    setUploads((current) => current.map((upload) => upload.key === key ? { ...upload, ...patch } : upload));
  }

  async function uploadOne(file: globalThis.File, key: string) {
    let attachmentId: string | undefined;
    try {
      const response = await fetch(`${baseApi}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });
      const upload = (await response.json()) as UploadRequestPayload;
      if (!response.ok || upload.error || !upload.attachmentId || !upload.uploadUrl) {
        throw new Error(upload.error || "Unable to prepare this upload.");
      }
      attachmentId = upload.attachmentId;
      updateUpload(key, { status: "uploading", progress: 0 });
      await putFile(
        upload.uploadUrl,
        file,
        upload.uploadExpectedHeaders ?? { "Content-Type": file.type || "application/octet-stream" },
        (progress) => updateUpload(key, { progress }),
      );
      updateUpload(key, { status: "completing", progress: 100 });
      const completeResponse = await fetch(`${baseApi}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId }),
      });
      const complete = (await completeResponse.json()) as { error?: string };
      if (!completeResponse.ok) throw new Error(complete.error || "Unable to finish this upload.");
      updateUpload(key, { status: "complete", progress: 100 });
    } catch (error) {
      if (attachmentId) {
        await fetch(`${baseApi}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId, failed: true }),
        }).catch(() => undefined);
      }
      updateUpload(key, {
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  async function uploadFiles(fileList: FileList | globalThis.File[]) {
    if (!data.canWrite) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const next = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
      status: "preparing" as const,
    }));
    setUploads((current) => [...next, ...current]);
    await Promise.all(files.map((file, index) => uploadOne(file, next[index].key)));
    router.refresh();
  }

  async function deleteFile(fileId: string, name: string) {
    if (!window.confirm(`Delete ${name}? This will remove the stored file.`)) return;
    setDeletingId(fileId);
    try {
      const response = await fetch(`${baseApi}/files/${fileId}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete file.");
      showSuccessToast("File deleted.");
      router.refresh();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Unable to delete file.");
    } finally {
      setDeletingId(undefined);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={data.project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="border-b border-[#e6ece7] px-5 py-6 sm:px-8">
            <Link href={`/projects/${data.project.id}/stages/2?workspace=${encodeURIComponent(data.workspace.id)}`} className="inline-flex items-center gap-2 text-[12px] font-[700] text-[#347452] hover:text-[#195c39]">
              <ArrowLeft className="h-4 w-4" /> Research workspace
            </Link>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-12 place-items-center rounded-[14px] bg-[#e7f3ea] text-[#2d7952]"><FolderOpen className="h-6 w-6" /></span>
                <div className="min-w-0"><p className="text-[11px] font-[700] uppercase tracking-[0.1em] text-[#77827a]">{data.workspace.ownerName}&apos;s folder set</p><h1 className="truncate text-[28px] font-[780] tracking-[-0.04em] text-[#151c17]">{data.folder.name}</h1></div>
              </div>
              {!data.canWrite ? <span className="inline-flex items-center gap-2 self-start rounded-full bg-[#e9eeea] px-3 py-2 text-[11px] font-[700] text-[#627067]"><LockKeyhole className="h-3.5 w-3.5" />Read-only workspace</span> : null}
            </div>
          </div>

          {data.canWrite ? (
            <div className="px-5 pt-6 sm:px-8">
              <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ""; }} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files); }}
                className={cn("flex w-full flex-col items-center justify-center rounded-[20px] border border-dashed px-6 py-8 text-center transition", dragging ? "border-[#28734d] bg-[#eaf5ed]" : "border-[#a9c7b3] bg-[#f7fbf8] hover:bg-[#eff7f1]")}
              >
                <UploadCloud className="h-7 w-7 text-[#2d7952]" /><span className="mt-2 text-[14px] font-[720] text-[#245f40]">Drop files here or choose files</span><span className="mt-1 text-[11px] text-[#748078]">Any file type is accepted, subject to the project upload size limit.</span>
              </button>
            </div>
          ) : null}

          <div className="px-5 py-6 sm:px-8">
            {uploads.length > 0 ? (
              <div className="mb-5 space-y-2">
                {uploads.map((upload) => (
                  <div key={upload.key} className="rounded-[14px] border border-[#e2e8e3] bg-[#fafcfb] px-4 py-3">
                    <div className="flex justify-between gap-4 text-[12px]"><span className="truncate font-[650] text-[#29332c]">{upload.name}</span><span className={upload.status === "failed" ? "text-[#b84e48]" : "text-[#5f6d63]"}>{upload.status === "uploading" ? `${upload.progress}%` : upload.status}</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e4eae5]"><div className={cn("h-full rounded-full transition-all", upload.status === "failed" ? "bg-[#bd5b53]" : "bg-[#2b8056]")} style={{ width: `${upload.status === "preparing" ? 5 : upload.progress}%` }} /></div>
                    {upload.error ? <p className="mt-1 text-[11px] text-[#b84e48]">{upload.error}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[18px] border border-[#e0e6e1] bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_80px_88px] gap-3 border-b border-[#e7ece8] bg-[#f8faf8] px-4 py-3 text-[10px] font-[750] uppercase tracking-[0.09em] text-[#778179] sm:grid-cols-[minmax(0,1fr)_120px_160px_120px] sm:gap-4">
                <span>Name</span><span>Size</span><span className="hidden sm:block">Uploaded</span><span className="text-right">Actions</span>
              </div>
              {data.files.length === 0 ? (
                <div className="px-6 py-14 text-center"><File className="mx-auto h-7 w-7 text-[#9aa59d]" /><p className="mt-3 text-[14px] font-[680] text-[#465149]">No files yet</p><p className="mt-1 text-[12px] text-[#7d8880]">This folder is ready for research and planning materials.</p></div>
              ) : data.files.map((file) => (
                <div key={file.id} className="grid grid-cols-[minmax(0,1fr)_80px_88px] items-center gap-3 border-b border-[#edf1ee] px-4 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_120px_160px_120px] sm:gap-4">
                  <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#edf5ef] text-[#397655]"><FileIcon mimeType={file.mimeType} /></span><div className="min-w-0"><p className="truncate text-[13px] font-[680] text-[#253028]" title={file.name}>{file.name}</p><p className="truncate text-[10px] text-[#879188]">{file.uploadedBy}</p></div></div>
                  <span className="text-[11px] text-[#6f7b72]">{formatBytes(file.size)}</span>
                  <span className="hidden text-[11px] text-[#6f7b72] sm:block">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(file.uploadedAt))}</span>
                  <div className="flex justify-end gap-1"><Button asChild type="button" variant="ghost" size="icon"><a href={`${baseApi}/files/${file.id}/download`} aria-label={`Download ${file.name}`}><Download className="h-4 w-4" /></a></Button>{data.canWrite ? <Button type="button" variant="ghost" size="icon" disabled={deletingId === file.id} onClick={() => void deleteFile(file.id, file.name)} aria-label={`Delete ${file.name}`}><Trash2 className="h-4 w-4 text-[#a64b45]" /></Button> : null}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

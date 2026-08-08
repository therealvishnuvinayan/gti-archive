"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type DragEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  Grid2X2,
  List,
  Loader2,
  LockKeyhole,
  MoreVertical,
  Presentation,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";

import { AssetPreviewDialog } from "@/components/projects/asset-preview-button";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { uploadProjectResearchFile } from "@/lib/project-research-upload-client";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FolderData = NonNullable<
  Awaited<ReturnType<typeof import("@/lib/project-research").getProjectResearchFolderPageData>>
>;
type FolderFile = FolderData["files"][number];
type FileView = "grid" | "list";
type FileSort = "newest" | "oldest" | "name-asc" | "name-desc";

type PendingUpload = {
  key: string;
  name: string;
  progress: number;
  status: "preparing" | "uploading" | "failed";
  error?: string;
};

const FILE_VIEW_STORAGE_KEY = "gti-stage-two-file-view";
const FILE_VIEW_CHANGE_EVENT = "gti-stage-two-file-view-change";
const sortLabels: Record<FileSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
};

function subscribeToFileView(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FILE_VIEW_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FILE_VIEW_CHANGE_EVENT, onStoreChange);
  };
}

function getStoredFileView(): FileView {
  const savedView = window.localStorage.getItem(FILE_VIEW_STORAGE_KEY);
  return savedView === "list" ? "list" : "grid";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUploadedDate(value: string, detailed = false) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(detailed ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

function getExtension(name: string) {
  const extension = name.split(".").pop();
  return extension && extension !== name ? extension.toLocaleUpperCase("en") : "FILE";
}

function getFileKind(file: Pick<FolderFile, "name" | "mimeType">) {
  const extension = getExtension(file.name).toLocaleLowerCase("en");
  const mimeType = file.mimeType.toLocaleLowerCase("en");

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || extension === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(extension)) return "document";
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) return "spreadsheet";
  if (["ppt", "pptx", "odp"].includes(extension)) return "presentation";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  if (["psd", "ai", "eps", "dwg", "dxf", "cad"].includes(extension)) return "design";
  if (mimeType.startsWith("text/") || ["md", "json", "xml"].includes(extension)) {
    return "text";
  }
  return "generic";
}

function isBrowserPreviewable(file: Pick<FolderFile, "name" | "mimeType">) {
  const kind = getFileKind(file);
  return ["image", "video", "pdf", "text"].includes(kind);
}

function FileKindIcon({ file, className }: { file: FolderFile; className?: string }) {
  const kind = getFileKind(file);
  const iconClassName = cn("h-5 w-5", className);

  if (kind === "image") return <FileImage className={iconClassName} />;
  if (kind === "video") return <FileVideo className={iconClassName} />;
  if (kind === "archive") return <FileArchive className={iconClassName} />;
  if (kind === "spreadsheet") return <FileSpreadsheet className={iconClassName} />;
  if (kind === "presentation") return <Presentation className={iconClassName} />;
  if (kind === "design") return <FileCode2 className={iconClassName} />;
  if (kind === "document" || kind === "pdf" || kind === "text") {
    return <FileText className={iconClassName} />;
  }
  return <File className={iconClassName} />;
}

function FileVisual({ file }: { file: FolderFile }) {
  const kind = getFileKind(file);
  const previewHref = `/api/project-assets/${file.attachmentId}/preview`;

  if (kind === "image") {
    return (
      <span className="relative block h-full w-full overflow-hidden bg-[#edf2ee]">
        <Image
          src={previewHref}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 640px) 80vw, (max-width: 1200px) 33vw, 240px"
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </span>
    );
  }

  const visualStyles: Record<string, string> = {
    video: "bg-[#eef2f8] text-[#4d6486]",
    pdf: "bg-[#fff0ef] text-[#b84e48]",
    document: "bg-[#edf3fb] text-[#426ea7]",
    spreadsheet: "bg-[#ebf6ef] text-[#2d7d51]",
    presentation: "bg-[#fff3e9] text-[#b66c32]",
    archive: "bg-[#f4effa] text-[#7758a2]",
    design: "bg-[#f0eff9] text-[#5e589c]",
    text: "bg-[#f1f4f2] text-[#5a6b60]",
    generic: "bg-[#f1f4f2] text-[#66736a]",
  };

  return (
    <span className={cn("flex h-full w-full flex-col items-center justify-center", visualStyles[kind])}>
      <FileKindIcon file={file} className="h-12 w-12" />
      <span className="mt-3 rounded-full bg-white/70 px-3 py-1 text-[10px] font-[780] tracking-[0.08em]">
        {getExtension(file.name)}
      </span>
    </span>
  );
}

function FileActionMenu({
  file,
  baseApi,
  canWrite,
  deleting,
  onPreview,
  onDelete,
}: {
  file: FolderFile;
  baseApi: string;
  canWrite: boolean;
  deleting: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-[9px]"
          aria-label={`Actions for ${file.name}`}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[190px]">
        {isBrowserPreviewable(file) ? (
          <DropdownMenuItem onSelect={onPreview}>
            <Eye className="h-4 w-4" /> Preview / Open
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <a href={`${baseApi}/files/${file.id}/download`}>
            <Download className="h-4 w-4" /> Download
          </a>
        </DropdownMenuItem>
        {canWrite ? (
          <DropdownMenuItem
            disabled={deleting}
            onSelect={onDelete}
            className="text-[#a64b45] focus:text-[#a64b45]"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileGalleryCard({
  file,
  baseApi,
  canWrite,
  deleting,
  onPreview,
  onDelete,
}: {
  file: FolderFile;
  baseApi: string;
  canWrite: boolean;
  deleting: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const previewable = isBrowserPreviewable(file);
  const openHref = previewable
    ? `/api/project-assets/${file.attachmentId}/preview`
    : `${baseApi}/files/${file.id}/download`;

  return (
    <article className="group min-w-0 overflow-hidden rounded-[18px] border border-[#dfe6df] bg-white shadow-[0_9px_24px_rgba(23,39,28,0.045)] transition hover:-translate-y-0.5 hover:border-[#bcd4c3] hover:shadow-[0_16px_34px_rgba(28,75,48,0.09)]">
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[#edf5ef] text-[#397655]">
          <FileKindIcon file={file} className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-[12px] font-[700] text-[#273129]" title={file.name}>
          {file.name}
        </p>
        <FileActionMenu
          file={file}
          baseApi={baseApi}
          canWrite={canWrite}
          deleting={deleting}
          onPreview={onPreview}
          onDelete={onDelete}
        />
      </div>
      {previewable ? (
        <button
          type="button"
          onClick={onPreview}
          className="block h-[148px] w-full border-y border-[#edf1ed] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          aria-label={`Preview ${file.name}`}
        >
          <FileVisual file={file} />
        </button>
      ) : (
        <a
          href={openHref}
          className="block h-[148px] border-y border-[#edf1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          aria-label={`Download ${file.name}`}
        >
          <FileVisual file={file} />
        </a>
      )}
      <div className="min-w-0 px-3 py-3">
        <p className="truncate text-[11px] text-[#657169]" title={file.uploadedBy}>
          {file.uploadedBy}
        </p>
        <p className="mt-1 text-[10px] text-[#8a948d]">
          Uploaded {formatUploadedDate(file.uploadedAt)} · {formatBytes(file.size)}
        </p>
      </div>
    </article>
  );
}

export function StageTwoFolderWorkspace({
  data,
  currentUserId,
}: {
  data: FolderData;
  currentUserId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const view = useSyncExternalStore(
    subscribeToFileView,
    getStoredFileView,
    () => "grid",
  );
  const [sort, setSort] = useState<FileSort>("newest");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FolderFile[]>(data.files);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [deletingId, setDeletingId] = useState<string>();
  const [previewFile, setPreviewFile] = useState<FolderFile>();
  const [fileToDelete, setFileToDelete] = useState<FolderFile>();
  const [deleteError, setDeleteError] = useState<string>();
  const baseApi = `/api/projects/${data.project.id}/research/folders/${data.folder.id}`;

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    const next = files.filter((file) =>
      normalizedQuery ? file.name.toLocaleLowerCase("en").includes(normalizedQuery) : true,
    );

    return next.sort((left, right) => {
      if (sort === "name-asc") return left.name.localeCompare(right.name);
      if (sort === "name-desc") return right.name.localeCompare(left.name);
      const dateDifference = new Date(left.uploadedAt).getTime() - new Date(right.uploadedAt).getTime();
      return sort === "oldest" ? dateDifference : -dateDifference;
    });
  }, [files, query, sort]);

  function updateUpload(key: string, patch: Partial<PendingUpload>) {
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)),
    );
  }

  async function uploadFiles(fileList: FileList | File[]) {
    if (!data.canWrite) return;
    const selectedFiles = Array.from(fileList);
    if (selectedFiles.length === 0) return;

    const pending = selectedFiles.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
      status: "preparing" as const,
    }));
    setUploads((current) => [...pending, ...current]);

    const results = await Promise.allSettled(
      selectedFiles.map(async (file, index) => {
        const key = pending[index].key;
        updateUpload(key, { status: "uploading", progress: 0 });
        try {
          const uploadedFile = await uploadProjectResearchFile({
            projectId: data.project.id,
            folderId: data.folder.id,
            file,
            onProgress: (progress) => updateUpload(key, { progress }),
          });
          setFiles((current) => [uploadedFile as FolderFile, ...current]);
          return uploadedFile;
        } catch (error) {
          updateUpload(key, {
            status: "failed",
            error: error instanceof Error ? error.message : "Upload failed.",
          });
          throw error;
        }
      }),
    );
    const uploadedCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - uploadedCount;

    const failedUploadKeys = new Set(
      results.flatMap((result, index) =>
        result.status === "rejected" ? [pending[index].key] : [],
      ),
    );
    setUploads((current) =>
      current.filter((upload) => failedUploadKeys.has(upload.key)),
    );
    if (uploadedCount > 0) {
      showSuccessToast(`${uploadedCount} ${uploadedCount === 1 ? "file" : "files"} uploaded.`);
    }
    if (failedCount > 0) {
      showErrorToast(`${failedCount} ${failedCount === 1 ? "file could" : "files could"} not be uploaded.`);
    }
  }

  async function deleteFile(file: FolderFile) {
    setDeletingId(file.id);
    setDeleteError(undefined);
    try {
      const response = await fetch(`${baseApi}/files/${file.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete file.");
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setFileToDelete(undefined);
      showSuccessToast("File deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete file.";
      setDeleteError(message);
      showErrorToast(message);
    } finally {
      setDeletingId(undefined);
    }
  }

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("Files");
  }

  function changeView(nextView: FileView) {
    window.localStorage.setItem(FILE_VIEW_STORAGE_KEY, nextView);
    window.dispatchEvent(new Event(FILE_VIEW_CHANGE_EVENT));
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={data.project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <header className="border-b border-[#e6ece7] px-5 py-5 sm:px-8">
            <Link
              href={`/projects/${data.project.id}/stages/2?workspace=${encodeURIComponent(data.workspace.id)}`}
              className="inline-flex items-center gap-2 text-[12px] font-[700] text-[#347452] hover:text-[#195c39]"
            >
              <ArrowLeft className="h-4 w-4" /> Research workspace
              <span className="text-[#a0aaa2]">/</span>
              <span className="max-w-[220px] truncate text-[#536158]">{data.folder.name}</span>
            </Link>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-[#e7f3ea] text-[#2d7952]">
                  <FolderOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-[26px] font-[780] tracking-[-0.04em] text-[#151c17] sm:text-[30px]">
                    {data.folder.name}
                  </h1>
                  <p className="mt-0.5 text-[11px] text-[#77827a]">
                    {data.workspace.ownerName}&apos;s folder set · {files.length} {files.length === 1 ? "file" : "files"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!data.canWrite ? (
                  <span className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[#e9eeea] px-3 text-[11px] font-[700] text-[#627067]">
                    <LockKeyhole className="h-3.5 w-3.5" /> Read-only workspace
                  </span>
                ) : (
                  <Button type="button" className="h-10 rounded-[11px]" onClick={() => inputRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Upload Files
                  </Button>
                )}
                <div className="inline-flex rounded-[11px] border border-[#dce3dc] bg-white p-1">
                  {(["grid", "list"] as FileView[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-label={`${option} view`}
                      aria-pressed={view === option}
                      onClick={() => changeView(option)}
                      className={cn(
                        "grid size-8 place-items-center rounded-[8px]",
                        view === option ? "bg-[#24764e] text-white" : "text-[#68736b] hover:bg-[#f1f5f2]",
                      )}
                    >
                      {option === "grid" ? <Grid2X2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="secondary" className="h-10 min-w-[145px] justify-between rounded-[11px] shadow-none">
                      <SlidersHorizontal className="h-4 w-4" /> {sortLabels[sort]} <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Sort files</DropdownMenuLabel>
                    {(Object.keys(sortLabels) as FileSort[]).map((option) => (
                      <DropdownMenuItem key={option} onSelect={() => setSort(option)}>
                        <span className="flex-1">{sortLabels[option]}</span>
                        {sort === option ? <Check className="h-4 w-4 text-brand" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <div className="border-b border-[#e9eee9] bg-[#fbfcfb] px-5 py-3 sm:px-8">
            <div className="relative max-w-[420px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829087]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files in this folder..."
                aria-label="Search files in this folder"
                className="h-10 rounded-[11px] border-[#dce3dc] bg-white pl-10 shadow-none"
              />
            </div>
          </div>

          <div
            className="relative min-h-[390px] bg-[#fbfcfb] px-5 py-6 sm:px-8"
            onDragEnter={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              dragDepth.current += 1;
              if (data.canWrite) setDragging(true);
            }}
            onDragOver={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = data.canWrite ? "copy" : "none";
            }}
            onDragLeave={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(event) => {
              if (!isFileDrag(event)) return;
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              if (data.canWrite) void uploadFiles(event.dataTransfer.files);
            }}
          >
            {dragging && data.canWrite ? (
              <div className="absolute inset-3 z-30 flex flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#2b8056] bg-[#eaf5ed]/95 text-center text-[#216643] shadow-[0_18px_44px_rgba(25,103,67,0.12)]">
                <UploadCloud className="h-10 w-10" />
                <p className="mt-3 text-[17px] font-[760]">Drop files to upload to {data.folder.name}</p>
                <p className="mt-1 text-[12px] text-[#5c7968]">Multiple files are supported.</p>
              </div>
            ) : null}

            {uploads.length > 0 ? (
              <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {uploads.map((upload) => (
                  <div key={upload.key} className="rounded-[13px] border border-[#e2e8e3] bg-white px-3.5 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="min-w-0 flex-1 truncate font-[680] text-[#29332c]">{upload.name}</span>
                      <span className={upload.status === "failed" ? "text-[#b84e48]" : "text-[#5f6d63]"}>
                        {upload.status === "uploading" ? `${upload.progress}%` : upload.status}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e4eae5]">
                      <div
                        className={cn("h-full rounded-full transition-all", upload.status === "failed" ? "bg-[#bd5b53]" : "bg-[#2b8056]")}
                        style={{ width: `${upload.status === "preparing" ? 5 : upload.progress}%` }}
                      />
                    </div>
                    {upload.error ? <p className="mt-1 text-[10px] text-[#b84e48]">{upload.error}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {visibleFiles.length === 0 ? (
              <div className="flex min-h-[310px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#d7e0d8] bg-white/70 px-6 text-center">
                <span className="grid size-14 place-items-center rounded-[17px] bg-[#edf5ef] text-[#397655]">
                  <FolderOpen className="h-7 w-7" />
                </span>
                <p className="mt-4 text-[15px] font-[720] text-[#364239]">
                  {query ? "No matching files" : "No files yet"}
                </p>
                <p className="mt-1 max-w-[360px] text-[12px] leading-5 text-[#77827a]">
                  {query
                    ? "Try another file name."
                    : data.canWrite
                      ? `Drag files here or upload files to ${data.folder.name}.`
                      : "This folder does not contain any files yet."}
                </p>
                {!query && data.canWrite ? (
                  <Button type="button" className="mt-5 rounded-[11px]" onClick={() => inputRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Upload Files
                  </Button>
                ) : null}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-4">
                {visibleFiles.map((file) => (
                  <FileGalleryCard
                    key={file.id}
                    file={file}
                    baseApi={baseApi}
                    canWrite={data.canWrite}
                    deleting={deletingId === file.id}
                    onPreview={() => setPreviewFile(file)}
                    onDelete={() => {
                      setDeleteError(undefined);
                      setFileToDelete(file);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-[#e0e6e1] bg-white">
                <div className="hidden grid-cols-[minmax(0,1fr)_120px_160px_110px_52px] gap-4 border-b border-[#e7ece8] bg-[#f8faf8] px-4 py-3 text-[10px] font-[750] uppercase tracking-[0.09em] text-[#778179] md:grid">
                  <span>Name</span><span>Type</span><span>Uploaded</span><span>Size</span><span />
                </div>
                {visibleFiles.map((file) => (
                  <div key={file.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-center gap-3 border-b border-[#edf1ee] px-4 py-3.5 last:border-0 md:grid-cols-[minmax(0,1fr)_120px_160px_110px_52px] md:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#edf5ef] text-[#397655]"><FileKindIcon file={file} /></span>
                      <div className="min-w-0">
                        {isBrowserPreviewable(file) ? (
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="block max-w-full truncate text-left text-[13px] font-[680] text-[#253028] hover:text-brand hover:underline"
                            title={file.name}
                          >
                            {file.name}
                          </button>
                        ) : (
                          <a
                            href={`${baseApi}/files/${file.id}/download`}
                            className="block truncate text-[13px] font-[680] text-[#253028] hover:text-brand hover:underline"
                            title={file.name}
                          >
                            {file.name}
                          </a>
                        )}
                        <p className="truncate text-[10px] text-[#879188] md:hidden">{file.uploadedBy} · {formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <span className="hidden text-[11px] text-[#6f7b72] md:block">{getExtension(file.name)}</span>
                    <span className="hidden text-[11px] leading-4 text-[#6f7b72] md:block">{formatUploadedDate(file.uploadedAt, true)}<span className="block truncate text-[10px] text-[#8b958e]" title={file.uploadedBy}>{file.uploadedBy}</span></span>
                    <span className="hidden text-[11px] text-[#6f7b72] md:block">{formatBytes(file.size)}</span>
                    <FileActionMenu
                      file={file}
                      baseApi={baseApi}
                      canWrite={data.canWrite}
                      deleting={deletingId === file.id}
                      onPreview={() => setPreviewFile(file)}
                      onDelete={() => {
                        setDeleteError(undefined);
                        setFileToDelete(file);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {previewFile ? (
        <AssetPreviewDialog
          key={previewFile.attachmentId}
          isOpen
          fileName={previewFile.name}
          mimeType={previewFile.mimeType}
          previewPath={`/api/project-assets/${previewFile.attachmentId}/preview`}
          downloadPath={`${baseApi}/files/${previewFile.id}/download`}
          onClose={() => setPreviewFile(undefined)}
        />
      ) : null}

      <ConfirmationDialog
        isOpen={Boolean(fileToDelete)}
        title="Delete file?"
        description={
          fileToDelete
            ? `Delete “${fileToDelete.name}”? This permanently removes the stored file and cannot be undone.`
            : ""
        }
        confirmLabel="Delete file"
        tone="destructive"
        pending={Boolean(fileToDelete && deletingId === fileToDelete.id)}
        error={deleteError}
        onConfirm={() => {
          if (fileToDelete) void deleteFile(fileToDelete);
        }}
        onClose={() => {
          setFileToDelete(undefined);
          setDeleteError(undefined);
        }}
      />
    </section>
  );
}

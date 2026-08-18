"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderKey,
  Grid2X2,
  List,
  ListChecks,
  LockKeyhole,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import {
  completeProjectResearchStageAction,
  createProjectResearchFolderAction,
  deleteProjectResearchFolderAction,
} from "@/app/(dashboard)/projects/[slug]/stages/2/actions";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectResearchPageData } from "@/lib/project-research";
import { uploadProjectResearchFile } from "@/lib/project-research-upload-client";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FolderView = "grid" | "list";
type FolderSort = "business" | "name-asc" | "name-desc" | "files-desc";
type FolderRecord = NonNullable<ProjectResearchPageData>["folders"][number];
type FolderUploadSummary = { fileCount: number; progress: number };

const sortLabels: Record<FolderSort, string> = {
  business: "Default order",
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "files-desc": "Most files",
};

function FolderArtwork({ action = false }: { action?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid size-12 shrink-0 place-items-center rounded-[14px]",
        action
          ? "border border-dashed border-[#77a88b] bg-white/70 text-[#28724b]"
          : "bg-[linear-gradient(145deg,#eaf5ed,#dceee2)] text-[#31805a]",
      )}
    >
      {action ? <Plus className="h-5 w-5" /> : <Folder className="h-7 w-7 fill-current opacity-90" />}
    </span>
  );
}

function FolderTile({
  folder,
  view,
  href,
  canWrite,
  canDelete,
  upload,
  onDropFiles,
  onDelete,
}: {
  folder: FolderRecord;
  view: FolderView;
  href: string;
  canWrite: boolean;
  canDelete: boolean;
  upload?: FolderUploadSummary;
  onDropFiles: (folder: FolderRecord, files: File[]) => void;
  onDelete: (folder: FolderRecord) => void;
}) {
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("Files");
  }

  return (
    <div
      aria-busy={Boolean(upload)}
      onDragEnter={(event) => {
        if (!canWrite || !isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!canWrite || !isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!canWrite || !isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        if (!canWrite || !isFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragActive(false);
        onDropFiles(folder, Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "group relative overflow-hidden border bg-white text-left shadow-[0_10px_28px_rgba(23,39,28,0.045)] transition hover:-translate-y-0.5 hover:border-[#bcd4c3] hover:shadow-[0_18px_38px_rgba(28,75,48,0.09)]",
        dragActive
          ? "border-[#2b8056] bg-[#eaf5ed] ring-2 ring-[#2b8056]/20"
          : "border-[#dfe6df]",
        view === "grid"
          ? "min-h-[154px] rounded-[20px]"
          : "w-full rounded-[17px]",
      )}
    >
      <Link
        href={href}
        draggable={false}
        className={cn(
          "flex h-full w-full",
          view === "grid"
            ? "min-h-[152px] flex-col p-5"
            : "items-center gap-4 px-4 py-3.5",
        )}
      >
        <div className={cn("flex w-full items-center gap-4", canDelete && "pr-10")}>
          <FolderArtwork />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-[720] text-[#202a23]">{folder.name}</span>
            <span className="mt-1 block text-[11px] text-[#7c867f]">
              {folder.isSystem ? "System folder" : "Custom folder"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#8a948d] transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </div>
        <span className={cn("flex items-center gap-1.5 text-[11px] text-[#6f7a72]", view === "grid" && "mt-auto border-t border-[#edf1ed] pt-3.5")}>
          {upload ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <File className="h-3.5 w-3.5" />}
          {upload
            ? `Uploading ${upload.fileCount} ${upload.fileCount === 1 ? "file" : "files"} · ${upload.progress}%`
            : `${folder.fileCount} ${folder.fileCount === 1 ? "file" : "files"}`}
        </span>
      </Link>
      {canDelete ? (
        <button
          type="button"
          aria-label={`Delete ${folder.name}`}
          title={`Delete ${folder.name}`}
          disabled={Boolean(upload)}
          onClick={() => onDelete(folder)}
          className={cn(
            "absolute z-20 grid size-9 place-items-center rounded-[10px] border border-[#ead9d7] bg-white text-[#ad514b] shadow-sm transition hover:border-[#d9a9a5] hover:bg-[#fff2f1] disabled:cursor-not-allowed disabled:opacity-45",
            view === "grid" ? "right-4 top-4" : "right-4 top-1/2 -translate-y-1/2",
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
      {dragActive ? (
        <span className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#eaf5ed]/95 text-[#216643]">
          <UploadCloud className="h-7 w-7" />
          <span className="mt-2 text-[13px] font-[760]">Drop to upload</span>
        </span>
      ) : null}
    </div>
  );
}

function NewFolderDialog({
  open,
  pending,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#112118]/40 px-4 py-8 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <Card className="w-full max-w-[500px] rounded-[24px] border border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-[760] tracking-[-0.03em] text-[#162019]">Create a folder</h2>
              <p className="mt-1 text-[13px] text-[#6f7a72]">Add a flat custom folder to the shared project workspace.</p>
            </div>
            <Button type="button" variant="secondary" size="icon" onClick={onClose} disabled={pending}>
              <X className="h-4 w-4" /><span className="sr-only">Close</span>
            </Button>
          </div>
          <label className="mt-6 block space-y-2">
            <span className="text-[13px] font-[680] text-[#2d372f]">Folder name</span>
            <Input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreate(name);
                if (event.key === "Escape") onClose();
              }}
              placeholder="e.g., Customer Interviews"
              aria-invalid={Boolean(error)}
              className={cn("h-12 rounded-[14px]", error && "border-[#c85c54]")}
            />
            {error ? <span className="block text-[12px] text-[#b84e48]">{error}</span> : null}
          </label>
          <div className="mt-7 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="button" onClick={() => onCreate(name)} disabled={pending}>
              <Plus className="h-4 w-4" /> {pending ? "Creating..." : "Create folder"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function StageTwoWorkspace({
  data,
  currentUserId,
}: {
  data: NonNullable<ProjectResearchPageData>;
  currentUserId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<FolderView>("grid");
  const [sort, setSort] = useState<FolderSort>("business");
  const [folderRecords, setFolderRecords] = useState(data.folders);
  const [folderUploads, setFolderUploads] = useState<
    Record<string, FolderUploadSummary | undefined>
  >({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [folderError, setFolderError] = useState<string>();
  const [folderToDelete, setFolderToDelete] = useState<FolderRecord>();
  const [deleteError, setDeleteError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const folders = useMemo(() => {
    const next = [...folderRecords];
    const compareBusinessOrder = (left: FolderRecord, right: FolderRecord) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);

    if (sort === "business") return next.sort(compareBusinessOrder);
    if (sort === "files-desc") {
      return next.sort(
        (left, right) =>
          right.fileCount - left.fileCount || compareBusinessOrder(left, right),
      );
    }

    return next.sort((left, right) => {
      const nameOrder =
        (sort === "name-desc" ? -1 : 1) * left.name.localeCompare(right.name);
      return nameOrder || compareBusinessOrder(left, right);
    });
  }, [folderRecords, sort]);

  async function uploadFilesToFolder(folder: FolderRecord, files: File[]) {
    if (!data.sharedWorkspace.canWrite || files.length === 0) return;

    const progress = files.map(() => 0);
    setFolderUploads((current) => ({
      ...current,
      [folder.id]: { fileCount: files.length, progress: 0 },
    }));

    const results = await Promise.allSettled(
      files.map((file, index) =>
        uploadProjectResearchFile({
          projectId: data.project.id,
          folderId: folder.id,
          file,
          onProgress: (nextProgress) => {
            progress[index] = nextProgress;
            const average = Math.round(
              progress.reduce((total, value) => total + value, 0) / files.length,
            );
            setFolderUploads((current) => ({
              ...current,
              [folder.id]: { fileCount: files.length, progress: average },
            }));
          },
        }),
      ),
    );
    const uploadedCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - uploadedCount;

    if (uploadedCount > 0) {
      setFolderRecords((current) =>
        current.map((record) =>
          record.id === folder.id
            ? { ...record, fileCount: record.fileCount + uploadedCount }
            : record,
        ),
      );
      showSuccessToast(
        `${uploadedCount} ${uploadedCount === 1 ? "file" : "files"} uploaded to ${folder.name}.`,
      );
    }
    if (failedCount > 0) {
      showErrorToast(
        `${failedCount} ${failedCount === 1 ? "file could" : "files could"} not be uploaded.`,
      );
    }
    setFolderUploads((current) => ({ ...current, [folder.id]: undefined }));
  }

  function createFolder(name: string) {
    setFolderError(undefined);
    startTransition(async () => {
      const result = await createProjectResearchFolderAction({
        projectId: data.project.id,
        name,
      });
      if ("error" in result) {
        setFolderError(result.error);
        return;
      }
      setDialogOpen(false);
      setFolderRecords((current) => [
        ...current,
        {
          id: result.folder.id,
          name: result.folder.name,
          isSystem: false,
          systemKey: null,
          sortOrder: 1000,
          fileCount: 0,
        },
      ]);
      showSuccessToast("Folder created.");
    });
  }

  function deleteFolder(folder: FolderRecord) {
    setDeleteError(undefined);
    startTransition(async () => {
      const result = await deleteProjectResearchFolderAction({
        projectId: data.project.id,
        folderId: folder.id,
      });
      if ("error" in result) {
        setDeleteError(result.error);
        return;
      }

      setFolderRecords((current) =>
        current.filter((record) => record.id !== result.folder.id),
      );
      setFolderToDelete(undefined);
      showSuccessToast(`${result.folder.name} deleted.`);
      router.refresh();
    });
  }

  function completeStage() {
    const stageThreeHref = `/projects/${data.project.id}/stages/3`;

    if (data.workflowStatus === "COMPLETED") {
      router.push(stageThreeHref);
      return;
    }

    startTransition(async () => {
      const result = await completeProjectResearchStageAction(data.project.id);
      if ("error" in result) {
        showErrorToast(result.error || "Unable to complete Stage 2.");
        return;
      }
      if (!result.alreadyCompleted) {
        showSuccessToast("Stage 2 completed.", "Concept Creation is now available.");
      }
      router.push(stageThreeHref);
      router.refresh();
    });
  }

  return (
    <section
      className="mx-auto w-full max-w-[1420px] pb-6"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
    >
      <ProjectAccessRealtimeGuard projectId={data.project.id} currentUserId={currentUserId} />
      <Card
        className="mt-5 overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]"
      >
        <CardContent className="p-0">
          <div className="bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-[12px] bg-[#eaf4ec] text-[#2e754f]"><Folder className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-[18px] font-[750] text-[#1b261f]">Shared folders</h2>
                  <p className="mt-0.5 text-[12px] text-[#758078]">
                    {data.sharedWorkspace.isProjectCompleted
                      ? "This project is completed. Stage 2 research is read-only."
                      : "Shared project research files and folders."}
                  </p>
                  {data.sharedWorkspace.isProjectCompleted ? (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#e9eeea] px-2.5 py-1 text-[10px] font-[720] text-[#5c6960]">
                      <LockKeyhole className="h-3 w-3" /> Project completed · Read-only
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:w-auto xl:flex-nowrap">
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                  <div className="inline-flex shrink-0 rounded-[12px] border border-[#dce3dc] bg-white p-1">
                    {(["grid", "list"] as FolderView[]).map((option) => (
                      <button key={option} type="button" aria-label={`${option} view`} aria-pressed={view === option} onClick={() => setView(option)} className={cn("grid size-9 place-items-center rounded-[9px]", view === option ? "bg-[#24764e] text-white" : "text-[#68736b]")}>
                        {option === "grid" ? <Grid2X2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="secondary" className="min-w-0 flex-1 justify-between rounded-[12px] shadow-none sm:min-w-[175px] sm:flex-none"><SlidersHorizontal className="h-4 w-4" /><span className="truncate">{sortLabels[sort]}</span><ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuLabel>Sort folders</DropdownMenuLabel>{(Object.keys(sortLabels) as FolderSort[]).map((option) => <DropdownMenuItem key={option} onSelect={() => setSort(option)}><span className="flex-1">{sortLabels[option]}</span>{sort === option ? <Check className="h-4 w-4 text-brand" /> : null}</DropdownMenuItem>)}</DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <div className={cn("mt-5", view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "space-y-3")}>
              {folders.map((folder) => (
                <FolderTile
                  key={folder.id}
                  folder={folder}
                  view={view}
                  href={`/projects/${data.project.id}/stages/2/folders/${folder.id}`}
                  canWrite={data.sharedWorkspace.canWrite}
                  canDelete={data.sharedWorkspace.canDeleteFolders}
                  upload={folderUploads[folder.id]}
                  onDropFiles={(targetFolder, files) =>
                    void uploadFilesToFolder(targetFolder, files)
                  }
                  onDelete={(targetFolder) => {
                    setDeleteError(undefined);
                    setFolderToDelete(targetFolder);
                  }}
                />
              ))}
              {data.sharedWorkspace.canWrite ? (
                <button type="button" onClick={() => { setFolderError(undefined); setDialogOpen(true); }} className={cn("group border border-dashed border-[#a9c6b2] bg-[linear-gradient(145deg,#f8fcf9,#eef7f1)] text-[#286b49]", view === "grid" ? "flex min-h-[154px] flex-col items-center justify-center rounded-[20px] p-5" : "flex w-full items-center gap-4 rounded-[17px] px-4 py-3.5")}>
                  <FolderArtwork action /><span className={view === "grid" ? "mt-3" : "flex-1 text-left"}><span className="block text-[14px] font-[720]">New Folder</span><span className="text-[11px] text-[#718079]">Create a new folder</span></span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[#dfe6df] bg-white px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-[12px] bg-[#edf1fb] text-[#52688f]"><FolderKey className="h-5 w-5" /></span>
              <div>
                <h2 className="text-[18px] font-[750] text-[#1b261f]">Private Folders</h2>
                <p className="mt-0.5 text-[12px] text-[#758078]">Your private files are owner-only. Other participant folders are classified.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {data.myPrivateFolder ? (
                <Link
                  href={data.myPrivateFolder.href}
                  className="group flex min-h-[154px] items-center gap-4 rounded-[20px] border border-[#cfdbea] bg-white p-5 shadow-[0_10px_28px_rgba(38,58,92,0.05)] transition hover:-translate-y-0.5 hover:border-[#aebfd8] hover:shadow-[0_18px_38px_rgba(38,58,92,0.1)]"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-[#edf1fb] text-[#52688f]"><FolderKey className="h-8 w-8" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-[740] text-[#202a23]">My Private Folder</span>
                    <span className="mt-2 inline-flex rounded-full bg-[#edf1fb] px-2.5 py-1 text-[10px] font-[720] text-[#52688f]">Owner only</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#71809e] transition group-hover:translate-x-0.5" />
                </Link>
              ) : null}
              {data.classifiedFolders.map((folder) => (
                <div
                  key={folder.key}
                  title={`Classified — only ${folder.ownerName} can access this folder.`}
                  className="flex min-h-[154px] cursor-default items-center gap-4 rounded-[20px] border border-[#e0e3e0] bg-[#f8f9f8] p-5"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-[#e8ebe9] text-[#69736c]"><LockKeyhole className="h-8 w-8" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-[740] text-[#353d37]">{folder.ownerName}&apos;s Folder</span>
                    <span className="mt-1 block truncate text-[10px] text-[#858e87]">{folder.role}</span>
                    <span className="mt-2 inline-flex rounded-full bg-[#e4e7e5] px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-[#59625c]">Classified</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:px-7 lg:px-9">
            <Button type="button" className="min-w-[180px] rounded-[13px]" onClick={completeStage} disabled={isPending}>
              {isPending ? "Saving..." : "Next Stage"}<ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild type="button" variant="outline" className="min-w-[160px] rounded-[13px] shadow-none"><Link href={`/projects/${data.project.id}`}><ListChecks className="h-4 w-4" />All Stages</Link></Button>
          </div>
        </CardContent>
      </Card>
      <NewFolderDialog open={dialogOpen} pending={isPending} error={folderError} onClose={() => setDialogOpen(false)} onCreate={createFolder} />
      <ConfirmationDialog
        isOpen={Boolean(folderToDelete)}
        title="Delete folder?"
        description={
          folderToDelete
            ? `Delete “${folderToDelete.name}” and every file inside it? This permanently removes them from the shared project workspace and cannot be undone.`
            : ""
        }
        confirmLabel="Delete folder"
        tone="destructive"
        pending={isPending}
        error={deleteError}
        onConfirm={() => {
          if (folderToDelete) deleteFolder(folderToDelete);
        }}
        onClose={() => {
          if (isPending) return;
          setFolderToDelete(undefined);
          setDeleteError(undefined);
        }}
      />
    </section>
  );
}

export function StageTwoLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none"><CardContent className="p-7"><Skeleton className="h-10 w-full max-w-[600px]" /><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-[154px] rounded-[20px]" />)}</div></CardContent></Card>
    </section>
  );
}

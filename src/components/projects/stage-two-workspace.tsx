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
  FolderKanban,
  Grid2X2,
  List,
  ListChecks,
  LockKeyhole,
  Loader2,
  Plus,
  SlidersHorizontal,
  UploadCloud,
  X,
} from "lucide-react";

import {
  completeProjectResearchStageAction,
  createProjectResearchFolderAction,
} from "@/app/(dashboard)/projects/[slug]/stages/2/actions";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectSummaryStrip } from "@/components/projects/project-summary-strip";
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
  business: "Business order",
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "files-desc": "Most files",
};

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PF"
  );
}

function ProjectSummary({ data }: { data: NonNullable<ProjectResearchPageData> }) {
  const people = (names: string[], group: string) =>
    names.map((name, index) => ({ id: `${group}-${index}`, name }));

  return (
    <ProjectSummaryStrip
      projectName={data.project.name}
      owner={
        data.project.ownerName
          ? { id: "project-owner", name: data.project.ownerName }
          : null
      }
      coOwners={people(data.project.coOwnerNames, "co-owner")}
      executors={people(data.project.executorNames, "executor")}
      emptyPeopleLabel="None assigned"
      columns="two"
    />
  );
}

function WorkspaceSwitch({
  data,
  compact = false,
}: {
  data: NonNullable<ProjectResearchPageData>;
  compact?: boolean;
}) {
  const router = useRouter();
  const selected = data.selectedWorkspace;

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-[#dce6dd] bg-[linear-gradient(145deg,#f9fcf9_0%,#f1f8f3_100%)]",
        compact
          ? "rounded-[14px] px-2.5 py-2 shadow-none"
          : "rounded-[20px] p-5 shadow-[0_14px_34px_rgba(31,78,51,0.07)]",
      )}
    >
      <div className="relative">
        <div className={cn("items-center justify-between gap-3", compact ? "hidden" : "flex")}>
          <p className="text-[10px] font-[760] uppercase tracking-[0.13em] text-[#718078]">
            Viewing folder set
          </p>
          {!selected.canWrite ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e6ece7] px-2 py-1 text-[10px] font-[700] text-[#647168]">
              <LockKeyhole className="h-3 w-3" /> Read-only
            </span>
          ) : null}
        </div>
        <div className={cn("flex items-center", compact ? "gap-2" : "mt-4 gap-3")}>
          <span className={cn("grid shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#3b9666,#17613e)] font-[760] text-white", compact ? "size-8 text-[10px]" : "size-11 text-[13px]")}>
            {getInitials(selected.ownerName)}
          </span>
          <div className={cn("min-w-0 flex-1", compact && "max-w-[160px]")}>
            <p className={cn("truncate font-[740] text-[#1d2821]", compact ? "text-[12px]" : "text-[14px]")}>
              {selected.ownerName}
            </p>
            <p className={cn("truncate text-[#718078]", compact ? "text-[10px]" : "mt-0.5 text-[11px]")}>{selected.role}</p>
          </div>
          {data.workspaceOptions.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="rounded-[12px] bg-white shadow-none">
                  Switch <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[250px]">
                <DropdownMenuLabel>View folder set</DropdownMenuLabel>
                {data.workspaceOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() =>
                      router.replace(
                        `/projects/${data.project.id}/stages/2?workspace=${encodeURIComponent(option.id)}`,
                      )
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-[680]">{option.name}</span>
                      <span className="block truncate text-[11px] text-[#7c8780]">{option.role}</span>
                    </span>
                    {selected.id === option.id ? <Check className="h-4 w-4 text-brand" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
  upload,
  onDropFiles,
}: {
  folder: FolderRecord;
  view: FolderView;
  href: string;
  canWrite: boolean;
  upload?: FolderUploadSummary;
  onDropFiles: (folder: FolderRecord, files: File[]) => void;
}) {
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("Files");
  }

  return (
    <Link
      href={href}
      draggable={false}
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
          ? "flex min-h-[154px] flex-col rounded-[20px] p-5"
          : "flex w-full items-center gap-4 rounded-[17px] px-4 py-3.5",
      )}
    >
      <div className="flex w-full items-center gap-4">
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
      {dragActive ? (
        <span className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#eaf5ed]/95 text-[#216643]">
          <UploadCloud className="h-7 w-7" />
          <span className="mt-2 text-[13px] font-[760]">Drop to upload</span>
        </span>
      ) : null}
    </Link>
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
              <p className="mt-1 text-[13px] text-[#6f7a72]">Add a flat custom folder to this participant&apos;s workspace.</p>
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
  showChrome = true,
}: {
  data: NonNullable<ProjectResearchPageData>;
  currentUserId: string;
  showChrome?: boolean;
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
    if (!data.selectedWorkspace.canWrite || files.length === 0) return;

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
        workspaceId: data.selectedWorkspace.id,
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

  function completeStage() {
    startTransition(async () => {
      const result = await completeProjectResearchStageAction(data.project.id);
      if ("error" in result && result.error) {
        showErrorToast(result.error);
        return;
      }
      showSuccessToast("Stage 2 completed.", "Concept Creation is now available.");
      router.push(`/projects/${data.project.id}/stages/3`);
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
      {showChrome ? (
        <ProjectAccessRealtimeGuard projectId={data.project.id} currentUserId={currentUserId} />
      ) : null}
      <Card
        className={cn(
          "overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]",
          !showChrome && "mt-5",
        )}
      >
        <CardContent className="p-0">
          {showChrome ? <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            {showChrome ? <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]">
              <FolderKanban className="h-4 w-4" /> Shared research workspace
            </div> : null}
            {showChrome ? <h1 className="mt-3 text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">
              Stage 2 - Project Research and Planning
            </h1> : null}
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <ProjectSummary data={data} />
              <WorkspaceSwitch data={data} />
            </div>
          </div> : null}

          <div className={cn("bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7", showChrome && "border-t border-[#e9eee9]")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-[12px] bg-[#eaf4ec] text-[#2e754f]"><Folder className="h-5 w-5" /></span>
                <div><h2 className="text-[18px] font-[750] text-[#1b261f]">Shared folders</h2><p className="mt-0.5 text-[12px] text-[#758078]">Files and folders in {data.selectedWorkspace.ownerName}&apos;s workspace.</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!showChrome ? <WorkspaceSwitch data={data} compact /> : null}
                <div className="inline-flex rounded-[12px] border border-[#dce3dc] bg-white p-1">
                  {(["grid", "list"] as FolderView[]).map((option) => (
                    <button key={option} type="button" aria-label={`${option} view`} aria-pressed={view === option} onClick={() => setView(option)} className={cn("grid size-9 place-items-center rounded-[9px]", view === option ? "bg-[#24764e] text-white" : "text-[#68736b]")}>
                      {option === "grid" ? <Grid2X2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button type="button" variant="secondary" className="min-w-[175px] justify-between rounded-[12px] shadow-none"><SlidersHorizontal className="h-4 w-4" />{sortLabels[sort]}<ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end"><DropdownMenuLabel>Sort folders</DropdownMenuLabel>{(Object.keys(sortLabels) as FolderSort[]).map((option) => <DropdownMenuItem key={option} onSelect={() => setSort(option)}><span className="flex-1">{sortLabels[option]}</span>{sort === option ? <Check className="h-4 w-4 text-brand" /> : null}</DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className={cn("mt-5", view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "space-y-3")}>
              {folders.map((folder) => (
                <FolderTile
                  key={folder.id}
                  folder={folder}
                  view={view}
                  href={`/projects/${data.project.id}/stages/2/folders/${folder.id}?workspace=${encodeURIComponent(data.selectedWorkspace.id)}`}
                  canWrite={data.selectedWorkspace.canWrite}
                  upload={folderUploads[folder.id]}
                  onDropFiles={(targetFolder, files) =>
                    void uploadFilesToFolder(targetFolder, files)
                  }
                />
              ))}
              {data.selectedWorkspace.canWrite ? (
                <button type="button" onClick={() => { setFolderError(undefined); setDialogOpen(true); }} className={cn("group border border-dashed border-[#a9c6b2] bg-[linear-gradient(145deg,#f8fcf9,#eef7f1)] text-[#286b49]", view === "grid" ? "flex min-h-[154px] flex-col items-center justify-center rounded-[20px] p-5" : "flex w-full items-center gap-4 rounded-[17px] px-4 py-3.5")}>
                  <FolderArtwork action /><span className={view === "grid" ? "mt-3" : "flex-1 text-left"}><span className="block text-[14px] font-[720]">New Folder</span><span className="text-[11px] text-[#718079]">Create a new folder</span></span>
                </button>
              ) : null}
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

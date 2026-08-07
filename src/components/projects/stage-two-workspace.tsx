"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderKanban,
  Grid2X2,
  Info,
  List,
  ListChecks,
  Plus,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
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
import type { ProjectFlowRecord } from "@/lib/projects";
import { showInfoToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type StageTwoWorkspaceProps = {
  project: ProjectFlowRecord;
  currentUserId: string;
};

type FolderRecord = {
  id: string;
  name: string;
  fileCount: number;
  memberCount: number;
  subtitle?: string;
  custom?: boolean;
};

type FolderView = "grid" | "list";
type FolderSort = "name-asc" | "name-desc" | "files-desc";

const predefinedFolders: FolderRecord[] = [
  { id: "brief", name: "Brief", fileCount: 12, memberCount: 4 },
  {
    id: "market-competition",
    name: "Market & Competition",
    fileCount: 24,
    memberCount: 5,
  },
  { id: "tech", name: "Tech", fileCount: 18, memberCount: 4 },
  {
    id: "vendors",
    name: "Vendors",
    fileCount: 16,
    memberCount: 4,
    subtitle: "Ready for pricing and comparisons",
  },
  { id: "finance", name: "Finance", fileCount: 14, memberCount: 4 },
  { id: "legal", name: "Legal", fileCount: 9, memberCount: 3 },
  { id: "pitch", name: "Pitch", fileCount: 7, memberCount: 3 },
];

const sortLabels: Record<FolderSort, string> = {
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

function StageTwoSummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] border border-[#e7ece7] bg-[#fbfcfb] px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#edf5ef] text-[#32704e]">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <dt className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#7b857e]">
          {label}
        </dt>
        <dd className="mt-1 truncate text-[13px] font-[680] text-[#253028]" title={value}>
          {value}
        </dd>
      </div>
    </div>
  );
}

export function StageTwoProjectSummary({ project }: { project: ProjectFlowRecord }) {
  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const coOwners = project.collaborators
    .filter((collaborator) => collaborator.role === "Project Co-Owner")
    .map((collaborator) => collaborator.name);
  const executors = project.executors.map((executor) => executor.name);
  const restrictedLabel = project.canViewParticipants ? "None assigned" : "Restricted";

  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <StageTwoSummaryItem
        icon={<FolderKanban className="h-[17px] w-[17px]" />}
        label="Project Name"
        value={project.title}
      />
      <StageTwoSummaryItem
        icon={<UserRound className="h-[17px] w-[17px]" />}
        label="Project Owner"
        value={owner?.name ?? (project.ownerId ? "Restricted" : "Not assigned")}
      />
      <StageTwoSummaryItem
        icon={<Users className="h-[17px] w-[17px]" />}
        label="Project Co-Owners"
        value={coOwners.length ? coOwners.join(", ") : restrictedLabel}
      />
      <StageTwoSummaryItem
        icon={<BriefcaseBusiness className="h-[17px] w-[17px]" />}
        label="Project Executors"
        value={executors.length ? executors.join(", ") : restrictedLabel}
      />
    </dl>
  );
}

type FolderOwnerOption = {
  id: string;
  name: string;
  role: string;
};

export function FolderOwnerSwitchCard({
  options,
  selectedId,
  onChange,
}: {
  options: FolderOwnerOption[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const selected = options.find((option) => option.id === selectedId) ?? options[0];

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#dce6dd] bg-[linear-gradient(145deg,#f9fcf9_0%,#f1f8f3_100%)] p-5 shadow-[0_14px_34px_rgba(31,78,51,0.07)]">
      <div className="absolute -right-8 -top-10 size-32 rounded-full bg-[#dceee1]/60 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] font-[760] uppercase tracking-[0.13em] text-[#718078]">
          Viewing Folder Set
          <span title="This switch is a local UI preview for this phase.">
            <Info className="h-3.5 w-3.5" />
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#3b9666,#17613e)] text-[13px] font-[760] text-white shadow-[0_8px_20px_rgba(31,115,72,0.2)]">
            {getInitials(selected.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-[740] text-[#1d2821]">
              {selected.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[#718078]">
              {selected.role}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-[12px] bg-white shadow-none"
              >
                Switch
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[250px]">
              <DropdownMenuLabel>View folder set</DropdownMenuLabel>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => onChange(option.id)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eaf3ec] text-[10px] font-[750] text-[#2e704b]">
                    {getInitials(option.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-[680]">
                      {option.name}
                    </span>
                    <span className="block truncate text-[11px] text-[#7c8780]">
                      {option.role}
                    </span>
                  </span>
                  {selected.id === option.id ? (
                    <Check className="h-4 w-4 text-brand" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function FolderArtwork({ custom = false }: { custom?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid size-12 shrink-0 place-items-center rounded-[14px]",
        custom
          ? "border border-dashed border-[#77a88b] bg-white/70 text-[#28724b]"
          : "bg-[linear-gradient(145deg,#eaf5ed,#dceee2)] text-[#31805a]",
      )}
    >
      {custom ? (
        <Plus className="h-5 w-5" />
      ) : (
        <Folder className="h-7 w-7 fill-current opacity-90" />
      )}
    </span>
  );
}

export function SharedFolderTile({
  folder,
  view,
  onOpen,
}: {
  folder: FolderRecord;
  view: FolderView;
  onOpen: (folder: FolderRecord) => void;
}) {
  if (view === "list") {
    return (
      <button
        type="button"
        onClick={() => onOpen(folder)}
        className="group flex w-full items-center gap-4 rounded-[17px] border border-[#e0e6e0] bg-white px-4 py-3.5 text-left shadow-[0_8px_24px_rgba(23,39,28,0.035)] transition hover:-translate-y-0.5 hover:border-[#bdd4c3] hover:shadow-[0_14px_30px_rgba(28,75,48,0.08)]"
      >
        <FolderArtwork custom={folder.custom} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-[700] text-[#202a23]">
            {folder.name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[#7c867f]">
            {folder.subtitle ?? (folder.custom ? "Locally created folder" : "Shared project folder")}
          </span>
        </span>
        <span className="hidden items-center gap-6 text-[11px] text-[#6f7a72] sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <File className="h-3.5 w-3.5" /> {folder.fileCount} files
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {folder.memberCount} members
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-[#8a948d] transition group-hover:translate-x-0.5 group-hover:text-brand" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(folder)}
      className="group flex min-h-[172px] w-full flex-col rounded-[20px] border border-[#dfe6df] bg-white p-5 text-left shadow-[0_10px_28px_rgba(23,39,28,0.045)] transition hover:-translate-y-1 hover:border-[#bcd4c3] hover:shadow-[0_18px_38px_rgba(28,75,48,0.09)]"
    >
      <div className="flex w-full items-start gap-4">
        <FolderArtwork custom={folder.custom} />
        <span className="min-w-0 flex-1 pt-1">
          <span className="block truncate text-[14px] font-[720] text-[#202a23]">
            {folder.name}
          </span>
          <span className="mt-1 block min-h-8 text-[11px] leading-4 text-[#7c867f]">
            {folder.subtitle ?? (folder.custom ? "Locally created folder" : "Shared project folder")}
          </span>
        </span>
        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-[#8a948d] transition group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>

      <span className="mt-auto flex w-full items-center gap-5 border-t border-[#edf1ed] pt-3.5 text-[11px] text-[#6f7a72]">
        <span className="inline-flex items-center gap-1.5">
          <File className="h-3.5 w-3.5" /> {folder.fileCount} files
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> {folder.memberCount} members
        </span>
      </span>
    </button>
  );
}

function NewFolderTile({ view, onClick }: { view: FolderView; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group border border-dashed border-[#a9c6b2] bg-[linear-gradient(145deg,#f8fcf9,#eef7f1)] text-[#286b49] transition hover:-translate-y-0.5 hover:border-[#5d9a73] hover:bg-[#edf7ef]",
        view === "grid"
          ? "flex min-h-[172px] flex-col items-center justify-center rounded-[20px] p-5 text-center"
          : "flex w-full items-center gap-4 rounded-[17px] px-4 py-3.5 text-left",
      )}
    >
      <FolderArtwork custom />
      <span className={view === "grid" ? "mt-3" : "min-w-0 flex-1"}>
        <span className="block text-[14px] font-[720]">New Folder</span>
        <span className="mt-0.5 block text-[11px] text-[#718079]">
          Create a new folder
        </span>
      </span>
      {view === "list" ? (
        <Plus className="h-4 w-4 shrink-0 transition group-hover:rotate-90" />
      ) : null}
    </button>
  );
}

function NewFolderDialog({
  open,
  value,
  error,
  onValueChange,
  onClose,
  onCreate,
}: {
  open: boolean;
  value: string;
  error?: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#112118]/40 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-two-new-folder-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-[500px] rounded-[24px] border border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="stage-two-new-folder-title"
                className="text-[22px] font-[760] tracking-[-0.03em] text-[#162019]"
              >
                Create a folder
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#6f7a72]">
                This preview is kept locally and will not be saved yet.
              </p>
            </div>
            <Button type="button" variant="secondary" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close new folder dialog</span>
            </Button>
          </div>

          <label className="mt-6 block space-y-2">
            <span className="text-[13px] font-[680] text-[#2d372f]">Folder name</span>
            <Input
              autoFocus
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreate();
                if (event.key === "Escape") onClose();
              }}
              placeholder="e.g., Customer Interviews"
              aria-invalid={Boolean(error)}
              className={cn(
                "h-12 rounded-[14px] bg-white shadow-none",
                error ? "border-[#c85c54]" : "border-[#dce3dc]",
              )}
            />
            {error ? <span className="block text-[12px] text-[#b84e48]">{error}</span> : null}
          </label>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              Create folder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SharedFolderGrid({
  folders,
  view,
  onOpenFolder,
  onCreateFolder,
}: {
  folders: FolderRecord[];
  view: FolderView;
  onOpenFolder: (folder: FolderRecord) => void;
  onCreateFolder: () => void;
}) {
  return (
    <div
      className={cn(
        "mt-5",
        view === "grid"
          ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          : "space-y-3",
      )}
    >
      {folders.map((folder) => (
        <SharedFolderTile
          key={folder.id}
          folder={folder}
          view={view}
          onOpen={onOpenFolder}
        />
      ))}
      <NewFolderTile view={view} onClick={onCreateFolder} />
    </div>
  );
}

export function StageTwoWorkspace({
  project,
  currentUserId,
}: StageTwoWorkspaceProps) {
  const [view, setView] = useState<FolderView>("grid");
  const [sort, setSort] = useState<FolderSort>("name-asc");
  const [customFolders, setCustomFolders] = useState<FolderRecord[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string>();

  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const folderOwnerOptions = useMemo<FolderOwnerOption[]>(() => {
    const participants: FolderOwnerOption[] = [
      ...(owner
        ? [{ id: owner.id, name: owner.name, role: "Project Owner" }]
        : []),
      ...project.collaborators
        .filter((collaborator) => collaborator.role === "Project Co-Owner")
        .map((collaborator) => ({
          id: collaborator.id,
          name: collaborator.name,
          role: "Project Co-Owner",
        })),
      ...project.executors.map((executor) => ({
        id: executor.id,
        name: executor.name,
        role: "Project Executor",
      })),
    ];
    const unique = new Map(participants.map((participant) => [participant.id, participant]));
    if (unique.size === 0) {
      unique.set("project-folder-set", {
        id: "project-folder-set",
        name: "Project Workspace",
        role: "Shared folder set",
      });
    }
    return [...unique.values()];
  }, [owner, project.collaborators, project.executors]);
  const [selectedFolderOwnerId, setSelectedFolderOwnerId] = useState(
    () => folderOwnerOptions[0]?.id ?? "project-folder-set",
  );
  const sortedFolders = useMemo(() => {
    const folders = [...predefinedFolders, ...customFolders];
    return folders.sort((left, right) => {
      if (sort === "files-desc") return right.fileCount - left.fileCount;
      const comparison = left.name.localeCompare(right.name);
      return sort === "name-desc" ? -comparison : comparison;
    });
  }, [customFolders, sort]);

  function openNewFolderDialog() {
    setNewFolderName("");
    setNewFolderError(undefined);
    setNewFolderOpen(true);
  }

  function createLocalFolder() {
    const name = newFolderName.trim().replace(/\s+/g, " ");
    if (!name) {
      setNewFolderError("Enter a folder name.");
      return;
    }
    if (
      [...predefinedFolders, ...customFolders].some(
        (folder) => folder.name.toLocaleLowerCase("en") === name.toLocaleLowerCase("en"),
      )
    ) {
      setNewFolderError("A folder with this name is already shown.");
      return;
    }
    if (name.length > 80) {
      setNewFolderError("Keep the folder name under 80 characters.");
      return;
    }

    setCustomFolders((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        name,
        fileCount: 0,
        memberCount: 1,
        custom: true,
      },
    ]);
    setNewFolderOpen(false);
    showSuccessToast("Folder added to this UI preview.", "It has not been saved yet.");
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />

      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]">
              <FolderKanban className="h-4 w-4" />
              Shared research workspace
            </div>
            <h1 className="mt-3 text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">
              Stage 2 - Project Research and Planning
            </h1>

            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
              <StageTwoProjectSummary project={project} />
              <FolderOwnerSwitchCard
                options={folderOwnerOptions}
                selectedId={selectedFolderOwnerId}
                onChange={(id) => {
                  setSelectedFolderOwnerId(id);
                  showInfoToast("Folder-set view changed locally.");
                }}
              />
            </div>
          </div>

          <div className="border-t border-[#e9eee9] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#eaf4ec] text-[#2e754f]">
                  <Folder className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[18px] font-[750] tracking-[-0.02em] text-[#1b261f]">
                    Shared folders
                  </h2>
                  <p className="mt-0.5 text-[12px] leading-5 text-[#758078]">
                    Organize research, planning, and reference materials by workspace.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-[12px] border border-[#dce3dc] bg-white p-1">
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                    className={cn(
                      "grid size-9 place-items-center rounded-[9px] transition",
                      view === "grid"
                        ? "bg-[#24764e] text-white shadow-[0_6px_14px_rgba(30,106,67,0.16)]"
                        : "text-[#68736b] hover:bg-[#f1f5f1]",
                    )}
                  >
                    <Grid2X2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                    className={cn(
                      "grid size-9 place-items-center rounded-[9px] transition",
                      view === "list"
                        ? "bg-[#24764e] text-white shadow-[0_6px_14px_rgba(30,106,67,0.16)]"
                        : "text-[#68736b] hover:bg-[#f1f5f1]",
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-w-[165px] justify-between rounded-[12px] shadow-none"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      {sortLabels[sort]}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[210px]">
                    <DropdownMenuLabel>Sort folders</DropdownMenuLabel>
                    {(Object.keys(sortLabels) as FolderSort[]).map((option) => (
                      <DropdownMenuItem key={option} onSelect={() => setSort(option)}>
                        <span className="flex-1">{sortLabels[option]}</span>
                        {sort === option ? <Check className="h-4 w-4 text-brand" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <SharedFolderGrid
              folders={sortedFolders}
              view={view}
              onCreateFolder={openNewFolderDialog}
              onOpenFolder={(folder) =>
                showInfoToast(
                  `${folder.name} is a UI preview.`,
                  "Folder contents will be connected during the Stage 2 backend phase.",
                )
              }
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:px-7 lg:px-9">
            <Button
              type="button"
              className="min-w-[180px] rounded-[13px]"
              onClick={() =>
                showInfoToast(
                  "Stage 3 is not connected yet.",
                  "This button is intentionally a safe UI-only placeholder.",
                )
              }
            >
              Next Stage
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="min-w-[160px] rounded-[13px] shadow-none"
            >
              <Link href={`/projects/${project.id}`}>
                <ListChecks className="h-4 w-4" />
                All Stages
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <NewFolderDialog
        open={newFolderOpen}
        value={newFolderName}
        error={newFolderError}
        onValueChange={(value) => {
          setNewFolderName(value);
          setNewFolderError(undefined);
        }}
        onClose={() => setNewFolderOpen(false)}
        onCreate={createLocalFolder}
      />
    </section>
  );
}

export function StageTwoLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-[600px] rounded-[12px]" />
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[70px] rounded-[16px]" />
                ))}
              </div>
              <Skeleton className="h-[153px] rounded-[20px]" />
            </div>
          </div>
          <div className="border-t border-[#e9eee9] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-12 w-56 rounded-[12px]" />
              <Skeleton className="h-12 w-64 rounded-[12px]" />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-[172px] rounded-[20px]" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

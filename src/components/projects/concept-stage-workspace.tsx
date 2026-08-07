"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Folder,
  FolderKanban,
  MoreVertical,
  Pencil,
  Plus,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ProjectFlowRecord } from "@/lib/projects";

type ConceptFolder = {
  id: string;
  name: string;
};

type FolderDialogState =
  | { mode: "create" }
  | { mode: "rename"; folderId: string; currentName: string }
  | null;

function getProjectDetails(project: ProjectFlowRecord) {
  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const coOwners = project.collaborators
    .filter((collaborator) => collaborator.role === "Project Co-Owner")
    .map((collaborator) => collaborator.name);
  const executors = project.executors.map((executor) => executor.name);
  const unavailableLabel = project.canViewParticipants ? "None assigned" : "Restricted";

  return {
    projectName: project.title,
    ownerName:
      owner?.name ??
      (project.ownerId ? "Restricted" : "Operational owner not assigned"),
    coOwnerNames: coOwners.join(", ") || unavailableLabel,
    executorNames: executors.join(", ") || unavailableLabel,
  };
}

function ProjectDetailCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="min-w-0 rounded-[20px] border-[#dfe6df] shadow-[0_12px_30px_rgba(23,39,28,0.045)]">
      <CardContent className="flex min-h-[126px] items-start gap-4 p-5 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-[#eaf4ed] text-[#2e8057]">
          {icon}
        </span>
        <span className="min-w-0 pt-0.5">
          <span className="block text-[10px] font-[760] uppercase tracking-[0.1em] text-[#77827a]">
            {label}
          </span>
          <span className="mt-2 block whitespace-pre-line text-[14px] font-[720] leading-5 text-[#202a23]">
            {value}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

function FolderNameDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: Exclude<FolderDialogState, null>;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(
    state.mode === "rename" ? state.currentName : "",
  );
  const cleanName = name.trim().replace(/\s+/g, " ");

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-[#112118]/35 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="concept-folder-dialog-title"
    >
      <Card className="w-full max-w-[460px] rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.2)]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="concept-folder-dialog-title"
                className="text-[21px] font-[760] tracking-[-0.03em] text-[#162019]"
              >
                {state.mode === "create" ? "Create concept folder" : "Rename concept folder"}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#6f7a72]">
                This UI-only change will reset when the page is refreshed.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              aria-label="Close folder dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <label className="mt-6 block space-y-2">
            <span className="text-[12px] font-[700] text-[#2d372f]">Folder Name</span>
            <Input
              autoFocus
              value={name}
              maxLength={80}
              placeholder="e.g., Concept 2"
              className="h-12 rounded-[14px]"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "Enter" && cleanName) onSubmit(cleanName);
              }}
            />
          </label>

          <div className="mt-7 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!cleanName}
              onClick={() => onSubmit(cleanName)}
            >
              {state.mode === "create" ? "Create Folder" : "Save Name"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ConceptStageWorkspace({
  stageNumber,
  stageTitle,
  project,
  currentUserId,
}: {
  stageNumber: 3 | 4;
  stageTitle: string;
  project: ProjectFlowRecord;
  currentUserId: string;
}) {
  const [folders, setFolders] = useState<ConceptFolder[]>([
    { id: "concept-1", name: "Concept 1" },
  ]);
  const [dialog, setDialog] = useState<FolderDialogState>(null);
  const projectDetails = getProjectDetails(project);

  function submitFolderName(name: string) {
    if (!dialog) return;

    if (dialog.mode === "rename") {
      setFolders((current) =>
        current.map((folder) =>
          folder.id === dialog.folderId ? { ...folder, name } : folder,
        ),
      );
    } else {
      setFolders((current) => [
        ...current,
        { id: crypto.randomUUID(), name },
      ]);
    }

    setDialog(null);
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-8">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />

      <header>
        <div className="flex items-center gap-2 text-[11px] font-[780] uppercase tracking-[0.12em] text-[#2f8057]">
          <FolderKanban className="h-4 w-4" />
          Concept Workspace
        </div>
        <h1 className="mt-4 text-[30px] font-[790] leading-[1.12] tracking-[-0.045em] text-[#111713] sm:text-[38px]">
          Stage {stageNumber} - {stageTitle}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[#68736b]">
          Create and manage concept folders.
        </p>
      </header>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectDetailCard
          icon={<Building2 className="h-[19px] w-[19px]" />}
          label="Project Name"
          value={projectDetails.projectName}
        />
        <ProjectDetailCard
          icon={<UserRound className="h-[19px] w-[19px]" />}
          label="Project Owner"
          value={projectDetails.ownerName}
        />
        <ProjectDetailCard
          icon={<Users className="h-[19px] w-[19px]" />}
          label="Project Co-Owners"
          value={projectDetails.coOwnerNames}
        />
        <ProjectDetailCard
          icon={<BriefcaseBusiness className="h-[19px] w-[19px]" />}
          label="Project Executors"
          value={projectDetails.executorNames}
        />
      </div>

      <section className="mt-7 border-t border-[#dfe6df] pt-7" aria-labelledby="concept-folders-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#eaf4ed] text-[#2e8057]">
              <Folder className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="concept-folders-heading"
                className="text-[20px] font-[760] tracking-[-0.025em] text-[#18211b]"
              >
                Concept Folders
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#707a73]">
                Manage your concept folders.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-[12px] border-[#39835d] bg-white px-5 font-[720] text-[#27704b] hover:bg-[#f1f8f3]"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" />
            New Folder
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <Card
              key={folder.id}
              className="min-w-0 rounded-[20px] border-[#dfe6df] shadow-[0_12px_30px_rgba(23,39,28,0.05)] transition hover:-translate-y-0.5 hover:border-[#bdd4c4] hover:shadow-[0_18px_38px_rgba(28,75,48,0.08)]"
            >
              <CardContent className="flex min-h-[126px] items-center gap-4 p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#e7f2ea] text-[#30845a]">
                  <Folder className="h-7 w-7 fill-current" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-[740] text-[#202a23]">
                  {folder.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-[#758078]"
                      aria-label={`Folder actions for ${folder.name}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setDialog({
                          mode: "rename",
                          folderId: folder.id,
                          currentName: folder.name,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#8b958e]" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {dialog ? (
        <FolderNameDialog
          key={dialog.mode === "rename" ? dialog.folderId : "create"}
          state={dialog}
          onClose={() => setDialog(null)}
          onSubmit={submitFolderName}
        />
      ) : null}
    </section>
  );
}

export function ConceptStageLoadingShell() {
  return (
    <div className="mx-auto w-full max-w-[1420px] animate-pulse space-y-7 pb-8">
      <div className="space-y-3">
        <div className="h-4 w-44 rounded-full bg-[#e8eee8]" />
        <div className="h-11 w-80 max-w-full rounded-[14px] bg-[#e8eee8]" />
        <div className="h-5 w-64 rounded-full bg-[#eef2ee]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[126px] rounded-[20px] bg-[#edf2ed]" />
        ))}
      </div>
      <div className="border-t border-[#e4e9e4] pt-7">
        <div className="h-12 w-56 rounded-[14px] bg-[#e8eee8]" />
        <div className="mt-6 h-[126px] max-w-[440px] rounded-[20px] bg-[#edf2ed]" />
      </div>
    </div>
  );
}

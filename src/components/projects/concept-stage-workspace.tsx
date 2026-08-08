"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ChevronRight,
  Folder,
  FolderKanban,
  MoreVertical,
  Pencil,
  Plus,
  X,
  FileCheck2,
  Send,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectFlowSummaryStrip } from "@/components/projects/project-summary-strip";
import {
  createProjectConceptFolderAction,
  renameProjectConceptFolderAction,
  handoffStageFourFilesAction,
} from "@/app/(dashboard)/projects/[slug]/stages/concept-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type {
  ConceptWorkflowStageKey,
  ProjectConceptFolderRecord,
} from "@/lib/project-concepts";
import type { ProjectFlowRecord } from "@/lib/projects";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { StageFourHandoffFileRecord } from "@/lib/stage-five";

type ConceptFolder = ProjectConceptFolderRecord;

type FolderDialogState =
  | { mode: "create" }
  | { mode: "rename"; folderId: string; currentName: string }
  | null;

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
                Folder names must be unique within this project stage.
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
              maxLength={120}
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

function StageFourFinalFileHandoff({
  projectId,
  initialFiles,
  canHandoff,
}: {
  projectId: string;
  initialFiles: StageFourHandoffFileRecord[];
  canHandoff: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSending, startSending] = useTransition();
  const selectedFiles = files.filter((file) => selectedIds.includes(file.id));
  const handedOffFiles = files.filter((file) => file.handedOff);
  const availableFiles = files.filter((file) => !file.handedOff);

  function sendToStageFive() {
    if (!selectedIds.length) return;
    const submittedIds = [...selectedIds];
    startSending(async () => {
      const result = await handoffStageFourFilesAction({
        projectId,
        attachmentIds: submittedIds,
      });
      if ("error" in result) {
        showErrorToast(result.error ?? "Unable to send the selected files to Stage 5.");
        return;
      }
      const handoffByAttachmentId = new Map(
        result.handoffs.map((handoff) => [handoff.sourceAttachmentId, handoff.id]),
      );
      setFiles((current) =>
        current.map((file) =>
          handoffByAttachmentId.has(file.id)
            ? { ...file, handedOff: true, handoffId: handoffByAttachmentId.get(file.id) ?? null }
            : file,
        ),
      );
      setSelectedIds([]);
      setSelecting(false);
      showSuccessToast(
        `${submittedIds.length} final ${submittedIds.length === 1 ? "file" : "files"} sent to Stage 5.`,
      );
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-[20px] border border-[#dfe6df] bg-white p-5 shadow-[0_12px_30px_rgba(23,39,28,0.04)]" aria-labelledby="stage-four-final-files-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#eaf4ed] text-[#2e8057]">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <h2 id="stage-four-final-files-heading" className="text-[17px] font-[760] text-[#18211b]">
              Final files for Stage 5
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-[#707a73]">
              Designate existing Stage 4 files for an independent file checklist. This does not change workflow status.
            </p>
          </div>
        </div>
        {canHandoff ? (
          <Button
            type="button"
            variant="outline"
            disabled={!availableFiles.length || isSending}
            onClick={() => setSelecting(true)}
          >
            <Plus className="h-4 w-4" /> Select files
          </Button>
        ) : null}
      </div>

      {handedOffFiles.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {handedOffFiles.map((file) => (
            <span key={file.id} className="inline-flex items-center gap-2 rounded-full bg-[#edf5ef] px-3 py-2 text-[11px] font-[650] text-[#326b4c]">
              <FileCheck2 className="h-3.5 w-3.5" /> {file.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[12px] italic text-[#879088]">No files have been sent to Stage 5 yet.</p>
      )}

      {selectedFiles.length ? (
        <div className="mt-4 border-t border-[#edf1ed] pt-4">
          <p className="text-[11px] font-[720] uppercase tracking-[0.08em] text-[#748078]">Selected</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedFiles.map((file) => (
              <span key={file.id} className="inline-flex items-center gap-2 rounded-full border border-[#d9e5dc] bg-white px-3 py-2 text-[11px] font-[650] text-[#344038]">
                {file.name}
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setSelectedIds((current) => current.filter((id) => id !== file.id))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <Button type="button" className="mt-3" disabled={isSending} onClick={sendToStageFive}>
            <Send className="h-4 w-4" /> {isSending ? "Sending..." : "Send to Stage 5"}
          </Button>
        </div>
      ) : null}

      {selecting ? (
        <div className="fixed inset-0 z-[165] flex items-center justify-center bg-[#112118]/40 px-4 py-8 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="select-stage-four-files-title">
          <Card className="w-full max-w-[600px] rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.22)]">
            <CardContent className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="select-stage-four-files-title" className="text-[21px] font-[760] text-[#162019]">Select final files</h2>
                  <p className="mt-1 text-[12px] text-[#6f7a72]">Choose one or more existing Stage 4 files.</p>
                </div>
                <Button type="button" variant="secondary" size="icon" onClick={() => setSelecting(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {availableFiles.map((file) => (
                  <label key={file.id} className="flex cursor-pointer items-center gap-3 rounded-[13px] border border-[#e1e8e2] px-4 py-3 hover:bg-[#f7faf7]">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(file.id)}
                      onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-[650] text-[#2d382f]">{file.name}</span>
                    <span className="text-[10px] uppercase text-[#859087]">{file.mimeType.split("/").pop()}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setSelecting(false)}>Done</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

export function ConceptStageWorkspace({
  stageNumber,
  stageTitle,
  stageKey,
  project,
  currentUserId,
  initialFolders,
  stageFourHandoffData,
}: {
  stageNumber: 3 | 4;
  stageTitle: string;
  stageKey: ConceptWorkflowStageKey;
  project: ProjectFlowRecord;
  currentUserId: string;
  initialFolders: ProjectConceptFolderRecord[];
  stageFourHandoffData?: {
    files: StageFourHandoffFileRecord[];
    canHandoff: boolean;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [folders, setFolders] = useState<ConceptFolder[]>(initialFolders);
  const [dialog, setDialog] = useState<FolderDialogState>(null);

  function submitFolderName(name: string) {
    if (!dialog) return;

    const submittedDialog = dialog;
    startTransition(async () => {
      if (submittedDialog.mode === "rename") {
        const result = await renameProjectConceptFolderAction({
          projectId: project.id,
          stageKey,
          folderId: submittedDialog.folderId,
          name,
        });

        if ("error" in result) {
          showErrorToast(result.error ?? "Unable to rename the concept folder.");
          return;
        }

        setFolders((current) =>
          current.map((folder) =>
            folder.id === result.folder.id
              ? { ...folder, name: result.folder.name }
              : folder,
          ),
        );
        showSuccessToast("Concept folder renamed.");
      } else {
        const result = await createProjectConceptFolderAction({
          projectId: project.id,
          stageKey,
          name,
        });

        if ("error" in result) {
          showErrorToast(result.error ?? "Unable to create the concept folder.");
          return;
        }

        setFolders((current) => [...current, result.folder]);
        showSuccessToast("Concept folder created.");
      }

      setDialog(null);
      router.refresh();
    });
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

      <ProjectFlowSummaryStrip project={project} />

      {stageNumber === 4 && stageFourHandoffData?.canHandoff ? (
        <StageFourFinalFileHandoff
          projectId={project.id}
          initialFiles={stageFourHandoffData.files}
          canHandoff={stageFourHandoffData.canHandoff}
        />
      ) : null}

      <section className="mt-6 border-t border-[#dfe6df] pt-6" aria-labelledby="concept-folders-heading">
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
            disabled={isPending}
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
              className="relative min-w-0 rounded-[20px] border-[#dfe6df] shadow-[0_12px_30px_rgba(23,39,28,0.05)] transition hover:-translate-y-0.5 hover:border-[#bdd4c4] hover:shadow-[0_18px_38px_rgba(28,75,48,0.08)]"
            >
              <Link
                href={`/projects/${project.id}/stages/${stageNumber}/concepts/${folder.id}`}
                className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8057] focus-visible:ring-offset-2"
                aria-label={`Open ${folder.name}`}
              />
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
                      className="relative z-10 size-8 shrink-0 text-[#758078]"
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

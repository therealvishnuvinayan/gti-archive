"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { getProjectCollaboratorTypeMeta } from "@/lib/project-collaborator-participant-types";
import type { ProjectCollaboratorRecord, ProjectExecutorRecord } from "@/lib/projects";

type ProjectCollaboratorsPanelProps = {
  collaborators: ProjectCollaboratorRecord[];
  onRemove?: (id: string) => void | Promise<void>;
  onAdd?: () => void;
  addLabel?: string;
  onToggleChatVisibility?: (id: string, paused: boolean) => void | Promise<void>;
  saving?: boolean;
};

type ProjectExecutorsPanelProps = {
  executors: ProjectExecutorRecord[];
};

type PendingCollaboratorAction =
  | {
      kind: "remove";
      collaborator: ProjectCollaboratorRecord;
    }
  | {
      kind: "pause";
      collaborator: ProjectCollaboratorRecord;
    }
  | {
      kind: "resume";
      collaborator: ProjectCollaboratorRecord;
    };

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getCollaboratorGroupLabel(collaborator: ProjectCollaboratorRecord) {
  return collaborator.group === "external" ? "External" : "Internal";
}

function getCollaboratorGroupBadgeClassName(collaborator: ProjectCollaboratorRecord) {
  return collaborator.group === "external"
    ? "border border-[#f1dfcf] bg-[#fff4ea] text-[#ca7b3b]"
    : "border border-[#d7ead7] bg-[#eef8ef] text-[#2f8d5d]";
}

function getExecutorRoleBadgeClassName(executor: ProjectExecutorRecord) {
  return executor.role === "MAIN_EXECUTOR"
    ? "border border-[#d7ead7] bg-[#eef8ef] text-[#2f8d5d]"
    : "border border-[#dce3ec] bg-[#f3f7fb] text-[#4b6f91]";
}

function getExecutorGroupBadgeClassName(executor: ProjectExecutorRecord) {
  return executor.group === "external"
    ? "border border-[#f1dfcf] bg-[#fff4ea] text-[#ca7b3b]"
    : "border border-[#d7ead7] bg-[#eef8ef] text-[#2f8d5d]";
}

function CollaboratorTypeBadge({
  collaborator,
}: {
  collaborator: ProjectCollaboratorRecord;
}) {
  const typeMeta = getProjectCollaboratorTypeMeta(collaborator.participantType);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase leading-4 tracking-[0.06em] ${typeMeta.badgeClassName}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeMeta.dotClassName}`}
        aria-hidden="true"
      />
      <span className="truncate">{typeMeta.label}</span>
    </span>
  );
}

function CollaboratorCompactRow({
  collaborator,
  actions,
}: {
  collaborator: ProjectCollaboratorRecord;
  actions?: ReactNode;
}) {
  return (
    <li
      className={`flex min-h-[54px] items-center gap-3 rounded-[14px] border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-2 ${
        collaborator.chatVisibilityPaused ? "opacity-70" : ""
      }`}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[800] text-white">
        {getInitials(collaborator.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13px] font-[700] leading-5 text-[#111712]">
            {collaborator.name}
          </p>
          {collaborator.chatVisibilityPaused ? (
            <span className="shrink-0 rounded-full bg-[#f1f4f1] px-2 py-0.5 text-[9px] font-[800] uppercase leading-4 tracking-[0.06em] text-[#68726a]">
              Chat paused
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] leading-4 text-[#7a837b]">
          {collaborator.email ?? collaborator.role}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase leading-4 tracking-[0.06em] ${getCollaboratorGroupBadgeClassName(
              collaborator,
            )}`}
          >
            {getCollaboratorGroupLabel(collaborator)}
          </span>
          <CollaboratorTypeBadge collaborator={collaborator} />
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </li>
  );
}

function ExecutorCompactRow({ executor }: { executor: ProjectExecutorRecord }) {
  return (
    <li className="flex min-h-[54px] items-center gap-3 rounded-[14px] border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#d7efe0,#2f8d5d)] text-[10px] font-[800] text-white">
        {getInitials(executor.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-[700] leading-5 text-[#111712]">
          {executor.name}
        </p>
        <p className="truncate text-[11px] leading-4 text-[#7a837b]">
          {executor.email ?? executor.roleLabel}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase leading-4 tracking-[0.06em] ${getExecutorRoleBadgeClassName(
              executor,
            )}`}
          >
            {executor.roleLabel}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase leading-4 tracking-[0.06em] ${getExecutorGroupBadgeClassName(
              executor,
            )}`}
          >
            {executor.group === "external" ? "External" : "Internal"}
          </span>
        </div>
      </div>
    </li>
  );
}

function ProjectExecutorsModal({
  executors,
  isOpen,
  onClose,
}: {
  executors: ProjectExecutorRecord[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredExecutors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return executors;
    }

    return executors.filter((executor) =>
      [
        executor.name,
        executor.email ?? "",
        executor.roleLabel,
        executor.group,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [executors, query]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-[720px] rounded-[24px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-[800] leading-tight text-[#111712]">
                Project Executors
              </h2>
              <p className="mt-1 text-[12px] text-[#6f7a72]">
                {executors.length} total
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              className="shrink-0 border border-line"
              aria-label="Close project executors"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e978f]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search executors..."
              className="h-10 rounded-[14px] border border-line pl-10 text-[13px]"
              autoFocus
            />
          </div>

          <div className="mt-4 max-h-[430px] overflow-y-auto pr-1">
            {filteredExecutors.length > 0 ? (
              <ul className="space-y-2">
                {filteredExecutors.map((executor) => (
                  <ExecutorCompactRow key={executor.id} executor={executor} />
                ))}
              </ul>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-5 py-10 text-center">
                <p className="text-[14px] font-[700] text-[#2a332d]">
                  No executors found.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectExecutorsPanel({ executors }: ProjectExecutorsPanelProps) {
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const sortedExecutors = useMemo(
    () =>
      [...executors].sort((left, right) => {
        if (left.role !== right.role) {
          return left.role === "MAIN_EXECUTOR" ? -1 : 1;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }),
    [executors],
  );
  const visibleExecutors = sortedExecutors.slice(0, 5);
  const hiddenExecutorCount = Math.max(sortedExecutors.length - visibleExecutors.length, 0);

  return (
    <>
      <Card className="rounded-[20px]">
        <CardHeader className="flex-col items-start gap-2 pb-3">
          <div className="flex w-full items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[20px] leading-[1.15]">
                Project Executors
              </CardTitle>
              <p className="mt-1 text-[12px] font-[600] text-[#7a837b]">
                {sortedExecutors.length} {sortedExecutors.length === 1 ? "member" : "members"}
              </p>
            </div>
            {hiddenExecutorCount > 0 ? (
              <button
                type="button"
                onClick={() => setViewAllOpen(true)}
                className="rounded-full bg-[#f1f6f2] px-2.5 py-1 text-[11px] font-[800] text-brand"
              >
                +{hiddenExecutorCount} more
              </button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {visibleExecutors.length > 0 ? (
            <ul className="space-y-2">
              {visibleExecutors.map((executor) => (
                <ExecutorCompactRow key={executor.id} executor={executor} />
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-4 py-5 text-[13px] text-[#7a837b]">
              No executors added yet.
            </p>
          )}

          {hiddenExecutorCount > 0 ? (
            <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-[#e4eae4] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setViewAllOpen(true)}
                className="text-left text-[12px] font-[800] text-brand"
              >
                +{hiddenExecutorCount} more
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewAllOpen(true)}
                className="h-8 justify-start px-0 text-[12px] font-[800] text-brand sm:justify-center sm:px-2"
              >
                View all executors
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProjectExecutorsModal
        executors={sortedExecutors}
        isOpen={viewAllOpen}
        onClose={() => setViewAllOpen(false)}
      />
    </>
  );
}

function ProjectCollaboratorsModal({
  collaborators,
  isOpen,
  onClose,
}: {
  collaborators: ProjectCollaboratorRecord[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredCollaborators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return collaborators;
    }

    return collaborators.filter((collaborator) => {
      const typeLabel = getProjectCollaboratorTypeMeta(
        collaborator.participantType,
      ).label.toLowerCase();

      return (
        collaborator.name.toLowerCase().includes(normalizedQuery) ||
        (collaborator.email ?? "").toLowerCase().includes(normalizedQuery) ||
        typeLabel.includes(normalizedQuery)
      );
    });
  }, [collaborators, query]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-[720px] rounded-[24px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-[800] leading-tight text-[#111712]">
                Project Collaborators
              </h2>
              <p className="mt-1 text-[12px] text-[#6f7a72]">
                {collaborators.length} total
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              className="shrink-0 border border-line"
              aria-label="Close project collaborators"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e978f]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search collaborators..."
              className="h-10 rounded-[14px] border border-line pl-10 text-[13px]"
              autoFocus
            />
          </div>

          <div className="mt-4 max-h-[430px] overflow-y-auto pr-1">
            {filteredCollaborators.length > 0 ? (
              <ul className="space-y-2">
                {filteredCollaborators.map((collaborator) => (
                  <CollaboratorCompactRow
                    key={collaborator.id}
                    collaborator={collaborator}
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-5 py-10 text-center">
                <p className="text-[14px] font-[700] text-[#2a332d]">
                  No collaborators found.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectCollaboratorsSummary({
  collaborators,
  onRemove,
  onAdd,
  addLabel = "Add Collaborator",
  onToggleChatVisibility,
  saving = false,
}: ProjectCollaboratorsPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingCollaboratorAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const visibleCollaborators = collaborators.slice(0, 5);
  const hiddenCollaboratorCount = Math.max(collaborators.length - visibleCollaborators.length, 0);

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    setActionError(null);

    try {
      if (pendingAction.kind === "remove") {
        await Promise.resolve(onRemove?.(pendingAction.collaborator.id));
      } else {
        await Promise.resolve(
          onToggleChatVisibility?.(
            pendingAction.collaborator.id,
            pendingAction.kind === "pause",
          ),
        );
      }

      setPendingAction(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : pendingAction.kind === "remove"
            ? "Unable to remove the collaborator right now."
            : "Unable to update chat visibility right now.",
      );
    }
  }

  const confirmationTitle =
    pendingAction?.kind === "remove"
      ? "Remove collaborator?"
      : pendingAction?.kind === "pause"
        ? "Pause chat visibility for this collaborator?"
        : "Resume chat visibility for this collaborator?";
  const confirmationDescription =
    pendingAction?.kind === "remove"
      ? "This collaborator will be removed from the project and will no longer have access to project collaboration features."
      : pendingAction?.kind === "pause"
        ? "This collaborator will still see older chat history, but new messages and files created while paused will be hidden from them."
        : "This collaborator will start seeing new chat messages and files again. Items created during earlier paused periods will stay hidden.";
  const confirmationLabel =
    pendingAction?.kind === "remove"
      ? "Remove Collaborator"
      : pendingAction?.kind === "pause"
        ? "Pause Chat Visibility"
        : "Resume Chat Visibility";

  return (
    <>
      <Card className="rounded-[20px]">
        <CardHeader className="flex-col items-start gap-2 pb-3">
          <div className="flex w-full items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[20px] leading-[1.15]">
                Project Collaborators
              </CardTitle>
              <p className="mt-1 text-[12px] font-[600] text-[#7a837b]">
                {collaborators.length} {collaborators.length === 1 ? "member" : "members"}
              </p>
            </div>
            {hiddenCollaboratorCount > 0 ? (
              <button
                type="button"
                onClick={() => setViewAllOpen(true)}
                className="rounded-full bg-[#f1f6f2] px-2.5 py-1 text-[11px] font-[800] text-brand"
              >
                +{hiddenCollaboratorCount} more
              </button>
            ) : null}
          </div>
          {onAdd ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAdd}
              className="-ml-2 h-auto px-2 py-1 text-[13px] font-[600] text-brand"
            >
              <Plus className="h-4 w-4" />
              {addLabel}
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="pt-0">
          {visibleCollaborators.length > 0 ? (
            <ul className="space-y-2">
              {visibleCollaborators.map((collaborator) => (
                <CollaboratorCompactRow
                  key={collaborator.id}
                  collaborator={collaborator}
                  actions={
                    collaborator.removable && (onToggleChatVisibility || onRemove) ? (
                      <>
                        {onToggleChatVisibility ? (
                          <Button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setPendingAction({
                                kind: collaborator.chatVisibilityPaused ? "resume" : "pause",
                                collaborator,
                              });
                            }}
                            variant="ghost"
                            size="icon"
                            className="size-8 text-[#6a746c]"
                            disabled={saving}
                            aria-label={`${
                              collaborator.chatVisibilityPaused ? "Resume" : "Pause"
                            } chat visibility for ${collaborator.name}`}
                          >
                            {collaborator.chatVisibilityPaused ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                        {onRemove ? (
                          <Button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setPendingAction({
                                kind: "remove",
                                collaborator,
                              });
                            }}
                            variant="ghost"
                            size="icon"
                            className="size-8 text-[#ff6e68]"
                            disabled={saving}
                            aria-label={`Remove ${collaborator.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d6ddd6] bg-[#fbfcfa] px-4 py-5 text-[13px] text-[#7a837b]">
              No collaborators added yet.
            </p>
          )}

          {hiddenCollaboratorCount > 0 ? (
            <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-[#e4eae4] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setViewAllOpen(true)}
                className="text-left text-[12px] font-[800] text-brand"
              >
                +{hiddenCollaboratorCount} more
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewAllOpen(true)}
                className="h-8 justify-start px-0 text-[12px] font-[800] text-brand sm:justify-center sm:px-2"
              >
                View all collaborators
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProjectCollaboratorsModal
        collaborators={collaborators}
        isOpen={viewAllOpen}
        onClose={() => setViewAllOpen(false)}
      />

      <ConfirmationDialog
        isOpen={pendingAction !== null}
        title={confirmationTitle ?? "Update collaborator"}
        description={confirmationDescription ?? ""}
        confirmLabel={confirmationLabel ?? "Confirm"}
        cancelLabel="Cancel"
        tone={pendingAction?.kind === "remove" ? "destructive" : "default"}
        pending={saving}
        error={actionError ?? undefined}
        onClose={() => {
          if (saving) {
            return;
          }

          setActionError(null);
          setPendingAction(null);
        }}
        onConfirm={() => {
          void handleConfirmAction();
        }}
      />
    </>
  );
}

export function ProjectCollaboratorsPanel(props: ProjectCollaboratorsPanelProps) {
  return <ProjectCollaboratorsSummary {...props} />;
}

"use client";

import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  getDefaultProjectCollaboratorParticipantType,
  getProjectCollaboratorTypeMeta,
  projectCollaboratorParticipantTypes,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectCollaboratorRecord } from "@/lib/projects";

type ProjectCollaboratorsPanelProps = {
  collaborators: ProjectCollaboratorRecord[];
  onRemove?: (id: string) => void | Promise<void>;
  onAdd?: () => void;
  addLabel?: string;
  onParticipantTypeChange?: (
    id: string,
    participantType: ProjectCollaboratorParticipantType,
  ) => void;
  onToggleChatVisibility?: (id: string, paused: boolean) => void | Promise<void>;
  saving?: boolean;
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

export function ProjectCollaboratorsPanel({
  collaborators,
  onRemove,
  onAdd,
  addLabel = "Add Collaborator",
  onParticipantTypeChange,
  onToggleChatVisibility,
  saving = false,
}: ProjectCollaboratorsPanelProps) {
  const internal = collaborators.filter((collaborator) => collaborator.group === "internal");
  const external = collaborators.filter((collaborator) => collaborator.group === "external");
  const [pendingAction, setPendingAction] = useState<PendingCollaboratorAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
          <CardTitle className="text-[20px] leading-[1.15]">
            Project Collaborators
          </CardTitle>
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
          {([
            ["Internal", internal],
            ["External", external],
          ] as const).map(([label, items]) => (
            <div key={label} className="mt-5">
              <h3 className="text-[16px] font-[700] text-[#86c864]">{label}</h3>
              <ul className="mt-3 space-y-3">
                {items.length > 0 ? (
                  items.map((collaborator) => (
                    <li
                      key={collaborator.id}
                      className={`flex items-center gap-3 ${
                        collaborator.chatVisibilityPaused ? "opacity-70" : ""
                      }`}
                    >
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                        {getInitials(collaborator.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-[600] text-[#111712]">
                          {collaborator.name}
                        </p>
                        <p className="truncate text-[10px] text-[#7a837b]">{collaborator.role}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-[800] uppercase tracking-[0.06em] ${getProjectCollaboratorTypeMeta(
                              collaborator.participantType,
                            ).badgeClassName}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${getProjectCollaboratorTypeMeta(
                                collaborator.participantType,
                              ).dotClassName}`}
                              aria-hidden="true"
                            />
                            {getProjectCollaboratorTypeMeta(collaborator.participantType).label}
                          </span>
                          {collaborator.chatVisibilityPaused ? (
                            <span className="inline-flex items-center rounded-full bg-[#f1f4f1] px-2 py-1 text-[9px] font-[800] uppercase tracking-[0.06em] text-[#68726a]">
                              Chat paused
                            </span>
                          ) : null}
                        </div>
                        {onParticipantTypeChange && collaborator.removable ? (
                          <div className="mt-2 max-w-[220px]">
                            <Select
                              value={
                                collaborator.participantType ??
                                getDefaultProjectCollaboratorParticipantType(
                                  collaborator.group,
                                )
                              }
                              onValueChange={(value) =>
                                onParticipantTypeChange(
                                  collaborator.id,
                                  value as ProjectCollaboratorParticipantType,
                                )
                              }
                              disabled={saving}
                            >
                              <SelectTrigger className="h-8 rounded-full border border-line bg-white text-[11px] font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {projectCollaboratorParticipantTypes.map((participantType) => (
                                  <SelectItem key={participantType} value={participantType}>
                                    {getProjectCollaboratorTypeMeta(participantType).label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                      {collaborator.removable && onToggleChatVisibility ? (
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
                      {collaborator.removable && onRemove ? (
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
                    </li>
                  ))
                ) : (
                  <li className="text-[12px] text-[#8a938c]">
                    No {label.toLowerCase()} collaborators yet.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

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

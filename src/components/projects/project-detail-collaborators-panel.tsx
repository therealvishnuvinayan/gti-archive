"use client";

import { useState } from "react";

import { removeProjectCollaboratorAction } from "@/app/(dashboard)/projects/actions";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import type { ProjectCollaboratorRecord } from "@/lib/projects";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type ProjectDetailCollaboratorsPanelProps = {
  projectId: string;
  collaborators: ProjectCollaboratorRecord[];
  canRemoveCollaborators: boolean;
};

export function ProjectDetailCollaboratorsPanel({
  projectId,
  collaborators,
  canRemoveCollaborators,
}: ProjectDetailCollaboratorsPanelProps) {
  const [items, setItems] = useState(collaborators);
  const [saving, setSaving] = useState(false);

  async function removeCollaborator(collaboratorId: string) {
    setSaving(true);

    try {
      const result = await removeProjectCollaboratorAction(projectId, collaboratorId);

      if ("error" in result) {
        throw new Error(result.error);
      }

      setItems((current) => {
        const owner = current.find((collaborator) => collaborator.access === "owner");
        return owner ? [owner, ...result.collaborators] : result.collaborators;
      });
      showSuccessToast("Collaborator removed successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to remove the collaborator right now.";
      showErrorToast("Unable to remove collaborator.", message);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProjectCollaboratorsPanel
      collaborators={items}
      onRemove={canRemoveCollaborators ? removeCollaborator : undefined}
      saving={saving}
    />
  );
}

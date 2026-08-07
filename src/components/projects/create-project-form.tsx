"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { CollaboratorPickerDialog } from "@/components/collaboration/collaborator-picker-dialog";
import {
  ProjectUserSelector,
  type ProjectUserOption,
} from "@/components/projects/project-user-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollaboratorRecord } from "@/lib/collaboration";
import type { ProjectOwnerCandidate } from "@/lib/project-owner-candidates";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast";

type CreateProjectFormProps = {
  currentUser: ProjectUserOption;
  eligibleOwnerCandidates: ProjectOwnerCandidate[];
  availableCollaborators: CollaboratorRecord[];
  canInviteCollaborator: boolean;
};

type FormErrors = {
  name?: string;
  owner?: string;
  executors?: string;
};

function getDefaultCollaboratorForm(): CollaboratorForm {
  return {
    name: "",
    email: "",
    type: "GTI_INTERNAL_CLIENT",
  };
}

function toUserOption(collaborator: CollaboratorRecord): ProjectUserOption {
  return {
    id: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    role: "COLLABORATOR",
  };
}

function upsertCollaborator(
  collaborators: CollaboratorRecord[],
  nextCollaborator: CollaboratorRecord,
) {
  const existingIndex = collaborators.findIndex(
    (collaborator) => collaborator.id === nextCollaborator.id,
  );

  if (existingIndex < 0) {
    return [...collaborators, nextCollaborator];
  }

  return collaborators.map((collaborator, index) =>
    index === existingIndex ? nextCollaborator : collaborator,
  );
}

export function CreateProjectForm({
  currentUser,
  eligibleOwnerCandidates,
  availableCollaborators,
  canInviteCollaborator,
}: CreateProjectFormProps) {
  const [projectName, setProjectName] = useState("");
  const [collaborators, setCollaborators] = useState(availableCollaborators);
  const [ownerIds, setOwnerIds] = useState<string[]>(() =>
    currentUser.role === "SUPER_ADMIN" ? [] : [currentUser.id],
  );
  const [coOwnerIds, setCoOwnerIds] = useState<string[]>([]);
  const [executorIds, setExecutorIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftExecutorIds, setDraftExecutorIds] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<CollaboratorForm>(
    getDefaultCollaboratorForm,
  );
  const [inviteError, setInviteError] = useState<string>();
  const [inviteSaving, setInviteSaving] = useState(false);

  const userOptions = useMemo(() => {
    const options = [currentUser, ...collaborators.map(toUserOption)];
    const uniqueOptions = new Map(options.map((user) => [user.id, user] as const));

    return [...uniqueOptions.values()];
  }, [collaborators, currentUser]);
  const ownerOptions = useMemo(
    () =>
      eligibleOwnerCandidates
        .filter((candidate) => candidate.role !== "SUPER_ADMIN")
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          role: candidate.role,
          avatarSrc:
            candidate.id === currentUser.id ? currentUser.avatarSrc : null,
        })),
    [currentUser, eligibleOwnerCandidates],
  );
  const coOwnerOptions = useMemo(
    () => userOptions.filter((user) => !ownerIds.includes(user.id)),
    [ownerIds, userOptions],
  );

  function handleOwnerChange(nextOwnerIds: string[]) {
    const nextOwnerId = nextOwnerIds[0];
    setOwnerIds(nextOwnerId ? [nextOwnerId] : []);

    if (nextOwnerId) {
      setCoOwnerIds((current) => current.filter((id) => id !== nextOwnerId));
    }

    setErrors((current) => ({ ...current, owner: undefined }));
  }

  function openCollaboratorPicker() {
    setDraftExecutorIds(executorIds);
    setPickerOpen(true);
  }

  function openInviteDialog() {
    if (!canInviteCollaborator) {
      showWarningToast(
        "Invitation unavailable.",
        "You do not have permission to invite collaborators.",
      );
      return;
    }

    setInviteForm(getDefaultCollaboratorForm());
    setInviteError(undefined);
    setPickerOpen(false);
    setInviteOpen(true);
  }

  async function handleInviteCollaborator() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      const message = "Enter both collaborator name and email.";
      setInviteError(message);
      return;
    }

    setInviteSaving(true);
    setInviteError(undefined);

    try {
      const result = await saveCollaboratorAction({
        ...inviteForm,
        allowExistingUser: true,
      });

      if ("error" in result) {
        setInviteError(result.error);
        return;
      }

      setCollaborators((current) => upsertCollaborator(current, result.collaborator));
      setExecutorIds((current) =>
        current.includes(result.collaborator.id)
          ? current
          : [...current, result.collaborator.id],
      );
      setErrors((current) => ({ ...current, executors: undefined }));
      setInviteOpen(false);
      showSuccessToast("Collaborator invited and added as an executor.");

      if (result.warning) {
        showWarningToast("Collaborator saved with a warning.", result.warning);
      }
    } catch {
      const message = "Unable to invite the collaborator right now. Please try again.";
      setInviteError(message);
      showErrorToast("Unable to invite collaborator.", message);
    } finally {
      setInviteSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};

    if (!projectName.trim()) {
      nextErrors.name = "Project name is required.";
    }

    if (ownerIds.length !== 1) {
      nextErrors.owner = "Select one project owner.";
    }

    if (executorIds.length === 0) {
      nextErrors.executors = "Select at least one project executor.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      showErrorToast("Review the highlighted fields.");
      return;
    }

    showWarningToast(
      "Project creation is awaiting Phase 2.",
      "The current project model still requires legacy fields and executor hierarchy data, so this form was not persisted.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] pb-4 sm:pb-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[13px] sm:text-[14px]">
        <Link href="/projects" className="font-[550] text-[#778079] transition hover:text-brand">
          Projects
        </Link>
        <span className="text-[#a0a7a1]" aria-hidden="true">
          /
        </span>
        <span className="font-[650] text-[#263029]">Create Project</span>
      </nav>

      <h1 className="text-[30px] font-[750] tracking-[-0.045em] text-[#111713] sm:text-[38px]">
        Create Project
      </h1>

      <form onSubmit={handleSubmit} noValidate className="mt-7 sm:mt-8">
        <div className="rounded-[22px] border border-[#d9e0d9] bg-white px-5 py-6 shadow-[0_12px_34px_rgba(20,36,25,0.035)] sm:px-8 sm:py-8 lg:px-10">
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-[190px_minmax(0,1fr)] md:items-start md:gap-y-7">
            <label htmlFor="project-name" className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Name
            </label>
            <div>
              <Input
                id="project-name"
                value={projectName}
                onChange={(event) => {
                  setProjectName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="Enter project name"
                className={`h-[54px] rounded-[16px] border px-4 text-[14px] shadow-none ${
                  errors.name ? "border-[#c85c54]" : "border-[#d9e0d9]"
                }`}
                autoComplete="off"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <p className="mt-1.5 text-[12px] text-[#b84e48]">{errors.name}</p>
              ) : null}
            </div>

            <div className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Owner
            </div>
            <ProjectUserSelector
              users={ownerOptions}
              selectedIds={ownerIds}
              onChange={handleOwnerChange}
              mode="single"
              placeholder="Search users..."
              ariaLabel="Project owner"
              error={errors.owner}
            />

            <div className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Co-Owners
            </div>
            <ProjectUserSelector
              users={coOwnerOptions}
              selectedIds={coOwnerIds}
              onChange={setCoOwnerIds}
              mode="multiple"
              placeholder="Search users..."
              ariaLabel="Project co-owners"
            />

            <div className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Executors
            </div>
            <div>
              <ProjectUserSelector
                users={userOptions}
                selectedIds={executorIds}
                onChange={(nextIds) => {
                  setExecutorIds(nextIds);
                  setErrors((current) => ({ ...current, executors: undefined }));
                }}
                mode="multiple"
                placeholder="Search users..."
                ariaLabel="Project executors"
                error={errors.executors}
              />

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <button
                  type="button"
                  onClick={openCollaboratorPicker}
                  className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] font-[650] text-brand transition hover:text-brand-dark"
                >
                  <Plus className="h-4 w-4" />
                  Add collaborator
                </button>
                <button
                  type="button"
                  onClick={openInviteDialog}
                  aria-disabled={!canInviteCollaborator}
                  title={
                    canInviteCollaborator
                      ? undefined
                      : "You do not have permission to invite collaborators."
                  }
                  className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] font-[650] text-brand transition hover:text-brand-dark aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite collaborator
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" className="min-w-[170px] rounded-[14px]">
            Create Project
          </Button>
          <Button asChild type="button" size="lg" variant="secondary" className="min-w-[112px] rounded-[14px] shadow-none">
            <Link href="/projects">Cancel</Link>
          </Button>
        </div>
      </form>

      <CollaboratorPickerDialog
        isOpen={pickerOpen}
        title="Add project executors"
        description="Select existing collaborators for this project."
        collaborators={collaborators}
        selectedIds={draftExecutorIds}
        onToggle={(collaboratorId) =>
          setDraftExecutorIds((current) =>
            current.includes(collaboratorId)
              ? current.filter((id) => id !== collaboratorId)
              : [...current, collaboratorId],
          )
        }
        onClose={() => setPickerOpen(false)}
        onConfirm={() => {
          setExecutorIds(draftExecutorIds);
          setErrors((current) => ({ ...current, executors: undefined }));
          setPickerOpen(false);
        }}
        onInviteFallback={canInviteCollaborator ? openInviteDialog : undefined}
        confirmLabel="Add executors"
      />

      <CollaboratorDialog
        isOpen={inviteOpen}
        mode="invite"
        form={inviteForm}
        error={inviteError}
        saving={inviteSaving}
        onClose={() => {
          if (!inviteSaving) {
            setInviteOpen(false);
          }
        }}
        onSubmit={handleInviteCollaborator}
        onChange={(field, value) => {
          setInviteForm((current) => ({ ...current, [field]: value }));
          setInviteError(undefined);
        }}
      />
    </div>
  );
}

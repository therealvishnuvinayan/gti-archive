"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import { createProjectV2Action } from "@/app/(dashboard)/projects/new/v2-actions";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
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
  coOwners?: string;
  executors?: string;
  collaborators?: string;
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
  const router = useRouter();
  const [isCreating, startCreating] = useTransition();
  const [projectName, setProjectName] = useState("");
  const [collaborators, setCollaborators] = useState(availableCollaborators);
  const [ownerIds, setOwnerIds] = useState<string[]>(() =>
    currentUser.role === "SUPER_ADMIN" ? [] : [currentUser.id],
  );
  const [coOwnerIds, setCoOwnerIds] = useState<string[]>([]);
  const [executorIds, setExecutorIds] = useState<string[]>([]);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<CollaboratorForm>(
    getDefaultCollaboratorForm,
  );
  const [inviteError, setInviteError] = useState<string>();
  const [inviteSaving, setInviteSaving] = useState(false);

  const collaboratorUserOptions = useMemo(() => {
    const options = collaborators.map(toUserOption);
    const uniqueOptions = new Map(options.map((user) => [user.id, user] as const));

    return [...uniqueOptions.values()];
  }, [collaborators]);
  const executorOptions = useMemo(
    () => collaboratorUserOptions.filter((user) => !collaboratorIds.includes(user.id)),
    [collaboratorIds, collaboratorUserOptions],
  );
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
    () =>
      ownerOptions.filter(
        (user) =>
          !ownerIds.includes(user.id) && !collaboratorIds.includes(user.id),
      ),
    [collaboratorIds, ownerIds, ownerOptions],
  );
  const projectCollaboratorOptions = useMemo(
    () =>
      collaboratorUserOptions.filter(
        (user) =>
          !ownerIds.includes(user.id) &&
          !coOwnerIds.includes(user.id) &&
          !executorIds.includes(user.id),
      ),
    [coOwnerIds, collaboratorUserOptions, executorIds, ownerIds],
  );

  function handleOwnerChange(nextOwnerIds: string[]) {
    const nextOwnerId = nextOwnerIds[0];
    setOwnerIds(nextOwnerId ? [nextOwnerId] : []);

    if (nextOwnerId) {
      setCoOwnerIds((current) => current.filter((id) => id !== nextOwnerId));
      setCollaboratorIds((current) => current.filter((id) => id !== nextOwnerId));
    }

    setErrors((current) => ({ ...current, owner: undefined }));
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
      setCollaboratorIds((current) =>
        current.includes(result.collaborator.id)
          ? current
          : [...current, result.collaborator.id],
      );
      setErrors((current) => ({ ...current, collaborators: undefined }));
      setInviteOpen(false);
      showSuccessToast("Collaborator invited and added to the project.");

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

    if (isCreating) {
      return;
    }

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

    startCreating(async () => {
      const result = await createProjectV2Action({
        name: projectName,
        ownerId: ownerIds[0] ?? "",
        coOwnerIds,
        executorIds,
        collaboratorIds,
      });

      if ("error" in result) {
        setErrors({
          name: result.fieldErrors?.name,
          owner: result.fieldErrors?.ownerId,
          coOwners: result.fieldErrors?.coOwnerIds,
          executors: result.fieldErrors?.executorIds,
          collaborators: result.fieldErrors?.collaboratorIds,
        });
        showErrorToast("Unable to create project.", result.error);
        return;
      }

      showSuccessToast("Project created successfully.");
      router.push(`/projects/${result.projectId}`);
      router.refresh();
    });
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
              onChange={(nextIds) => {
                setCoOwnerIds(nextIds);
                setCollaboratorIds((current) =>
                  current.filter((id) => !nextIds.includes(id)),
                );
                setErrors((current) => ({ ...current, coOwners: undefined }));
              }}
              mode="multiple"
              placeholder="Search users..."
              ariaLabel="Project co-owners"
              error={errors.coOwners}
            />

            <div className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Executors
            </div>
            <div>
              <ProjectUserSelector
                users={executorOptions}
                selectedIds={executorIds}
                onChange={(nextIds) => {
                  setExecutorIds(nextIds);
                  setCollaboratorIds((current) =>
                    current.filter((id) => !nextIds.includes(id)),
                  );
                  setErrors((current) => ({ ...current, executors: undefined }));
                }}
                mode="multiple"
                placeholder="Search users..."
                ariaLabel="Project executors"
                error={errors.executors}
              />
            </div>

            <div className="pt-0 text-[14px] font-[700] text-[#18211b] md:pt-[16px]">
              Project Collaborators
            </div>
            <div>
              <ProjectUserSelector
                users={projectCollaboratorOptions}
                selectedIds={collaboratorIds}
                onChange={(nextIds) => {
                  setCollaboratorIds(nextIds);
                  setErrors((current) => ({ ...current, collaborators: undefined }));
                }}
                mode="multiple"
                placeholder="Search users..."
                ariaLabel="Project collaborators"
                error={errors.collaborators}
              />
              <p className="mt-2 text-[12px] text-[#768078]">
                Add people who will participate in or access this project.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
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
          <Button
            type="submit"
            size="lg"
            disabled={isCreating}
            className="min-w-[170px] rounded-[14px]"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCreating ? "Creating..." : "Create Project"}
          </Button>
          <Button
            asChild
            type="button"
            size="lg"
            variant="secondary"
            className="min-w-[112px] rounded-[14px] shadow-none"
          >
            <Link href="/projects">Cancel</Link>
          </Button>
        </div>
      </form>

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

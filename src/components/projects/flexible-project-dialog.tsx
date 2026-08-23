"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createFlexibleProjectAction,
  updateFlexibleProjectAction,
} from "@/app/(dashboard)/projects/flexible/actions";
import { AppDatePicker } from "@/components/calendar/app-date-picker";
import { FlexibleDialog } from "@/components/projects/flexible-dialog";
import { ProjectUserSelector } from "@/components/projects/project-user-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  FlexibleProjectFieldErrors,
  FlexibleProjectUserOption,
} from "@/lib/flexible-projects";
import { showSuccessToast } from "@/lib/toast";

type EditableFlexibleProject = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  collaboratorIds: string[];
  deadline: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  scope: "INTERNAL" | "EXTERNAL";
};

type FlexibleProjectDialogProps = {
  mode: "create" | "edit";
  users: FlexibleProjectUserOption[];
  currentUserId: string;
  initialProject?: EditableFlexibleProject;
  onClose: () => void;
};

const inputClassName =
  "h-11 rounded-[14px] border border-[#d9e1d9] bg-white shadow-none";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-2 block text-[12px] font-[700] text-[#3c4740]">
      {children} {required ? <span className="text-[#b5483f]">*</span> : null}
    </span>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-[11px] text-[#b5483f]">{children}</p> : null;
}

export function FlexibleProjectDialog({
  mode,
  users,
  currentUserId,
  initialProject,
  onClose,
}: FlexibleProjectDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialProject?.name ?? "");
  const [description, setDescription] = useState(initialProject?.description ?? "");
  const [ownerIds, setOwnerIds] = useState<string[]>([
    initialProject?.ownerId ?? (users.some(({ id }) => id === currentUserId) ? currentUserId : users[0]?.id ?? ""),
  ]);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>(initialProject?.collaboratorIds ?? []);
  const [deadline, setDeadline] = useState(initialProject?.deadline?.slice(0, 10) ?? "");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">(initialProject?.priority ?? "MEDIUM");
  const [scope, setScope] = useState<"INTERNAL" | "EXTERNAL">(initialProject?.scope ?? "INTERNAL");
  const [errors, setErrors] = useState<FlexibleProjectFieldErrors>({});
  const [formError, setFormError] = useState("");
  const ownerId = ownerIds[0] ?? "";
  const collaboratorOptions = useMemo(
    () => users.filter((user) => user.id !== ownerId),
    [ownerId, users],
  );

  function changeOwner(ids: string[]) {
    const nextOwnerId = ids[0] ?? "";
    setOwnerIds(nextOwnerId ? [nextOwnerId] : []);
    setCollaboratorIds((current) => current.filter((id) => id !== nextOwnerId));
    setErrors((current) => ({ ...current, ownerId: undefined, collaboratorIds: undefined }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors: FlexibleProjectFieldErrors = {};
    if (!name.trim()) nextErrors.name = "Project name is required.";
    if (!ownerId) nextErrors.ownerId = "Select a project owner.";
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    startTransition(async () => {
      const input = {
        name,
        description,
        ownerId,
        collaboratorIds,
        deadline,
        priority,
        scope,
      };
      const result =
        mode === "edit" && initialProject
          ? await updateFlexibleProjectAction(initialProject.id, input)
          : await createFlexibleProjectAction(input);
      if ("error" in result) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }

      showSuccessToast(mode === "create" ? "Flexible Project created." : "Flexible Project updated.");
      onClose();
      if (mode === "create") router.push(`/projects/flexible/${result.slug}`);
      else router.refresh();
    });
  }

  return (
    <FlexibleDialog
      open
      title={mode === "create" ? "New Flexible Project" : "Edit Flexible Project"}
      description={mode === "create" ? "Set up a simple project with your own milestones." : "Update the project details and participants."}
      onClose={pending ? () => undefined : onClose}
      maxWidth="max-w-[780px]"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" form="flexible-project-form" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Saving..." : mode === "create" ? "Create Project" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form id="flexible-project-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {formError ? <div className="sm:col-span-2 rounded-[14px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#a9423d]">{formError}</div> : null}

        <label className="sm:col-span-2">
          <FieldLabel required>Project Name</FieldLabel>
          <Input value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: undefined })); }} required maxLength={160} placeholder="e.g. Annual Retail Conference" className={inputClassName} />
          <FieldError>{errors.name}</FieldError>
        </label>

        <div className="sm:col-span-2">
          <FieldLabel>Description / Brief</FieldLabel>
          <RichTextEditor value={description} onChange={setDescription} placeholder="What should this project deliver?" minHeightClassName="min-h-28" ariaLabel="Project description and brief" />
          <FieldError>{errors.description}</FieldError>
        </div>

        <div>
          <FieldLabel required>Owner</FieldLabel>
          <ProjectUserSelector users={users} selectedIds={ownerIds} onChange={changeOwner} mode="single" placeholder="Search GTI users..." ariaLabel="Project owner" error={errors.ownerId} />
          <FieldError>{errors.ownerId}</FieldError>
        </div>

        <div>
          <FieldLabel>Collaborators</FieldLabel>
          <ProjectUserSelector users={collaboratorOptions} selectedIds={collaboratorIds} onChange={(ids) => { setCollaboratorIds(ids); setErrors((current) => ({ ...current, collaboratorIds: undefined })); }} mode="multiple" placeholder="Search GTI users..." ariaLabel="Project collaborators" error={errors.collaboratorIds} />
          <FieldError>{errors.collaboratorIds}</FieldError>
        </div>

        <div>
          <FieldLabel>Deadline</FieldLabel>
          <AppDatePicker value={deadline} onChange={(value) => { setDeadline(value); setErrors((current) => ({ ...current, deadline: undefined })); }} placeholder="Select deadline" triggerClassName={`${inputClassName} w-full justify-between px-4 font-normal shadow-none hover:bg-white`} />
          <FieldError>{errors.deadline}</FieldError>
        </div>

        <div>
          <FieldLabel>Priority</FieldLabel>
          <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
            <SelectTrigger className={`${inputClassName} w-full px-4`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <FieldError>{errors.priority}</FieldError>
        </div>

        <div>
          <FieldLabel>Internal / External</FieldLabel>
          <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
            <SelectTrigger className={`${inputClassName} w-full px-4`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INTERNAL">Internal</SelectItem>
              <SelectItem value="EXTERNAL">External</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </form>
    </FlexibleDialog>
  );
}

"use client";

import { type FormEvent, useState } from "react";

import { AppDatePicker } from "@/components/calendar/app-date-picker";
import { FlexiblePrototypeDialog } from "@/components/projects/flexible-prototype-dialog";
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
import type { FlexibleMilestoneFixture } from "@/lib/flexible-project-ui-fixtures";

export type FlexibleMilestoneFormValue = {
  name: string;
  category: string;
  responsible: string;
  deadline: string;
  approvalRequired: boolean;
  description: string;
};

type FlexibleMilestoneDialogProps = {
  mode: "add" | "edit";
  initialMilestone?: FlexibleMilestoneFixture;
  onClose: () => void;
  onSave: (value: FlexibleMilestoneFormValue) => void;
};

const inputClassName =
  "h-11 rounded-[14px] border border-[#d9e1d9] bg-white shadow-none";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-2 block text-[12px] font-[700] text-[#3c4740]">
      {children} {required ? <span className="text-[#b5483f]">*</span> : null}
    </span>
  );
}

export function FlexibleMilestoneDialog({
  mode,
  initialMilestone,
  onClose,
  onSave,
}: FlexibleMilestoneDialogProps) {
  const [name, setName] = useState(initialMilestone?.name ?? "");
  const [category, setCategory] = useState(initialMilestone?.category ?? "Standard");
  const [responsible, setResponsible] = useState(initialMilestone?.responsible ?? "Vishnu");
  const [deadline, setDeadline] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(
    initialMilestone?.approvalRequired ?? false,
  );
  const [description, setDescription] = useState(initialMilestone?.description ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      category,
      responsible,
      deadline,
      approvalRequired,
      description,
    });
  }

  return (
    <FlexiblePrototypeDialog
      open
      title={mode === "add" ? "Add Milestone" : "Edit Milestone"}
      description="Changes stay in local browser state and are not saved."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="flexible-milestone-form">
            {mode === "add" ? "Add Milestone" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form id="flexible-milestone-form" onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <Label required>Milestone Name</Label>
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Production Readiness"
            className={inputClassName}
          />
        </label>

        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={`${inputClassName} w-full px-4`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Standard">Standard</SelectItem>
              <SelectItem value="Creative">Creative</SelectItem>
              <SelectItem value="UX Planning">UX Planning</SelectItem>
              <SelectItem value="Design">Design</SelectItem>
              <SelectItem value="Vendor Sourcing">Vendor Sourcing</SelectItem>
              <SelectItem value="Vendor Comparison">Vendor Comparison</SelectItem>
              <SelectItem value="Design Review">Design Review</SelectItem>
              <SelectItem value="Sample Review">Sample Review</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="Review & Inspection">Review & Inspection</SelectItem>
              <SelectItem value="Website / App">Website / App</SelectItem>
              <SelectItem value="Event / Exhibition">Event / Exhibition</SelectItem>
              <SelectItem value="Handover">Handover</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Responsible Person</Label>
          <Select value={responsible} onValueChange={setResponsible}>
            <SelectTrigger className={`${inputClassName} w-full px-4`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vishnu">Vishnu</SelectItem>
              <SelectItem value="Sarah Ahmed">Sarah Ahmed</SelectItem>
              <SelectItem value="Admin User">Admin User</SelectItem>
              <SelectItem value="Collaborator 01">Collaborator 01</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Deadline</Label>
          <AppDatePicker
            value={deadline}
            onChange={setDeadline}
            placeholder={initialMilestone?.dateLabel ?? "Select deadline"}
            triggerClassName={`${inputClassName} w-full justify-between px-4 font-normal shadow-none hover:bg-white`}
          />
        </div>

        <div>
          <Label>Approval Required</Label>
          <Select
            value={approvalRequired ? "yes" : "no"}
            onValueChange={(value) => setApprovalRequired(value === "yes")}
          >
            <SelectTrigger className={`${inputClassName} w-full px-4`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label>Description / Notes</Label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Add context, expected outcomes, or handover notes."
            minHeightClassName="min-h-28"
            ariaLabel="Milestone description and notes"
          />
        </div>
      </form>
    </FlexiblePrototypeDialog>
  );
}

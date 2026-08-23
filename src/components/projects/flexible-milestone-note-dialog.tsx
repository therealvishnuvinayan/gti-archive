"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { FlexibleDialog } from "@/components/projects/flexible-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FlexibleMilestoneNoteFieldErrors } from "@/lib/flexible-projects";

const NOTE_MAX_LENGTH = 2_000;

type FlexibleMilestoneNoteDialogProps = {
  onClose: () => void;
  onSave: (content: string) => Promise<{
    error?: string;
    fieldErrors?: FlexibleMilestoneNoteFieldErrors;
  }>;
};

export function FlexibleMilestoneNoteDialog({
  onClose,
  onSave,
}: FlexibleMilestoneNoteDialogProps) {
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldError, setFieldError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalized = content.trim();
    if (!normalized) {
      setFieldError("Note is required.");
      return;
    }

    setFieldError("");
    setFormError("");
    startTransition(async () => {
      const result = await onSave(normalized);
      if (result.error) {
        setFormError(result.error);
        setFieldError(result.fieldErrors?.content ?? "");
      }
    });
  }

  return (
    <FlexibleDialog
      open
      title="Add Note"
      description="Add a reminder, task, or update to this milestone."
      maxWidth="max-w-[560px]"
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" form="flexible-milestone-note-form" disabled={pending || !content.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Adding..." : "Add Note"}
          </Button>
        </>
      }
    >
      <form id="flexible-milestone-note-form" onSubmit={submit}>
        {formError ? (
          <div className="mb-4 rounded-[14px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#a9423d]">
            {formError}
          </div>
        ) : null}
        <label>
          <span className="mb-2 block text-[12px] font-[700] text-[#3c4740]">
            Note <span className="text-[#b5483f]">*</span>
          </span>
          <Textarea
            autoFocus
            required
            maxLength={NOTE_MAX_LENGTH}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setFieldError("");
            }}
            placeholder="e.g. Confirm the final copy with the client"
            aria-label="Milestone note"
            aria-invalid={Boolean(fieldError)}
            className="min-h-36 resize-y rounded-[14px] border-[#d9e1d9] bg-white px-4 py-3 text-[13px] leading-6 shadow-none"
          />
        </label>
        <div className="mt-2 flex items-start justify-between gap-3">
          {fieldError ? <p className="text-[11px] text-[#b5483f]">{fieldError}</p> : <span />}
          <p className="shrink-0 text-[10px] text-[#899189]">{content.length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}</p>
        </div>
      </form>
    </FlexibleDialog>
  );
}

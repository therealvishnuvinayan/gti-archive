"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ArchiveItemForm = {
  fileName: string;
  projectName: string;
  projectLabel: string;
  date: string;
  listedBy: string;
  createdBy: string;
  fileTypes: string;
  tag: string;
  country: string;
};

type ArchiveItemDialogProps = {
  isOpen: boolean;
  mode: "add" | "edit";
  title: string;
  form: ArchiveItemForm;
  onChange: <K extends keyof ArchiveItemForm>(
    field: K,
    value: ArchiveItemForm[K],
  ) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function ArchiveItemDialog({
  isOpen,
  mode,
  title,
  form,
  onChange,
  onClose,
  onSubmit,
}: ArchiveItemDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <div className="w-full max-w-[640px] rounded-[28px] bg-white p-6 shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
              {mode === "add" ? `Add ${title}` : `Edit ${title}`}
            </h2>
            <p className="mt-1 text-[14px] text-[#6a706b]">
              Manage archive metadata for this category.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#253029]"
            aria-label="Close archive item dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["fileName", "File Name"],
              ["projectName", "Project Name"],
              ["projectLabel", "Project Label"],
              ["date", "Date"],
              ["listedBy", "Listed By"],
              ["createdBy", "Created By"],
              ["fileTypes", "File Types"],
              ["tag", "Tag"],
              ["country", "Country"],
            ] as Array<[keyof ArchiveItemForm, string]>
          ).map(([field, label]) => (
            <label key={field} className={field === "projectLabel" ? "sm:col-span-2" : ""}>
              <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
                {label}
              </span>
              <Input
                value={form[field]}
                onChange={(event) => onChange(field, event.target.value)}
                className="h-12 rounded-2xl border border-line text-[15px] text-[#18211a] focus-visible:ring-0"
              />
            </label>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="min-h-[48px] px-6 text-[15px] font-[600] text-[#2f3a32]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            className="min-h-[48px] px-7 text-[15px] font-[600]"
          >
            {mode === "add" ? "Add Item" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

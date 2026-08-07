"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CreateContactDirectoryEntryInput } from "@/lib/project-inquiry";

export type ProjectContactForm = Required<CreateContactDirectoryEntryInput>;

type ProjectContactDialogProps = {
  isOpen: boolean;
  title: string;
  form: ProjectContactForm;
  fieldErrors?: Partial<Record<keyof ProjectContactForm, string>>;
  error?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof ProjectContactForm>(
    field: K,
    value: ProjectContactForm[K],
  ) => void;
};

export function ProjectContactDialog({
  isOpen,
  title,
  form,
  fieldErrors,
  error,
  saving = false,
  onClose,
  onSubmit,
  onChange,
}: ProjectContactDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-[#112118]/45 px-4 py-6 backdrop-blur-[2px] sm:items-center sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-contact-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <Card className="max-h-[calc(100vh-3rem)] w-full max-w-[660px] overflow-y-auto rounded-[26px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="project-contact-dialog-title"
                className="text-[23px] font-[740] tracking-[-0.03em] text-[#111712]"
              >
                {title}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#6a746d]">
                Save this person or entity to the reusable contact directory.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="shrink-0 border border-line shadow-none"
              aria-label="Close contact dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <div className="mt-5 rounded-[16px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#ae4742]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["name", "Name", "Contact name", true],
                ["company", "Company", "Company or organisation", false],
                ["position", "Position / title", "Role or position", false],
                ["email", "Email", "name@example.com", false],
                ["phone", "Phone", "+971 ...", false],
              ] as const
            ).map(([field, label, placeholder, required]) => (
              <label
                key={field}
                className={field === "phone" ? "space-y-2 sm:col-span-2" : "space-y-2"}
              >
                <span className="block text-[13px] font-[650] text-[#2d372f]">
                  {label}
                  {required ? <span className="ml-1 text-[#bd4d48]">*</span> : null}
                </span>
                <Input
                  type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                  value={form[field]}
                  onChange={(event) => onChange(field, event.target.value)}
                  placeholder={placeholder}
                  aria-invalid={Boolean(fieldErrors?.[field])}
                  className={`h-12 rounded-[14px] border bg-white shadow-none ${
                    fieldErrors?.[field] ? "border-[#c85c54]" : "border-[#dce3dc]"
                  }`}
                />
                {fieldErrors?.[field] ? (
                  <span className="block text-[12px] text-[#b84e48]">
                    {fieldErrors[field]}
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
              className="rounded-[13px] shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="rounded-[13px]"
            >
              {saving ? "Saving..." : "Save contact"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

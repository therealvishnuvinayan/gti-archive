"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export type CollaboratorForm = {
  name: string;
  email: string;
};

type CollaboratorDialogProps = {
  isOpen: boolean;
  mode: "invite" | "edit";
  form: CollaboratorForm;
  error?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) => void;
};

export function CollaboratorDialog({
  isOpen,
  mode,
  form,
  error,
  saving = false,
  onClose,
  onSubmit,
  onChange,
}: CollaboratorDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#112118]/45 px-4 py-6 sm:items-center sm:py-8">
      <Card className="max-h-[calc(100vh-3rem)] w-full max-w-[640px] overflow-y-auto rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)] sm:max-h-[calc(100vh-4rem)]">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                {mode === "invite" ? "Invite Collaborator" : "Edit Collaborator"}
              </h2>
              <p className="mt-1 text-[14px] text-[#6a706b]">
                {mode === "invite"
                  ? "Invite an internal user to the collaboration directory."
                  : "Update this internal user's collaboration details."}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              className="shrink-0 border border-line"
              aria-label="Close collaborator dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error ? (
            <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="block text-[13px] font-[600] text-[#2d372f]">Name</span>
              <Input
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="User name"
                className="rounded-2xl border border-line"
              />
            </label>

            <label className="space-y-2">
              <span className="block text-[13px] font-[600] text-[#2d372f]">Email</span>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="user@gulbahartobacco.com"
                className="rounded-2xl border border-line"
              />
            </label>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={saving}>
              {saving
                ? mode === "invite"
                  ? "Saving..."
                  : "Updating..."
                : mode === "invite"
                  ? "Send Invite"
                  : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

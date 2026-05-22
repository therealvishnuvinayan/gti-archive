"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AccessArea = "project" | "calendar" | "library" | "archive";
export type PermissionLevel = "full" | "limited" | "none";
export type CollaboratorType = "Internal" | "External";

export type CollaboratorForm = {
  name: string;
  email: string;
  type: CollaboratorType;
  permissions: Record<AccessArea, PermissionLevel>;
};

type CollaboratorDialogProps = {
  isOpen: boolean;
  mode: "invite" | "edit";
  form: CollaboratorForm;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) => void;
  onPermissionChange: (area: AccessArea, value: PermissionLevel) => void;
};

const areaLabels: Record<AccessArea, string> = {
  project: "Project Access",
  calendar: "Calendar Access",
  library: "Library Access",
  archive: "Archives Access",
};

const permissionOptions: Array<{ value: PermissionLevel; label: string }> = [
  { value: "full", label: "Full access" },
  { value: "limited", label: "Limited access" },
  { value: "none", label: "No access" },
];

export function CollaboratorDialog({
  isOpen,
  mode,
  form,
  onClose,
  onSubmit,
  onChange,
  onPermissionChange,
}: CollaboratorDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <Card className="w-full max-w-[640px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                {mode === "invite" ? "Invite Collaborator" : "Edit Access"}
              </h2>
              <p className="mt-1 text-[14px] text-[#6a706b]">
                {mode === "invite"
                  ? "Add a collaborator and assign access areas."
                  : "Update what this collaborator can view or manage."}
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

          <div className="grid gap-4 sm:grid-cols-2">
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
              <span className="block text-[13px] font-[600] text-[#2d372f]">Type</span>
              <Select
                value={form.type}
                onValueChange={(value) => onChange("type", value as CollaboratorType)}
              >
                <SelectTrigger className="rounded-2xl border border-line">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="External">External</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2 sm:col-span-2">
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

          <div className="mt-6 space-y-3">
            {(Object.keys(areaLabels) as AccessArea[]).map((area) => (
              <Card key={area} className="rounded-[22px] border border-line shadow-none">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="sm:max-w-[55%]">
                    <p className="text-[14px] font-[700] text-[#1f2923]">
                      {areaLabels[area]}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-[#7a837b]">
                      Control whether this collaborator can view or edit this area.
                    </p>
                  </div>

                  <div className="w-full sm:w-[190px]">
                    <Select
                      value={form.permissions[area]}
                      onValueChange={(value) =>
                        onPermissionChange(area, value as PermissionLevel)
                      }
                    >
                      <SelectTrigger className="rounded-full border border-line">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {permissionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit}>
              {mode === "invite" ? "Send Invite" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

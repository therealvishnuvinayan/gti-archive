"use client";

import { X } from "lucide-react";

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
      <div className="w-full max-w-[560px] rounded-[28px] bg-white p-6 shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
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
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#253029]"
            aria-label="Close collaborator dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Name
            </span>
            <input
              value={form.name}
              onChange={(event) => onChange("name", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
              placeholder="User name"
            />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Type
            </span>
            <select
              value={form.type}
              onChange={(event) =>
                onChange("type", event.target.value as CollaboratorType)
              }
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
          </label>

          <label className="sm:col-span-2">
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Email
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
              placeholder="user@gulbahartobacco.com"
            />
          </label>
        </div>

        <div className="mt-6 space-y-3">
          {(
            Object.keys(areaLabels) as AccessArea[]
          ).map((area) => (
            <div
              key={area}
              className="flex flex-col gap-2 rounded-[18px] border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[14px] font-[600] text-[#1f2923]">
                  {areaLabels[area]}
                </p>
                <p className="text-[12px] text-[#7a837b]">
                  Control whether this collaborator can view or edit this area.
                </p>
              </div>

              <select
                value={form.permissions[area]}
                onChange={(event) =>
                  onPermissionChange(area, event.target.value as PermissionLevel)
                }
                className="h-11 rounded-full border border-line px-4 text-[14px] font-[600] text-[#18211a] outline-none transition-colors focus:border-brand"
              >
                {permissionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-line px-6 text-[15px] font-[600] text-[#2f3a32]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-7 text-[15px] font-[600] text-white"
          >
            {mode === "invite" ? "Send Invite" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

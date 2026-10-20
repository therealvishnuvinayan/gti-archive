import type { BusinessRole } from "./definitions";

export type AdministrationDomain = "business" | "technical";
export type AdministrationAccount = {
  id: string;
  name: string | null;
  email: string;
  version: number | null;
  status: "ACTIVE" | "SUSPENDED" | "UNASSIGNED";
  value: string | null;
  canChangeStatus: boolean;
};
export type AdministrationDirectory = {
  actorId: string;
  actorVersion: number;
  accounts: AdministrationAccount[];
};
export type AdministrationHistory = {
  entries: Array<{
    version: number; changeId: string; reason: string; timestamp: string;
    actor: { id: string; name: string | null; email: string };
    before: string; after: string;
  }>;
  nextBeforeVersion: number | null;
};
export type AdministrationResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
export type AdministrationChange = { status: "APPLIED" | "NO_CHANGE"; changeId?: string; signInRequired: boolean };

export const businessRoleOptions: Array<{ value: Exclude<BusinessRole, "DIRECTOR">; label: string; impact: string }> = [
  { value: "SENIOR_PROJECT_MANAGER", label: "Senior Project Manager", impact: "Scoped project management, creation with approved presets and global Archive access. Final completion still requires Director approval. Library access remains scoped." },
  { value: "JUNIOR_PROJECT_MANAGER", label: "Junior Project Manager", impact: "Scoped project management. Creation requires Director approval and an SPM Co-owner. No Archive access; Library access remains scoped." },
  { value: "DESIGNER", label: "Designer", impact: "Assigned task context and permitted files, granted Archives and scoped Library. No project creation, business approval or user administration." },
  { value: "DIGITAL_LEAD", label: "Digital Lead", impact: "Assigned task context, permitted files, granted Archives and Archive category management. No project creation, business approval or user administration." },
];
export function administrationLabel(value: string | null) {
  return value === "DIRECTOR" ? "Director" : value === "TECHNICAL_ADMIN" ? "Technical Administrator"
    : businessRoleOptions.find(role => role.value === value)?.label ?? "None";
}

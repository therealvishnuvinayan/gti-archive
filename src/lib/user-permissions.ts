import { denyLegacyAdministration } from "@/lib/authorization/deferred-administration";
import type { PermissionRole } from "@/lib/permissions/definitions";

export type ManagedUserStatus = "ACTIVE" | "INVITED" | "INVITE_EXPIRED";
export type ManagedArchiveAccessLevel = "NONE" | "FULL" | "PARTIAL";

export type ManagedArchiveAssetAccessRecord = {
  id: string;
  recordType: "FINAL_ARCHIVE_FILE" | "MANUAL_ARCHIVE_FILE";
  fileName: string;
  categoryId: string | null;
  categoryLabel: string;
  sourceLabel: string;
  archivedAtLabel: string;
};

export type ManagedUserRecord = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: PermissionRole;
  projectCreationAccessGranted: boolean;
  canAccessArchives: boolean;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetAccesses: ManagedArchiveAssetAccessRecord[];
  status: ManagedUserStatus;
};

export type ManagedUserUpdateInput = {
  userId: string;
  avatarUrl?: string;
  role: PermissionRole;
  projectCreationAccessGranted: boolean;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetIds?: string[];
  updatedById?: string | null;
};


// Historical DTOs remain for the retired editor's compile-time consumers.
// No legacy role, Archive grant, avatar or account mutation is executable here.
export async function listUsersForPermissionManagement(): Promise<ManagedUserRecord[]> { return denyLegacyAdministration(); }
export async function getManagedUserPermissionRecord(userId: string): Promise<ManagedUserRecord | null> {
  void userId; return denyLegacyAdministration();
}
export async function updateManagedUserPermissions(input: ManagedUserUpdateInput): Promise<ManagedUserRecord> {
  void input; return denyLegacyAdministration();
}

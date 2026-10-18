"use server";
import { denyLegacyAdministration } from "@/lib/authorization/deferred-administration";
import type { PermissionRole, PermissionProfileType } from "@/lib/permissions/definitions";
import type { PermissionProfile, PermissionSyncResult } from "@/lib/permissions/profiles";
import type { ManagedArchiveAccessLevel, ManagedArchiveAssetAccessRecord, ManagedUserRecord } from "@/lib/user-permissions";

type SaveUserAccessInput = {
  userId: string;
  avatarUrl?: string;
  role: PermissionRole;
  projectCreationAccessGranted: boolean;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetIds?: string[];
};

type SearchArchiveAccessAssetsInput = {
  query?: string;
  categoryId?: string;
};

type ArchiveAccessAssetSearchRecord = ManagedArchiveAssetAccessRecord & {
  recordTypeLabel: string;
};

type PermissionProfileInput = {
  profileType: PermissionProfileType;
  profileKey: string;
};

type Result<T> = ({ error: string } & Partial<Record<keyof T, never>>) | (T & { error?: never });
export async function saveUserAccessAction(input: SaveUserAccessInput): Promise<Result<{ success: boolean; user: ManagedUserRecord }>> {
  void input; return denyLegacyAdministration();
}
export async function searchArchiveAssetsForAccessAction(input: SearchArchiveAccessAssetsInput): Promise<Result<{ success: boolean; assets: ArchiveAccessAssetSearchRecord[]; categories: { id: string; name: string }[] }>> {
  void input; return denyLegacyAdministration();
}
export async function getPermissionProfileAction(input: PermissionProfileInput): Promise<Result<{ success: boolean; profile: PermissionProfile }>> {
  void input; return denyLegacyAdministration();
}
export async function savePermissionProfileAction(input: PermissionProfileInput & { state: Record<string, boolean> }): Promise<Result<{ success: boolean; profile: PermissionProfile; message: string }>> {
  void input; return denyLegacyAdministration();
}
export async function resetPermissionProfileToDefaultsAction(input: PermissionProfileInput): Promise<Result<{ success: boolean; profile: PermissionProfile; message: string }>> {
  void input; return denyLegacyAdministration();
}
export async function syncPermissionDefinitionsAction(): Promise<Result<{ success: boolean; result: PermissionSyncResult }>> {
  return denyLegacyAdministration();
}

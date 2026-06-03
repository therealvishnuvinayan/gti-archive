"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LockKeyhole,
  PencilLine,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  getPermissionProfileAction,
  resetPermissionProfileToDefaultsAction,
  savePermissionProfileAction,
  saveUserAccessAction,
  syncPermissionDefinitionsAction,
} from "@/app/(dashboard)/users/actions";
import { Badge } from "@/components/ui/badge";
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
import {
  allPermissionKeys,
  collaboratorTypeValues,
  permissionProfileTypeValues,
  permissionRoleValues,
  type CollaboratorTypeValue,
  type PermissionKey,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getDefaultPermissionProfileValue,
  getPermissionGroup,
  getPermissionProfileDescription,
  getPermissionProfileOptions,
  permissionMatrixGroups,
  type PermissionMatrixGroupId,
  type PermissionProfileType,
} from "@/lib/permissions/preview";
import { getCollaboratorTypeLabel } from "@/lib/project-collaborator-participant-types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { ManagedUserRecord, ManagedUserStatus } from "@/lib/user-permissions";
import { cn } from "@/lib/utils";

type UsersWorkspaceProps = {
  currentUserId: string;
  initialUsers: ManagedUserRecord[];
  canUpdateUsers: boolean;
  canManagePermissions: boolean;
};

type UserEditForm = {
  userId: string;
  role: PermissionRole;
  collaboratorType: CollaboratorTypeValue;
};

type PermissionProfileFormState = Record<PermissionKey, boolean>;

type EditablePermissionProfile = {
  profileType: PermissionProfileType;
  profileKey: string;
  state: PermissionProfileFormState;
  source: "db" | "code-default";
};

const roleBadgeStyles: Record<PermissionRole, string> = {
  SUPER_ADMIN: "border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]",
  ADMIN: "border-[#d6e4f4] bg-[#eef5fd] text-[#2f6da6]",
  COLLABORATOR: "border-[#f4dfbf] bg-[#fff4e4] text-[#cb821e]",
};

const statusLabels: Record<ManagedUserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  INVITE_EXPIRED: "Invite Expired",
};

const statusBadgeStyles: Record<ManagedUserStatus, string> = {
  ACTIVE: "border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]",
  INVITED: "border-[#f4dfbf] bg-[#fff4e4] text-[#cb821e]",
  INVITE_EXPIRED: "border-[#f3d1cf] bg-[#fff0ef] text-[#d6544d]",
};

const profileTypeLabels: Record<PermissionProfileType, string> = {
  role: "Role",
  collaboratorType: "Collaborator Type",
  accessPreset: "Access Preset",
};

function sortUsers(users: ManagedUserRecord[]) {
  const roleOrder: Record<PermissionRole, number> = {
    SUPER_ADMIN: 0,
    ADMIN: 1,
    COLLABORATOR: 2,
  };

  return [...users].sort((left, right) => {
    if (roleOrder[left.role] !== roleOrder[right.role]) {
      return roleOrder[left.role] - roleOrder[right.role];
    }

    return (
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.email.localeCompare(right.email, undefined, { sensitivity: "base" })
    );
  });
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "GU";
}

function getDefaultForm(user: ManagedUserRecord): UserEditForm {
  return {
    userId: user.id,
    role: user.role,
    collaboratorType: user.collaboratorType,
  };
}

function buildEmptyPermissionProfileState() {
  return allPermissionKeys.reduce((state, permissionKey) => {
    state[permissionKey] = false;
    return state;
  }, {} as PermissionProfileFormState);
}

function clonePermissionProfileState(state: Record<string, boolean>) {
  const nextState = buildEmptyPermissionProfileState();

  for (const permissionKey of allPermissionKeys) {
    nextState[permissionKey] = Boolean(state[permissionKey]);
  }

  return nextState;
}

function hasPermissionProfileChanges(
  currentState: PermissionProfileFormState,
  savedState: PermissionProfileFormState,
) {
  return allPermissionKeys.some(
    (permissionKey) => currentState[permissionKey] !== savedState[permissionKey],
  );
}

function FilterBadge({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#d9e4da] bg-[#f8fbf8] px-4 py-2 text-[13px] font-[600] text-[#4e5a50]">
      {icon}
      {text}
    </div>
  );
}

function StatusBadge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("min-h-[32px] justify-center whitespace-normal text-center leading-5", className)}
    >
      {children}
    </Badge>
  );
}

function EditUserModal({
  user,
  form,
  error,
  saving,
  isOpen,
  onClose,
  onChange,
  onSave,
}: {
  user: ManagedUserRecord | null;
  form: UserEditForm | null;
  error?: string;
  saving: boolean;
  isOpen: boolean;
  onClose: () => void;
  onChange: <K extends keyof UserEditForm>(field: K, value: UserEditForm[K]) => void;
  onSave: () => void;
}) {
  if (!isOpen || !user || !form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#102116]/26 px-4 py-6 backdrop-blur-[2px]">
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col overflow-y-auto rounded-[34px] border border-[#e8efe8] bg-white shadow-[0_30px_90px_rgba(19,36,27,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf2ed] px-6 pb-5 pt-6 sm:px-8">
          <div>
            <h2 className="text-[40px] font-[700] leading-none tracking-[-0.05em] text-[#111712]">
              Edit User
            </h2>
            <p className="mt-3 text-[15px] text-[#707a71]">
              Update role and collaborator type assignments for this account.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 border border-[#dde5de]"
            aria-label="Close edit user modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 px-6 py-6 sm:px-8">
          {error ? (
            <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
              {error}
            </div>
          ) : null}

          <div className="rounded-[24px] border border-[#e8eee7] bg-[#fbfcfa] p-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#d8e6d7] bg-[radial-gradient(circle_at_top,#f7f4d9,#d7ebb8_60%,#c2d99d)] text-[24px] font-[700] text-[#58764a]">
                {getInitials(user.name)}
              </div>
              <div>
                <p className="text-[20px] font-[700] text-[#1a221c]">{user.name}</p>
                <p className="text-[14px] text-[#6f776f]">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[15px] font-[600] text-[#2a342d]">Role</span>
              <Select
                value={form.role}
                onValueChange={(value) => onChange("role", value as PermissionRole)}
              >
                <SelectTrigger className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[16px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {permissionRoleValues.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[15px] font-[600] text-[#2a342d]">
                Collaborator Type
              </span>
              <Select
                value={form.collaboratorType}
                onValueChange={(value) =>
                  onChange("collaboratorType", value as CollaboratorTypeValue)
                }
              >
                <SelectTrigger className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[16px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collaboratorTypeValues.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getCollaboratorTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#edf2ed] px-6 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-8">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="min-w-[140px] rounded-[16px]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-w-[184px] rounded-[16px]"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ManagePermissionsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [profileType, setProfileType] = useState<PermissionProfileType>("role");
  const [profileKey, setProfileKey] = useState(() =>
    getDefaultPermissionProfileValue("role"),
  );
  const [selectedGroup, setSelectedGroup] = useState<PermissionMatrixGroupId>(
    permissionMatrixGroups[0]?.id ?? "dashboard",
  );
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<EditablePermissionProfile | null>(null);
  const [savedState, setSavedState] = useState<PermissionProfileFormState>(() =>
    buildEmptyPermissionProfileState(),
  );
  const [draftState, setDraftState] = useState<PermissionProfileFormState>(() =>
    buildEmptyPermissionProfileState(),
  );
  const [profileError, setProfileError] = useState<string>();
  const [isLoadingProfile, setLoadingProfile] = useState(false);
  const [isSavingProfile, setSavingProfile] = useState(false);
  const [isResettingProfile, setResettingProfile] = useState(false);
  const [isSyncingDefinitions, setSyncingDefinitions] = useState(false);

  const profileOptions = useMemo(() => getPermissionProfileOptions(profileType), [profileType]);
  const selectedProfileDescription = useMemo(
    () => getPermissionProfileDescription(profileType, profileKey),
    [profileType, profileKey],
  );
  const currentGroup = useMemo(() => getPermissionGroup(selectedGroup), [selectedGroup]);
  const hasChanges = useMemo(
    () => hasPermissionProfileChanges(draftState, savedState),
    [draftState, savedState],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return currentGroup.items;
    }

    return currentGroup.items.filter((item) =>
      [item.label, item.key, item.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [currentGroup.items, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setProfileError(undefined);

      try {
        const result = await getPermissionProfileAction({
          profileType,
          profileKey,
        });

        if (isCancelled) {
          return;
        }

        if ("error" in result) {
          setProfile(null);
          setProfileError(result.error);
          return;
        }

        const nextState = clonePermissionProfileState(result.profile.state);

        setProfile({
          ...result.profile,
          state: nextState,
        });
        setSavedState(nextState);
        setDraftState(nextState);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfile(null);
        setProfileError(
          error instanceof Error
            ? error.message
            : "Unable to load this permission profile right now.",
        );
      } finally {
        if (!isCancelled) {
          setLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, profileType, profileKey]);

  function handleProfileTypeChange(value: string) {
    const nextProfileType = value as PermissionProfileType;

    setProfileType(nextProfileType);
    setProfileKey(getDefaultPermissionProfileValue(nextProfileType));
    setSelectedGroup(permissionMatrixGroups[0]?.id ?? "dashboard");
    setQuery("");
    setProfileError(undefined);
  }

  function handlePermissionToggle(permissionKey: PermissionKey, enabled: boolean) {
    setDraftState((current) => ({
      ...current,
      [permissionKey]: enabled,
    }));
  }

  async function handleSave() {
    if (!profile || isSavingProfile || isResettingProfile) {
      return;
    }

    setSavingProfile(true);
    setProfileError(undefined);

    try {
      const result = await savePermissionProfileAction({
        profileType,
        profileKey,
        state: draftState,
      });

      if ("error" in result) {
        setProfileError(result.error);
        showErrorToast("Unable to save permission profile.", result.error);
        return;
      }

      const nextState = clonePermissionProfileState(result.profile.state);

      setProfile({
        ...result.profile,
        state: nextState,
      });
      setSavedState(nextState);
      setDraftState(nextState);
      showSuccessToast("Permission profile updated.", result.message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save this permission profile right now.";
      setProfileError(message);
      showErrorToast("Unable to save permission profile.", message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleResetToDefaults() {
    if (isSavingProfile || isResettingProfile) {
      return;
    }

    setResettingProfile(true);
    setProfileError(undefined);

    try {
      const result = await resetPermissionProfileToDefaultsAction({
        profileType,
        profileKey,
      });

      if ("error" in result) {
        setProfileError(result.error);
        showErrorToast("Unable to reset permission profile.", result.error);
        return;
      }

      const nextState = clonePermissionProfileState(result.profile.state);

      setProfile({
        ...result.profile,
        state: nextState,
      });
      setSavedState(nextState);
      setDraftState(nextState);
      showSuccessToast("Permission profile reset.", result.message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to reset this permission profile right now.";
      setProfileError(message);
      showErrorToast("Unable to reset permission profile.", message);
    } finally {
      setResettingProfile(false);
    }
  }

  async function handleSyncDefinitions() {
    if (isSyncingDefinitions) {
      return;
    }

    setSyncingDefinitions(true);
    setProfileError(undefined);

    try {
      const result = await syncPermissionDefinitionsAction();

      if ("error" in result) {
        setProfileError(result.error);
        showErrorToast("Unable to sync permission definitions.", result.error);
        return;
      }

      showSuccessToast(
        "Permission definitions synced.",
        `${result.result.definitionsSynced} definitions checked.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sync permission definitions right now.";
      setProfileError(message);
      showErrorToast("Unable to sync permission definitions.", message);
    } finally {
      setSyncingDefinitions(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#102116]/28 px-4 py-6 backdrop-blur-[2px] sm:px-8">
      <div className="mx-auto flex h-full w-full max-w-[1380px] flex-col overflow-hidden rounded-[34px] border border-[#e5ece4] bg-white shadow-[0_30px_90px_rgba(19,36,27,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf2ed] px-6 pb-5 pt-6 sm:px-8">
          <div>
            <h2 className="text-[40px] font-[700] leading-none tracking-[-0.05em] text-[#131a14]">
              Manage Permissions
            </h2>
            <p className="mt-3 text-[15px] text-[#6f776f]">
              Configure saved permission profiles for roles, collaborator types, and access presets.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            disabled={isSavingProfile || isResettingProfile}
            className="shrink-0 border border-[#dde5de]"
            aria-label="Close manage permissions modal"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="rounded-[24px] border border-[#e2ebe1]">
              <CardContent className="space-y-5 p-5">
                <div>
                  <p className="text-[18px] font-[700] text-[#18201a]">Profile</p>
                  <p className="mt-1 text-[13px] leading-5 text-[#748074]">
                    Permission profiles are global. Users inherit role permissions, and collaborators are further limited by collaborator type.
                  </p>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-[700] uppercase tracking-[0.08em] text-[#7b857c]">
                    Profile type
                  </span>
                  <Select value={profileType} onValueChange={handleProfileTypeChange}>
                    <SelectTrigger className="h-[46px] rounded-[16px] border border-[#dde6dd]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {permissionProfileTypeValues.map((type) => (
                        <SelectItem key={type} value={type}>
                          {profileTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-[700] uppercase tracking-[0.08em] text-[#7b857c]">
                    Profile
                  </span>
                  <Select value={profileKey} onValueChange={setProfileKey}>
                    <SelectTrigger className="h-[46px] rounded-[16px] border border-[#dde6dd]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {profileOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[13px] leading-5 text-[#748074]">
                    {selectedProfileDescription}
                  </p>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] font-[700] uppercase tracking-[0.08em] text-[#7b857c]">
                    Permission group
                  </span>
                  <Select
                    value={selectedGroup}
                    onValueChange={(value) =>
                      setSelectedGroup(value as PermissionMatrixGroupId)
                    }
                  >
                    <SelectTrigger className="h-[46px] rounded-[16px] border border-[#dde6dd]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {permissionMatrixGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="rounded-[18px] border border-[#e7ede6] bg-[#fbfcfa] p-4">
                  <p className="text-[13px] font-[700] text-[#18201a]">
                    {profile?.source === "db" ? "Saved profile" : "Code defaults"}
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-[#748074]">
                    Hard rules still apply even when a permission is enabled.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border border-[#e2ebe1]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 border-b border-[#edf2ed] pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[24px] font-[700] tracking-[-0.03em] text-[#18201a]">
                      {currentGroup.title}
                    </p>
                    <p className="mt-1 text-[14px] leading-6 text-[#748074]">
                      {currentGroup.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-[240px]">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b948c]" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search permissions..."
                        className="h-[46px] rounded-[16px] border border-[#dde6dd] pl-11 pr-4 shadow-none"
                      />
                    </div>
                    <StatusBadge
                      className={
                        hasChanges
                          ? "border-[#f4dfbf] bg-[#fff4e4] text-[#cb821e]"
                          : "border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]"
                      }
                    >
                      {hasChanges ? "Unsaved Changes" : "Saved State"}
                    </StatusBadge>
                  </div>
                </div>

                {profileError ? (
                  <div className="mt-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                    {profileError}
                  </div>
                ) : null}

                {isLoadingProfile ? (
                  <div className="mt-5 rounded-[20px] border border-dashed border-[#dfe7df] bg-white px-6 py-12 text-center">
                    <p className="text-[18px] font-[700] text-[#18201a]">Loading profile</p>
                    <p className="mt-2 text-[14px] text-[#748074]">
                      Fetching the saved permission state for this profile.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {filteredItems.map((item) => {
                      const enabled = draftState[item.key];

                      return (
                        <label
                          key={item.key}
                          className="flex items-start gap-3 rounded-[18px] border border-[#edf2ed] bg-white px-4 py-4"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) =>
                              handlePermissionToggle(item.key, event.target.checked)
                            }
                            disabled={isSavingProfile || isResettingProfile}
                            className="mt-1 h-4 w-4 rounded border-[#c6d6c8] accent-[#256a45]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-[15px] font-[700] text-[#1a221c]">
                                  {item.label}
                                </p>
                                <p className="mt-1 text-[12px] font-[600] text-[#7b857c]">
                                  {item.key}
                                </p>
                                <p className="mt-2 text-[13px] leading-6 text-[#6f796f]">
                                  {item.description}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.hardRule ? (
                                    <StatusBadge className="border-[#f3d1cf] bg-[#fff0ef] text-[#d6544d]">
                                      Hard rule
                                    </StatusBadge>
                                  ) : null}
                                  {item.moduleGated ? (
                                    <StatusBadge className="border-[#f4dfbf] bg-[#fff4e4] text-[#cb821e]">
                                      Module scope
                                    </StatusBadge>
                                  ) : null}
                                  {item.isSystem ? (
                                    <StatusBadge className="border-[#d6e4f4] bg-[#eef5fd] text-[#2f6da6]">
                                      System
                                    </StatusBadge>
                                  ) : null}
                                </div>
                              </div>
                              <StatusBadge
                                className={
                                  enabled
                                    ? "border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]"
                                    : "border-[#f3d1cf] bg-[#fff0ef] text-[#d6544d]"
                                }
                              >
                                {enabled ? "Allowed" : "Not Allowed"}
                              </StatusBadge>
                            </div>
                          </div>
                        </label>
                      );
                    })}

                    {filteredItems.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-[#dfe7df] bg-white px-6 py-12 text-center">
                        <p className="text-[18px] font-[700] text-[#18201a]">No permissions found</p>
                        <p className="mt-2 text-[14px] text-[#748074]">
                          Try a different search term for this permission group.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="border-t border-[#edf2ed] px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterBadge
                icon={<ShieldCheck className="h-4 w-4 text-brand" />}
                text={profile?.source === "db" ? "Saved profile" : "Using defaults"}
              />
              <FilterBadge
                icon={<LockKeyhole className="h-4 w-4 text-brand" />}
                text="No per-user overrides"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={handleSyncDefinitions}
                disabled={isSyncingDefinitions}
                className="gap-2 rounded-[16px]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {isSyncingDefinitions ? "Syncing..." : "Sync Definitions"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetToDefaults}
                disabled={isLoadingProfile || isSavingProfile || isResettingProfile}
                className="gap-2 rounded-[16px]"
              >
                <RotateCcw className="h-4 w-4" />
                {isResettingProfile ? "Resetting..." : "Reset to Defaults"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSavingProfile || isResettingProfile}
                className="rounded-[16px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={
                  isLoadingProfile ||
                  isSavingProfile ||
                  isResettingProfile ||
                  !profile ||
                  !hasChanges
                }
                className="rounded-[16px]"
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsersWorkspace({
  currentUserId,
  initialUsers,
  canUpdateUsers,
  canManagePermissions,
}: UsersWorkspaceProps) {
  const router = useRouter();
  const [users, setUsers] = useState(() => sortUsers(initialUsers));
  const [query, setQuery] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUserRecord | null>(null);
  const [form, setForm] = useState<UserEditForm | null>(null);
  const [drawerError, setDrawerError] = useState<string>();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isPermissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.role,
        getCollaboratorTypeLabel(user.collaboratorType),
        statusLabels[user.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, users]);

  function openDrawer(user: ManagedUserRecord) {
    if (!canUpdateUsers) {
      return;
    }

    setEditingUser(user);
    setForm(getDefaultForm(user));
    setDrawerError(undefined);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (isPending) {
      return;
    }

    setDrawerOpen(false);
    setDrawerError(undefined);
  }

  function handleFormChange<K extends keyof UserEditForm>(
    field: K,
    value: UserEditForm[K],
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleSave() {
    if (!form || !editingUser) {
      return;
    }

    setDrawerError(undefined);

    startTransition(async () => {
      try {
        const result = await saveUserAccessAction(form);

        if ("error" in result) {
          setDrawerError(result.error);
          showErrorToast("Unable to update user.", result.error);
          return;
        }

        setUsers((current) =>
          sortUsers(
            current.map((user) => (user.id === result.user.id ? result.user : user)),
          ),
        );
        setEditingUser(result.user);
        setForm(getDefaultForm(result.user));
        setDrawerOpen(false);
        showSuccessToast("User updated successfully.");
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to update this user right now. Please try again.";
        setDrawerError(message);
        showErrorToast("Unable to update user.", message);
      }
    });
  }

  return (
    <>
      <section className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
              Users
            </h1>
            <p className="text-[15px] text-[#6f776f]">
              Manage user assignments and global permission profiles.
            </p>
          </div>

          {canManagePermissions ? (
            <Button
              type="button"
              onClick={() => setPermissionsModalOpen(true)}
              className="h-[48px] gap-2 rounded-[16px] px-5 text-[15px]"
            >
              <ShieldCheck className="h-4 w-4" />
              Manage Permissions
            </Button>
          ) : null}
        </header>

        <Card className="rounded-[28px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-[#edf1ec] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[28px] font-[700] tracking-[-0.03em] text-[#18201a]">
                  User Directory
                </h2>
                <p className="mt-1 text-[14px] text-[#748074]">
                  Assign roles and collaborator types. Individual permission overrides are intentionally not used.
                </p>
              </div>
              <FilterBadge
                icon={<LockKeyhole className="h-4 w-4 text-brand" />}
                text="SUPER_ADMIN only"
              />
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-[360px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b948c]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search users..."
                  className="h-[48px] rounded-[16px] border border-[#dde6dd] pl-11 pr-4 shadow-none"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <FilterBadge
                  icon={<UsersRound className="h-4 w-4 text-brand" />}
                  text={`${filteredUsers.length} of ${users.length} users`}
                />
                <FilterBadge
                  icon={<UserRound className="h-4 w-4 text-brand" />}
                  text="Role-based profiles"
                />
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left">
                    {[
                      "Name",
                      "Email",
                      "Role",
                      "Collaborator Type",
                      "Status",
                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-[#edf1ec] px-4 py-3 text-[12px] font-[700] uppercase tracking-[0.08em] text-[#7c867d]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#d8e6d7] bg-[radial-gradient(circle_at_top,#f7f4d9,#d7ebb8_60%,#c2d99d)] text-[15px] font-[700] text-[#58764a]">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="text-[15px] font-[700] text-[#172019]">{user.name}</p>
                            {user.id === currentUserId ? (
                              <p className="text-[12px] text-[#758075]">Current user</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4 text-[14px] text-[#5f6c61]">
                        {user.email}
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <StatusBadge className={roleBadgeStyles[user.role]}>
                          {user.role}
                        </StatusBadge>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <StatusBadge className="border-[#e1eadf] bg-[#f8fbf8] text-[#4d6552]">
                          {getCollaboratorTypeLabel(user.collaboratorType)}
                        </StatusBadge>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <StatusBadge className={statusBadgeStyles[user.status]}>
                          {statusLabels[user.status]}
                        </StatusBadge>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        {canUpdateUsers ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openDrawer(user)}
                            className="gap-2 rounded-full"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit User
                          </Button>
                        ) : (
                          <StatusBadge className="border-[#dde4dd] bg-[#f8faf8] text-[#556058]">
                            Read only
                          </StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="mt-6 rounded-[22px] border border-dashed border-[#dfe7df] bg-[#fbfdfb] px-6 py-16 text-center">
                <p className="text-[22px] font-[700] tracking-[-0.03em] text-[#162019]">
                  No users found
                </p>
                <p className="mt-2 text-[14px] text-[#748074]">
                  Try a different search term to find the user you want to manage.
                </p>
              </div>
            ) : null}

            <p className="mt-5 text-[13px] text-[#738072]">
              Showing {filteredUsers.length} of {users.length} users.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[26px] border border-[#e1eadf] bg-[#fbfcfa]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[18px] font-[700] text-[#18201a]">
                <CheckCircle2 className="h-5 w-5 text-brand" />
                Permission model
              </p>
              <p className="mt-1 text-[14px] leading-6 text-[#748074]">
                Effective access is role permissions intersected with collaborator type permissions for collaborator users. Project ownership and membership hard rules are still enforced.
              </p>
            </div>
            {canManagePermissions ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPermissionsModalOpen(true)}
                className="shrink-0 gap-2 rounded-[16px]"
              >
                <ShieldCheck className="h-4 w-4" />
                Open Permissions
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <EditUserModal
        isOpen={isDrawerOpen}
        user={editingUser}
        form={form}
        error={drawerError}
        saving={isPending}
        onClose={closeDrawer}
        onChange={handleFormChange}
        onSave={handleSave}
      />

      <ManagePermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
      />
    </>
  );
}

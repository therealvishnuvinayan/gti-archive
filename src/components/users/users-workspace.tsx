"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Database,
  LockKeyhole,
  PencilLine,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  getPermissionProfileAction,
  resetPermissionProfileToDefaultsAction,
  savePermissionProfileAction,
  saveUserAccessAction,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  allPermissionKeys,
  collaboratorTypeValues,
  permissionRoleValues,
  type PermissionKey,
  type CollaboratorTypeValue,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getCollaboratorTypeLabel,
  getProjectCollaboratorTypeMeta,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import {
  getDefaultPermissionProfileValue,
  getPermissionGroup,
  getPermissionProfileDescription,
  getPermissionProfileOptions,
  permissionMatrixGroups,
  type PermissionMatrixGroupId,
  type PermissionProfileType,
} from "@/lib/permissions/preview";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { ManagedUserRecord, ManagedUserStatus } from "@/lib/user-permissions";
import { cn } from "@/lib/utils";

type UsersWorkspaceProps = {
  currentUserId: string;
  initialUsers: ManagedUserRecord[];
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

function getCollaboratorTypeBadgeClassName(
  collaboratorType: CollaboratorTypeValue,
) {
  return getProjectCollaboratorTypeMeta(
    collaboratorType as ProjectCollaboratorParticipantType,
  ).badgeClassName;
}

const userStatusLabels: Record<ManagedUserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  INVITE_EXPIRED: "Invite Expired",
};

const userStatusBadgeStyles: Record<ManagedUserStatus, string> = {
  ACTIVE: "border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]",
  INVITED: "border-[#f4dfbf] bg-[#fff4e4] text-[#cb821e]",
  INVITE_EXPIRED: "border-[#f3d1cf] bg-[#fff0ef] text-[#d6544d]",
};

const permissionProfileTypeLabels: Record<PermissionProfileType, string> = {
  role: "Global Role",
  collaboratorType: "Collaborator Type",
  accessPreset: "Access Preset",
};

const visiblePermissionProfileTypes: PermissionProfileType[] = [
  "role",
  "collaboratorType",
];

const permissionProfileSourceLabels: Record<EditablePermissionProfile["source"], string> = {
  db: "Saved Permission Profile",
  "code-default": "Default Permission Profile",
};

function buildEmptyPermissionProfileState() {
  return allPermissionKeys.reduce((state, permissionKey) => {
    state[permissionKey] = false;
    return state;
  }, {} as PermissionProfileFormState);
}

function clonePermissionProfileState(state: PermissionProfileFormState) {
  return { ...state } as PermissionProfileFormState;
}

function hasPermissionProfileChanges(
  currentState: PermissionProfileFormState,
  savedState: PermissionProfileFormState,
) {
  return allPermissionKeys.some(
    (permissionKey) => currentState[permissionKey] !== savedState[permissionKey],
  );
}

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
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getDefaultForm(user: ManagedUserRecord): UserEditForm {
  return {
    userId: user.id,
    role: user.role,
    collaboratorType: user.collaboratorType,
  };
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
      className={cn("min-h-[32px] min-w-[84px] justify-center whitespace-normal text-center leading-5", className)}
    >
      {children}
    </Badge>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-[#e7ede6] bg-[#fbfcfa] px-4 py-3">
      <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#7b857c]">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-[600] text-[#202821]">{value}</p>
    </div>
  );
}

function EditUserDrawer({
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
    <div className="fixed inset-0 z-50 bg-[#102116]/26 backdrop-blur-[2px]">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="flex h-full w-full max-w-[720px] flex-col overflow-y-auto rounded-l-[36px] border-l border-[#e8efe8] bg-white shadow-[-20px_0_60px_rgba(19,36,27,0.14)]">
          <div className="flex items-start justify-between gap-4 px-8 pb-2 pt-8 sm:px-10">
            <div>
              <h2 className="text-[42px] font-[700] leading-none tracking-[-0.06em] text-[#111712]">
                Edit User
              </h2>
              <p className="mt-3 text-[16px] text-[#707a71]">
                Update the role and collaborator type assigned to this account.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="mt-1 shrink-0 border border-[#dde5de]"
              aria-label="Close edit user drawer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="px-8 pb-8 pt-6 sm:px-10">
            {error ? (
              <div className="mb-6 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                {error}
              </div>
            ) : null}

            <div className="mb-6 rounded-[24px] border border-[#e8eee7] bg-[#fbfcfa] p-5">
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

            <div className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="Name" value={user.name} />
              <ReadOnlyField label="Email" value={user.email} />
              <ReadOnlyField
                label="Account Status"
                value={userStatusLabels[user.status]}
              />
              <ReadOnlyField
                label="Permission Profile"
                value="Managed globally from Role Permissions and Collaborator Type Permissions."
              />
            </div>

            <div className="mt-8 grid gap-x-6 gap-y-6 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[15px] font-[600] text-[#2a342d]">Role</span>
                <Select value={form.role} onValueChange={(value) => onChange("role", value as PermissionRole)}>
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

          <div className="mt-auto flex flex-col gap-3 border-t border-[#edf2ed] px-8 py-6 sm:flex-row sm:items-center sm:justify-end sm:px-10">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
              className="min-w-[140px] rounded-[16px] text-[18px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="min-w-[184px] rounded-[16px] text-[18px]"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
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
  const [profileValue, setProfileValue] = useState(() =>
    getDefaultPermissionProfileValue("role"),
  );
  const [selectedGroup, setSelectedGroup] = useState<PermissionMatrixGroupId>("project");
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

  const profileOptions = useMemo(() => getPermissionProfileOptions(profileType), [profileType]);
  const currentGroup = useMemo(() => getPermissionGroup(selectedGroup), [selectedGroup]);
  const selectedProfileDescription = useMemo(
    () => getPermissionProfileDescription(profileType, profileValue),
    [profileType, profileValue],
  );
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
          profileKey: profileValue,
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

        setProfile(result.profile);
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
  }, [isOpen, profileType, profileValue]);

  function handleProfileTypeChange(nextValue: string) {
    const nextProfileType = nextValue as PermissionProfileType;
    setProfileType(nextProfileType);
    setProfileValue(getDefaultPermissionProfileValue(nextProfileType));
    setSelectedGroup(permissionMatrixGroups[0]?.id ?? "project");
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
        profileKey: profileValue,
        state: draftState,
      });

      if ("error" in result) {
        setProfileError(result.error);
        showErrorToast("Unable to save permission profile.", result.error);
        return;
      }

      const nextState = clonePermissionProfileState(result.profile.state);

      setProfile(result.profile);
      setSavedState(nextState);
      setDraftState(nextState);
      showSuccessToast("Permission profile updated.", result.message);
      setProfileError(undefined);
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
        profileKey: profileValue,
      });

      if ("error" in result) {
        setProfileError(result.error);
        showErrorToast("Unable to reset permission profile.", result.error);
        return;
      }

      const nextState = clonePermissionProfileState(result.profile.state);

      setProfile(result.profile);
      setSavedState(nextState);
      setDraftState(nextState);
      showSuccessToast("Permission profile reset.", result.message);
      setProfileError(undefined);
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
              Configure global permission rules for roles and collaborator types.
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
          <div className="rounded-[24px] border border-[#e2ebe1] bg-[linear-gradient(180deg,#fffefb,rgba(249,251,247,0.92))] p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <Tabs value={profileType} onValueChange={handleProfileTypeChange}>
                  <TabsList>
                    {visiblePermissionProfileTypes.map((value) => (
                      <TabsTrigger key={value} value={value}>
                        {permissionProfileTypeLabels[value]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="max-w-[460px]">
                  <p className="mb-2 text-[13px] font-[700] uppercase tracking-[0.08em] text-[#6a756d]">
                    Selected Profile
                  </p>
                  <Select value={profileValue} onValueChange={setProfileValue}>
                    <SelectTrigger className="h-[54px] rounded-[16px] border border-[#dce4dc] bg-white px-4 text-[15px] shadow-none">
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
                  <p className="mt-2 text-[13px] text-[#758075]">
                    {selectedProfileDescription}
                  </p>
                </div>
              </div>

              <div className="max-w-[520px] rounded-[22px] border border-[#dbe7dc] bg-[#f8fcf8] p-4">
                <div className="flex items-center gap-2 text-[14px] font-[700] text-[#213026]">
                  <LockKeyhole className="h-4 w-4 text-brand" />
                  Hard Rule Reminder
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#647066]">
                  Some permissions are still limited by hard business rules such as project ownership, executor assignment, project membership, and user-owned notifications.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#d9e4da] bg-white px-3 py-1.5 text-[12px] font-[600] text-[#556257]">
                {permissionProfileTypeLabels[profileType]}
              </span>
              <span className="rounded-full border border-[#d9e4da] bg-white px-3 py-1.5 text-[12px] font-[600] text-[#556257]">
                {profileOptions.find((option) => option.value === profileValue)?.label ?? profileValue}
              </span>
              <span className="rounded-full border border-[#d9e4da] bg-white px-3 py-1.5 text-[12px] font-[600] text-[#556257]">
                {profile ? permissionProfileSourceLabels[profile.source] : "Loading profile"}
              </span>
              {profile?.source === "code-default" ? (
                <span
                  className="rounded-full border border-[#d9e4da] bg-white px-3 py-1.5 text-[12px] font-[600] text-[#556257]"
                >
                  Default rules active
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="rounded-[28px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
              <CardContent className="p-5">
                <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#758075]">
                  Permission Groups
                </p>
                <div className="mt-4 space-y-2">
                  {permissionMatrixGroups.map((group) => {
                    const allowedCount = group.items.filter((item) =>
                      draftState[item.key],
                    ).length;
                    const isActive = group.id === selectedGroup;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setSelectedGroup(group.id);
                          setQuery("");
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition-colors",
                          isActive
                            ? "border-[#bad7c0] bg-[#f4fbf6]"
                            : "border-[#edf2ed] bg-[#fbfcfa] hover:border-[#d5e2d7] hover:bg-[#f8faf8]",
                        )}
                      >
                        <div>
                          <p className="text-[15px] font-[700] text-[#18211a]">{group.title}</p>
                          <p className="mt-1 text-[12px] text-[#758075]">
                            {allowedCount}/{group.items.length} enabled
                          </p>
                        </div>
                        <CheckCircle2
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-brand" : "text-[#a2aea5]",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 border-b border-[#edf1ec] pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-[28px] font-[700] tracking-[-0.03em] text-[#18201a]">
                      {currentGroup.title}
                    </h3>
                    <p className="mt-1 max-w-[680px] text-[14px] text-[#748074]">
                      {currentGroup.description}
                    </p>
                  </div>

                  <div className="relative w-full lg:max-w-[320px]">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b948c]" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search permissions..."
                      className="h-[46px] rounded-[16px] border border-[#dde6dd] pl-11 pr-4 shadow-none"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-[#e7ede6] bg-[#fcfdfb] p-5">
                  {profileError ? (
                    <div className="rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                      {profileError}
                    </div>
                  ) : null}

                  {isLoadingProfile ? (
                    <div className="rounded-[20px] border border-dashed border-[#dfe7df] bg-white px-6 py-12 text-center">
                      <p className="text-[18px] font-[700] text-[#18201a]">Loading profile</p>
                      <p className="mt-2 text-[14px] text-[#748074]">
                        Fetching the saved permission state for this profile.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-[18px] font-[700] text-[#18201a]">
                            {permissionProfileTypeLabels[profileType]}:{" "}
                            {profileOptions.find((option) => option.value === profileValue)?.label ?? profileValue}
                          </p>
                          <p className="mt-1 text-[14px] text-[#748074]">
                            {profile?.source === "db"
                              ? "This permission profile is using saved global rules."
                              : "This permission profile is using the default global rules until it is saved."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge className="border-[#d6e4f4] bg-[#eef5fd] text-[#2f6da6]">
                            {currentGroup.title}
                          </StatusBadge>
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
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                                  <div className="shrink-0">
                                    {enabled ? (
                                      <StatusBadge className="border-[#d5e7d6] bg-[#eef8ef] text-[#2f7f53]">
                                        Allowed
                                      </StatusBadge>
                                    ) : (
                                      <StatusBadge className="border-[#f3d1cf] bg-[#fff0ef] text-[#d6544d]">
                                        Not Allowed
                                      </StatusBadge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {filteredItems.length === 0 ? (
                        <div className="mt-5 rounded-[20px] border border-dashed border-[#dfe7df] bg-white px-6 py-12 text-center">
                          <p className="text-[18px] font-[700] text-[#18201a]">No permissions found</p>
                          <p className="mt-2 text-[14px] text-[#748074]">
                            Try a different search term for this permission group.
                          </p>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="border-t border-[#edf2ed] px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterBadge
                icon={<Database className="h-4 w-4 text-brand" />}
                text={
                  profile?.source === "db"
                    ? "Saved permission profile"
                    : "Using default permission profile"
                }
              />
              <FilterBadge
                icon={<LockKeyhole className="h-4 w-4 text-brand" />}
                text="Profile-level permissions only"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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
        userStatusLabels[user.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, users]);

  function openDrawer(user: ManagedUserRecord) {
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
              Manage users, roles, and collaborator type assignments.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setPermissionsModalOpen(true)}
            className="h-[48px] gap-2 rounded-[16px] px-5 text-[15px]"
          >
            <ShieldCheck className="h-4 w-4" />
            Manage Permissions
          </Button>
        </header>

        <Card className="rounded-[28px] border border-[#ebefe8] bg-white shadow-[0_16px_40px_rgba(23,39,28,0.05)]">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-[#edf1ec] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[28px] font-[700] tracking-[-0.03em] text-[#18201a]">
                  User Directory
                </h2>
                <p className="mt-1 text-[14px] text-[#748074]">
                  Assign roles and collaborator types without turning permissions into a per-user workflow.
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
                  text="Assignments only"
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
                        <StatusBadge className={getCollaboratorTypeBadgeClassName(user.collaboratorType)}>
                          {getCollaboratorTypeLabel(user.collaboratorType)}
                        </StatusBadge>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
                        <StatusBadge className={userStatusBadgeStyles[user.status]}>
                          {userStatusLabels[user.status]}
                        </StatusBadge>
                      </td>
                      <td className="border-b border-[#f1f4f0] px-4 py-4">
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
      </section>

      <EditUserDrawer
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

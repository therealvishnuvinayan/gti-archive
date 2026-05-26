"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Info,
  LockKeyhole,
  PencilLine,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import {
  changePasswordAction,
  updateProfileAction,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MIN_PASSWORD_LENGTH,
  getPasswordRequirementChecks,
} from "@/lib/password-rules";

type SettingsWorkspaceProps = {
  user: {
    name: string;
    email: string;
    role: string;
    memberSince: string;
    passwordChangedAt: string;
    avatarSrc: string | null;
    department: string;
    phoneNumber: string;
    jobTitle: string;
    bio: string;
  };
  canManageMasterData?: boolean;
};

type ProfileDraft = {
  name: string;
  department: string;
  phoneNumber: string;
  jobTitle: string;
  bio: string;
};

type PasswordDraft = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

const maxProfilePhotoBytes = 2 * 1024 * 1024;
const allowedProfilePhotoTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const departmentOptions = [
  "System Administration",
  "Project Management",
  "Design & Packaging",
  "Marketing",
  "Operations",
  "Sales",
  "Product Development",
] as const;

function SettingsCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[24px] border border-[#ebefe8] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            {title}
          </h2>
          <p className="text-[14px] text-[#768078]">{description}</p>
        </div>

        {action}
      </div>

      <div className="mt-5">{children}</div>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-[12px] font-medium text-[#ba3f31]">{message}</p>;
}

function getDepartmentFromRole(role: string) {
  if (role === "Super Admin") {
    return "System Administration";
  }

  if (role === "Admin") {
    return "Project Management";
  }

  return "Design & Packaging";
}

function getProfileInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "GU";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function buildProfileDraft(user: SettingsWorkspaceProps["user"]): ProfileDraft {
  return {
    name: user.name,
    department: user.department || getDepartmentFromRole(user.role),
    phoneNumber: user.phoneNumber,
    jobTitle: user.jobTitle || user.role,
    bio: user.bio,
  };
}

function validateProfilePhoto(file: File) {
  if (!allowedProfilePhotoTypes.has(file.type.toLowerCase())) {
    return "Profile photo must be JPG, PNG, GIF, or WebP.";
  }

  if (file.size > maxProfilePhotoBytes) {
    return "Profile photo must be smaller than 2MB.";
  }

  return null;
}

async function uploadProfilePhoto(file: File) {
  const uploadRequest = await fetch("/api/profile/avatar/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    }),
  });

  const uploadPayload = (await uploadRequest.json()) as {
    uploadUrl?: string;
    storageKey?: string;
    error?: string;
  };

  if (!uploadRequest.ok || !uploadPayload.uploadUrl || !uploadPayload.storageKey) {
    throw new Error(uploadPayload.error || "Unable to prepare the profile photo upload.");
  }

  const putResponse = await fetch(uploadPayload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error("Unable to upload the profile photo right now.");
  }

  return uploadPayload.storageKey;
}

function AvatarCircle({
  src,
  initials,
  sizeClassName,
  textClassName,
}: {
  src?: string | null;
  initials: string;
  sizeClassName: string;
  textClassName: string;
}) {
  if (src) {
    return (
      <AvatarImage
        key={src}
        src={src}
        alt="Profile avatar"
        className={`${sizeClassName} rounded-full border border-[#dce7dd] object-cover shadow-[0_20px_44px_rgba(31,58,44,0.12)]`}
        fallback={
          <div
            className={`grid ${sizeClassName} place-items-center rounded-full border border-[#dce7dd] bg-[radial-gradient(circle_at_top,#ffd7c4,#dd956f_58%,#b9673d)] ${textClassName} font-[700] text-white shadow-[0_20px_44px_rgba(31,58,44,0.12)]`}
          >
            {initials}
          </div>
        }
      />
    );
  }

  return (
    <div
      className={`grid ${sizeClassName} place-items-center rounded-full border border-[#dce7dd] bg-[radial-gradient(circle_at_top,#ffd7c4,#dd956f_58%,#b9673d)] ${textClassName} font-[700] text-white shadow-[0_20px_44px_rgba(31,58,44,0.12)]`}
    >
      {initials}
    </div>
  );
}

function AvatarImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImageFailed(true)}
    />
  );
}

function buildPasswordDraft(): PasswordDraft {
  return {
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  };
}

function PasswordRequirementItem({
  label,
  isValid,
}: {
  label: string;
  isValid: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-[14px] text-[#5f6a60]">
      <CheckCircle2
        className={`h-4 w-4 shrink-0 ${isValid ? "text-brand" : "text-[#a8b0a8]"}`}
      />
      <span>{label}</span>
    </div>
  );
}

function PasswordInputField({
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  error?: string;
  disabled: boolean;
}) {
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <label className="block">
      <span className="mb-2 block text-[16px] font-[600] text-[#697268]">{label}</span>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 pr-14 text-[18px] shadow-none"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          disabled={disabled}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#404840]"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          <ToggleIcon className="h-5 w-5" />
        </button>
      </div>
      <FieldError message={error} />
    </label>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: typeof UserRound;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-[42px] gap-2 rounded-xl border-[#b8d8c0] bg-[#fbfefc] px-4 text-[13px] font-semibold text-brand shadow-[0_8px_20px_rgba(35,104,72,0.06)] hover:bg-brand-soft"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function EditProfileDrawer({
  isOpen,
  user,
  form,
  nameError,
  bioError,
  avatarError,
  error,
  saving,
  avatarPreviewSrc,
  selectedAvatarFileName,
  onClose,
  onReset,
  onChange,
  onSelectAvatar,
  onSave,
}: {
  isOpen: boolean;
  user: SettingsWorkspaceProps["user"];
  form: ProfileDraft;
  nameError?: string;
  bioError?: string;
  avatarError?: string;
  error?: string;
  saving: boolean;
  avatarPreviewSrc: string | null;
  selectedAvatarFileName?: string;
  onClose: () => void;
  onReset: () => void;
  onChange: <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => void;
  onSelectAvatar: (file: File | null) => void;
  onSave: () => void;
}) {
  const departmentValues =
    form.department && !departmentOptions.includes(form.department as (typeof departmentOptions)[number])
      ? [form.department, ...departmentOptions]
      : departmentOptions;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#102116]/26 backdrop-blur-[2px]">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="flex h-full w-full max-w-[980px] flex-col overflow-y-auto rounded-l-[36px] border-l border-[#e8efe8] bg-white shadow-[-20px_0_60px_rgba(19,36,27,0.14)]">
          <div className="flex items-start justify-between gap-4 px-8 pb-2 pt-8 sm:px-10">
            <div>
              <h2 className="text-[54px] font-[700] leading-none tracking-[-0.06em] text-[#111712]">
                Edit Profile
              </h2>
              <p className="mt-3 text-[18px] text-[#707a71]">
                Update your personal information and how others see you.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="mt-1 shrink-0 border border-[#dde5de]"
              aria-label="Close edit profile drawer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="px-8 pb-8 sm:px-10">
            {error ? (
              <div className="mb-6 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                {error}
              </div>
            ) : null}

            <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center">
              <AvatarCircle
                src={avatarPreviewSrc}
                initials={getProfileInitials(form.name || user.name)}
                sizeClassName="h-[152px] w-[152px] shrink-0"
                textClassName="text-[58px]"
              />

              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    onSelectAvatar(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-[46px] rounded-[14px] border-[#b8d8c0] px-6 text-[18px] font-[600] text-brand"
                >
                  <ImagePlus className="h-4 w-4" />
                  Change Photo
                </Button>
                <p className="text-[14px] text-[#808981]">
                  {selectedAvatarFileName || "JPG, PNG, GIF or WebP. Max size 2MB."}
                </p>
                <FieldError message={avatarError} />
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-7 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Full Name
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[18px] shadow-none"
                />
                <FieldError message={nameError} />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Email Address
                </span>
                <Input
                  value={user.email}
                  disabled
                  className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[18px] shadow-none disabled:opacity-100"
                />
                <p className="mt-2 text-[12px] text-[#7f887f]">
                  Sign-in email cannot be changed here.
                </p>
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Department
                </span>
                <Select
                  value={form.department}
                  onValueChange={(value) => onChange("department", value)}
                >
                  <SelectTrigger className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[18px] font-[500] shadow-none">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentValues.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Phone Number
                </span>
                <Input
                  value={form.phoneNumber}
                  onChange={(event) => onChange("phoneNumber", event.target.value)}
                  placeholder="+971 50 123 4567"
                  className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[18px] shadow-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Job Title / Role
                </span>
                <Input
                  value={form.jobTitle}
                  onChange={(event) => onChange("jobTitle", event.target.value)}
                  className="h-[54px] rounded-[16px] border border-[#dce4dc] px-4 text-[18px] shadow-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-[#2b352d]">
                  Short Bio / About <span className="text-[#7d877f]">(optional)</span>
                </span>
                <div className="relative">
                  <Textarea
                    value={form.bio}
                    onChange={(event) => onChange("bio", event.target.value)}
                    className="min-h-[122px] rounded-[16px] border border-[#dce4dc] px-4 py-3 text-[18px] shadow-none"
                  />
                <span className="absolute bottom-3 right-4 text-[12px] text-[#7e8780]">
                  {form.bio.length}/300
                  </span>
                </div>
                <FieldError message={bioError} />
              </label>
            </div>

            <div className="mt-8 border-t border-dashed border-[#dfe7df] pt-6">
              <h3 className="text-[28px] font-[700] tracking-[-0.03em] text-[#1b231d]">
                Account Information
              </h3>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="rounded-[18px] border border-[#edf2ed] bg-[#fbfcfa] px-4 py-4">
                  <p className="text-[13px] font-[600] uppercase tracking-[0.08em] text-[#7e8880]">
                    Member Since
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-[22px] font-[700] text-[#18211a]">
                    <CalendarDays className="h-5 w-5 text-[#7a867c]" />
                    {user.memberSince}
                  </p>
                </div>

                <div className="rounded-[18px] border border-[#edf2ed] bg-[#fbfcfa] px-4 py-4">
                  <p className="text-[13px] font-[600] uppercase tracking-[0.08em] text-[#7e8880]">
                    Account Role
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-[22px] font-[700] text-[#18211a]">
                    <ShieldCheck className="h-5 w-5 text-[#7a867c]" />
                    {user.role}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-[18px] border border-[#dbe8df] bg-[#f7fcf8] px-4 py-4 text-[15px] text-[#5e6c61]">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <p>
                  Some account details cannot be changed. Contact a system administrator for assistance.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-[#edf2ed] px-8 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              disabled={saving}
              className="justify-start px-0 text-[18px] font-[700] text-brand hover:bg-transparent"
            >
              Reset
            </Button>

            <div className="flex flex-col gap-3 sm:flex-row">
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
    </div>
  );
}

function ChangePasswordDrawer({
  isOpen,
  passwordChangedAt,
  form,
  fieldErrors,
  error,
  saving,
  visibility,
  onClose,
  onChange,
  onToggleVisibility,
  onSave,
}: {
  isOpen: boolean;
  passwordChangedAt: string;
  form: PasswordDraft;
  fieldErrors: {
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  };
  error?: string;
  saving: boolean;
  visibility: {
    currentPassword: boolean;
    newPassword: boolean;
    confirmNewPassword: boolean;
  };
  onClose: () => void;
  onChange: <K extends keyof PasswordDraft>(field: K, value: PasswordDraft[K]) => void;
  onToggleVisibility: (field: keyof PasswordDraft) => void;
  onSave: () => void;
}) {
  const passwordChecks = getPasswordRequirementChecks(form.newPassword);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#102116]/26 backdrop-blur-[2px]">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="flex h-full w-full max-w-[860px] flex-col overflow-y-auto rounded-l-[36px] border-l border-[#e8efe8] bg-white shadow-[-20px_0_60px_rgba(19,36,27,0.14)]">
          <div className="flex items-start justify-between gap-4 px-8 pb-2 pt-8 sm:px-10">
            <div>
              <h2 className="text-[54px] font-[700] leading-none tracking-[-0.06em] text-[#111712]">
                Change Password
              </h2>
              <p className="mt-3 text-[18px] text-[#707a71]">
                Update your password to keep your account secure.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              disabled={saving}
              className="mt-1 shrink-0 border border-[#dde5de]"
              aria-label="Close change password drawer"
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

            <div className="space-y-8">
              <PasswordInputField
                label="Current Password"
                value={form.currentPassword}
                onChange={(value) => onChange("currentPassword", value)}
                visible={visibility.currentPassword}
                onToggleVisibility={() => onToggleVisibility("currentPassword")}
                error={fieldErrors.currentPassword}
                disabled={saving}
              />

              <PasswordInputField
                label="New Password"
                value={form.newPassword}
                onChange={(value) => onChange("newPassword", value)}
                visible={visibility.newPassword}
                onToggleVisibility={() => onToggleVisibility("newPassword")}
                error={fieldErrors.newPassword}
                disabled={saving}
              />

              <PasswordInputField
                label="Confirm New Password"
                value={form.confirmNewPassword}
                onChange={(value) => onChange("confirmNewPassword", value)}
                visible={visibility.confirmNewPassword}
                onToggleVisibility={() => onToggleVisibility("confirmNewPassword")}
                error={fieldErrors.confirmNewPassword}
                disabled={saving}
              />

              <div className="rounded-[24px] border border-[#ebefe8] bg-[#fbfcfa] p-5">
                <p className="text-[26px] font-[700] tracking-[-0.03em] text-[#1b231d]">
                  Password must contain:
                </p>
                <div className="mt-4 space-y-3">
                  <PasswordRequirementItem
                    label={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    isValid={passwordChecks.minLength}
                  />
                  <PasswordRequirementItem
                    label="One uppercase letter (A–Z)"
                    isValid={passwordChecks.uppercase}
                  />
                  <PasswordRequirementItem
                    label="One number (0–9)"
                    isValid={passwordChecks.number}
                  />
                  <PasswordRequirementItem
                    label="One special character (!@#$%^&*)"
                    isValid={passwordChecks.specialCharacter}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[15px] text-[#677266]">Last changed</p>
                <p className="text-[28px] font-[700] tracking-[-0.03em] text-[#131a14]">
                  {passwordChangedAt}
                </p>
              </div>
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
              className="min-w-[228px] rounded-[16px] text-[18px]"
            >
              {saving ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsWorkspace({
  user,
}: SettingsWorkspaceProps) {
  const router = useRouter();
  const [isProfileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [isPasswordDrawerOpen, setPasswordDrawerOpen] = useState(false);
  const [drawerError, setDrawerError] = useState<string>();
  const [passwordDrawerError, setPasswordDrawerError] = useState<string>();
  const [saveNotice, setSaveNotice] = useState<string>();
  const [avatarError, setAvatarError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    bio?: string;
  }>({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  }>({});
  const [form, setForm] = useState<ProfileDraft>(() => buildProfileDraft(user));
  const [passwordForm, setPasswordForm] = useState<PasswordDraft>(() => buildPasswordDraft());
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [isProfilePending, startProfileTransition] = useTransition();
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [passwordVisibility, setPasswordVisibility] = useState({
    currentPassword: false,
    newPassword: false,
    confirmNewPassword: false,
  });

  const profileRows = [
    { label: "Full Name", value: user.name },
    { label: "Email Address", value: user.email },
    { label: "Role", value: user.role },
    { label: "Department", value: user.department || getDepartmentFromRole(user.role) },
    { label: "Member Since", value: user.memberSince },
  ];

  const displayInitials = useMemo(() => getProfileInitials(user.name), [user.name]);
  const selectedAvatarPreviewSrc = useMemo(() => {
    if (!selectedAvatarFile) {
      return null;
    }

    return URL.createObjectURL(selectedAvatarFile);
  }, [selectedAvatarFile]);

  useEffect(() => {
    if (!selectedAvatarPreviewSrc) {
      return;
    }

    return () => {
      URL.revokeObjectURL(selectedAvatarPreviewSrc);
    };
  }, [selectedAvatarPreviewSrc]);

  function closeDrawer() {
    if (isProfilePending) {
      return;
    }

    setProfileDrawerOpen(false);
    setDrawerError(undefined);
    setAvatarError(undefined);
    setFieldErrors({});
    setSelectedAvatarFile(null);
  }

  function openDrawer() {
    setForm(buildProfileDraft(user));
    setFieldErrors({});
    setDrawerError(undefined);
    setAvatarError(undefined);
    setSaveNotice(undefined);
    setSelectedAvatarFile(null);
    setProfileDrawerOpen(true);
  }

  function resetForm() {
    setForm(buildProfileDraft(user));
    setFieldErrors({});
    setDrawerError(undefined);
    setAvatarError(undefined);
    setSelectedAvatarFile(null);
  }

  function handleChange<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    if (field === "bio" && typeof value === "string" && value.length > 300) {
      setForm((current) => ({
        ...current,
        [field]: value.slice(0, 300),
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleAvatarSelection(file: File | null) {
    setAvatarError(undefined);

    if (!file) {
      setSelectedAvatarFile(null);
      return;
    }

    const validationError = validateProfilePhoto(file);

    if (validationError) {
      setSelectedAvatarFile(null);
      setAvatarError(validationError);
      return;
    }

    setSelectedAvatarFile(file);
  }

  function handleSave() {
    setDrawerError(undefined);
    setFieldErrors({});
    setSaveNotice(undefined);
    setAvatarError(undefined);

    const trimmedName = form.name.trim();

    if (!trimmedName) {
      setDrawerError("Please correct the highlighted fields.");
      setFieldErrors({
        name: "Full name is required.",
      });
      return;
    }

    if (form.bio.trim().length > 300) {
      setDrawerError("Please correct the highlighted fields.");
      setFieldErrors({
        bio: "Short bio must be 300 characters or fewer.",
      });
      return;
    }

    startProfileTransition(async () => {
      try {
        let avatarUrl: string | null | undefined;

        if (selectedAvatarFile) {
          avatarUrl = await uploadProfilePhoto(selectedAvatarFile);
        }

        const result = await updateProfileAction({
          ...form,
          avatarUrl,
        });

        if (result.error) {
          setDrawerError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }

        setProfileDrawerOpen(false);
        setSelectedAvatarFile(null);
        setSaveNotice("Profile updated successfully.");
        router.refresh();
      } catch (error) {
        setDrawerError(
          error instanceof Error
            ? error.message
            : "Unable to update your profile right now. Please try again.",
        );
      }
    });
  }

  function openPasswordDrawer() {
    setPasswordForm(buildPasswordDraft());
    setPasswordFieldErrors({});
    setPasswordDrawerError(undefined);
    setSaveNotice(undefined);
    setPasswordVisibility({
      currentPassword: false,
      newPassword: false,
      confirmNewPassword: false,
    });
    setPasswordDrawerOpen(true);
  }

  function closePasswordDrawer() {
    if (isPasswordPending) {
      return;
    }

    setPasswordDrawerOpen(false);
    setPasswordDrawerError(undefined);
    setPasswordFieldErrors({});
    setPasswordForm(buildPasswordDraft());
  }

  function handlePasswordChange<K extends keyof PasswordDraft>(
    field: K,
    value: PasswordDraft[K],
  ) {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function togglePasswordVisibility(field: keyof PasswordDraft) {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  function handlePasswordSave() {
    setPasswordDrawerError(undefined);
    setPasswordFieldErrors({});
    setSaveNotice(undefined);

    const nextFieldErrors: typeof passwordFieldErrors = {};

    if (!passwordForm.currentPassword) {
      nextFieldErrors.currentPassword = "Current password is required.";
    }

    if (!passwordForm.newPassword) {
      nextFieldErrors.newPassword = "New password is required.";
    }

    if (!passwordForm.confirmNewPassword) {
      nextFieldErrors.confirmNewPassword = "Confirm new password is required.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setPasswordDrawerError("Please correct the highlighted fields.");
      setPasswordFieldErrors(nextFieldErrors);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordDrawerError("Please correct the highlighted fields.");
      setPasswordFieldErrors({
        confirmNewPassword: "New password and confirm password do not match.",
      });
      return;
    }

    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setPasswordDrawerError("Please correct the highlighted fields.");
      setPasswordFieldErrors({
        newPassword: "New password must be different from current password.",
      });
      return;
    }

    if (!Object.values(getPasswordRequirementChecks(passwordForm.newPassword)).every(Boolean)) {
      setPasswordDrawerError("Password does not meet the required rules.");
      setPasswordFieldErrors({
        newPassword: "Password does not meet the required rules.",
      });
      return;
    }

    startPasswordTransition(async () => {
      try {
        const result = await changePasswordAction(passwordForm);

        if (result.error) {
          setPasswordDrawerError(result.error);
          setPasswordFieldErrors(result.fieldErrors ?? {});
          return;
        }

        setPasswordDrawerOpen(false);
        setPasswordForm(buildPasswordDraft());
        setSaveNotice("Password updated successfully.");
        router.refresh();
      } catch {
        setPasswordDrawerError("Unable to update your password right now. Please try again.");
      }
    });
  }

  return (
    <>
      <section className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
            Settings
          </h1>
          <p className="text-[15px] text-[#6f776f]">
            Manage core account and project configuration.
          </p>
        </header>

        {saveNotice ? (
          <div className="mx-auto max-w-[980px] rounded-[18px] border border-[#cfe4d5] bg-[#f4fbf6] px-4 py-3 text-[13px] font-medium text-brand">
            {saveNotice}
          </div>
        ) : null}

        <div className="mx-auto max-w-[980px] space-y-4">
          <SettingsCard
            title="Profile Information"
            description="Update your personal information and how others see you."
            action={<ActionButton icon={PencilLine} label="Edit Profile" onClick={openDrawer} />}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <AvatarCircle
                src={user.avatarSrc}
                initials={displayInitials}
                sizeClassName="h-[72px] w-[72px] shrink-0"
                textClassName="text-[28px]"
              />

              <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {profileRows.map((row) => (
                  <div key={row.label} className="space-y-1">
                    <p className="text-[12px] font-medium text-[#7c857d]">
                      {row.label}
                    </p>
                    <p className="text-[16px] font-semibold text-[#1c241d]">
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Password"
            description="Update your password regularly to keep your account secure."
            action={
              <ActionButton
                icon={LockKeyhole}
                label="Change Password"
                onClick={openPasswordDrawer}
              />
            }
          >
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-[#7c857d]">Last changed</p>
              <p className="text-[15px] font-semibold text-[#1e261f]">
                {user.passwordChangedAt}
              </p>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Project Master Data"
            description="Manage reusable project categories, tags, and currencies used across project forms and filters."
            action={
              <Button
                asChild
                type="button"
                variant="outline"
                className="h-[42px] gap-2 rounded-xl border-[#b8d8c0] bg-[#fbfefc] px-4 text-[13px] font-semibold text-brand shadow-[0_8px_20px_rgba(35,104,72,0.06)] hover:bg-brand-soft"
              >
                <Link href="/settings/project-master-data">
                  <Settings2 className="h-4 w-4" />
                  Open Project Master Data
                </Link>
              </Button>
            }
          >
            <div className="rounded-[22px] bg-[#fbfcfa] p-4">
              <p className="text-[15px] font-semibold text-[#1e261f]">
                Categories and tags
              </p>
              <p className="mt-1 text-[14px] text-[#748074]">
                Manage reusable values used across project forms and filters.
              </p>
            </div>
          </SettingsCard>
        </div>
      </section>

      <EditProfileDrawer
        isOpen={isProfileDrawerOpen}
        user={user}
        form={form}
        nameError={fieldErrors.name}
        bioError={fieldErrors.bio}
        avatarError={avatarError}
        error={drawerError}
        saving={isProfilePending}
        avatarPreviewSrc={selectedAvatarPreviewSrc || user.avatarSrc}
        selectedAvatarFileName={selectedAvatarFile?.name || undefined}
        onClose={closeDrawer}
        onReset={resetForm}
        onChange={handleChange}
        onSelectAvatar={handleAvatarSelection}
        onSave={handleSave}
      />

      <ChangePasswordDrawer
        isOpen={isPasswordDrawerOpen}
        passwordChangedAt={user.passwordChangedAt}
        form={passwordForm}
        fieldErrors={passwordFieldErrors}
        error={passwordDrawerError}
        saving={isPasswordPending}
        visibility={passwordVisibility}
        onClose={closePasswordDrawer}
        onChange={handlePasswordChange}
        onToggleVisibility={togglePasswordVisibility}
        onSave={handlePasswordSave}
      />
    </>
  );
}

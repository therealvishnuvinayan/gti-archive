import { redirect } from "next/navigation";
import Link from "next/link";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { projectReadActor } from "@/lib/authorization/project-read-rules";

function formatRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMemberSince(date: Date | string | number | null | undefined) {
  if (!date) {
    return "—";
  }

  const normalizedDate = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(normalizedDate);
}

function formatPasswordChangedAt(date: Date | string | number | null | undefined) {
  if (!date) {
    return "—";
  }

  const normalizedDate = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(normalizedDate);
}

export default async function SettingsPage() {
  const user = await requireUser();

  if (!hasPermission(user, "settings.viewOwnProfile")) {
    redirect("/");
  }

  const canViewMasterData = hasPermission(user, "settings.viewMasterData");
  const canUpdateProfile = hasPermission(user, "settings.updateOwnProfile");
  const canChangePassword = hasPermission(user, "settings.changeOwnPassword");
  const canViewUsers =
    hasPermission(user, "users.view");

  return (
    <DashboardLayout>
      {projectReadActor(user)?.technicalPrivileges.includes("TECHNICAL_ADMIN") && <section className="mx-6 mt-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Technical Administration</h2>
        <p className="my-2 text-sm text-muted-foreground">Manage technical privileges for existing accounts with recorded reasons and history.</p>
        <Link className="text-sm font-medium underline" href="/settings/technical-administration">Manage technical privileges</Link>
      </section>}
      <SettingsWorkspace
        user={{
          name: getUserDisplayName(user),
          email: user.email,
          role: [projectReadActor(user)?.businessRole, ...(projectReadActor(user)?.technicalPrivileges ?? [])].filter(Boolean).map(value => formatRole(value!)).join(" · ") || "No assigned role",
          memberSince: formatMemberSince(user.createdAt),
          passwordChangedAt: formatPasswordChangedAt(user.passwordChangedAt),
          avatarSrc: user.avatarUrl
            ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
            : null,
          department: user.department?.trim() || "",
          phoneNumber: user.phoneNumber?.trim() || "",
          jobTitle: user.jobTitle?.trim() || "",
          bio: user.bio?.trim() || "",
        }}
        canUpdateProfile={canUpdateProfile}
        canChangePassword={canChangePassword}
        canViewMasterData={canViewMasterData}
        canViewUsers={canViewUsers}
      />
    </DashboardLayout>
  );
}

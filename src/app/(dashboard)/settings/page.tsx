import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getUserDisplayName, requireUser } from "@/lib/auth";

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

export default async function SettingsPage() {
  const user = await requireUser();
  const canManageMasterData =
    user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

  return (
    <DashboardLayout>
      <SettingsWorkspace
        user={{
          name: getUserDisplayName(user),
          email: user.email,
          role: formatRole(user.role),
          memberSince: formatMemberSince(user.createdAt),
        }}
        canManageMasterData={canManageMasterData}
      />
    </DashboardLayout>
  );
}

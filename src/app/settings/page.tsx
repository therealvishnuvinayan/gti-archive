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

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search projects, files, people...",
      }}
    >
      <SettingsWorkspace
        user={{
          name: getUserDisplayName(user),
          email: user.email,
          role: formatRole(user.role),
        }}
      />
    </DashboardLayout>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { isBusinessAdministratorRole } from "@/lib/user-role-compatibility";

export default async function SettingsPermissionsPage() {
  const user = await requireUser();

  if (
    isBusinessAdministratorRole(user.role) &&
    hasPermission(user, "users.view") &&
    hasPermission(user, "users.managePermissions") &&
    hasPermission(user, "settings.managePermissions")
  ) {
    redirect("/users");
  }

  redirect("/settings");
}

import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function SettingsPermissionsPage() {
  const user = await requireUser();

  if (
    user.role === UserRole.SUPER_ADMIN &&
    hasPermission(user, "users.view") &&
    hasPermission(user, "users.managePermissions") &&
    hasPermission(user, "settings.managePermissions")
  ) {
    redirect("/users");
  }

  redirect("/settings");
}

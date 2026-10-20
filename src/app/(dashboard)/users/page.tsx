import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { administration } from "@/lib/authorization/administration";
import { AdministrationWorkspace } from "@/components/users/administration-workspace";

export default async function UsersPage() {
  const user = await requireUser();
  if (!hasPermission(user, "users.view")) redirect("/no-access");
  const directory = await administration.getAdministrationDirectory("business");
  return <DashboardLayout><AdministrationWorkspace domain="business" directory={directory} /></DashboardLayout>;
}

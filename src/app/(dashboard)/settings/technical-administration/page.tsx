import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AdministrationWorkspace } from "@/components/users/administration-workspace";
import { requireUser } from "@/lib/auth";
import { projectReadActor } from "@/lib/authorization/project-read-rules";
import { administration } from "@/lib/authorization/administration";

export default async function TechnicalAdministrationPage() {
  const user = await requireUser();
  if (!projectReadActor(user)?.technicalPrivileges.includes("TECHNICAL_ADMIN")) redirect("/no-access");
  const directory = await administration.getAdministrationDirectory("technical");
  return <DashboardLayout><AdministrationWorkspace domain="technical" directory={directory} /></DashboardLayout>;
}

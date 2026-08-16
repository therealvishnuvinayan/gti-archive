import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function ProjectDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  if (!hasPermission(user, "project.view")) {
    redirect("/no-access");
  }

  return children;
}

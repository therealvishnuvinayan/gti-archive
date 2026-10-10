import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { TaskerWorkspace } from "@/components/tasks/tasker-workspace";

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();

  if (!hasPermission(user, "project.view")) {
    redirect("/no-access");
  }

  const { slug } = await params;
  return <>{children}<TaskerWorkspace project={{ projectType: "STRUCTURED", projectId: slug }} currentUserId={user.id} compact /></>;
}

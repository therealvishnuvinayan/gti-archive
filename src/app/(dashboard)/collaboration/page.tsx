import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
export default async function CollaborationPage() {
  const user = await requireUser();
  redirect(hasPermission(user, "users.view") ? "/users" : "/no-access");
}

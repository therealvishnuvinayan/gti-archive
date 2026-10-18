import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
export default async function SettingsPermissionsPage() {
  await requireUser();
  redirect("/settings");
}

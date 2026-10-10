import { redirect } from "next/navigation";
import { ContactDirectoryWorkspace } from "@/components/contacts/contact-directory-workspace";
import { requireUser } from "@/lib/auth";
import { getContactDirectory } from "@/lib/contact-directory";
import { canManageContactDirectories } from "@/lib/permissions/resolver";

export default async function ClientsPage() {
  const user = await requireUser();
  if (!canManageContactDirectories(user)) redirect("/");
  const contacts = await getContactDirectory(user, "CLIENT");
  return <ContactDirectoryWorkspace kind="CLIENT" initialContacts={contacts} />;
}

import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { listBusinessUsers } from "@/lib/authorization/business-users";

export default async function UsersPage() {
  const user = await requireUser();
  if (!hasPermission(user, "users.view")) redirect("/no-access");
  const users = await listBusinessUsers(user);
  return <DashboardLayout><section className="space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Business Users</h1>
    <p>Current V2 business assignments. Role editing is not available in this screen. Changes require the audited V2 assignment service.</p>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>
      <th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Business role</th><th className="p-3">Status</th>
    </tr></thead><tbody>{users.map(row => <tr key={row.id} className="border-t">
      <td className="p-3">{row.name || "—"}</td><td className="p-3">{row.email}</td>
      <td className="p-3">{row.authorization?.businessRole?.replaceAll("_", " ") || "No business role"}</td>
      <td className="p-3">{row.authorization?.accountStatus || "Unassigned"}</td>
    </tr>)}</tbody></table></div>
  </section></DashboardLayout>;
}

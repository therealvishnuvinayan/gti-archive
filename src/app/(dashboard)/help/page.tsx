import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getSidebarVisibility, hasPermission } from "@/lib/permissions/resolver";
export default async function HelpPage() {
  const user = await requireUser();
  if (!hasPermission(user, "help.view")) redirect("/no-access");
  const nav = getSidebarVisibility(user);
  return <DashboardLayout><section className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">FLUX access and workflows</h1>
    <p>Your business role and technical privileges are assigned separately. Settings shows your current assignments. Menu visibility does not grant access to another person’s projects or files.</p>
    {nav.projects && <p><Link href="/projects" className="underline">Projects</Link> shows your permitted work. SPM creation uses an approved preset. JPM creation requires Director approval and an SPM Co-owner. Final completion requires a Director decision and all mandatory workflow and document checks.</p>}
    {nav.tasks && <p><Link href="/tasks" className="underline">Tasks</Link> contains the existing concept work. Assigned work gives access to its permitted context and files. Additional universal task types are planned for a later milestone.</p>}
    {nav.archives && <p><Link href="/archives" className="underline">Archives</Link> is global for Director and SPM. Designer and Digital Lead access requires the existing file and category grants. Digital Lead category management does not grant file access or verification authority.</p>}
    {nav.library && <p><Link href="/library" className="underline">Library</Link> follows project and task permissions. SPM/JPM can also read their own manual uploads. Library management remains Director-only.</p>}
    {nav.users && <p><Link href="/users" className="underline">Business Users</Link> supports audited business role changes, permitted suspension/reactivation, history and protected Director transfer. Changes require a reason and confirmation. Technical privileges cannot be granted through business authority. New-account invitations remain unavailable.</p>}
    {!nav.tasks && <p>This account has no business access. Settings offers personal controls and, for Technical Administrators, separate audited technical privilege management. Technical privileges do not grant project or approval access.</p>}
    <p>Project Tracker, project realtime subscriptions, new templates, Stage Builder and additional task types are not active in this authorization phase.</p>
  </section></DashboardLayout>;
}

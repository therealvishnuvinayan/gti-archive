import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { GovernanceForm } from "@/components/projects/governance-form";
import { requireUser } from "@/lib/auth";
import { canCreateProjects } from "@/lib/permissions/resolver";
import { getGovernanceWorkspace } from "@/lib/project-governance/service";

const field = "mt-1 block w-full rounded-lg border border-slate-300 p-2";
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const requestedKind = (await searchParams).kind;
  const user = await requireUser();
  if (!canCreateProjects(user)) redirect("/projects");
  const data = await getGovernanceWorkspace(user);
  const director = data.role === "DIRECTOR", junior = data.role === "JUNIOR_PROJECT_MANAGER";
  const managerRoles = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"];
  return <DashboardLayout><main className="mx-auto max-w-3xl space-y-6 p-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{junior ? "Request a project" : "Create a project"}</h1><Link className="underline" href="/projects/approvals">Approvals and requests</Link></div>
    <aside className="rounded-xl bg-emerald-50 p-4">
      <p>Director Oversight is automatically enabled for every project. The Marketing Director has full business authority and does not need to be added as a Co-owner.</p>
      <p className="mt-2 font-medium">Marketing Director: {data.director ? data.director.name || data.director.email : "No active Director available"}</p>
    </aside>
    {!director && !junior && !data.presets.length ? <p role="status">Artwork creation is waiting for the Director to approve the existing legacy preset. No preset is approved automatically.</p> : <GovernanceForm submitLabel={junior ? "Submit to Director" : "Create project"}>
      <input type="hidden" name="command" value="create" /><input type="hidden" name="clientRequestId" value={randomUUID()} />
      {director ? <label className="block">Project workflow<select name="kind" defaultValue={requestedKind === "FLEXIBLE" ? "FLEXIBLE" : "ARTWORK"} className={field}><option value="ARTWORK">Existing Artwork workflow</option><option value="FLEXIBLE">Flexible project</option></select><span className="text-sm text-slate-600">Flexible creation supports a Director or SPM owner. Leave co-owners and executors empty for that workflow.</span></label> : <input type="hidden" name="kind" value="ARTWORK" />}
      <label className="block">Project name<input name="name" required maxLength={200} className={field} /></label>
      <label className="block">Brief<textarea name="description" maxLength={20000} rows={5} className={field} /></label>
      <label className="block">Scope<select name="executionType" className={field}><option value="INTERNAL">Internal</option><option value="EXTERNAL">External</option></select></label>
      {director ? <label className="block">Owner<select name="ownerId" defaultValue={user.id} required className={field}>{data.users.filter(u => managerRoles.includes(u.authorization?.businessRole ?? "")).map(u => <option key={u.id} value={u.id}>{u.name || u.email} — {u.authorization?.businessRole?.replaceAll("_", " ")}</option>)}</select></label> : <><input type="hidden" name="ownerId" value={user.id} /><p>Owner: {user.name || user.email}</p></>}
      <label className="block">{junior ? "SPM co-owner (required)" : "Co-owners (optional)"}<select name="coOwnerIds" multiple required={junior} className={field}>{data.users.filter(u => u.id !== user.id && (junior ? u.authorization?.businessRole === "SENIOR_PROJECT_MANAGER" : ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(u.authorization?.businessRole ?? ""))).map(u => <option key={u.id} value={u.id}>{u.name || u.email} — {u.authorization?.businessRole?.replaceAll("_", " ")}</option>)}</select><span className="text-sm text-slate-600">Use Command or Control to select multiple people. A JPM owner always requires an SPM co-owner.</span></label>
      <label className="block">Executors (optional)<select name="executorIds" multiple className={field}>{data.users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      <label className="block">Artwork tags, separated by commas (1–4; leave empty for Flexible)<input name="tags" className={field} /></label>
      {!director && !junior && <><input type="hidden" name="presetApprovalId" value={data.presets[0].id} /><p>Approved legacy Artwork preset · approved by {data.presets[0].approvedBy.name || data.presets[0].approvedBy.email}. This is the existing workflow, not a published V2 template.</p></>}
      {junior && <p>Submitted details are retained for review. Activation requires the Director’s approval and unchanged participant eligibility. Requests expire after seven days.</p>}
    </GovernanceForm>}
  </main></DashboardLayout>;
}

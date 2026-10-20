import Link from "next/link";
import { GovernanceForm } from "./governance-form";
import { getCompletionPanel } from "@/lib/project-governance/service";
import type { CompletionTarget } from "@/lib/project-governance/completion";
import type { PermissionUser } from "@/lib/permissions/resolver";
import { canCreateProjects } from "@/lib/permissions/resolver";

export async function ProjectCompletionGovernance({ user, target }: { user: PermissionUser; target: CompletionTarget }) {
  if (!canCreateProjects(user)) return null;
  const panel = await getCompletionPanel(user, target);
  if (!panel) return null;
  return <section id="final-completion" className="mx-auto my-6 max-w-5xl space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-semibold">Final project completion</h2>
    <p>{panel.archived ? "Archived" : panel.completed ? "Project completed" : panel.pending ? "Completion requested — awaiting Director decision" : panel.blocker ? "Project work is still in progress" : "Ready for final completion review"}</p>
    {panel.blocker && !panel.pending && !panel.archived && <p>{panel.blocker}</p>}
    {!panel.completed && !panel.archived && !panel.pending && !panel.blocker && <GovernanceForm submitLabel={panel.director ? "Finalize as Director" : "Request Director approval"}>
      <input type="hidden" name="command" value={panel.director ? "finalize" : "requestCompletion"} /><input type="hidden" name="kind" value={target.kind} /><input type="hidden" name="projectId" value={target.projectId} />
      <label className="block">Completion reason<textarea name="reason" required maxLength={2000} className="mt-1 block w-full rounded-lg border p-2" /></label>
    </GovernanceForm>}
    <p className="text-sm text-slate-600">Stage or milestone completion marks work as ready for review. Final project completion records the Director’s decision; archiving is separate.</p>
    <Link className="underline" href="/projects/approvals">View requests and Director decisions</Link>
  </section>;
}

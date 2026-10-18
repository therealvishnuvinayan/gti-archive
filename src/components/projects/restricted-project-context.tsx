import { RichTextContent } from "@/components/ui/rich-text-editor";
import type { getRestrictedFlexibleProjectContext, getRestrictedProjectContext } from "@/lib/authorization/project-context";
import Link from "next/link";

type Context = Awaited<ReturnType<typeof getRestrictedProjectContext>> | Awaited<ReturnType<typeof getRestrictedFlexibleProjectContext>>;
export function RestrictedProjectContextView({ data }: { data: Context }) {
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <Link href="/projects" className="text-sm text-emerald-800">Back to projects</Link>
    <h1 className="text-3xl font-semibold">{data.name}</h1>
    <div className="grid gap-3 text-sm sm:grid-cols-3">
      <p>Creator: {data.creator.name ?? "Project creator"}</p>
      <p>Owner: {data.owner?.name ?? "Unassigned"}</p>
      <p>Project deadline: {data.deadline?.slice(0, 10) ?? "Not set"}</p>
    </div>
    <section className="rounded-xl border p-5"><h2 className="mb-3 font-semibold">Project brief</h2>
      <RichTextContent value={data.projectBrief ?? ""} />
      {data.targetMarkets.length > 0 && <p className="mt-3">Target markets: {data.targetMarkets.join(", ")}</p>}
      {data.deliverables.length > 0 && <p className="mt-3">Deliverables: {data.deliverables.join(", ")}</p>}
    </section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Your assigned work</h2>
      {data.tasks.length === 0 && <p>No assigned work is available in this project.</p>}
      {data.tasks.map((task) => <article key={task.id} className="space-y-3 rounded-xl border p-5">
        <h3 className="font-semibold">{task.name}</h3>
        {task.assigner && <p>Assigned by {task.assigner.name ?? "Project manager"}</p>}
        <p>Deadline: {task.deadline?.slice(0, 10) ?? "Not set"}</p>
        <RichTextContent value={task.taskBrief ?? ""} />
        {task.files.length > 0 && <ul className="space-y-2">{task.files.map((file) => <li key={file.id}>
          <a className="text-emerald-800 underline" href={"/api/" + (task.folder ? "project-assets" : "flexible-project-attachments") + `/${encodeURIComponent(file.id)}/download`}>{file.originalFileName}</a>
        </li>)}</ul>}
      </article>)}
    </section>
  </div>;
}

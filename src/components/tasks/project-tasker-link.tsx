import Link from "next/link";
import { taskEnabled } from "@/lib/tasker/contracts";
// Render only inside a workspace whose native project/context read was authorized.
export function ProjectTaskerLink({ kind, projectId }: { kind: "structured" | "flexible"; projectId: string }) {
  return taskEnabled() ? <div className="mx-auto max-w-5xl px-6 py-4"><Link className="inline-flex rounded-xl border border-[#d9e2da] bg-white px-4 py-2 text-sm font-semibold text-emerald-800" href={`/tasks?context=${encodeURIComponent(`${kind}:${projectId}`)}`}>Project General Tasks</Link></div> : null;
}

import { publicationEnabled } from "@/lib/stage-builder/publication-activation";
import { listWorkflowApprovals } from "@/lib/stage-builder/publication";
import Link from "next/link";
import { runtimeAuthorization } from "@/lib/authorization/runtime";
import { draftsEnabled } from "@/lib/stage-builder/service";

export async function StageBuilderEntry() {
  if (!draftsEnabled()) return null;
  const result = await runtimeAuthorization.authorize({ capability: "template.configureCustomStages", targetId: "stage-drafts" });
  if (result.decision !== "ALLOW") return null;
  const publication = publicationEnabled() ? await listWorkflowApprovals(0, "PENDING") : null;
  return <div className="mb-4 flex flex-wrap gap-4"><Link href="/projects/workflow-drafts" className="mb-4 ml-4 inline-block underline">Workflow drafts · Stage Builder</Link>{publication && <><Link className="underline" href="/projects/workflow-approvals">{publication.director ? "Workflow Approvals" : "My workflow submissions"} ({publication.pendingCount})</Link><Link className="underline" href="/projects/published-workflows">Published definitions</Link></>}</div>;
}

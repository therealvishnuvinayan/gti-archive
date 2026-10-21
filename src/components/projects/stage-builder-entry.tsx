import Link from "next/link";
import { runtimeAuthorization } from "@/lib/authorization/runtime";
import { draftsEnabled } from "@/lib/stage-builder/service";

export async function StageBuilderEntry() {
  if (!draftsEnabled()) return null;
  const result = await runtimeAuthorization.authorize({ capability: "template.configureCustomStages", targetId: "stage-drafts" });
  if (result.decision !== "ALLOW") return null;
  return <Link href="/projects/workflow-drafts" className="mb-4 ml-4 inline-block underline">Workflow drafts · Stage Builder</Link>;
}

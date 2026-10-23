import { runtimeIntegrationEnabled } from "@/lib/runtime-integration/activation";
import Link from "next/link";
import { runtimeEnabled } from "@/lib/stage-runtime/activation";
import { runtimeAuthorization } from "@/lib/authorization/runtime";
export async function StageRuntimeEntry() {
  if (!runtimeEnabled()) return null;
  const d = await runtimeAuthorization.authorize({ capability: "project.runtimeList", targetId: "runtime-projects" });
  return d.decision === "ALLOW" ? <><Link className="mb-4 ml-4 inline-block underline" href="/projects/runtime">Runtime projects · Approved workflows</Link>{runtimeIntegrationEnabled() && <Link className="ml-4 underline" href="/projects/runtime/requests">Runtime creation approvals</Link>}</> : null;
}

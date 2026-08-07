import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptStageRoute } from "@/components/projects/concept-stage-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageFourPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;

  return (
    <ConceptStageRoute
      slug={decodeRouteParam(rawSlug)}
      stageNumber={4}
      stageTitle="Final Concept"
      stageKey={ProjectWorkflowStageKey.PROJECT_DEVELOPMENT}
    />
  );
}

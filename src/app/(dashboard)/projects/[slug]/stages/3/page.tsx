import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptStageRoute } from "@/components/projects/concept-stage-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageThreePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;

  return (
    <ConceptStageRoute
      slug={decodeRouteParam(rawSlug)}
      stageNumber={3}
      stageTitle="Initial Concept"
      stageKey={ProjectWorkflowStageKey.CONCEPT_CREATION}
    />
  );
}

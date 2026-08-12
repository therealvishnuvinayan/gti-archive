import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptStageRoute } from "@/components/projects/concept-stage-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageFourPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ executor?: string }>;
}) {
  const [{ slug: rawSlug }, { executor }] = await Promise.all([
    params,
    searchParams,
  ]);

  return (
    <ConceptStageRoute
      slug={decodeRouteParam(rawSlug)}
      stageNumber={4}
      stageTitle="Final Concept"
      stageKey={ProjectWorkflowStageKey.PROJECT_DEVELOPMENT}
      executorFilter={executor}
    />
  );
}

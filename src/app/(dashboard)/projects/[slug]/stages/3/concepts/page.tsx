import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptStageRoute } from "@/components/projects/concept-stage-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageThreeConceptFoldersPage({
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
      stageNumber={3}
      stageTitle="Initial Concept"
      stageKey={ProjectWorkflowStageKey.CONCEPT_CREATION}
      executorFilter={executor}
      foldersOnly
    />
  );
}

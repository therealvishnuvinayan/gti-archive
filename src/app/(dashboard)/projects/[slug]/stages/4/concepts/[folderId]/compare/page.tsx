import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptCompareRoute } from "@/components/projects/concept-compare-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageFourConceptComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; folderId: string }>;
  searchParams: Promise<{ base?: string; compare?: string }>;
}) {
  const [{ slug, folderId }, { base, compare }] = await Promise.all([
    params,
    searchParams,
  ]);

  return (
    <ConceptCompareRoute
      projectId={decodeRouteParam(slug)}
      folderId={decodeRouteParam(folderId)}
      stageKey={ProjectWorkflowStageKey.PROJECT_DEVELOPMENT}
      base={base}
      compare={compare}
    />
  );
}

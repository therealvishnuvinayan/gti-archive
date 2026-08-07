import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptChatRoute } from "@/components/projects/concept-chat-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageThreeConceptChatPage({
  params,
}: {
  params: Promise<{ slug: string; folderId: string }>;
}) {
  const { slug, folderId } = await params;

  return (
    <ConceptChatRoute
      projectId={decodeRouteParam(slug)}
      folderId={decodeRouteParam(folderId)}
      stageNumber={3}
      stageKey={ProjectWorkflowStageKey.CONCEPT_CREATION}
    />
  );
}

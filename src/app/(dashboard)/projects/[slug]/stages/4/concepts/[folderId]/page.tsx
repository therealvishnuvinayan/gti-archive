import { ProjectWorkflowStageKey } from "@prisma/client";

import { ConceptChatRoute } from "@/components/projects/concept-chat-route";
import { decodeRouteParam } from "@/lib/route-params";

export default async function StageFourConceptChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; folderId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { slug, folderId } = await params;
  const { returnTo } = await searchParams;

  return (
    <ConceptChatRoute
      projectId={decodeRouteParam(slug)}
      folderId={decodeRouteParam(folderId)}
      stageKey={ProjectWorkflowStageKey.PROJECT_DEVELOPMENT}
      backHref={returnTo === "/tasks" ? "/tasks" : undefined}
    />
  );
}

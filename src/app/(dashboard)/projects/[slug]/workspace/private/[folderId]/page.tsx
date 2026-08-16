import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectAccessUnavailableState } from "@/components/projects/project-route-state";
import { StageTwoFolderWorkspace } from "@/components/projects/stage-two-folder-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectPrivateFolderPageData } from "@/lib/project-private-folders";
import { decodeRouteParam } from "@/lib/route-params";

export default async function ProjectPrivateFolderPage({
  params,
}: {
  params: Promise<{ slug: string; folderId: string }>;
}) {
  const { slug, folderId: encodedFolderId } = await params;
  const folderId = decodeRouteParam(encodedFolderId);
  const user = await requireUser();
  let data = null;

  try {
    data = await getProjectPrivateFolderPageData(user, {
      projectId: slug,
      folderId,
    });
  } catch {
    data = null;
  }

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search private files...",
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      {data ? (
        <StageTwoFolderWorkspace
          key={data.folder.id}
          data={data}
          currentUserId={user.id}
          context="private"
        />
      ) : (
        <ProjectAccessUnavailableState
          parentHref={`/projects/${slug}`}
          parentLabel="Workspace"
        />
      )}
    </DashboardLayout>
  );
}

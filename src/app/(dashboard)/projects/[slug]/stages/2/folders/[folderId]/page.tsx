import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectAccessUnavailableState } from "@/components/projects/project-route-state";
import { StageTwoFolderWorkspace } from "@/components/projects/stage-two-folder-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectResearchFolderPageData } from "@/lib/project-research";
import { decodeRouteParam } from "@/lib/route-params";

export default async function ProjectResearchFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; folderId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug, folderId: encodedFolderId } = await params;
  const { workspace } = await searchParams;
  const folderId = decodeRouteParam(encodedFolderId);
  const user = await requireUser();
  let data = null;

  try {
    data = await getProjectResearchFolderPageData(user, {
      projectId: slug,
      folderId,
    });
  } catch {
    data = null;
  }

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for projects, folders, files...",
      }}
    >
      {data ? (
        <StageTwoFolderWorkspace
          key={data.folder.id}
          data={data}
          currentUserId={user.id}
        />
      ) : (
        <ProjectAccessUnavailableState
          parentHref={`/projects/${slug}/stages/2${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`}
          parentLabel="Research workspace"
        />
      )}
    </DashboardLayout>
  );
}

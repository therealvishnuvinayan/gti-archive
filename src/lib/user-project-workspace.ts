import { getRestrictedProjectContext } from "@/lib/authorization/project-context";
import { canReadProjectResource } from "@/lib/authorization/project-read";
import type { ProjectAccessUser } from "@/lib/projects";
import type { UserTaskDisplayState } from "@/lib/user-projects";
import "server-only";

export type UserProjectWorkspaceData = {
  context: Awaited<ReturnType<typeof getRestrictedProjectContext>>;
  projectBrief: {
    text: string;
    attachments: Array<{
      id: string;
      originalFileName: string;
      mimeType: string;
      fileSize: number;
    }>;
  };
  project: {
    id: string;
    name: string;
    description: string | null;
    owner: { id: string; name: string } | null;
  };
  sharedFolders: Array<{
    key: "BRIEF" | "TECH";
    name: "Brief" | "Tech";
    folderId: string | null;
    fileCount: number;
    canUpload: boolean;
    href: string | null;
  }>;
  myPrivateFolder: {
    id: string;
    href: string;
  } | null;
  canViewClassifiedFolders: boolean;
  classifiedFolders: Array<{
    key: string;
    ownerName: string;
    role: string;
  }>;
  assignedConcepts: Array<{
    id: string;
    name: string;
    href: string;
    dueAt: string | null;
    updatedAt: string;
    display: UserTaskDisplayState;
  }>;
};

export async function getUserProjectWorkspace(projectId: string, currentUser: ProjectAccessUser): Promise<UserProjectWorkspaceData | null> {
  if (!await canReadProjectResource("structured", projectId, "project.viewContext", currentUser)) return null;
  const context = await getRestrictedProjectContext(projectId, currentUser);
  return {
    context,
    project: { id: context.id, name: context.name, description: context.projectBrief,
      owner: context.owner ? { id: context.owner.id, name: context.owner.name ?? "Project owner" } : null },
    projectBrief: { text: context.projectBrief ?? "", attachments: [] },
    sharedFolders: [], myPrivateFolder: null, canViewClassifiedFolders: false,
    classifiedFolders: [], assignedConcepts: [],
  };
}

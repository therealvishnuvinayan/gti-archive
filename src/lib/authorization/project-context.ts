import { prisma } from "@/lib/prisma";
import "server-only";
import { refreshProjectReader } from "./project-read";
import { projectReadTarget, readableStructuredFileProject } from "./project-read-policies";
import { flexibleProjectReadWhere, projectReadActor, structuredProjectReadWhere } from "./project-read-rules";
import { runtimeAuthorization } from "./runtime";

const identity = { id: true, name: true } as const;
export async function getRestrictedProjectContext(projectId: string, expected?: { id: string }) {
  const user = await refreshProjectReader(expected);
  return runtimeAuthorization.runAuthorized({ capability: "project.viewContext", targetId: projectReadTarget("structured", projectId) }, async (tx, grant) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: {
      id: true, name: true, description: true, endDate: true,
      createdBy: { select: identity }, owner: { select: identity },
      inquiry: { select: { initialBrief: true, deadline: true,
        targetMarkets: { select: { label: true } }, deliverables: { select: { label: true } } } },
      conceptFolders: { where: { assignedExecutorId: grant.actorUserId, taskerStage: { projectId } }, orderBy: { sortOrder: "asc" }, select: {
        id: true, name: true, assignedBy: { select: identity },
        taskerStage: { select: { id: true, description: true, plannedDueAt: true,
          attachments: { where: { projectId, status: "READY" }, select: { id: true, originalFileName: true, mimeType: true, fileSize: true } } } },
      } },
    } });
    const actor = projectReadActor(user)!;
    const tasks = await Promise.all(project.conceptFolders.map(async (task) => ({
      id: task.id, name: task.name, assigner: task.assignedBy,
      taskBrief: task.taskerStage.description, stageBrief: null,
      deadline: task.taskerStage.plannedDueAt?.toISOString() ?? null,
      folder: { id: task.id, name: task.name, kind: "concept" as const },
      files: (await Promise.all(task.taskerStage.attachments.map(async (file) =>
        await readableStructuredFileProject(tx, actor, file.id) ? file : null))).filter((file) => file !== null),
    })));
    return { id: project.id, name: project.name, creator: project.createdBy, owner: project.owner,
      projectBrief: project.inquiry?.initialBrief ?? project.description,
      targetMarkets: project.inquiry?.targetMarkets.map((item) => item.label) ?? [],
      deliverables: project.inquiry?.deliverables.map((item) => item.label) ?? [],
      deadline: (project.inquiry?.deadline ?? project.endDate)?.toISOString() ?? null, tasks };
  });
}

export async function getRestrictedFlexibleProjectContext(projectId: string, expected?: { id: string }) {
  await refreshProjectReader(expected);
  return runtimeAuthorization.runAuthorized({ capability: "project.viewContext", targetId: projectReadTarget("flexible", projectId) }, async (tx, grant) => {
    const project = await tx.flexibleProject.findUniqueOrThrow({ where: { id: projectId }, select: {
      id: true, name: true, description: true, deadline: true,
      owner: { select: identity }, createdBy: { select: identity },
      milestones: { where: { responsibleUserId: grant.actorUserId }, orderBy: { sortOrder: "asc" }, select: {
        id: true, name: true, description: true, deadline: true,
        attachments: { where: { projectId, status: "READY" }, select: { id: true, originalFileName: true, mimeType: true, fileSize: true } },
      } },
    } });
    return { id: project.id, name: project.name, creator: project.createdBy, owner: project.owner,
      projectBrief: project.description, deadline: project.deadline?.toISOString() ?? null,
      targetMarkets: [] as string[], deliverables: [] as string[],
      tasks: project.milestones.map((task) => ({ id: task.id, name: task.name, assigner: null,
        taskBrief: task.description, stageBrief: null, deadline: task.deadline?.toISOString() ?? null,
        folder: null, files: task.attachments })) };
  });
}

// A reusable index for relationship-scoped context routes. No workflow columns
// are selected, including for filtering and ordering.
export async function getProjectContextIndex(expected?: { id: string }, limitedOnly = false) {
  const user = await refreshProjectReader(expected);
  const actor = projectReadActor(user);
  const structured = limitedOnly && actor?.businessRole === "DIRECTOR" ? { id: { in: [] } } : structuredProjectReadWhere(actor);
  const flexible = limitedOnly && actor?.businessRole === "DIRECTOR" ? { id: { in: [] } } : flexibleProjectReadWhere(actor);
  const [artwork, privateProjects] = await Promise.all([
    prisma.project.findMany({where: {AND: [structured, ...(limitedOnly ? [{NOT: structuredProjectReadWhere(actor, true)}] : [])]},
      select: {id:true, name:true}, orderBy: [{name:"asc"}, {id:"asc"}]}),
    prisma.flexibleProject.findMany({where: {AND: [flexible, ...(limitedOnly ? [{NOT: flexibleProjectReadWhere(actor, true)}] : [])]},
      select: {id:true, name:true, slug:true}, orderBy: [{name:"asc"}, {id:"asc"}]}),
  ]);
  return {artwork: artwork.map(project => ({...project, href: `/projects/${encodeURIComponent(project.id)}`})),
    flexible: privateProjects.map(({slug, ...project}) => ({...project, href: `/projects/flexible/${encodeURIComponent(slug)}`})),
    total: artwork.length + privateProjects.length};
}

export async function getFlexibleContextBySlug(slug: string, expected?: {id: string}) {
  const user = await refreshProjectReader(expected);
  const project = await prisma.flexibleProject.findFirst({where:{slug, AND:flexibleProjectReadWhere(projectReadActor(user))},select:{id:true}});
  return project ? getRestrictedFlexibleProjectContext(project.id, user) : null;
}

export async function getDirectorProjectResources(projectId: string, expected?: { id: string }) {
  const user = await refreshProjectReader(expected);
  if (projectReadActor(user)?.businessRole !== "DIRECTOR") return null;
  return runtimeAuthorization.runAuthorized({capability: "project.view", targetId: projectReadTarget("structured", projectId)}, async tx => {
    const [files, privateFolders, researchFolders] = await Promise.all([
      tx.projectAttachment.findMany({where:{projectId,status:"READY"},select:{id:true,originalFileName:true},orderBy:{id:"asc"}}),
      tx.projectPrivateFolder.findMany({where:{projectId,parentFolderId:null},select:{id:true,name:true,owner:{select:identity}},orderBy:{id:"asc"}}),
      tx.projectResearchFolder.findMany({where:{workspace:{projectId},parentFolderId:null},select:{id:true,name:true,workspace:{select:{owner:{select:identity}}}},orderBy:{id:"asc"}}),
    ]);
    const authorizedFiles = (await Promise.all(files.map(async file => await readableStructuredFileProject(tx, projectReadActor(user)!, file.id) ? file : null))).filter(file => file !== null);
    return {files: authorizedFiles,folders:[...privateFolders.map(folder=>({id:folder.id,name:folder.name,owner:folder.owner,href:`/projects/${encodeURIComponent(projectId)}/workspace/private/${encodeURIComponent(folder.id)}`})),
      ...researchFolders.map(folder=>({id:folder.id,name:folder.name,owner:folder.workspace.owner,href:`/projects/${encodeURIComponent(projectId)}/stages/2/folders/${encodeURIComponent(folder.id)}`}))]};
  });
}

import {
  AttachmentStatus,
  ProjectInquiryPartyRole,
  ProjectInquiryPartySource,
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import { createProjectV2 } from "../src/lib/project-creation";
import {
  completeProjectResearchStage,
  createProjectResearchFolder,
  ensureProjectResearchWorkspace,
  getProjectResearchFolderPageData,
  getProjectResearchPageData,
  PROJECT_RESEARCH_SYSTEM_FOLDERS,
} from "../src/lib/project-research";
import {
  completeProjectResearchFileUpload,
  deleteProjectResearchFile,
  getProjectResearchFileDownloadUrl,
  requestProjectResearchFileUpload,
} from "../src/lib/project-research-files";
import {
  normalizeProjectResearchTextFileName,
  validatePreparedProjectResearchTextFile,
  validateProjectResearchTextContent,
} from "../src/lib/project-research-text-file";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";

function check(number: number, condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Check ${number} failed: ${message}`);
}

function expectError(result: unknown) {
  return Boolean(result && typeof result === "object" && "error" in result);
}

const users = {
  superAdmin: {
    id: "research-super-admin",
    email: "research-super-admin@example.test",
    name: "Research Super Admin",
    role: UserRole.SUPER_ADMIN,
    collaboratorType: "GTI_INTERNAL_CLIENT" as const,
  },
  owner: {
    id: "research-owner",
    email: "research-owner@example.test",
    name: "Research Owner",
    role: UserRole.ADMIN,
    collaboratorType: "GTI_INTERNAL_CLIENT" as const,
  },
  coOwner: {
    id: "research-co-owner",
    email: "research-co-owner@example.test",
    name: "Research Co-owner",
    role: UserRole.COLLABORATOR,
    collaboratorType: "GTI_INTERNAL_CLIENT" as const,
  },
  executor: {
    id: "research-executor",
    email: "research-executor@example.test",
    name: "Research Executor",
    role: UserRole.COLLABORATOR,
    collaboratorType: "EXTERNAL_AGENCY" as const,
  },
  collaborator: {
    id: "research-collaborator",
    email: "research-collaborator@example.test",
    name: "Research Collaborator",
    role: UserRole.COLLABORATOR,
    collaboratorType: "EXTERNAL_VENDOR" as const,
  },
  outsider: {
    id: "research-outsider",
    email: "research-outsider@example.test",
    name: "Research Outsider",
    role: UserRole.COLLABORATOR,
    collaboratorType: "CLIENT_OF_GTI" as const,
  },
  adminOutsider: {
    id: "research-admin-outsider",
    email: "research-admin-outsider@example.test",
    name: "Research Admin Outsider",
    role: UserRole.ADMIN,
    collaboratorType: "GTI_INTERNAL_CLIENT" as const,
  },
};

async function cleanupIntegrationFixtures() {
  const userIds = [
    ...Object.values(users).map((user) => user.id),
    "research-late-collaborator",
  ];

  await prisma.project.deleteMany({
    where: {
      OR: [{ ownerId: { in: userIds } }, { createdById: { in: userIds } }],
    },
  });
  await prisma.contactDirectoryEntry.deleteMany({
    where: { createdById: { in: userIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds }, email: { endsWith: "@example.test" } },
  });
}

async function unlockStageTwo(projectId: string) {
  await prisma.projectWorkflowStage.updateMany({
    where: { projectId, stageKey: ProjectWorkflowStageKey.PROJECT_INQUIRY },
    data: { status: ProjectWorkflowStageStatus.COMPLETED, completedAt: new Date() },
  });
  await prisma.projectWorkflowStage.updateMany({
    where: {
      projectId,
      stageKey: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
    },
    data: { status: ProjectWorkflowStageStatus.AVAILABLE, unlockedAt: new Date() },
  });
}

async function mustCreateProject(name: string) {
  const result = await createProjectV2(
    { id: users.superAdmin.id },
    {
      name,
      ownerId: users.owner.id,
      coOwnerIds: [users.coOwner.id],
      executorIds: [users.executor.id],
    },
  );
  check(1, "projectId" in result, "new V2 project creation must succeed");
  await unlockStageTwo(result.projectId);
  return result.projectId;
}

async function main() {
  check(51, "error" in normalizeProjectResearchTextFileName("   "), "empty text file names must fail");
  const appendedTextName = normalizeProjectResearchTextFileName("  Market research notes  ");
  check(52, "fileName" in appendedTextName && appendedTextName.fileName === "Market research notes.txt", "text file names must be trimmed and receive .txt");
  const existingTextName = normalizeProjectResearchTextFileName("Market research notes.txt");
  check(53, "fileName" in existingTextName && existingTextName.fileName === "Market research notes.txt", "existing .txt extensions must not be duplicated");
  check(54, "error" in normalizeProjectResearchTextFileName("../unsafe.txt"), "path-like text file names must fail");
  const multilineText = "Market findings\n\nConsumers prefer UTF-8 café notes.\nhttps://example.test";
  const multilineValidation = validateProjectResearchTextContent(multilineText);
  check(55, "byteLength" in multilineValidation && multilineValidation.byteLength === new TextEncoder().encode(multilineText).byteLength, "multiline UTF-8 content must preserve its encoded byte length");
  check(56, "error" in validatePreparedProjectResearchTextFile({ fileName: "unsafe", mimeType: "text/plain", fileSize: 10 }), "prepared text uploads must require the normalized .txt name");

  await prisma.user.createMany({
    data: Object.values(users).map((user) => ({ ...user, passwordHash: "x" })),
  });

  const projectId = await mustCreateProject("Stage 2 integration project");
  await prisma.projectCollaborator.create({
    data: {
      projectId,
      userId: users.collaborator.id,
      addedById: users.superAdmin.id,
      participantType: "EXTERNAL_VENDOR",
    },
  });
  await ensureProjectResearchWorkspace(projectId, users.collaborator.id);

  const workspaces = await prisma.projectResearchWorkspace.findMany({
    where: { projectId },
    include: { folders: { orderBy: { sortOrder: "asc" } } },
  });
  check(1, workspaces.length === 4, "each distinct participant must get one workspace");
  check(2, workspaces.some((item) => item.ownerUserId === users.owner.id), "owner workspace missing");
  check(3, workspaces.some((item) => item.ownerUserId === users.coOwner.id), "co-owner workspace missing");
  check(4, workspaces.some((item) => item.ownerUserId === users.executor.id), "executor workspace missing");
  check(5, workspaces.some((item) => item.ownerUserId === users.collaborator.id), "collaborator workspace missing");
  check(6, workspaces.filter((item) => item.ownerUserId === users.executor.id).length === 1, "duplicate relations must deduplicate workspaces");

  const inquiry = await prisma.projectInquiry.create({ data: { projectId } });
  const contact = await prisma.contactDirectoryEntry.create({
    data: { name: "Manual Stage 2 Contact", createdById: users.superAdmin.id },
  });
  await prisma.projectInquiryParty.create({
    data: {
      inquiryId: inquiry.id,
      role: ProjectInquiryPartyRole.CLIENT,
      source: ProjectInquiryPartySource.MANUAL_CONTACT,
      contactId: contact.id,
      snapshotName: contact.name,
    },
  });
  check(7, !(await prisma.projectResearchWorkspace.findFirst({ where: { projectId, ownerUserId: contact.id } })), "manual contacts must not get workspaces");
  check(8, workspaces.every((item) => item.folders.length === 7), "each workspace must have seven predefined folders");
  check(9, workspaces.every((item) => item.folders.map((folder) => folder.systemKey).join("|") === PROJECT_RESEARCH_SYSTEM_FOLDERS.map((folder) => folder.key).join("|")), "system keys must match exactly");
  check(10, workspaces.every((item) => item.folders.map((folder) => folder.name).join("|") === PROJECT_RESEARCH_SYSTEM_FOLDERS.map((folder) => folder.name).join("|")), "folder business order must match exactly");
  await ensureProjectResearchWorkspace(projectId, users.owner.id);
  check(11, (await prisma.projectResearchFolder.count({ where: { workspace: { projectId, ownerUserId: users.owner.id } } })) === 7, "reinitialization must not duplicate predefined folders");

  const ownerWorkspace = workspaces.find((item) => item.ownerUserId === users.owner.id)!;
  const executorWorkspace = workspaces.find((item) => item.ownerUserId === users.executor.id)!;
  const ownerBrief = ownerWorkspace.folders.find((folder) => folder.systemKey === "BRIEF")!;
  const executorBrief = executorWorkspace.folders.find((folder) => folder.systemKey === "BRIEF")!;
  const custom = await createProjectResearchFolder(users.owner, { projectId, workspaceId: ownerWorkspace.id, name: "  Customer   Interviews " });
  check(12, "folder" in custom && custom.folder?.name === "Customer Interviews", "custom folder must persist trimmed whitespace");
  const duplicateCustom = await createProjectResearchFolder(users.owner, { projectId, workspaceId: ownerWorkspace.id, name: "customer interviews" });
  check(13, expectError(duplicateCustom), "case-insensitive custom duplicates must fail");
  const duplicateBrief = await createProjectResearchFolder(users.owner, { projectId, workspaceId: ownerWorkspace.id, name: " BRIEF " });
  check(14, expectError(duplicateBrief), "custom folders must not duplicate Brief");

  const lateUserId = "research-late-collaborator";
  await prisma.user.create({ data: { id: lateUserId, email: "research-late@example.test", name: "Late Collaborator", passwordHash: "x", role: UserRole.COLLABORATOR } });
  await prisma.projectCollaborator.create({ data: { projectId, userId: lateUserId, addedById: users.superAdmin.id, participantType: "GTI_INTERNAL_CLIENT" } });
  await ensureProjectResearchWorkspace(projectId, lateUserId);
  check(15, (await prisma.projectResearchWorkspace.findUnique({ where: { projectId_ownerUserId: { projectId, ownerUserId: lateUserId } }, include: { folders: true } }))?.folders.length === 7, "late collaborator must get a complete workspace");

  const superAdminPage = await getProjectResearchPageData(users.superAdmin, projectId);
  check(
    16,
    superAdminPage?.selectedWorkspace.ownerUserId === users.owner.id,
    `non-participant SUPER_ADMIN must default to owner workspace (actual=${superAdminPage?.selectedWorkspace.ownerUserId ?? "null"}, options=${superAdminPage?.workspaceOptions.map((item) => item.ownerUserId).join(",") ?? "none"})`,
  );
  const executorPage = await getProjectResearchPageData(users.executor, projectId);
  check(17, executorPage?.selectedWorkspace.ownerUserId === users.executor.id, "participant must default to own workspace");
  check(18, superAdminPage?.workspaceOptions.length === 5, "SUPER_ADMIN must see all current participant workspaces");
  const ownerPage = await getProjectResearchPageData(users.owner, projectId, executorWorkspace.id);
  check(19, ownerPage?.selectedWorkspace.id === executorWorkspace.id, "owner must switch to other workspaces");
  const coOwnerPage = await getProjectResearchPageData(users.coOwner, projectId, executorWorkspace.id);
  check(20, coOwnerPage?.selectedWorkspace.id === executorWorkspace.id, "co-owner must switch to other workspaces");
  const executorCross = await getProjectResearchPageData(users.executor, projectId, ownerWorkspace.id);
  check(21, executorCross?.selectedWorkspace.id === executorWorkspace.id, "executor cannot switch to another workspace");
  const collaboratorPage = await getProjectResearchPageData(users.collaborator, projectId, ownerWorkspace.id);
  check(22, collaboratorPage?.selectedWorkspace.ownerUserId === users.collaborator.id, "normal collaborator cannot switch to another workspace");
  check(23, ownerPage?.selectedWorkspace.canWrite === false && coOwnerPage?.selectedWorkspace.canWrite === false, "owner/co-owner cross-workspace view must be read-only");
  const superAdminCross = await getProjectResearchPageData(users.superAdmin, projectId, executorWorkspace.id);
  check(24, superAdminCross?.selectedWorkspace.canWrite === true, "SUPER_ADMIN must write cross-workspace");

  const upload = await requestProjectResearchFileUpload(users.executor, {
    projectId,
    folderId: executorBrief.id,
    originalFileName: "floor-plan.dwg",
    mimeType: "application/acad",
    fileSize: 512,
  });
  check(25, !("error" in upload), "own-workspace upload must be prepared");
  check(27, !("error" in upload), "generic CAD file type must be accepted");
  if ("error" in upload) throw new Error(String(upload.error));
  const completedFile = await completeProjectResearchFileUpload(users.executor, {
    projectId,
    folderId: executorBrief.id,
    attachmentId: upload.attachmentId,
  });
  check(
    49,
    completedFile?.attachmentId === upload.attachmentId &&
      completedFile.name === "floor-plan.dwg" &&
      completedFile.uploadedAt.length > 0,
    "upload completion must return the persisted gallery file metadata",
  );

  const uploadTwo = await requestProjectResearchFileUpload(users.executor, { projectId, folderId: executorBrief.id, originalFileName: "research.bundle", mimeType: "application/octet-stream", fileSize: 256 });
  check(26, !("error" in uploadTwo), "a second file in a multi-file selection must be accepted");
  if ("error" in uploadTwo) throw new Error(String(uploadTwo.error));
  const completedFileTwo = await completeProjectResearchFileUpload(users.executor, {
    projectId,
    folderId: executorBrief.id,
    attachmentId: uploadTwo.attachmentId,
  });
  check(
    50,
    completedFileTwo?.attachmentId === uploadTwo.attachmentId &&
      completedFileTwo.name === "research.bundle",
    "independently completed files must each return their own persisted record",
  );
  const association = await prisma.projectResearchFolderFile.findUnique({ where: { attachmentId: upload.attachmentId } });
  check(28, association?.folderId === executorBrief.id, "file association must target the exact folder");

  const textUpload = await requestProjectResearchFileUpload(users.executor, {
    projectId,
    folderId: executorBrief.id,
    originalFileName: "Market research notes.txt",
    mimeType: "text/plain",
    fileSize: new TextEncoder().encode(multilineText).byteLength,
  });
  check(57, !("error" in textUpload), "plain-text files must use the existing upload preparation pipeline");
  if ("error" in textUpload) throw new Error(String(textUpload.error));
  const completedTextFile = await completeProjectResearchFileUpload(users.executor, {
    projectId,
    folderId: executorBrief.id,
    attachmentId: textUpload.attachmentId,
  });
  check(58, completedTextFile?.name === "Market research notes.txt" && completedTextFile.mimeType === "text/plain", "saved text attachments must retain their .txt name and text/plain MIME type");
  const textAssociation = await prisma.projectResearchFolderFile.findUnique({ where: { attachmentId: textUpload.attachmentId } });
  check(59, textAssociation?.folderId === executorBrief.id, "saved text files must associate with the exact Stage 2 folder");
  const textFolderPage = await getProjectResearchFolderPageData(users.executor, { projectId, folderId: executorBrief.id });
  check(60, textFolderPage?.files.some((file) => file.id === textAssociation?.id && file.mimeType === "text/plain"), "saved text files must appear in the real folder file dataset");
  const textDownloadUrl = await getProjectResearchFileDownloadUrl(users.executor, { projectId, folderId: executorBrief.id, fileId: textAssociation!.id });
  check(61, textDownloadUrl.length > 0, "saved text files must use the normal secure download path");
  await deleteProjectResearchFile(users.executor, { projectId, folderId: executorBrief.id, fileId: textAssociation!.id });
  check(62, !(await prisma.projectResearchFolderFile.findUnique({ where: { id: textAssociation!.id } })), "authorized users must delete created text files normally");

  const foreignProjectId = await mustCreateProject("Stage 2 foreign project");
  const foreignOwnerWorkspace = await prisma.projectResearchWorkspace.findUniqueOrThrow({ where: { projectId_ownerUserId: { projectId: foreignProjectId, ownerUserId: users.owner.id } }, include: { folders: true } });
  let crossProjectRejected = false;
  try { await completeProjectResearchFileUpload(users.superAdmin, { projectId: foreignProjectId, folderId: foreignOwnerWorkspace.folders[0].id, attachmentId: upload.attachmentId }); } catch { crossProjectRejected = true; }
  check(29, crossProjectRejected, "cross-project attachment injection must fail");
  let crossWorkspaceRejected = false;
  try { await requestProjectResearchFileUpload(users.executor, { projectId, folderId: ownerBrief.id, originalFileName: "blocked.txt", mimeType: "text/plain", fileSize: 1 }); } catch { crossWorkspaceRejected = true; }
  check(30, crossWorkspaceRejected, "unauthorized cross-workspace upload must fail");

  const refreshedExecutor = await getProjectResearchPageData(users.executor, projectId);
  check(31, refreshedExecutor?.folders.find((folder) => folder.id === executorBrief.id)?.fileCount === 2, "real READY file count must update");
  const folderPage = await getProjectResearchFolderPageData(users.executor, { projectId, folderId: executorBrief.id });
  check(32, folderPage?.files.length === 2 && folderPage.files[0].name && folderPage.files[0].uploadedBy && folderPage.files[0].uploadedAt, "file list must return real metadata");
  const downloadUrl = await getProjectResearchFileDownloadUrl(users.owner, { projectId, folderId: executorBrief.id, fileId: association!.id });
  check(33, typeof downloadUrl === "string" && downloadUrl.length > 0, "authorized cross-workspace download must succeed");
  let unauthorizedDownload = false;
  try { await getProjectResearchFileDownloadUrl(users.outsider, { projectId, folderId: executorBrief.id, fileId: association!.id }); } catch { unauthorizedDownload = true; }
  check(34, unauthorizedDownload, "unauthorized download must fail");
  let unauthorizedDelete = false;
  try { await deleteProjectResearchFile(users.owner, { projectId, folderId: executorBrief.id, fileId: association!.id }); } catch { unauthorizedDelete = true; }
  check(36, unauthorizedDelete, "read-only cross-workspace delete must fail");
  await deleteProjectResearchFile(users.superAdmin, { projectId, folderId: executorBrief.id, fileId: association!.id });
  check(35, !(await prisma.projectResearchFolderFile.findUnique({ where: { id: association!.id } })) && (await prisma.projectAttachment.findUniqueOrThrow({ where: { id: upload.attachmentId } })).status === AttachmentStatus.DELETED, "authorized delete must remove association and mark attachment deleted");

  check(37, refreshedExecutor?.folders.every((folder) => Number.isInteger(folder.fileCount)), "folder cards must receive real database counts");
  const refreshedOwner = await getProjectResearchPageData(users.owner, projectId);
  check(38, refreshedOwner?.folders.some((folder) => folder.name === "Customer Interviews"), "custom folder must survive refresh");
  check(39, (await getProjectResearchPageData(users.owner, projectId, executorWorkspace.id))?.selectedWorkspace.id === executorWorkspace.id, "workspace query selection must survive refresh");

  const zeroFileProjectId = await mustCreateProject("Stage 2 zero file completion");
  const zeroCompletion = await completeProjectResearchStage(users.superAdmin, zeroFileProjectId);
  check(40, "success" in zeroCompletion && !zeroCompletion.alreadyCompleted, "Stage 2 must complete with zero files and report a new completion");
  const zeroStages = await prisma.projectWorkflowStage.findMany({ where: { projectId: zeroFileProjectId } });
  check(41, zeroStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING)?.status === ProjectWorkflowStageStatus.COMPLETED, "completion must mark Stage 2 complete");
  check(42, zeroStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION)?.status === ProjectWorkflowStageStatus.AVAILABLE, "completion must unlock Stage 3");
  const laterStageKeys = new Set<ProjectWorkflowStageKey>([ProjectWorkflowStageKey.PROJECT_DEVELOPMENT, ProjectWorkflowStageKey.FINAL_LAYOUT, ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER, ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION]);
  check(43, zeroStages.filter((stage) => laterStageKeys.has(stage.stageKey)).every((stage) => stage.status === ProjectWorkflowStageStatus.LOCKED), "Stage 4-7 must remain locked");

  const lockedProject = await prisma.project.create({ data: { name: "Locked Stage 2", ownerId: users.owner.id, createdById: users.superAdmin.id, workflowStages: { createMany: { data: getInitialProjectWorkflowStageData() } } } });
  const lockedResult = await completeProjectResearchStage(users.superAdmin, lockedProject.id);
  const lockedStages = await prisma.projectWorkflowStage.findMany({ where: { projectId: lockedProject.id } });
  check(44, expectError(lockedResult) && lockedStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING)?.status === ProjectWorkflowStageStatus.LOCKED && lockedStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION)?.status === ProjectWorkflowStageStatus.LOCKED, "failed completion must not corrupt workflow state");
  const firstStageTwo = zeroStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING)!;
  const firstStageThree = zeroStages.find((stage) => stage.stageKey === ProjectWorkflowStageKey.CONCEPT_CREATION)!;
  const repeatedCompletion = await completeProjectResearchStage(users.superAdmin, zeroFileProjectId);
  const repeatedStages = await prisma.projectWorkflowStage.findMany({ where: { projectId: zeroFileProjectId } });
  check(45, "success" in repeatedCompletion && repeatedCompletion.alreadyCompleted && repeatedStages.find((stage) => stage.stageKey === firstStageTwo.stageKey)?.completedAt?.getTime() === firstStageTwo.completedAt?.getTime() && repeatedStages.find((stage) => stage.stageKey === firstStageThree.stageKey)?.unlockedAt?.getTime() === firstStageThree.unlockedAt?.getTime(), "repeated completion must report the completed state and preserve timestamps");
  check(46, Boolean(await getProjectResearchPageData(users.owner, zeroFileProjectId)), "completed Stage 2 must remain openable");
  check(47, (await prisma.projectStage.count({ where: { projectId: { in: [projectId, zeroFileProjectId] } } })) === 0, "Stage 2 must not create legacy ProjectStage rows");
  check(48, !Object.keys(prisma).some((key) => /task|vendor/i.test(key)), "Stage 2 must not add task/chat/vendor-specific models");
  check(30, (await getProjectResearchPageData(users.adminOutsider, projectId)) === null, "ADMIN role alone must not gain Stage 2 access");

  console.log("Stage 2 database integration checks 1-62 passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupIntegrationFixtures();
    await prisma.$disconnect();
  });

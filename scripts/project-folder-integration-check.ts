import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";
import { createProjectResearchFolder, ensureCanonicalProjectResearchWorkspace, getProjectResearchFolderPageData, getProjectResearchPageData } from "../src/lib/project-research";
import { assertResearchFolderReadAccess, assertResearchFolderWriteAccess } from "../src/lib/project-research-access";
import { completeProjectResearchFileUpload, deleteProjectResearchFolder, requestProjectResearchFileUpload } from "../src/lib/project-research-files";
import { createProjectPrivateSubfolder, deleteProjectPrivateSubfolder, ensureProjectPrivateFolder, getProjectPrivateFolderPageData, requestProjectPrivateFileUpload } from "../src/lib/project-private-folders";
import { getProjectResearchImportOptions, importProjectInquiryContent } from "../src/lib/project-research-import";

const prefix = `folder-test-${randomUUID()}`;
const makeUser = (name: string, role: UserRole = UserRole.USER) => ({ id: `${prefix}-${name}`, email: `${prefix}-${name}@example.test`, name, role });
// Verify project authority independently of the account's global role.
const owner = makeUser("owner"), coOwner = makeUser("coowner"), reader = makeUser("reader"), outsider = makeUser("outsider", UserRole.ADMIN);
const projectId = `${prefix}-project`, otherProjectId = `${prefix}-other`;
const removedObjects: string[] = [];
// Keep S3 isolated while testing real database constraints and services.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storage = require("../src/lib/storage/s3") as typeof import("../src/lib/storage/s3");
storage.deleteObjectIfNeeded = async (key: string) => { removedObjects.push(key); };

async function createChild(parentFolderId: string, name: string, user = owner) {
  const result = await createProjectResearchFolder(user, { projectId, parentFolderId, name });
  assert.ok("folder" in result && result.folder, JSON.stringify(result));
  return result.folder;
}

async function main() {
  for (const user of [owner, coOwner, reader, outsider]) await prisma.user.create({ data: { ...user, passwordHash: "test" } });
  for (const id of [projectId, otherProjectId]) {
    await prisma.project.create({ data: {
      id, name: "Nested folders", ownerId: owner.id, createdById: owner.id,
      coOwners: { create: { userId: coOwner.id } }, executors: { create: { userId: reader.id } },
      inquiry: { create: { initialBrief: "<p>Subfolder brief</p>" } },
      workflowStages: { createMany: { data: getInitialProjectWorkflowStageData(new Date()).map((stage) => ({ ...stage, status: stage.stageKey === "PROJECT_RESEARCH_AND_PLANNING" ? "AVAILABLE" as const : stage.status })) } },
    } });
    await ensureCanonicalProjectResearchWorkspace(id);
  }
  const roots = await prisma.projectResearchFolder.findMany({ where: { workspace: { projectId } } });
  const brief = roots.find((folder) => folder.systemKey === "BRIEF")!;
  const finance = roots.find((folder) => folder.systemKey === "FINANCE")!;
  const otherRoot = await prisma.projectResearchFolder.findFirstOrThrow({ where: { workspace: { projectId: otherProjectId } } });
  const references = await createChild(brief.id, "References");
  const interviews = await createChild(references.id, "Interviews", coOwner);
  const notes = await createChild(interviews.id, "Notes");
  const financeReferences = await createChild(finance.id, "References", coOwner);
  for (const input of [
    { projectId, parentFolderId: brief.id, name: "  REFERENCES  " },
    { projectId, name: "Brief" },
    { projectId, parentFolderId: otherRoot.id, name: "Foreign" },
    { projectId, parentFolderId: notes.id, name: " " },
    { projectId, parentFolderId: notes.id, name: "a".repeat(121) },
  ]) assert.ok("error" in await createProjectResearchFolder(owner, input));
  assert.ok("error" in await createProjectResearchFolder(reader, { projectId, parentFolderId: brief.id, name: "Forbidden" }));
  const concurrent = await Promise.all([createProjectResearchFolder(owner, { projectId, parentFolderId: references.id, name: "Concurrent" }), createProjectResearchFolder(coOwner, { projectId, parentFolderId: references.id, name: "concurrent" })]);
  assert.equal(concurrent.filter((result) => "folder" in result).length, 1);
  await assert.rejects(() => prisma.projectResearchFolder.create({ data: { workspaceId: brief.workspaceId, parentFolderId: otherRoot.id, name: "Invalid", normalizedName: "invalid" } }));
  assert.equal((await getProjectResearchPageData(owner, projectId))?.folders.length, roots.length, "Landing page lists only roots");
  assert.deepEqual((await getProjectResearchFolderPageData(coOwner, { projectId, folderId: notes.id }))?.ancestors.map((folder) => folder.name), ["Brief", "References", "Interviews"]);
  assert.equal((await getProjectResearchFolderPageData(owner, { projectId, folderId: brief.id }))?.folders[0].id, references.id);
  await assertResearchFolderReadAccess(reader, { projectId, folderId: notes.id });
  await assert.rejects(() => assertResearchFolderWriteAccess(reader, { projectId, folderId: notes.id }));
  await assert.rejects(() => assertResearchFolderReadAccess(reader, { projectId, folderId: financeReferences.id }));
  const upload = await requestProjectResearchFileUpload(coOwner, { projectId, folderId: notes.id, originalFileName: "Notes.txt", mimeType: "text/plain", fileSize: 3 });
  assert.ok("attachmentId" in upload && upload.attachmentId);
  await completeProjectResearchFileUpload(coOwner, { projectId, folderId: notes.id, attachmentId: upload.attachmentId });
  const target = { projectId, folderId: interviews.id };
  const option = (await getProjectResearchImportOptions(owner, target)).find((item) => item.title === "Initial Brief")!;
  const imported = await importProjectInquiryContent(owner, { ...target, itemIds: [option.id] }, {
    bucket: () => "folder-test", copy: async () => undefined, write: async () => undefined, remove: async () => undefined,
  });
  assert.equal(imported.files.length, 1);
  assert.equal((await getProjectResearchFolderPageData(reader, target))?.files.length, 1);
  assert.ok("error" in await deleteProjectResearchFolder(reader, { projectId, folderId: references.id }));
  await prisma.project.update({ where: { id: projectId }, data: { completedAt: new Date() } });
  assert.ok("error" in await createProjectResearchFolder(coOwner, { projectId, parentFolderId: notes.id, name: "Completed" }));
  await prisma.project.update({ where: { id: projectId }, data: { completedAt: null } });
  await prisma.projectWorkflowStage.updateMany({ where: { projectId, stageKey: "PROJECT_RESEARCH_AND_PLANNING" }, data: { status: "LOCKED" } });
  assert.ok("error" in await createProjectResearchFolder(owner, { projectId, parentFolderId: notes.id, name: "Locked" }));
  await prisma.projectWorkflowStage.updateMany({ where: { projectId, stageKey: "PROJECT_RESEARCH_AND_PLANNING" }, data: { status: "AVAILABLE" } });

  const privateRoot = await ensureProjectPrivateFolder(projectId, owner.id);
  assert.ok((await Promise.all([ensureProjectPrivateFolder(projectId, owner.id), ensureProjectPrivateFolder(projectId, owner.id)])).every((root) => root.id === privateRoot.id));
  const privateChild = await createProjectPrivateSubfolder(owner, { projectId, parentFolderId: privateRoot.id, name: "References" });
  assert.ok("folder" in privateChild && privateChild.folder);
  const privateLeaf = await createProjectPrivateSubfolder(owner, { projectId, parentFolderId: privateChild.folder.id, name: "Notes" });
  assert.ok("folder" in privateLeaf && privateLeaf.folder);
  assert.ok("error" in await createProjectPrivateSubfolder(owner, { projectId, parentFolderId: privateRoot.id, name: "references" }));
  assert.equal((await getProjectResearchPageData(owner, projectId))?.myPrivateFolder?.href, `/projects/${projectId}/workspace/private/${privateRoot.id}`);
  assert.deepEqual((await getProjectPrivateFolderPageData(owner, { projectId, folderId: privateLeaf.folder.id })).ancestors.map((folder) => folder.name), ["My Private Folder", "References"]);
  const privateChildId = privateChild.folder.id, privateLeafId = privateLeaf.folder.id;
  for (const user of [coOwner, reader, outsider]) {
    await assert.rejects(() => getProjectPrivateFolderPageData(user, { projectId, folderId: privateLeafId }));
    await assert.rejects(() => createProjectPrivateSubfolder(user, { projectId, parentFolderId: privateChildId, name: "Forbidden" }));
    await assert.rejects(() => deleteProjectPrivateSubfolder(user, { projectId, folderId: privateChildId }));
  }
  await assert.rejects(() => createProjectPrivateSubfolder(owner, { projectId: otherProjectId, parentFolderId: privateRoot.id, name: "Foreign" }));
  await assert.rejects(() => prisma.projectPrivateFolder.create({ data: { projectId, ownerUserId: coOwner.id, parentFolderId: privateRoot.id, name: "Invalid", normalizedName: "invalid" } }));
  const privateUpload = await requestProjectPrivateFileUpload(owner, { projectId, folderId: privateLeafId, originalFileName: "Private.txt", mimeType: "text/plain", fileSize: 3, createdTextFile: true });
  assert.ok("attachmentId" in privateUpload && privateUpload.attachmentId);
  assert.ok("error" in await deleteProjectPrivateSubfolder(owner, { projectId, folderId: privateRoot.id }));
  await deleteProjectPrivateSubfolder(owner, { projectId, folderId: privateChildId });
  assert.equal(await prisma.projectPrivateFolder.count({ where: { projectId, ownerUserId: owner.id } }), 1);
  assert.equal(await prisma.projectAttachment.count({ where: { projectId, assetType: "PROJECT_PRIVATE_FILE", status: { not: "DELETED" } } }), 0);
  await deleteProjectResearchFolder(coOwner, { projectId, folderId: references.id });
  assert.equal(await prisma.projectResearchFolder.count({ where: { id: { in: [references.id, interviews.id, notes.id] } } }), 0);
  assert.ok(await prisma.projectResearchFolder.findUnique({ where: { id: financeReferences.id } }));
  assert.equal(await prisma.projectAttachment.count({ where: { projectId, assetType: "PROJECT_RESEARCH_FILE", status: { not: "DELETED" } } }), 0);
  assert.ok(removedObjects.length >= 3, "Subtree deletion cleans up all stored files");
  console.log("Nested folder creation, breadcrumbs, inherited access, imports, uploads, uniqueness, privacy and deletion passed.");
}

main().finally(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner.id, coOwner.id, reader.id, outsider.id] } } });
  await prisma.$disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });

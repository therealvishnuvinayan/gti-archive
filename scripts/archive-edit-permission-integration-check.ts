import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as auth from "../src/lib/auth";
import {
  saveArchiveCategoryAction,
  setArchiveCategoryStatusAction,
  deleteArchiveCategoryAction,
  saveProjectCategoryAction,
} from "../src/app/(dashboard)/settings/project-master-data/actions";
import { hasPermission, getArchiveAccessLevel, canUseArchives } from "../src/lib/permissions/resolver";
import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  UserRole,
} from "@prisma/client";

import { getActiveArchiveCategoryOptions, getArchiveCategoryBySlug } from "../src/lib/archive-categories";
import type { ArchiveArtworkMetadataDraft } from "../src/lib/archive-artwork-metadata";
import {
  listArchivedFilesByCategory,
  listArchiveCategorySummaries,
  searchArchivesForUser,
  getArchivedFileDownloadUrlForUser,
  getArchivedFilePreviewUrlForUser,
  createArchiveFileShareLink,
  deleteArchivedFileForUser,
  requestArchiveFileUpload,
  completeArchiveFileUpload,
  canManageArchiveCategoryAccess,
  updateArchivedFileInformation,
} from "../src/lib/archives";
import type { PermissionKey } from "../src/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "../src/lib/permissions/profiles";
import { prisma } from "../src/lib/prisma";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Archive edit integration check failed: ${message}`);
  }
}

async function expectDenied(task: Promise<unknown>, message: string) {
  try {
    await task;
  } catch {
    return;
  }

  throw new Error(`Archive edit integration check failed: ${message}`);
}

function snapshot(
  permissions: Iterable<PermissionKey>,
  archiveAccessLevel: "NONE" | "PARTIAL" | "FULL",
): PermissionProfileSnapshot {
  const permissionSet = new Set(permissions);

  return {
    effectivePermissions: permissionSet,
    rolePermissions: permissionSet,
    archiveAccessGranted: archiveAccessLevel !== "NONE",
    archiveAccessLevel,
  };
}

function metadataDraft(runId: string, titleWorkingName: string) {
  const date = "2026-08-18";

  return {
    artworkId: `ARCHIVE-EDIT-${runId}`,
    titleWorkingName,
    versionRevision: "v1",
    languageMarket: "English / UAE",
    artworkType: "Packaging",
    brandSubBrand: "Archive Edit Brand",
    productSku: "SKU-001",
    campaignProject: "Archive edit permission check",
    formatDimensions: "A4",
    colourSpace: "CMYK",
    resolution: "300 DPI",
    fileFormats: "PDF",
    printProcess: "Digital",
    specialFinishes: "None",
    creationDate: date,
    lastModifiedDate: date,
    goLiveOnShelfDate: "",
    expirySunsetDate: "",
    archiveStatus: "Archived",
    createdByName: "Archive Edit Creator",
    approvedByName: "Archive Edit Approver",
    approvedAt: date,
    clientBrandOwner: "Archive Edit Owner",
    regulatoryClearance: "Approved",
    fontsUsed: "Inter",
    imagesPhotography: "None",
    illustrationsIcons: "None",
    colourCodes: "CMYK",
    thirdPartyLogosIp: "",
    supplierPrinter: "Test Printer",
    outputFilesList: "archive-edit.pdf",
    printProofRef: "",
    packagingDielineRef: "",
    changeLog: "Archive edit permission integration check.",
    relatedArtworks: "",
    briefSpecLink: "",
    generalNotes: "",
  } satisfies ArchiveArtworkMetadataDraft;
}

async function main() {
  const deletedKeys: string[] = [];
  // Never contact AWS. URL signing runs locally with the runner's dummy credentials.
  S3Client.prototype.send = (async (command: unknown) => {
    check(command instanceof DeleteObjectCommand, "only mocked object deletion may call AWS");
    deletedKeys.push(command.input.Key!);
    return {};
  }) as typeof S3Client.prototype.send;
  const runId = randomUUID();
  const ids = {
    user: `archive-edit-user-${runId}`,
    admin: `archive-edit-admin-${runId}`,
    superAdmin: `archive-edit-super-admin-${runId}`,
    category: `archive-edit-category-${runId}`,
    accessibleFile: `archive-edit-accessible-${runId}`,
    inaccessibleFile: `archive-edit-inaccessible-${runId}`,
    project: `archive-edit-project-${runId}`,
    projectAttachment: `archive-edit-project-attachment-${runId}`,
    projectArchive: `archive-edit-project-archive-${runId}`,
    projectFile: `archive-edit-project-file-${runId}`,
  };
  const categorySlug = `archive-edit-${runId}`;
  const userIds = [ids.user, ids.admin, ids.superAdmin];

  try {
    await prisma.user.createMany({
      data: [
        { id: ids.user, role: UserRole.USER },
        { id: ids.admin, role: UserRole.ADMIN },
        { id: ids.superAdmin, role: UserRole.SUPER_ADMIN },
      ].map((user) => ({
        ...user,
        email: `${user.id}@example.test`,
        name: user.id,
        passwordHash: "archive-edit-integration-only",
      })),
    });
    await prisma.archiveCategory.create({
      data: {
        id: ids.category,
        name: `Archive Edit ${runId}`,
        slug: categorySlug,
      },
    });
    await prisma.archiveCategoryAccess.create({
      data: { archiveCategoryId: ids.category, userId: ids.admin },
    });
    await prisma.manualArchiveFile.createMany({
      data: [
        {
          id: ids.accessibleFile,
          fileName: "archive-edit-accessible.pdf",
          originalFileName: "archive-edit-accessible.pdf",
          storageKey: `archive-edit/${runId}/accessible.pdf`,
        },
        {
          id: ids.inaccessibleFile,
          fileName: "archive-edit-inaccessible.pdf",
          originalFileName: "archive-edit-inaccessible.pdf",
          storageKey: `archive-edit/${runId}/inaccessible.pdf`,
        },
      ].map((file) => ({
        ...file,
        archiveCategoryId: ids.category,
        mimeType: "application/pdf",
        fileSize: 128,
        bucket: "archive-edit-integration",
        status: AttachmentStatus.READY,
        uploadedById: ids.admin,
      })),
    });
    await prisma.project.create({
      data: {
        id: ids.project,
        name: `Archive Edit Project ${runId}`,
        ownerId: ids.admin,
        createdById: ids.admin,
      },
    });
    await prisma.projectAttachment.create({
      data: {
        id: ids.projectAttachment,
        projectId: ids.project,
        uploadedById: ids.admin,
        fileName: "archive-edit-project.pdf",
        originalFileName: "archive-edit-project.pdf",
        mimeType: "application/pdf",
        fileSize: 128,
        bucket: "archive-edit-integration",
        storageKey: `archive-edit/${runId}/project-source.pdf`,
        assetType: AttachmentAssetType.FINAL_ARCHIVE,
        status: AttachmentStatus.READY,
      },
    });
    await prisma.projectArchive.create({
      data: {
        id: ids.projectArchive,
        projectId: ids.project,
        archivedById: ids.admin,
        projectName: `Archive Edit Project ${runId}`,
        projectCategory: "Archive Edit Category",
        archiveCategoryId: ids.category,
        archivedAt: new Date(),
      },
    });
    await prisma.archivedProjectFile.create({
      data: {
        id: ids.projectFile,
        archiveId: ids.projectArchive,
        projectId: ids.project,
        sourceAttachmentId: ids.projectAttachment,
        finalArchiveFileName: "archive-edit-project.pdf",
        originalFileName: "archive-edit-project.pdf",
        mimeType: "application/pdf",
        fileSize: 128,
        bucket: "archive-edit-integration",
        storageKey: `archive-edit/${runId}/project-source.pdf`,
        archivedById: ids.admin,
        archivedAt: new Date(),
      },
    });
    await prisma.archiveArtworkMetadata.create({
      data: {
        sourceType: "DIRECT_UPLOAD",
        manualArchiveFileId: ids.accessibleFile,
        ...metadataDraft(runId, "Original Archive Title"),
        creationDate: new Date("2026-08-18T00:00:00.000Z"),
        lastModifiedDate: new Date("2026-08-18T00:00:00.000Z"),
        approvedAt: new Date("2026-08-18T00:00:00.000Z"),
        goLiveOnShelfDate: null,
        expirySunsetDate: null,
        createdByUserId: ids.admin,
        approvedByUserId: ids.admin,
        archivedById: ids.admin,
      },
    });
    await prisma.userArchiveAccess.create({
      data: {
        userId: ids.user,
        level: "PARTIAL",
        grantedById: ids.admin,
      },
    });
    await prisma.userArchiveAssetAccess.create({
      data: {
        userId: ids.user,
        manualArchiveFileId: ids.accessibleFile,
        grantedById: ids.admin,
      },
    });
    await prisma.userArchiveAssetAccess.create({
      data: {
        userId: ids.user,
        archivedProjectFileId: ids.projectFile,
        grantedById: ids.admin,
      },
    });

    const normalUser = {
      id: ids.user,
      role: UserRole.USER,
      email: `${ids.user}@example.test`,
      name: "Archive Edit USER",
      permissionProfileSnapshot: snapshot(["archive.view"], "PARTIAL"),
    };
    const admin = {
      id: ids.admin,
      role: UserRole.ADMIN,
      email: `${ids.admin}@example.test`,
      name: "Archive Edit ADMIN",
    };
    const superAdmin = {
      id: ids.superAdmin,
      role: UserRole.SUPER_ADMIN,
      email: `${ids.superAdmin}@example.test`,
      name: "Archive Edit SUPER_ADMIN",
    };
    const category = await getArchiveCategoryBySlug(categorySlug);
    check(category, "the Archive category fixture must exist");

    const initialListing = await listArchivedFilesByCategory(normalUser, category);
    check(
      initialListing.some((file) => file.id === ids.accessibleFile) &&
        initialListing.some((file) => file.id === ids.projectFile) &&
        initialListing.some((file) => file.id === ids.inaccessibleFile),
      "legacy partial access must not restrict Archive items",
    );

    const userUpdate = await updateArchivedFileInformation(normalUser, {
      archivedFileId: ids.accessibleFile,
      finalArchiveFileName: "archive-edit-user-renamed.pdf",
      artworkMetadata: metadataDraft(runId, "USER Updated Archive Title"),
    });
    check(
      userUpdate.finalArchiveFileName === "archive-edit-user-renamed.pdf" &&
        userUpdate.artworkMetadata?.titleWorkingName ===
          "USER Updated Archive Title",
      "a normal USER must rename and edit metadata for an accessible Archive item",
    );

    const projectFileUpdate = await updateArchivedFileInformation(normalUser, {
      archivedFileId: ids.projectFile,
      finalArchiveFileName: "archive-edit-project-user-renamed.pdf",
    });
    check(
      projectFileUpdate.finalArchiveFileName ===
        "archive-edit-project-user-renamed.pdf",
      "a normal USER with an explicit asset grant must edit an accessible project Archive file",
    );

    const fullScopeNonMember = {
      ...normalUser,
      permissionProfileSnapshot: snapshot(["archive.view"], "FULL"),
    };
    await updateArchivedFileInformation(fullScopeNonMember, {
      archivedFileId: ids.projectFile,
      finalArchiveFileName: "cross-project-rename.pdf",
    });
    await updateArchivedFileInformation(normalUser, {
      archivedFileId: ids.inaccessibleFile,
      finalArchiveFileName: "ungranted-user-rename.pdf",
    });

    const restrictedUser = { ...normalUser, permissionProfileSnapshot: snapshot([], "NONE") };
    for (const actor of [restrictedUser, admin, superAdmin].map((actor) => ({
      ...actor, permissionProfileSnapshot: snapshot([], "NONE"),
    }))) {
      check(canUseArchives(actor) && getArchiveAccessLevel(actor) === "FULL", "every role has full Archives access");
      check(canManageArchiveCategoryAccess(actor), "every role can manage categories");
      check(hasPermission(actor, "archive.view") && hasPermission(actor, "archive.uploadFile") && hasPermission(actor, "archive.download"), "every Archive permission is enabled");
      const options = await getActiveArchiveCategoryOptions(actor);
      check(options.some((option) => option.id === ids.category), "restricted categories are available in upload options");
      const summaries = await listArchiveCategorySummaries(actor);
      check(summaries.some((item) => item.id === ids.category && item.fileCount === 3), "all categories and their file counts are visible");
      for (const id of [ids.projectFile, ids.inaccessibleFile]) {
        check((await getArchivedFileDownloadUrlForUser(actor, id)).includes("X-Amz-Signature"), "cross-project and manual downloads are allowed");
        check((await getArchivedFilePreviewUrlForUser(actor, id)).includes("X-Amz-Signature"), "cross-project and manual previews are allowed");
        const link = await createArchiveFileShareLink(actor, { archivedFileId: id, expiryDays: 1 });
        check(link.sharePath.startsWith("/archive-download/"), "any user can share any archive file");
      }
      const search = await searchArchivesForUser({ user: actor, query: `Archive Edit Project ${runId}` });
      check(search.results.some((result) => result.id === ids.projectArchive), "cross-project Archives are searchable");
    }
    check(!hasPermission(restrictedUser, "settings.manageMasterData"), "Archive access must not grant other settings access");
    check(!hasPermission(restrictedUser, "library.view"), "Archive access must not grant Library access");
    const originalRequireUser = auth.requireUser;
    Object.assign(auth, { requireUser: async () => restrictedUser });
    try {
      const created = await saveArchiveCategoryAction({
        name: `Shared management ${runId}`, slug: `shared-management-${runId}`,
        isActive: true, allowedUserIds: [ids.admin],
      });
      check("item" in created && created.item, "users can create archive categories without settings permissions");
      check(await prisma.archiveCategoryAccess.count({ where: { archiveCategoryId: created.item.id } }) === 0, "category restrictions cannot be reinstated");
      const edited = await saveArchiveCategoryAction({
        id: created.item.id, name: `Edited shared management ${runId}`,
        slug: `shared-management-${runId}`, isActive: true,
      });
      check("success" in edited, "users can edit archive categories");
      await setArchiveCategoryStatusAction({ id: created.item.id, isActive: false });
      check((await prisma.archiveCategory.findUnique({ where: { id: created.item.id } }))?.isActive === false, "users can deactivate archive categories");
      const deleted = await deleteArchiveCategoryAction(created.item.id);
      check("success" in deleted && await prisma.archiveCategory.count({ where: { id: created.item.id } }) === 0, "users can delete unused archive categories");
      await expectDenied(saveProjectCategoryAction({ name: "Unrelated settings probe", isActive: true }), "users must not gain unrelated master-data permissions");
    } finally {
      Object.assign(auth, { requireUser: originalRequireUser });
    }
    await expectDenied(getArchivedFileDownloadUrlForUser({ ...restrictedUser, id: "" }, ids.projectFile), "anonymous downloads remain denied");
    await expectDenied(deleteArchivedFileForUser({ ...restrictedUser, id: "" }, ids.projectFile), "anonymous deletion remains denied");
    await expectDenied(updateArchivedFileInformation(restrictedUser, { archivedFileId: ids.projectFile, finalArchiveFileName: "bad-name.exe" }), "file extension validation remains enforced");
    const upload = await requestArchiveFileUpload(restrictedUser, {
      archiveCategoryId: ids.category, fileName: "user-upload.pdf", originalFileName: "user-upload.pdf", mimeType: "application/pdf", fileSize: 128,
    });
    check("archiveFileId" in upload && upload.archiveFileId, "a user with no saved permissions can upload in a restricted category");
    await completeArchiveFileUpload(restrictedUser, upload.archiveFileId, { artworkMetadata: metadataDraft(runId, "User Upload") });
    const uploadRecord = await prisma.manualArchiveFile.findUnique({ where: { id: upload.archiveFileId } });
    check(uploadRecord?.status === AttachmentStatus.READY, "user upload completion succeeds");
    await deleteArchivedFileForUser(admin, upload.archiveFileId);
    check(deletedKeys.includes(uploadRecord.storageKey), "unshared archive objects are removed from storage");

    const adminUpdate = await updateArchivedFileInformation(admin, {
      archivedFileId: ids.inaccessibleFile,
      finalArchiveFileName: "archive-edit-admin-renamed.pdf",
    });
    check(
      adminUpdate.finalArchiveFileName === "archive-edit-admin-renamed.pdf",
      "ADMIN must retain Archive editing",
    );

    const superAdminUpdate = await updateArchivedFileInformation(superAdmin, {
      archivedFileId: ids.accessibleFile,
      finalArchiveFileName: "archive-edit-super-admin-renamed.pdf",
      artworkMetadata: metadataDraft(runId, "SUPER_ADMIN Updated Archive Title"),
    });
    check(
      superAdminUpdate.finalArchiveFileName ===
        "archive-edit-super-admin-renamed.pdf" &&
        superAdminUpdate.artworkMetadata?.titleWorkingName ===
          "SUPER_ADMIN Updated Archive Title",
      "SUPER_ADMIN must retain Archive editing",
    );

    const persistedFiles = await prisma.manualArchiveFile.findMany({
      where: { id: { in: [ids.accessibleFile, ids.inaccessibleFile] } },
      include: { artworkMetadata: true },
    });
    const persistedAccessible = persistedFiles.find(
      (file) => file.id === ids.accessibleFile,
    );
    const persistedInaccessible = persistedFiles.find(
      (file) => file.id === ids.inaccessibleFile,
    );
    check(
      persistedAccessible?.fileName === "archive-edit-super-admin-renamed.pdf" &&
        persistedAccessible.artworkMetadata?.titleWorkingName ===
          "SUPER_ADMIN Updated Archive Title",
      "authorized filename and metadata edits must persist",
    );
    check(
      persistedInaccessible?.fileName === "archive-edit-admin-renamed.pdf",
      "admin edits still persist",
    );
    const persistedProjectFile = await prisma.archivedProjectFile.findUnique({
      where: { id: ids.projectFile },
      select: { finalArchiveFileName: true },
    });
    check(
      persistedProjectFile?.finalArchiveFileName ===
        "cross-project-rename.pdf",
      "cross-project edits must persist",
    );

    const updatedListing = await listArchivedFilesByCategory(normalUser, category);
    check(
      updatedListing.some(
        (file) =>
          file.id === ids.accessibleFile &&
          file.finalArchiveFileName === "archive-edit-super-admin-renamed.pdf",
      ),
      "Archive listing must continue working after edits",
    );

    await deleteArchivedFileForUser(restrictedUser, ids.projectFile);
    check(await prisma.projectAttachment.count({ where: { id: ids.projectAttachment } }) === 1, "deleting an Archive copy preserves the original attachment");
    check(!deletedKeys.includes(`archive-edit/${runId}/project-source.pdf`), "shared project storage is preserved");
    await deleteArchivedFileForUser(restrictedUser, ids.inaccessibleFile);
    check(await prisma.archiveFileShareLink.count({ where: { OR: [{ archivedProjectFileId: ids.projectFile }, { manualArchiveFileId: ids.inaccessibleFile }] } }) === 0, "deleted archive share links are removed");
    const afterDeletion = await listArchivedFilesByCategory(restrictedUser, category);
    check(afterDeletion.length === 1 && afterDeletion[0].id === ids.accessibleFile, "deleted Archive entries disappear from the list");
    console.log("Archive full-access integration checks passed: all roles, restricted profiles/categories, cross-project files, search, upload, edit, preview, download, share, deletion, and source-file preservation.");
  } finally {
    await prisma.project.deleteMany({ where: { id: ids.project } });
    await prisma.manualArchiveFile.deleteMany({
      where: { id: { in: [ids.accessibleFile, ids.inaccessibleFile] } },
    });
    await prisma.archiveCategory.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { randomUUID } from "node:crypto";

import {
  Prisma,
  ProjectCompletionDocumentType,
  ProjectCompletionStepStatus,
  SubmissionReviewStatus,
  type User,
} from "@prisma/client";

import { getUserDisplayName } from "@/lib/auth";
import {
  notifyApprovalProofUploaded,
  notifyCopyrightDocumentUploaded,
  notifyInvoiceUploaded,
  runNotificationTask,
} from "@/lib/notification-center";
import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import type { PermissionKey } from "@/lib/permissions/definitions";
import { assertProjectAccess } from "@/lib/project-history";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  buildProjectCompletionDocumentKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadUrl,
  getFileExtension,
  getMaxAssetUploadBytes,
  getS3BucketName,
  isAllowedProjectCompletionDocument,
  sanitizeFileName,
} from "@/lib/storage/s3";

export type ProjectCompletionWorkflowUser = Pick<
  User,
  "id" | "role" | "email" | "name" | "projectAccess" | "collaboratorType"
> &
  PermissionUser;

export type ProjectCompletionContactOption = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
};

export type ProjectCompletionArchivedFileOption = {
  id: string;
  finalArchiveFileName: string;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  sourceLabel: string;
  previewPath: string;
  downloadPath: string;
};

export type ProjectCompletionDocumentRecord = {
  id: string;
  type: ProjectCompletionDocumentType;
  typeLabel: string;
  originalFileName: string;
  archiveFileName: string;
  mimeType: string;
  fileTypeLabel: string;
  fileSizeLabel: string;
  uploadedAt: string;
  uploadedBy: string;
  previewPath: string;
  downloadPath: string;
};

export type ProjectCompletionWorkflowRecord = {
  workflowId: string;
  projectId: string;
  canManage: boolean;
  canUploadInvoice: boolean;
  needsInitialConfiguration: boolean;
  approvalRequired: boolean | null;
  approvalStatus: ProjectCompletionStepStatus;
  approvalContactUserId: string | null;
  approvalContactName: string | null;
  approvalNote: string | null;
  approvalRequestedAt: string | null;
  approvalCompletedAt: string | null;
  approvalSelectedArchivedFileIds: string[];
  copyrightRequired: boolean | null;
  copyrightStatus: ProjectCompletionStepStatus;
  copyrightContactUserId: string | null;
  copyrightContactName: string | null;
  copyrightNote: string | null;
  copyrightRequestedAt: string | null;
  copyrightCompletedAt: string | null;
  invoiceStatus: ProjectCompletionStepStatus;
  invoiceCompletedAt: string | null;
  completedAt: string | null;
  isApprovalResolved: boolean;
  isCopyrightUnlocked: boolean;
  isCopyrightResolved: boolean;
  isInvoiceUnlocked: boolean;
  availableContacts: ProjectCompletionContactOption[];
  finalArchivedFiles: ProjectCompletionArchivedFileOption[];
  approvalSelectedFiles: ProjectCompletionArchivedFileOption[];
  documents: ProjectCompletionDocumentRecord[];
  approvalProofDocument: ProjectCompletionDocumentRecord | null;
  copyrightTransferDocument: ProjectCompletionDocumentRecord | null;
  invoiceDocument: ProjectCompletionDocumentRecord | null;
};

export type RequestProjectCompletionDocumentUploadInput = {
  projectId: string;
  documentType: ProjectCompletionDocumentType;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
};

export type RequestProjectCompletionDocumentUploadResult = {
  uploadUrl: string;
  storageKey: string;
};

type ProjectCompletionProjectRecord = NonNullable<
  Awaited<ReturnType<typeof getProjectCompletionProject>>
>;

function formatCompletionTimestamp(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompletionFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function getCompletionFileTypeLabel(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName).toUpperCase();

  if (extension) {
    return extension;
  }

  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

function getCompletionDocumentTypeLabel(type: ProjectCompletionDocumentType) {
  switch (type) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      return "Approval Proof";
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      return "Copyright Transfer";
    case ProjectCompletionDocumentType.INVOICE:
    default:
      return "Invoice";
  }
}

function getArchivedFileSourceLabel(file: {
  sourceRevisionId: string | null;
  sourceRevision: { revisionNumber: number } | null;
  sourceAttachment: {
    submissionReviewStatus: SubmissionReviewStatus | null;
  };
}) {
  if (file.sourceRevisionId) {
    return `Revision ${file.sourceRevision?.revisionNumber ?? "—"}`;
  }

  return file.sourceAttachment.submissionReviewStatus === SubmissionReviewStatus.APPROVED
    ? "Approved submission"
    : "Final archive";
}

function isProjectOwner(
  project: Pick<ProjectCompletionProjectRecord, "createdById">,
  userId: string,
) {
  return project.createdById === userId;
}

type ProjectCompletionPermissionProject = Pick<
  ProjectCompletionProjectRecord,
  "createdById" | "executorUserId" | "executors"
>;

function canViewCompletionWorkflow(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return hasProjectPermission(user, project, "completion.viewChecklist");
}

function canManageCompletionWorkflow(
  project: Pick<ProjectCompletionProjectRecord, "createdById">,
  user: ProjectCompletionWorkflowUser,
) {
  return isProjectOwner(project, user.id);
}

function canUploadInvoiceForProject(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return hasProjectPermission(user, project, "completion.uploadInvoice");
}

function canAccessCompletionDocuments(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
) {
  return hasProjectPermission(user, project, "completion.viewChecklist");
}

function requireCompletionProjectPermission(
  project: ProjectCompletionPermissionProject,
  user: ProjectCompletionWorkflowUser,
  permissionKey: PermissionKey,
  message: string,
) {
  if (!hasProjectPermission(user, project, permissionKey)) {
    throw new Error(message);
  }
}

function getCompletionDocumentUploadPermissionKey(
  documentType: ProjectCompletionDocumentType,
) {
  switch (documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      return "completion.uploadApprovalProof" satisfies PermissionKey;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      return "completion.uploadCopyrightDocument" satisfies PermissionKey;
    case ProjectCompletionDocumentType.INVOICE:
    default:
      return "completion.uploadInvoice" satisfies PermissionKey;
  }
}

function isCompletedProject(project: {
  status: string;
  archive: { id: string } | null;
  archivedAt: Date | null;
  completedAt: Date | null;
}) {
  return Boolean(
    project.archive || project.archivedAt || project.completedAt || project.status === "COMPLETED",
  );
}

function isStepResolved(status: ProjectCompletionStepStatus) {
  return (
    status === ProjectCompletionStepStatus.COMPLETED ||
    status === ProjectCompletionStepStatus.NOT_REQUIRED
  );
}

function getNextInvoiceStatus(
  currentStatus: ProjectCompletionStepStatus,
  approvalStatus: ProjectCompletionStepStatus,
  copyrightStatus: ProjectCompletionStepStatus,
) {
  if (currentStatus === ProjectCompletionStepStatus.COMPLETED) {
    return ProjectCompletionStepStatus.COMPLETED;
  }

  if (currentStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
    return ProjectCompletionStepStatus.NOT_REQUIRED;
  }

  return isStepResolved(approvalStatus) && isStepResolved(copyrightStatus)
    ? ProjectCompletionStepStatus.PENDING
    : ProjectCompletionStepStatus.NOT_STARTED;
}

function ensureRequirementChangeAllowed(
  stepLabel: string,
  currentRequired: boolean | null,
  currentStatus: ProjectCompletionStepStatus,
  nextRequired: boolean,
) {
  if (currentRequired === nextRequired) {
    return currentStatus;
  }

  if (currentStatus === ProjectCompletionStepStatus.COMPLETED) {
    throw new Error(`${stepLabel} has already been completed and can no longer be changed.`);
  }

  if (currentStatus === ProjectCompletionStepStatus.PENDING) {
    throw new Error(`${stepLabel} is already in progress and cannot be changed now.`);
  }

  return nextRequired
    ? ProjectCompletionStepStatus.NOT_STARTED
    : ProjectCompletionStepStatus.NOT_REQUIRED;
}

function mapContactOptions(project: ProjectCompletionProjectRecord) {
  const contactMap = new Map<string, ProjectCompletionContactOption>();

  const addContact = (
    user: { id: string; name: string | null; email: string },
    roleLabel: string,
  ) => {
    if (!contactMap.has(user.id)) {
      contactMap.set(user.id, {
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
        roleLabel,
      });
    }
  };

  addContact(project.createdBy, "Project Owner");

  if (project.executorUser) {
    addContact(project.executorUser, "Main Executor");
  }

  for (const collaborator of project.collaborators) {
    addContact(collaborator.user, "Collaborator");
  }

  return Array.from(contactMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

function mapArchivedFileOption(
  file: NonNullable<ProjectCompletionProjectRecord["archive"]>["files"][number],
) {
  return {
    id: file.id,
    finalArchiveFileName: file.finalArchiveFileName,
    originalFileName: file.originalFileName,
    fileTypeLabel: getCompletionFileTypeLabel(file.finalArchiveFileName, file.mimeType),
    mimeType: file.mimeType,
    fileSizeLabel: formatCompletionFileSize(file.fileSize),
    sourceLabel: getArchivedFileSourceLabel(file),
    previewPath: `/api/archives/files/${file.id}/preview`,
    downloadPath: `/api/archives/files/${file.id}/download`,
  } satisfies ProjectCompletionArchivedFileOption;
}

function mapDocumentRecord(
  document: NonNullable<ProjectCompletionProjectRecord["completionWorkflow"]>["documents"][number],
) {
  return {
    id: document.id,
    type: document.type,
    typeLabel: getCompletionDocumentTypeLabel(document.type),
    originalFileName: document.originalFileName,
    archiveFileName: document.archiveFileName,
    mimeType: document.mimeType,
    fileTypeLabel: getCompletionFileTypeLabel(document.archiveFileName, document.mimeType),
    fileSizeLabel: formatCompletionFileSize(document.fileSize),
    uploadedAt: formatCompletionTimestamp(document.uploadedAt) ?? "—",
    uploadedBy: getUserDisplayName(document.uploadedBy),
    previewPath: `/api/project-completion-documents/${document.id}/preview`,
    downloadPath: `/api/project-completion-documents/${document.id}/download`,
  } satisfies ProjectCompletionDocumentRecord;
}

async function getProjectCompletionProject(projectId: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        name: true,
        category: true,
        tag: true,
        status: true,
        createdById: true,
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
        archivedAt: true,
        completedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        executorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        collaborators: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        archive: {
          select: {
            id: true,
            files: {
              orderBy: [
                {
                  archivedAt: "desc",
                },
                {
                  finalArchiveFileName: "asc",
                },
              ],
              select: {
                id: true,
                finalArchiveFileName: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                sourceRevisionId: true,
                sourceRevision: {
                  select: {
                    revisionNumber: true,
                  },
                },
                sourceAttachment: {
                  select: {
                    submissionReviewStatus: true,
                  },
                },
              },
            },
          },
        },
        completionWorkflow: {
          select: {
            id: true,
            approvalRequired: true,
            approvalStatus: true,
            approvalContactUserId: true,
            approvalContactUser: {
              select: {
                name: true,
                email: true,
              },
            },
            approvalNote: true,
            approvalSelectedArchivedFileIds: true,
            approvalRequestedAt: true,
            approvalCompletedAt: true,
            copyrightRequired: true,
            copyrightStatus: true,
            copyrightContactUserId: true,
            copyrightContactUser: {
              select: {
                name: true,
                email: true,
              },
            },
            copyrightNote: true,
            copyrightRequestedAt: true,
            copyrightCompletedAt: true,
            invoiceStatus: true,
            invoiceCompletedAt: true,
            completedAt: true,
            documents: {
              orderBy: [
                {
                  uploadedAt: "desc",
                },
                {
                  type: "asc",
                },
              ],
              select: {
                id: true,
                type: true,
                originalFileName: true,
                archiveFileName: true,
                mimeType: true,
                fileSize: true,
                bucket: true,
                storageKey: true,
                uploadedAt: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
}

async function ensureProjectCompletionViewAccess(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  await assertProjectAccess(user, projectId);

  const project = await getProjectCompletionProject(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!isCompletedProject(project)) {
    return null;
  }

  if (!canViewCompletionWorkflow(project, user)) {
    return null;
  }

  return project;
}

async function ensureProjectCompletionManageAccess(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  await assertProjectAccess(user, projectId);

  const project = await getProjectCompletionProject(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!isCompletedProject(project)) {
    throw new Error("Complete and archive the project before using the completion checklist.");
  }

  if (!canManageCompletionWorkflow(project, user)) {
    throw new Error("Only the project owner can manage the completion checklist.");
  }

  return project;
}

async function ensureProjectCompletionDocumentAccess(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await withPrismaRetry(() =>
    prisma.projectCompletionDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        projectId: true,
        archiveFileName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
        project: {
          select: {
            createdById: true,
            executorUserId: true,
            executors: {
              select: {
                userId: true,
                role: true,
              },
            },
          },
        },
      },
    }),
  );

  if (!document) {
    throw new Error("Completion document not found.");
  }

  await assertProjectAccess(user, document.projectId);

  if (!canAccessCompletionDocuments(document.project, user)) {
    throw new Error("You do not have access to this completion document.");
  }

  return document;
}

async function ensureWorkflowExists(projectId: string) {
  return withPrismaRetry(() =>
    prisma.projectCompletionWorkflow.upsert({
      where: {
        projectId,
      },
      update: {},
      create: {
        projectId,
      },
      select: {
        id: true,
      },
    }),
  );
}

async function ensureWorkflowExistsTx(tx: Prisma.TransactionClient, projectId: string) {
  return tx.projectCompletionWorkflow.upsert({
    where: {
      projectId,
    },
    update: {},
    create: {
      projectId,
    },
    select: {
      id: true,
      approvalRequired: true,
      approvalStatus: true,
      approvalSelectedArchivedFileIds: true,
      copyrightRequired: true,
      copyrightStatus: true,
      invoiceStatus: true,
    },
  });
}

function mapWorkflowRecord(
  project: ProjectCompletionProjectRecord,
  user: ProjectCompletionWorkflowUser,
) {
  if (!project.completionWorkflow) {
    throw new Error("Project completion workflow is not available yet.");
  }

  const finalArchivedFiles = project.archive?.files.map(mapArchivedFileOption) ?? [];
  const approvalSelectedFileIdSet = new Set(
    project.completionWorkflow.approvalSelectedArchivedFileIds,
  );
  const approvalSelectedFiles = finalArchivedFiles.filter((file) =>
    approvalSelectedFileIdSet.has(file.id),
  );
  const documents = project.completionWorkflow.documents.map(mapDocumentRecord);
  const documentByType = new Map(documents.map((document) => [document.type, document] as const));

  return {
    workflowId: project.completionWorkflow.id,
    projectId: project.id,
    canManage: canManageCompletionWorkflow(project, user),
    canUploadInvoice: canUploadInvoiceForProject(project, user),
    needsInitialConfiguration:
      project.completionWorkflow.approvalRequired === null ||
      project.completionWorkflow.copyrightRequired === null,
    approvalRequired: project.completionWorkflow.approvalRequired,
    approvalStatus: project.completionWorkflow.approvalStatus,
    approvalContactUserId: project.completionWorkflow.approvalContactUserId ?? null,
    approvalContactName: project.completionWorkflow.approvalContactUser
      ? getUserDisplayName(project.completionWorkflow.approvalContactUser)
      : null,
    approvalNote: project.completionWorkflow.approvalNote ?? null,
    approvalRequestedAt: formatCompletionTimestamp(
      project.completionWorkflow.approvalRequestedAt,
    ),
    approvalCompletedAt: formatCompletionTimestamp(
      project.completionWorkflow.approvalCompletedAt,
    ),
    approvalSelectedArchivedFileIds:
      project.completionWorkflow.approvalSelectedArchivedFileIds,
    copyrightRequired: project.completionWorkflow.copyrightRequired,
    copyrightStatus: project.completionWorkflow.copyrightStatus,
    copyrightContactUserId: project.completionWorkflow.copyrightContactUserId ?? null,
    copyrightContactName: project.completionWorkflow.copyrightContactUser
      ? getUserDisplayName(project.completionWorkflow.copyrightContactUser)
      : null,
    copyrightNote: project.completionWorkflow.copyrightNote ?? null,
    copyrightRequestedAt: formatCompletionTimestamp(
      project.completionWorkflow.copyrightRequestedAt,
    ),
    copyrightCompletedAt: formatCompletionTimestamp(
      project.completionWorkflow.copyrightCompletedAt,
    ),
    invoiceStatus: project.completionWorkflow.invoiceStatus,
    invoiceCompletedAt: formatCompletionTimestamp(project.completionWorkflow.invoiceCompletedAt),
    completedAt: formatCompletionTimestamp(project.completionWorkflow.completedAt),
    isApprovalResolved: isStepResolved(project.completionWorkflow.approvalStatus),
    isCopyrightUnlocked: isStepResolved(project.completionWorkflow.approvalStatus),
    isCopyrightResolved: isStepResolved(project.completionWorkflow.copyrightStatus),
    isInvoiceUnlocked:
      isStepResolved(project.completionWorkflow.approvalStatus) &&
      isStepResolved(project.completionWorkflow.copyrightStatus),
    availableContacts: mapContactOptions(project),
    finalArchivedFiles,
    approvalSelectedFiles,
    documents,
    approvalProofDocument:
      documentByType.get(ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF) ?? null,
    copyrightTransferDocument:
      documentByType.get(ProjectCompletionDocumentType.COPYRIGHT_TRANSFER) ?? null,
    invoiceDocument: documentByType.get(ProjectCompletionDocumentType.INVOICE) ?? null,
  } satisfies ProjectCompletionWorkflowRecord;
}

function validateContactSelection(
  contactOptions: ProjectCompletionContactOption[],
  contactUserId: string,
  label: string,
) {
  const selectedContact = contactOptions.find((contact) => contact.id === contactUserId);

  if (!selectedContact) {
    throw new Error(`Select a valid ${label} contact before continuing.`);
  }

  return selectedContact;
}

function buildCompletionDocumentStoragePrefix(
  projectId: string,
  documentType: ProjectCompletionDocumentType,
) {
  const placeholder = "__placeholder__";

  return buildProjectCompletionDocumentKey({
    projectId,
    documentType,
    safeFileName: placeholder,
  }).replace(placeholder, "");
}

export async function getProjectCompletionWorkflowForUser(
  user: ProjectCompletionWorkflowUser,
  projectId: string,
) {
  const project = await ensureProjectCompletionViewAccess(user, projectId);

  if (!project) {
    return null;
  }

  if (!project.completionWorkflow) {
    await ensureWorkflowExists(projectId);
    const refreshedProject = await getProjectCompletionProject(projectId);

    if (!refreshedProject?.completionWorkflow) {
      throw new Error("Unable to load the project completion workflow.");
    }

    return mapWorkflowRecord(refreshedProject, user);
  }

  return mapWorkflowRecord(project, user);
}

export async function configureProjectCompletionWorkflow(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    approvalRequired: boolean;
    copyrightRequired: boolean;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.setApprovalRequired",
    "You do not have permission to configure authority approval requirements.",
  );
  requireCompletionProjectPermission(
    project,
    user,
    "completion.setCopyrightRequired",
    "You do not have permission to configure copyright transfer requirements.",
  );

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);
      const nextApprovalStatus = ensureRequirementChangeAllowed(
        "Authority approval",
        workflow.approvalRequired,
        workflow.approvalStatus,
        input.approvalRequired,
      );
      const nextCopyrightStatus = ensureRequirementChangeAllowed(
        "Copyright transfer",
        workflow.copyrightRequired,
        workflow.copyrightStatus,
        input.copyrightRequired,
      );
      const nextInvoiceStatus = getNextInvoiceStatus(
        workflow.invoiceStatus,
        nextApprovalStatus,
        nextCopyrightStatus,
      );

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          approvalRequired: input.approvalRequired,
          approvalStatus: nextApprovalStatus,
          approvalContactUserId:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalNote:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalSelectedArchivedFileIds:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? [] : undefined,
          approvalRequestedAt:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          approvalCompletedAt:
            nextApprovalStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightRequired: input.copyrightRequired,
          copyrightStatus: nextCopyrightStatus,
          copyrightContactUserId:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightNote:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightRequestedAt:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          copyrightCompletedAt:
            nextCopyrightStatus === ProjectCompletionStepStatus.NOT_REQUIRED ? null : undefined,
          invoiceStatus: nextInvoiceStatus,
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function prepareAuthorityApprovalRequest(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    selectedArchivedFileIds: string[];
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.prepareApproval",
    "You do not have permission to prepare authority approval requests.",
  );

  if (!project.archive || project.archive.files.length === 0) {
    throw new Error("No final archived files are available for authority approval.");
  }

  const contactOptions = mapContactOptions(project);
  validateContactSelection(contactOptions, input.contactUserId, "approval");

  const selectedFileIds = Array.from(
    new Set(input.selectedArchivedFileIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (selectedFileIds.length === 0) {
    throw new Error("Select at least one final archived file for authority approval.");
  }

  const validArchivedFileIds = new Set(project.archive.files.map((file) => file.id));

  if (selectedFileIds.some((fileId) => !validArchivedFileIds.has(fileId))) {
    throw new Error("One or more selected archived files are no longer available.");
  }

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (workflow.approvalRequired === null) {
        throw new Error("Set the project completion checklist requirements first.");
      }

      if (!workflow.approvalRequired) {
        throw new Error("Authority approval is marked as not required for this project.");
      }

      if (workflow.approvalStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Authority approval has already been completed.");
      }

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          approvalStatus: ProjectCompletionStepStatus.PENDING,
          approvalContactUserId: input.contactUserId,
          approvalNote: input.note?.trim() || null,
          approvalSelectedArchivedFileIds: selectedFileIds,
          approvalRequestedAt: new Date(),
          approvalCompletedAt: null,
          invoiceStatus: getNextInvoiceStatus(
            workflow.invoiceStatus,
            ProjectCompletionStepStatus.PENDING,
            workflow.copyrightStatus,
          ),
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function prepareCopyrightTransferRequest(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    contactUserId: string;
    note?: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);
  requireCompletionProjectPermission(
    project,
    user,
    "completion.prepareCopyrightTransfer",
    "You do not have permission to prepare copyright transfer requests.",
  );
  const contactOptions = mapContactOptions(project);
  validateContactSelection(contactOptions, input.contactUserId, "copyright");

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (!isStepResolved(workflow.approvalStatus)) {
        throw new Error(
          "Complete or mark authority approval as not required before preparing copyright transfer.",
        );
      }

      if (workflow.copyrightRequired === null) {
        throw new Error("Set the project completion checklist requirements first.");
      }

      if (!workflow.copyrightRequired) {
        throw new Error("Copyright transfer is marked as not required for this project.");
      }

      if (workflow.copyrightStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Copyright transfer has already been completed.");
      }

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          copyrightStatus: ProjectCompletionStepStatus.PENDING,
          copyrightContactUserId: input.contactUserId,
          copyrightNote: input.note?.trim() || null,
          copyrightRequestedAt: new Date(),
          copyrightCompletedAt: null,
          invoiceStatus: getNextInvoiceStatus(
            workflow.invoiceStatus,
            workflow.approvalStatus,
            ProjectCompletionStepStatus.PENDING,
          ),
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function markProjectInvoiceNotRequired(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
  },
) {
  const project = await ensureProjectCompletionManageAccess(user, input.projectId);

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const workflow = await ensureWorkflowExistsTx(tx, project.id);

      if (
        !isStepResolved(workflow.approvalStatus) ||
        !isStepResolved(workflow.copyrightStatus)
      ) {
        throw new Error(
          "Complete or skip authority approval and copyright transfer before marking invoice as not required.",
        );
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.COMPLETED) {
        throw new Error("Invoice has already been completed.");
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
        return;
      }

      const invoiceDocument = await tx.projectCompletionDocument.findUnique({
        where: {
          workflowId_type: {
            workflowId: workflow.id,
            type: ProjectCompletionDocumentType.INVOICE,
          },
        },
        select: {
          id: true,
        },
      });

      if (invoiceDocument) {
        throw new Error("An invoice document has already been uploaded.");
      }

      const completedAt = new Date();

      await tx.projectCompletionWorkflow.update({
        where: {
          projectId: project.id,
        },
        data: {
          invoiceStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
          invoiceCompletedAt: null,
          completedAt,
        },
      });
    }),
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("Unable to load the updated project completion workflow.");
  }

  return workflow;
}

export async function requestProjectCompletionDocumentUpload(
  user: ProjectCompletionWorkflowUser,
  input: RequestProjectCompletionDocumentUploadInput,
): Promise<RequestProjectCompletionDocumentUploadResult> {
  if (!input.originalFileName.trim()) {
    throw new Error("A completion document file name is required.");
  }

  if (!input.mimeType.trim()) {
    throw new Error("A valid completion document MIME type is required.");
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new Error("A valid completion document file size is required.");
  }

  if (input.fileSize > getMaxAssetUploadBytes()) {
    throw new Error("The selected file exceeds the upload size limit.");
  }

  if (!isAllowedProjectCompletionDocument(input.originalFileName, input.mimeType)) {
    throw new Error("Completion documents must be PDF, PNG, JPG, JPEG, or WebP files.");
  }

  const project = await ensureProjectCompletionViewAccess(user, input.projectId);

  if (!project) {
    throw new Error("You do not have access to this completion workflow.");
  }

  requireCompletionProjectPermission(
    project,
    user,
    getCompletionDocumentUploadPermissionKey(input.documentType),
    "You do not have permission to upload this completion document.",
  );

  const workflow = await getProjectCompletionWorkflowForUser(user, input.projectId);

  if (!workflow) {
    throw new Error("You do not have access to this completion workflow.");
  }

  switch (input.documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      if (!workflow.canManage) {
        throw new Error("Only the project owner can upload authority approval proof.");
      }

      if (workflow.approvalStatus !== ProjectCompletionStepStatus.PENDING) {
        throw new Error("Prepare the authority approval request before uploading proof.");
      }
      break;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      if (!workflow.canManage) {
        throw new Error("Only the project owner can upload copyright transfer documents.");
      }

      if (!workflow.isApprovalResolved) {
        throw new Error(
          "Complete authority approval before uploading the signed copyright transfer document.",
        );
      }

      if (workflow.copyrightStatus !== ProjectCompletionStepStatus.PENDING) {
        throw new Error("Prepare the copyright transfer request before uploading the signed document.");
      }
      break;
    case ProjectCompletionDocumentType.INVOICE:
      if (!workflow.canUploadInvoice) {
        throw new Error("Only the project owner or project executor can upload the invoice.");
      }

      if (!workflow.isInvoiceUnlocked) {
        throw new Error(
          "Complete or skip authority approval and copyright transfer before uploading the invoice.",
        );
      }

      if (workflow.invoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
        throw new Error("Invoice is marked as not required for this project.");
      }
      break;
  }

  const safeFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
    input.originalFileName,
  )}`;
  const storageKey = buildProjectCompletionDocumentKey({
    projectId: input.projectId,
    documentType: input.documentType,
    safeFileName,
  });
  const uploadUrl = await createPresignedUploadUrl({
    storageKey,
    mimeType: input.mimeType,
  });

  return {
    uploadUrl,
    storageKey,
  };
}

export async function finalizeProjectCompletionDocumentUpload(
  user: ProjectCompletionWorkflowUser,
  input: {
    projectId: string;
    documentType: ProjectCompletionDocumentType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
    failed?: boolean;
  },
) {
  if (input.failed) {
    return;
  }

  if (!isAllowedProjectCompletionDocument(input.originalFileName, input.mimeType)) {
    throw new Error("Completion documents must be PDF, PNG, JPG, JPEG, or WebP files.");
  }

  const expectedPrefix = buildCompletionDocumentStoragePrefix(
    input.projectId,
    input.documentType,
  );

  if (!input.storageKey.startsWith(expectedPrefix)) {
    throw new Error("Completion document storage key is invalid.");
  }

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          createdById: true,
          executorUserId: true,
          executors: {
            select: {
              userId: true,
              role: true,
            },
          },
          status: true,
          archivedAt: true,
          completedAt: true,
          archive: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error("Project not found.");
      }

      await assertProjectAccess(user, input.projectId);
      requireCompletionProjectPermission(
        project,
        user,
        getCompletionDocumentUploadPermissionKey(input.documentType),
        "You do not have permission to upload this completion document.",
      );

      if (!isCompletedProject(project)) {
        throw new Error(
          "Complete and archive the project before uploading completion documents.",
        );
      }

      const canManage = canManageCompletionWorkflow(project, user);
      const canUploadInvoice = canUploadInvoiceForProject(project, user);
      const workflow = await ensureWorkflowExistsTx(tx, project.id);
      const archiveFileName = input.originalFileName.trim();
      const uploadedAt = new Date();

      switch (input.documentType) {
        case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
          if (!canManage) {
            throw new Error("Only the project owner can upload authority approval proof.");
          }

          if (workflow.approvalStatus !== ProjectCompletionStepStatus.PENDING) {
            throw new Error("Prepare the authority approval request before uploading proof.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              approvalStatus: ProjectCompletionStepStatus.COMPLETED,
              approvalCompletedAt: uploadedAt,
              invoiceStatus: getNextInvoiceStatus(
                workflow.invoiceStatus,
                ProjectCompletionStepStatus.COMPLETED,
                workflow.copyrightStatus,
              ),
            },
          });
          break;
        case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
          if (!canManage) {
            throw new Error("Only the project owner can upload copyright transfer documents.");
          }

          if (!isStepResolved(workflow.approvalStatus)) {
            throw new Error(
              "Complete authority approval before uploading the signed copyright transfer document.",
            );
          }

          if (workflow.copyrightStatus !== ProjectCompletionStepStatus.PENDING) {
            throw new Error("Prepare the copyright transfer request before uploading the signed document.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.COPYRIGHT_TRANSFER,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.COPYRIGHT_TRANSFER,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              copyrightStatus: ProjectCompletionStepStatus.COMPLETED,
              copyrightCompletedAt: uploadedAt,
              invoiceStatus: getNextInvoiceStatus(
                workflow.invoiceStatus,
                workflow.approvalStatus,
                ProjectCompletionStepStatus.COMPLETED,
              ),
            },
          });
          break;
        case ProjectCompletionDocumentType.INVOICE:
          if (!canUploadInvoice) {
            throw new Error("Only the project owner or project executor can upload the invoice.");
          }

          if (
            !isStepResolved(workflow.approvalStatus) ||
            !isStepResolved(workflow.copyrightStatus)
          ) {
            throw new Error(
              "Complete or skip authority approval and copyright transfer before uploading the invoice.",
            );
          }

          if (workflow.invoiceStatus === ProjectCompletionStepStatus.NOT_REQUIRED) {
            throw new Error("Invoice is marked as not required for this project.");
          }

          await tx.projectCompletionDocument.upsert({
            where: {
              workflowId_type: {
                workflowId: workflow.id,
                type: ProjectCompletionDocumentType.INVOICE,
              },
            },
            update: {
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
            create: {
              projectId: project.id,
              workflowId: workflow.id,
              type: ProjectCompletionDocumentType.INVOICE,
              originalFileName: input.originalFileName,
              archiveFileName,
              mimeType: input.mimeType,
              fileSize: input.fileSize,
              bucket: getS3BucketName(),
              storageKey: input.storageKey,
              uploadedById: user.id,
              uploadedAt,
            },
          });

          await tx.projectCompletionWorkflow.update({
            where: {
              projectId: project.id,
            },
            data: {
              invoiceStatus: ProjectCompletionStepStatus.COMPLETED,
              invoiceCompletedAt: uploadedAt,
              completedAt: uploadedAt,
            },
          });
          break;
      }
    }),
  );

  switch (input.documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      await runNotificationTask("approval-proof-uploaded", () =>
        notifyApprovalProofUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      await runNotificationTask("copyright-document-uploaded", () =>
        notifyCopyrightDocumentUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
    case ProjectCompletionDocumentType.INVOICE:
      await runNotificationTask("invoice-uploaded", () =>
        notifyInvoiceUploaded({
          projectId: input.projectId,
          actorId: user.id,
        }),
      );
      break;
  }
}

export async function getProjectCompletionDocumentDownloadUrlForUser(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await ensureProjectCompletionDocumentAccess(user, documentId);

  return createPresignedDownloadUrl({
    bucket: document.bucket,
    storageKey: document.storageKey,
    fileName: document.archiveFileName,
    mimeType: document.mimeType,
  });
}

export async function getProjectCompletionDocumentPreviewUrlForUser(
  user: ProjectCompletionWorkflowUser,
  documentId: string,
) {
  const document = await ensureProjectCompletionDocumentAccess(user, documentId);

  return createPresignedPreviewUrl({
    bucket: document.bucket,
    storageKey: document.storageKey,
    fileName: document.archiveFileName,
    mimeType: document.mimeType,
  });
}
